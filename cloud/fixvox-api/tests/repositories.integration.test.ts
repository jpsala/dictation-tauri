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
import { PostgresProfileCommandRepository } from "../src/postgres/profile-command-repository";
import { composeApi } from "../src/composition";
import { PostgresUsageQuotaRepository } from "../src/postgres/usage-quota-repository";
import { PostgresAdminRepository } from "../src/postgres/admin-repository";

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

async function createPublishedProfile(profileId: string, label: string, definition: Record<string, unknown> = { capabilities: [profileId] }): Promise<string> {
  const profiles = await sql.unsafe<{ id: string }>(`
    INSERT INTO profiles (profile_id, label)
    VALUES ($1, $2)
    RETURNING id::text
  `, [profileId, label]);
  await sql.unsafe(`
    INSERT INTO profile_versions (
      profile_id, version, status, definition, authority_revision, created_by, published_by, published_at
    ) VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 'test', 'test', now())
  `, [profiles[0].id, JSON.stringify(definition)]);
  await sql.unsafe(`
    UPDATE profiles SET active_published_version = 1 WHERE id = $1::uuid
  `, [profiles[0].id]);
  return profiles[0].id;
}

describe("PostgreSQL control-plane repositories", () => {
  test("role mutations accept only listed linked opaque principals and append redacted audit", async () => {
    const control = new PostgresControlPlaneRepository(sql);
    const admin = new PostgresAdminRepository(sql);
    const ownerHash = "a".repeat(64), candidateHash = "b".repeat(64);
    for (const [index, subjectHash] of [ownerHash, candidateHash].entries()) {
      const account = await sql.unsafe<{ id: string }>(`INSERT INTO accounts (provider, provider_subject_hash, handle) VALUES ('google', $1, $2) RETURNING id::text`, [subjectHash, `linked-${index}`]);
      const device = await control.bindDevice({ installIdHash: `install-${index}`, generatedDeviceId: `device-${index}` });
      await sql.unsafe(`UPDATE devices SET account_id = $2::uuid WHERE id = $1::uuid`, [device.id, account[0].id]);
      if (index === 0) await sql.unsafe(`INSERT INTO role_bindings (account_id, role, granted_by) VALUES ($1::uuid, 'owner', 'bootstrap')`, [account[0].id]);
    }
    const ownerKey = `arp_${ownerHash}`, candidateKey = `arp_${candidateHash}`;
    expect((await admin.linkedPrincipals()).principals).toHaveLength(2);
    let unlistedPrincipalError: unknown;
    try {
      await admin.setRoleBinding({ actorPrincipalKey: ownerKey, subjectPrincipalKey: `arp_${"c".repeat(64)}`, role: "publisher" });
    } catch (error) {
      unlistedPrincipalError = error;
    }
    expect(unlistedPrincipalError instanceof Error).toBe(true);
    expect((unlistedPrincipalError as Error).message).toContain("listed_linked_principal_required");
    expect((await admin.setRoleBinding({ actorPrincipalKey: ownerKey, subjectPrincipalKey: candidateKey, role: "publisher" })).role).toBe("publisher");
    expect(await admin.roleForPrincipal(candidateKey)).toBe("publisher");
    const audit = await admin.audit(10);
    expect(audit.some((record) => record.action === "role.set" && record.targetType === "principal")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(ownerHash);
  });

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

  test("materializes product profile engine and prompt routing server-side", async () => {
    const repository = new PostgresControlPlaneRepository(sql);
    const device = await repository.bindDevice({ installIdHash: "product-install", generatedDeviceId: "product-device" });
    await sql.unsafe(`INSERT INTO engines (engine_id, kind, provider, model) VALUES ('product-stt', 'transcription', 'mock-stt', 'stt-model'), ('product-chat', 'postprocess', 'mock-chat', 'chat-model'), ('product-selection', 'selectionTransform', 'mock-selection', 'selection-model')`);
    await sql.unsafe(`INSERT INTO prompts (prompt_id, kind, body) VALUES ('product-stt-prompt', 'transcription', 'fixture'), ('product-chat-prompt', 'postprocess', 'fixture'), ('product-selection-prompt', 'selectionTransform', 'fixture')`);
    const definition = {
      schemaVersion: 1,
      label: "Product",
      access: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions"] },
      runtime: {
        transcription: { engineId: "product-stt", promptId: "product-stt-prompt" },
        postprocess: { engineId: "product-chat", promptId: "product-chat-prompt" },
        selectionTransform: { engineId: "product-selection", promptId: "product-selection-prompt" },
      },
      limits: { mode: "block", quotaProfile: "pro-unlimited" },
      userControls: {}, defaults: {},
    };
    const profileId = await createPublishedProfile("product", "Product", definition);
    await sql.unsafe(`INSERT INTO policy_assignments (target_type, target_id, profile_id, priority, source) VALUES ('device', $1::uuid, $2::uuid, 10, 'device')`, [device.id, profileId]);

    const effective = await repository.resolveEffectiveProfile({ deviceId: "product-device", fallbackProfileId: "product" });
    expect(effective?.definition).toEqual({
      ...definition,
      capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions"],
      quota: { profile: "pro-unlimited" },
      engines: {
        transcription: { id: "product-stt", provider: "mock-stt", model: "stt-model", promptId: "product-stt-prompt" },
        postprocess: { id: "product-chat", provider: "mock-chat", model: "chat-model", promptId: "product-chat-prompt" },
        selectionTransform: { id: "product-selection", provider: "mock-selection", model: "selection-model", promptId: "product-selection-prompt" },
        assistant: { id: "product-selection", provider: "mock-selection", model: "selection-model", promptId: "product-selection-prompt" },
      },
    });
    const projected = (await new PostgresAdminRepository(sql).profiles()).find((profile) => profile.profileId === "product");
    expect(projected).toEqual({
      profileId: "product", label: "Product", revision: 0,
      published: { ...definition, profileId: "product", version: 1, status: "published" },
      draft: null,
      history: [{ ...definition, profileId: "product", version: 1, status: "published" }],
    });
  });

  test("applies and rolls back immutable product profiles with idempotent redacted receipts", async () => {
    await sql.unsafe(`INSERT INTO engines (engine_id, kind, provider, model) VALUES ('command-stt', 'transcription', 'mock', 'stt'), ('command-chat', 'postprocess', 'mock', 'chat'), ('command-selection', 'selectionTransform', 'mock', 'selection')`);
    const definition = {
      schemaVersion: 1, label: "Command profile",
      access: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions"] },
      runtime: { transcription: { engineId: "command-stt" }, postprocess: { engineId: "command-chat" }, selectionTransform: { engineId: "command-selection" } },
      limits: { mode: "block", quotaProfile: "pro-unlimited" }, userControls: {}, defaults: {},
    };
    await createPublishedProfile("command", "Command", definition);
    const commands = new PostgresProfileCommandRepository(databaseUrl);
    const nextDefinition = { ...definition, label: "Command profile v2", defaults: { "voice.pressEnterAfterPaste": true } };
    const applied = await commands.apply({ profileId: "command", expectedRevision: 0, definition: nextDefinition, actorRefHash: "actor-redacted", confirmation: "APPLY command REV 0" });
    expect(applied).toEqual({ profileId: "command", label: "Command profile v2", previousVersion: 1, resultingVersion: 2, revision: 1, auditId: applied.auditId, idempotentReplay: false });
    const applyAudits = await sql.unsafe<{ metadata: string; metadata_type: string }>(`SELECT safe_metadata::text AS metadata, jsonb_typeof(safe_metadata) AS metadata_type FROM audit_records WHERE action = 'profile.apply'`);
    expect(applyAudits).toHaveLength(1);
    expect(applyAudits[0].metadata_type).toBe("object");
    expect(applyAudits[0].metadata).toMatch(/commandFingerprint.*[a-f0-9]{64}/);
    for (let index = 0; index < 25; index += 1) {
      await sql.unsafe(`INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata) VALUES ('noise-actor', 'noise', 'test', $1, 'success', jsonb_build_object('index', $2::integer))`, [`noise-${index}`, index]);
    }
    const beforeReplay = await sql.unsafe<{ versions: string; audits: string }>(`SELECT (SELECT count(*)::text FROM profile_versions) AS versions, (SELECT count(*)::text FROM audit_records) AS audits`);
    expect((await commands.apply({ profileId: "command", expectedRevision: 0, definition: nextDefinition, actorRefHash: "actor-redacted", confirmation: "APPLY command REV 0" })).idempotentReplay).toBe(true);
    const afterReplay = await sql.unsafe<{ versions: string; audits: string }>(`SELECT (SELECT count(*)::text FROM profile_versions) AS versions, (SELECT count(*)::text FROM audit_records) AS audits`);
    expect(afterReplay).toEqual(beforeReplay);
    const rolledBack = await commands.rollback({ profileId: "command", targetVersion: 1, expectedRevision: 1, actorRefHash: "actor-redacted", confirmation: "ROLLBACK command TO 1 REV 1" });
    expect(rolledBack).toEqual({ profileId: "command", label: "Command profile", previousVersion: 2, resultingVersion: 3, revision: 2, auditId: rolledBack.auditId, idempotentReplay: false });
    const rows = await sql.unsafe<{ action: string; safe_metadata: Record<string, unknown> | string }>(`SELECT action, safe_metadata FROM audit_records WHERE action LIKE 'profile.%' ORDER BY sequence_id`);
    expect(rows.map((row) => row.action)).toEqual(["profile.apply", "profile.rollback"]);
    expect(JSON.stringify(rows)).not.toContain("Command profile v2");
    expect(JSON.stringify(rows)).not.toContain("APPLY command");
  });

  test("serves canonical profile apply and rollback through the local HTTP contract", async () => {
    await sql.unsafe(`INSERT INTO engines (engine_id, kind, provider, model) VALUES ('http-stt', 'transcription', 'mock', 'stt'), ('http-chat', 'postprocess', 'mock', 'chat'), ('http-selection', 'selectionTransform', 'mock', 'selection')`);
    const definition = { schemaVersion: 1, label: "HTTP profile", access: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions"] }, runtime: { transcription: { engineId: "http-stt" }, postprocess: { engineId: "http-chat" }, selectionTransform: { engineId: "http-selection" } }, limits: { mode: "block", quotaProfile: "pro-unlimited" }, userControls: {}, defaults: {} };
    await createPublishedProfile("http-profile", "HTTP profile", definition);
    const control = new PostgresControlPlaneRepository(sql);
    const device = await control.bindDevice({ installIdHash: "http-owner-install", generatedDeviceId: "http-owner-device" });
    const subjectHash = "d".repeat(64);
    const accounts = await sql.unsafe<{ id: string }>(`INSERT INTO accounts (provider, provider_subject_hash, handle) VALUES ('google', $1, 'http-owner') RETURNING id::text`, [subjectHash]);
    await sql.unsafe(`UPDATE devices SET account_id = $2::uuid WHERE id = $1::uuid`, [device.id, accounts[0].id]);
    await sql.unsafe(`INSERT INTO role_bindings (account_id, role, granted_by) VALUES ($1::uuid, 'owner', 'bootstrap')`, [accounts[0].id]);
    const principalKey = `arp_${subjectHash}`;
    const api = composeApi({ FIXVOX_API_DATABASE_URL: databaseUrl, FIXVOX_API_PUBLIC_BASE_URL: "http://127.0.0.1:8790", FIXVOX_API_MOCK_PROVIDERS: "true", ADMIN_VIEW_API_KEY: "http-view", ADMIN_EDIT_API_KEY: "http-edit", ADMIN_PUBLISH_API_KEY: "http-publish" }, { logger: { info() {} } });
    const headers = { authorization: "Bearer http-publish", "content-type": "application/json", "x-fixvox-principal-key": principalKey, "x-fixvox-recent-google-at": new Date().toISOString() };
    try {
      const profiles = await api.handler(new Request("http://127.0.0.1:8790/product/v1/control-room/profiles", { headers }));
      expect(profiles.status).toBe(200);
      expect(JSON.stringify(await profiles.json())).toContain('"engineId":"http-stt"');
      const candidate = { ...definition, label: "HTTP profile v2", runtime: { transcription: { engineKey: "http-stt" }, postprocess: { engineKey: "http-chat" }, selectionTransform: { engineKey: "http-selection" } } };
      const applyBody = { expectedRevision: 0, definition: candidate, confirmation: { action: "apply", profileKey: "http-profile", expectedRevision: 0, phrase: "APPLY http-profile REV 0" } };
      const applied = await api.handler(new Request("http://127.0.0.1:8790/product/v1/control-room/profiles/http-profile/apply", { method: "POST", headers, body: JSON.stringify(applyBody) }));
      expect(applied.status).toBe(200);
      expect((await applied.json()).data.profile).toEqual({ key: "http-profile", label: "HTTP profile v2", publishedVersion: 2, revision: 1 });
      const replayed = await api.handler(new Request("http://127.0.0.1:8790/product/v1/control-room/profiles/http-profile/apply", { method: "POST", headers, body: JSON.stringify(applyBody) }));
      expect((await replayed.json()).data.idempotentReplay).toBe(true);
      const rollbackBody = { targetVersion: 1, expectedRevision: 1, confirmation: { action: "rollback", profileKey: "http-profile", targetVersion: 1, expectedRevision: 1, phrase: "ROLLBACK http-profile TO 1 REV 1" } };
      const rolledBack = await api.handler(new Request("http://127.0.0.1:8790/product/v1/control-room/profiles/http-profile/rollback", { method: "POST", headers, body: JSON.stringify(rollbackBody) }));
      expect(rolledBack.status).toBe(200);
      expect((await rolledBack.json()).data.profile).toEqual({ key: "http-profile", label: "HTTP profile", publishedVersion: 3, revision: 2 });
    } finally { await api.close(); }
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

  test("keeps the warmed authoritative quota boundary p95 at or below 15 ms", async () => {
    const devices = await sql.unsafe<{ id: string }>(`
      INSERT INTO devices (device_id) VALUES ('quota-latency-device') RETURNING id::text
    `);
    const repository = new PostgresUsageQuotaRepository(sql);
    const latencies: number[] = [];
    for (let index = 0; index < 40; index++) {
      const startedAt = performance.now();
      const decision = await repository.reserve({
        idempotencyKey: `latency-${index}`,
        deviceId: devices[0].id,
        usageKind: "stt",
        amount: 1,
        limit: 100,
        windowStart: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const elapsed = performance.now() - startedAt;
      expect(decision.allowed).toBe(true);
      expect(await repository.release(decision.reservationId!)).toBe(true);
      if (index >= 5) latencies.push(elapsed);
    }
    latencies.sort((left, right) => left - right);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
    console.info(`[fixvox-api] quota_boundary_p95_ms=${p95.toFixed(3)}`);
    expect(p95 <= 15).toBe(true);
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
    expect(manifest.schemaVersion).toBe(5);
    expect(manifest.authority).toEqual({ mode: "cloudflare-authority", revision: 0 });
    expect(manifest.counts.usage_reservations).toBe(0);
    expect(JSON.stringify(manifest)).not.toMatch(/subject-hash|audio|transcript/i);
  });
});
