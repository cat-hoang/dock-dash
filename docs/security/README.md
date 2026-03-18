# Security Issues — DockDash

This directory tracks all identified security issues for the DockDash project.
Each issue has its own file with a full description, impact analysis, and suggested solution.

## How to Use

Update the `Status` field in each issue file as work progresses.

| Status | Meaning |
|---|---|
| `open` | Identified, not yet addressed |
| `in-progress` | Actively being worked on |
| `fixed` | Resolved and verified |
| `postponed` | Acknowledged, deferred to a later date |
| `wont-fix` | Accepted risk — documented reason required |

---

## Issue Tracker

| ID | Severity | Status | Summary | File |
|----|----------|--------|---------|------|
| SEC-001 | Critical | `open` | No authentication or authorization on any endpoint | [SEC-001](./SEC-001-no-authentication.md) |
| SEC-002 | Critical | `open` | Docker socket mount enables host container escape | [SEC-002](./SEC-002-docker-socket-host-escape.md) |
| SEC-003 | Critical | `open` | Path traversal via unvalidated `composeFolder` setting | [SEC-003](./SEC-003-path-traversal-compose-folder.md) |
| SEC-004 | High | `open` | Unencrypted TCP Docker connection (port 2375, no TLS) | [SEC-004](./SEC-004-unencrypted-tcp-docker.md) |
| SEC-005 | High | `open` | No format validation on container ID route parameter | [SEC-005](./SEC-005-no-container-id-validation.md) |
| SEC-006 | High | `open` | No runtime request body schema validation on settings endpoint | [SEC-006](./SEC-006-no-runtime-body-validation.md) |
| SEC-007 | High | `open` | Full server filesystem paths disclosed in API responses | [SEC-007](./SEC-007-filesystem-paths-in-api-response.md) |
| SEC-008 | High | `open` | Server binds to all interfaces (`0.0.0.0`) with no auth | [SEC-008](./SEC-008-server-binds-all-interfaces.md) |
| SEC-009 | Medium | `open` | Internal Docker error messages forwarded to clients | [SEC-009](./SEC-009-error-message-leakage.md) |
| SEC-010 | Medium | `open` | Wildcard CORS (`origin: true`) in development mode | [SEC-010](./SEC-010-wildcard-cors.md) |
| SEC-011 | Medium | `open` | No rate limiting on container start/stop endpoints | [SEC-011](./SEC-011-no-rate-limiting.md) |
| SEC-012 | Medium | `open` | No HTTPS — all API traffic transmitted in cleartext | [SEC-012](./SEC-012-no-https.md) |

---

## Priority Order

Address issues in this order for the most risk reduction per effort:

1. **SEC-001** — Authentication blocks the majority of attack scenarios
2. **SEC-003** — Path traversal is directly exploitable via the API
3. **SEC-007** — Trivial fix, reduces information available to attackers
4. **SEC-009** — Trivial fix, reduces error message leakage
5. **SEC-006** — Add Fastify schema validation to the settings route
6. **SEC-005** — Add Fastify schema validation to the container ID param
7. **SEC-010** — Tighten CORS to the known Vite dev origin
8. **SEC-008** — Restrict Docker port binding to `127.0.0.1` in compose
9. **SEC-002** — Use docker-socket-proxy to restrict socket access (after auth is done)
10. **SEC-011** — Add `@fastify/rate-limit`
11. **SEC-004** — Use TLS or avoid TCP entirely if using socket proxy
12. **SEC-012** — Add a reverse proxy (Caddy / nginx) for TLS termination

---

## Audit Info

| Field | Value |
|---|---|
| Audit date | 2026-03-10 |
| Audited by | Claude (automated static analysis) |
| Codebase commit | `9cb2adb` |
