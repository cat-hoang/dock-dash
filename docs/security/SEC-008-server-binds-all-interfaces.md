# SEC-008 — Server Binds to All Network Interfaces (`0.0.0.0`)

| Field       | Value                                    |
|-------------|------------------------------------------|
| ID          | SEC-008                                  |
| Severity    | **High**                                 |
| Status      | `resolved`                                 |
| Affected    | Server network binding                   |
| Files       | `packages/backend/src/index.ts`          |

---

## Description

The Fastify server is hardcoded to listen on all network interfaces:

```ts
await app.listen({ port, host: '0.0.0.0' })
```

Binding to `0.0.0.0` means the application accepts connections from every network interface on the host — localhost, LAN, Wi-Fi, VPNs, and potentially the public internet. This is appropriate when the application is intentionally behind a reverse proxy and relies on network-level controls, but dangerous when paired with the lack of authentication (SEC-001) or when no reverse proxy is present.

---

## Impact

- The Docker management API is accessible from any network the host is connected to
- If the host has a public IP or is on a shared network, the unauthenticated API is directly reachable
- Amplifies the impact of every other vulnerability in this audit

---

## Suggested Solution

### Option A — Bind to `127.0.0.1` and Use a Reverse Proxy (Recommended for Production)

Change the default host binding so the app only accepts local connections. A reverse proxy (nginx, Caddy, Traefik) handles TLS and authentication, and forwards traffic to the backend:

```ts
const host = process.env.HOST ?? '127.0.0.1'
await app.listen({ port, host })
```

Then in `docker-compose.yml`, use an internal network and let the reverse proxy container expose port 443.

### Option B — Make the Bind Address Configurable

Allow the operator to override the host via an environment variable, defaulting to `127.0.0.1`:

```ts
// index.ts
const host = process.env.HOST ?? '127.0.0.1'
await app.listen({ port, host })
```

For Docker deployments where `0.0.0.0` is needed (because Docker maps the internal port to the host), the operator can set `HOST=0.0.0.0` explicitly, making the choice conscious.

### Note on Docker Port Mapping

When running inside Docker, `0.0.0.0` inside the container is typically required for Docker's port mapping to work (`"3001:3001"`). In this case, restrict exposure at the Docker level instead:

```yaml
# Bind only to localhost on the host machine
ports:
  - "127.0.0.1:3001:3001"
```

This prevents the port from being accessible from other hosts on the network while keeping the container binding at `0.0.0.0` as required.

---

## References

- [Docker: Published ports](https://docs.docker.com/network/#published-ports)
- [CWE-605: Multiple Binds to the Same Port](https://cwe.mitre.org/data/definitions/605.html)
