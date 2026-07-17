export type VerifiedGoogleIdentity = { subject: string; verifiedAt: Date };
export type OAuthExchange = { exchangeAndVerify(input: { code: string }): Promise<VerifiedGoogleIdentity> };

/** Deterministic provider-free boundary. It intentionally never performs network I/O or stores tokens. */
export function createMockOAuthExchange(): OAuthExchange {
  return {
    async exchangeAndVerify({ code }) {
      if (!code || code === "mock-fail") throw new Error("mock_oauth_exchange_failed");
      return { subject: `mock-google:${code}`, verifiedAt: new Date() };
    },
  };
}
