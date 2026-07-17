export type AdminCapability = "view" | "edit" | "publish";
export type AdminAuthorizationFailure = "missing_admin_api_key" | "invalid_admin_token" | "insufficient_admin_capability";

export function authorizeAdminBearer(
  credentials: Array<readonly [token: string, capability: AdminCapability]>,
  authorizationHeader: string | null,
  required: AdminCapability,
): AdminAuthorizationFailure | null {
  const configured = credentials.filter(([token]) => Boolean(token.trim()));
  if (configured.length === 0) return "missing_admin_api_key";

  const authHeader = authorizationHeader?.trim() ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const granted = configured.find(([candidate]) => token === candidate)?.[1];
  if (!granted) return "invalid_admin_token";

  const rank: Record<AdminCapability, number> = { view: 1, edit: 2, publish: 3 };
  return rank[granted] < rank[required] ? "insufficient_admin_capability" : null;
}
