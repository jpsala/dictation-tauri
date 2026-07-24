import { describe, expect, test } from "bun:test";
import {
  buildGoogleOAuthAuthorizeUrl,
  createGoogleOAuthExchange,
} from "../src/oauth.ts";

describe("Google OAuth boundary", () => {
  test("builds a complete authorization request and always shows account selection", () => {
    const authorizeUrl = new URL(buildGoogleOAuthAuthorizeUrl({
      clientId: "fixture-client",
      redirectUri: "https://auth.fixture.test/callback",
    }, "fixture-state"));
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(authorizeUrl.searchParams)).toEqual({
      client_id: "fixture-client",
      prompt: "select_account",
      redirect_uri: "https://auth.fixture.test/callback",
      response_type: "code",
      scope: "openid email profile",
      state: "fixture-state",
    });
  });

  test("exchanges the code server-side and verifies the Google userinfo subject", async () => {
    const calls: Array<{ url: string; authorization?: string; body?: string }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        ...(init?.headers ? { authorization: new Headers(init.headers).get("authorization") ?? undefined } : {}),
        ...(init?.body ? { body: String(init.body) } : {}),
      });
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "fixture-access-token" });
      }
      return Response.json({ sub: "fixture-google-subject", email_verified: true });
    }) as typeof fetch;
    const exchange = createGoogleOAuthExchange({
      clientId: "fixture-client",
      clientSecret: "fixture-secret",
      redirectUri: "https://auth.fixture.test/callback",
    }, fetchImpl);

    const identity = await exchange.exchangeAndVerify({ code: "fixture-code" });

    expect(identity.subject).toBe("fixture-google-subject");
    expect(identity.verifiedAt instanceof Date).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    const tokenBody = new URLSearchParams(calls[0]?.body);
    expect(tokenBody.get("client_id")).toBe("fixture-client");
    expect(tokenBody.get("client_secret")).toBe("fixture-secret");
    expect(tokenBody.get("redirect_uri")).toBe("https://auth.fixture.test/callback");
    expect(calls[1]).toEqual({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
      authorization: "Bearer fixture-access-token",
    });
  });

  test("fails closed when Google does not return a verified identity", async () => {
    const fetchImpl = (async (input: string | URL | Request) => String(input).endsWith("/token")
      ? Response.json({ access_token: "fixture-access-token" })
      : Response.json({ sub: "fixture-google-subject", email_verified: false })) as typeof fetch;
    const exchange = createGoogleOAuthExchange({
      clientId: "fixture-client",
      clientSecret: "fixture-secret",
      redirectUri: "https://auth.fixture.test/callback",
    }, fetchImpl);

    await expect(exchange.exchangeAndVerify({ code: "fixture-code" }))
      .rejects.toThrow("google_oauth_identity_invalid");
  });
});
