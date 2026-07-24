export type VerifiedGoogleIdentity = { subject: string; verifiedAt: Date };
export type OAuthExchange = { exchangeAndVerify(input: { code: string }): Promise<VerifiedGoogleIdentity> };

export type GoogleOAuthPublicConfig = {
  clientId: string;
  redirectUri: string;
};

export type GoogleOAuthExchangeConfig = GoogleOAuthPublicConfig & {
  clientSecret: string;
  timeoutMs?: number;
};

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function buildGoogleOAuthAuthorizeUrl(
  config: GoogleOAuthPublicConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export function createGoogleOAuthExchange(
  config: GoogleOAuthExchangeConfig,
  fetchImpl: typeof fetch = fetch,
): OAuthExchange {
  return {
    async exchangeAndVerify({ code }) {
      if (!code) throw new Error("google_oauth_code_missing");
      const signal = AbortSignal.timeout(config.timeoutMs ?? 30_000);
      const tokenBody = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      });
      const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenBody,
        signal,
      });
      if (!tokenResponse.ok) throw new Error("google_oauth_exchange_failed");
      const token = await tokenResponse.json() as Record<string, unknown>;
      const accessToken = typeof token.access_token === "string" ? token.access_token : "";
      if (!accessToken) throw new Error("google_oauth_exchange_invalid");

      const identityResponse = await fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!identityResponse.ok) throw new Error("google_oauth_identity_failed");
      const identity = await identityResponse.json() as Record<string, unknown>;
      const subject = typeof identity.sub === "string" ? identity.sub.trim() : "";
      if (!subject || identity.email_verified !== true) {
        throw new Error("google_oauth_identity_invalid");
      }
      return { subject, verifiedAt: new Date() };
    },
  };
}

/** Deterministic provider-free boundary. It intentionally never performs network I/O or stores tokens. */
export function createMockOAuthExchange(): OAuthExchange {
  return {
    async exchangeAndVerify({ code }) {
      if (!code || code === "mock-fail") throw new Error("mock_oauth_exchange_failed");
      return { subject: `mock-google:${code}`, verifiedAt: new Date() };
    },
  };
}
