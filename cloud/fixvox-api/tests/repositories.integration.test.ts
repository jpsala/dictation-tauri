/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { createBackupManifest } from "../src/postgres/backup-manifest";
import {
  DeviceBindingConflictError,
  PostgresControlPlaneRepository,
} from "../src/postgres/control-plane-repository";
import { PostgresAuthSessionRepository, RECENT_GOOGLE_AUTH_MS } from "../src/postgres/auth-session-repository";
import {
  PostgresProfilePublicationRepository,
  StaleProfileRevisionError,
} from "../src/postgres/profile-publication-repository";
import { PostgresUsageQuotaRepository } from "../src/postgres/usage-quota-repository";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
const sql = new Bun.SQL(databaseUrl);
afterAll(async () => {
  await resetDomainData();
  await sql.close();
});

async function resetDomainData(): Promise<void> {
  const databases = await sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
  if (databases[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");
  await sql.unsafe(`
    TRUNCATE TABLE
      audit_records, usage_events, usage_reservations, policy_assignments,
      account_groups, install_bindings, devices, accounts, settings_defaults,
      profile_engine_bindings, profile_prompt_bindings, profile_versions,
      profiles, groups, engines, prompts, quota_policies, oauth_states,
      desktop_login_sessions, admin_sessions, role_bindings, request_events,
      prewarm_daily_counters, feedback_events, pricing_records, pricing_watchlist, migration_runs
    RESTART IDENTITY CASCADE
  `);
  await sql.unsafe("DELETE FROM control_plane_authority");
  await sql.unsafe(`
    INSERT INTO control_plane_authority (mode, revision, changed_by)
    VALUES ('cloudflare-authority', 0, 'integration-test')
  `);
}

beforeEach(resetDomainData);

async function createPublishedProfile(profileId: string, label: string): Promise<string> {
  const profiles = await sql.unsafe<{ id: string }>(`
    INSERT INTO profiles (profile_id, label)
    VALUES ($1, $2)
    RETURNING id::text
  `, [profileId, label]);
  await sql.unsafe(`
    INSERT INTO profile_versions (
      profile_id, version, status, definition, authority_revision, created_by, published_by, published_at
    ) VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 'test', 'test', now())
  `, [profiles[0].id, JSON.stringify({ capabilities: [profileId] })]);
  await sql.unsafe(`
    UPDATE profiles SET active_published_version = 1 WHERE id = $1::uuid
  `, [profiles[0].id]);
  return profiles[0].id;
}

describe("PostgreSQL control-plane repositories", () => {
  test("binds installs once and rejects device rebinding", async () => {
    const repository = new PostgresControlPlaneRepository(sql);
    const first = await repository.bindDevice({
      installIdHash: "install-hash-a",
      generatedDeviceId: "device-a",
    });
    expect(first.created).toBe(true);
    expect((await repository.bindDevice({
      installIdHash: "install-hash-a",
      suppliedDeviceId: "device-a",
      generatedDeviceId: "unused",
    })).created).toBe(false);
    await expect(repository.bindDevice({
      installIdHash: "install-hash-a",
      suppliedDeviceId: "device-other",
      generatedDeviceId: "unused",
    })).rejects.toThrow(DeviceBindingConflictError);
  });

  test("resolves account policy before fallback from published versions", async () => {
    const repository = new PostgresControlPlaneRepository(sql);
    const device = await repository.bindDevice({ installIdHash: "install", generatedDeviceId: "device" });
    const accounts = await sql.unsafe<{ id: string }>(`
      INSERT INTO accounts (provider, provider_subject_hash, handle)
      VALUES ('google', 'subject-hash', 'acct') RETURNING id::text
    `);
    await sql.unsafe("UPDATE devices SET account_id = $2::uuid WHERE id = $1::uuid", [device.id, accounts[0].id]);
    await createPublishedProfile("starter", "Starter");
    const proId = await createPublishedProfile("pro", "Pro");
    await sql.unsafe(`
      INSERT INTO policy_assignments (target_type, target_id, profile_id, priority, source)
      VALUES ('account', $1::uuid, $2::uuid, 10, 'account')
    `, [accounts[0].id, proId]);

    expect(await repository.resolveEffectiveProfile({ deviceId: "device", fallbackProfileId: "starter" })).toEqual({
      profileId: "pro",
      label: "Pro",
      version: 1,
      definition: { capabilities: ["pro"] },
      source: "account",
    });
  });

  test("publishes one immutable draft and rejects a stale revision", async () => {
    const profileId = await createPublishedProfile("custom", "Custom");
    await sql.unsafe(`
      INSERT INTO profile_versions (
        profile_id, version, status, definition, authority_revision, created_by
      ) VALUES ($1::uuid, 2, 'draft', '{"capabilities":["custom-v2"]}'::jsonb, 0, 'actor')
    `, [profileId]);
    await sql.unsafe("UPDATE profiles SET current_draft_version = 2 WHERE id = $1::uuid", [profileId]);

    const repository = new PostgresProfilePublicationRepository(databaseUrl);
    expect(await repository.publish({ profileId: "custom", expectedRevision: 0, actorRefHash: "actor-hash" }))
      .toEqual({ profileId: "custom", version: 2, revision: 1 });
    const versions = await sql.unsafe<{ version: number; status: string }>(`
      SELECT version, status FROM profile_versions WHERE profile_id = $1::uuid ORDER BY version
    `, [profileId]);
    expect(versions).toEqual([{ version: 1, status: "historical" }, { version: 2, status: "published" }]);
    const audits = await sql.unsafe<{ count: string }>("SELECT COUNT(*)::text AS count FROM audit_records");
    expect(audits[0].count).toBe("1");
    await expect(repository.publish({ profileId: "custom", expectedRevision: 0, actorRefHash: "actor-hash" }))
      .rejects.toThrow(StaleProfileRevisionError);
  });

  test("enforces immutable profile history and append-only audit in PostgreSQL", async () => {
    const profileId = await createPublishedProfile("immutable", "Immutable");
    await sql.unsafe(`
      INSERT INTO audit_records (
        actor_ref_hash, action, target_type, target_ref_hash, result
      ) VALUES ('actor', 'test', 'profile', 'immutable', 'success')
    `);

    const profileVerifier = new Bun.SQL(databaseUrl);
    let profileMutationError: unknown;
    try {
      await profileVerifier.unsafe(
        "UPDATE profile_versions SET definition = '{}'::jsonb WHERE profile_id = $1::uuid AND version = 1",
        [profileId],
      );
    } catch (error) {
      profileMutationError = error;
    } finally {
      await profileVerifier.close();
    }
    expect(String(profileMutationError)).toContain("profile_version_content_is_immutable");

    const auditVerifier = new Bun.SQL(databaseUrl);
    let auditMutationError: unknown;
    try {
      await auditVerifier.unsafe("DELETE FROM audit_records");
    } catch (error) {
      auditMutationError = error;
    } finally {
      await auditVerifier.close();
    }
    expect(String(auditMutationError)).toContain("audit_records_are_append_only");
  });

  test("admits exactly ten of twenty concurrent quota reservations", async () => {
    const devices = await sql.unsafe<{ id: string }>(`
      INSERT INTO devices (device_id) VALUES ('quota-device') RETURNING id::text
    `);
    const repository = new PostgresUsageQuotaRepository(sql);
    const now = Date.now();
    const decisions = await Promise.all(Array.from({ length: 20 }, (_, index) => repository.reserve({
      idempotencyKey: `request-${index}`,
      deviceId: devices[0].id,
      usageKind: "stt",
      amount: 1,
      limit: 10,
      windowStart: new Date(now - 60_000),
      expiresAt: new Date(now + 60_000),
    })));
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(10);

    const reservations = await sql.unsafe<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM usage_reservations",
    );
    expect(reservations[0].count).toBe("10");
  });

  test("keeps reservations idempotent and consumes exactly one usage event", async () => {
    const devices = await sql.unsafe<{ id: string }>(`
      INSERT INTO devices (device_id) VALUES ('consume-device') RETURNING id::text
    `);
    const repository = new PostgresUsageQuotaRepository(sql);
    const input = {
      idempotencyKey: "consume-request",
      deviceId: devices[0].id,
      usageKind: "stt",
      amount: 2,
      limit: 10,
      windowStart: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const first = await repository.reserve(input);
    const repeated = await repository.reserve(input);
    expect(repeated.reservationId).toBe(first.reservationId);
    expect(repeated.idempotent).toBe(true);
    await repository.consume({ reservationId: first.reservationId!, safeUnits: 2, outcome: "success" });
    await expect(repository.consume({ reservationId: first.reservationId!, safeUnits: 2, outcome: "success" }))
      .rejects.toThrow("quota_reservation_not_active");
    expect(await repository.release(first.reservationId!)).toBe(false);
    const events = await sql.unsafe<{ count: string }>("SELECT COUNT(*)::text AS count FROM usage_events");
    expect(events[0].count).toBe("1");
  });

  test("persists only hashed OAuth handles, consumes callbacks once, and claims a desktop device once", async () => {
    const control = new PostgresControlPlaneRepository(sql);
    const auth = new PostgresAuthSessionRepository(sql);
    const device = await control.bindDevice({ installIdHash: "install-hash", generatedDeviceId: "auth-device" });
    const expiresAt = new Date(Date.now() + 60_000);
    await auth.createDesktopHandoff({ sessionHash: "desktop-state-hash", handoffHash: "handoff-hash", expiresAt });
    await auth.createOAuthState({ stateHash: "oauth-state-hash", provider: "google", protectedMetadata: "{}", expiresAt });
    expect(await auth.attachDesktopOAuthState("desktop-state-hash", "oauth-state-hash")).toBe(true);
    expect(JSON.stringify(await sql.unsafe("SELECT state_hash, session_hash, handoff_hash FROM oauth_states, desktop_login_sessions"))).not.toContain("raw-state");
    const callbacks = await Promise.all([auth.consumeOAuthState("oauth-state-hash"), auth.consumeOAuthState("oauth-state-hash")]);
    expect(callbacks.filter(Boolean)).toHaveLength(1);
    expect(await auth.completeOAuthState("oauth-state-hash", "subject-hash", new Date())).toBe(true);
    const claims = await Promise.all([
      auth.claimDesktopDevice({ sessionHash: "desktop-state-hash", deviceId: device.deviceId, installIdHash: "install-hash" }),
      auth.claimDesktopDevice({ sessionHash: "desktop-state-hash", deviceId: device.deviceId, installIdHash: "install-hash" }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const verificationNow = new Date();
    expect(auth.isRecentGoogleVerification(new Date(verificationNow.getTime() - RECENT_GOOGLE_AUTH_MS), verificationNow)).toBe(true);
    expect(auth.isRecentGoogleVerification(new Date(verificationNow.getTime() - RECENT_GOOGLE_AUTH_MS - 1), verificationNow)).toBe(false);
  });

  test("skips unlimited quota writes and emits only safe backup metadata", async () => {
    const devices = await sql.unsafe<{ id: string }>(`
      INSERT INTO devices (device_id) VALUES ('unlimited-device') RETURNING id::text
    `);
    const quota = new PostgresUsageQuotaRepository(sql);
    const decision = await quota.reserve({
      idempotencyKey: "unlimited-request",
      deviceId: devices[0].id,
      usageKind: "stt",
      amount: 1,
      limit: null,
      windowStart: new Date(0),
      expiresAt: new Date(Date.now() + 60_000),
      unlimited: true,
    });
    expect(decision.reservationId).toBe(null);
    const manifest = await createBackupManifest(sql, new Date("2026-07-15T00:00:00.000Z"));
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.authority).toEqual({ mode: "cloudflare-authority", revision: 0 });
    expect(manifest.counts.usage_reservations).toBe(0);
    expect(JSON.stringify(manifest)).not.toMatch(/subject-hash|audio|transcript/i);
  });
});
