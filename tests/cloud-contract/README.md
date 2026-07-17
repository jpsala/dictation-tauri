# Fixvox Cloud contract fixtures

Checkpoint A fixtures freeze the current Worker surface before extracting a Bun/PostgreSQL adapter.

- `fixtures.ts`: route inventory plus provider-free request/response expectations.
- `redaction.ts`: normalized schemas and evidence redaction guards.
- `contract-fixtures.test.ts`: source-coverage and fixture/redaction checks.
- `cloud/fixvox-proxy/src/contract-runner.test.ts`: deterministic Worker execution with memory KV/DO and mocked upstreams.

Run from the repository root:

```text
npm run test:pipeline -- tests/cloud-contract
npm run cloud:test
```

The runner writes only normalized, redacted evidence under ignored `artifacts/self-hosted-control-plane/checkpoint-a/`. It never contacts a real provider or production control-plane endpoint.
