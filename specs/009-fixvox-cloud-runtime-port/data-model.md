# Data Model: Fixvox Cloud Runtime Port

## CloudRuntimeConfig

- `baseUrl: string`
- `mode: "managed" | "direct" | "providerFree"`
- `installId: string`
- `deviceId?: string`
- `lastRegisterAt?: string`
- `lastError?: RedactedHostRuntimeError`

## DeviceRegistrationSnapshot

- `ok: boolean`
- `deviceId: string`
- `activated: boolean`
- `policyId?: string`
- `policyLabel?: string`
- `authRequired: boolean`
- `authProviders: string[]`
- `features: Record<string, boolean>`
- `defaults?: unknown`
- `limits?: unknown`
- `transportPolicy?: unknown`

## ManagedPreflightDecision

- `allowed: boolean`
- `reason?: "device_not_registered" | "auth_required" | "service_unavailable" | "policy_blocked" | "quota_exceeded"`
- `retryAfterSeconds?: number`
- `limits?: unknown`

## FixvoxProxyMetadata

- `backendRequestId?: string`
- `providerRequestId?: string`
- `costUsd?: number`
- `pricingSource?: string`
- `usageLimit?: number`
- `usageRemaining?: number`
- `usageResetAt?: string`
- `usageKey?: string`
- `proxyParseMs?: number`
- `proxyUsageMs?: number`
- `proxyUpstreamMs?: number`
- `proxyInitMs?: number`
- `proxyTotalMs?: number`
- `serverTiming?: string`
