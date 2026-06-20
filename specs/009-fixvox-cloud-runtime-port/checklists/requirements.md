# Requirements Checklist: Fixvox Cloud Runtime Port

- [ ] Managed cloud path avoids provider keys in React.
- [ ] Managed cloud path uses `X-Device-Id`.
- [ ] Device registration is host-owned.
- [ ] Preflight blocks unavailable/denied managed execution.
- [ ] Direct BYOK is explicit, not silent fallback.
- [ ] Default CI checks perform no real network/provider calls.
- [ ] Cloud smoke evidence is redacted.
