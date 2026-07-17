import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accountHandleForGoogleSubject,
  annotateCurrentAdminAccount,
} from "../../admin/fixvox-web/account-identity.mjs";

describe("Admin current account identity", () => {
  it("marks the existing Google account without exposing its subject or email", () => {
    const subject = "google-sub-123456";
    const currentHandle = accountHandleForGoogleSubject(subject);
    const other = {
      accountHandle: "acc_other",
      userRedacted: "google user redacted",
      userEmail: null,
    };

    const result = annotateCurrentAdminAccount({
      accounts: [
        {
          accountHandle: currentHandle,
          userRedacted: "google user redacted",
          userEmail: null,
        },
        other,
      ],
    }, {
      provider: "google",
      sub: subject,
      name: "Juan Pablo Sala",
      email: "jpsala@gmail.com",
    });

    expect(result.currentAccount).toEqual({
      linked: true,
      displayName: "Juan Pablo Sala",
      userEmailRedacted: "j…@gmail.com",
    });
    expect(result.accounts[0]).toMatchObject({
      accountHandle: currentHandle,
      isCurrentAccount: true,
      displayName: "Juan Pablo Sala",
      userEmailRedacted: "j…@gmail.com",
    });
    expect(result.accounts[1]).toEqual(other);
    expect(JSON.stringify(result)).not.toContain(subject);
    expect(JSON.stringify(result)).not.toContain("jpsala@gmail.com");
  });

  it("strips raw account identity fields from proxied account payloads", () => {
    const result = annotateCurrentAdminAccount({
      accounts: [{ accountHandle: "acc_safe", accountId: "google:raw@example.com", userEmail: "raw@example.com", googleSubject: "subject-secret" }],
    }, null)

    expect(result.accounts).toEqual([{ accountHandle: "acc_safe", userEmail: null }])
    expect(JSON.stringify(result)).not.toContain("raw@example.com")
    expect(JSON.stringify(result)).not.toContain("subject-secret")
  })

  it("reports an unlinked admin identity without fabricating an account", () => {
    const accounts = [{ accountHandle: "acc_other", userRedacted: "user redacted" }];
    const result = annotateCurrentAdminAccount({ accounts }, {
      provider: "google",
      sub: "unlinked-google-sub",
      name: "Juan Pablo Sala",
      email: "jpsala@gmail.com",
    });

    expect(result.accounts).toEqual(accounts);
    expect(result.currentAccount).toEqual({
      linked: false,
      displayName: "Juan Pablo Sala",
      userEmailRedacted: "j…@gmail.com",
    });
  });

  it("keeps the Google subject server-side and renders a recognizable badge", () => {
    const serverSource = readFileSync("admin/fixvox-web/server.mjs", "utf8");
    const appSource = readFileSync("admin/fixvox-web/public/app.js", "utf8");

    expect(serverSource).toContain("sub: String(user.sub || '').trim() || null");
    expect(serverSource).toContain("annotateCurrentAdminAccount(accounts, readSession(req))");
    expect(serverSource).not.toContain("user: { provider: readSession(req).provider, email: readSession(req).email || null, name: readSession(req).name || null, sub:");
    expect(appSource).toContain("Tu cuenta");
    expect(appSource).toContain("isCurrentAccount");
    expect(appSource).toContain("currentAccount.linked");
    expect(appSource).not.toContain("account.googleSubject");
  });
});
