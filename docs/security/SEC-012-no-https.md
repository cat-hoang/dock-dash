# SEC-012 — No HTTPS / TLS Termination

| Field       | Value                                    |
|-------------|------------------------------------------|
| ID          | SEC-012                                  |
| Severity    | **Medium**                               |
| Status      | `resolved`                               |
| Affected    | All HTTP traffic                         |
| Files       | `packages/backend/src/index.ts`          |
|             | `docker-compose.yml`                     |

---

## Description

The application serves all traffic over plain HTTP with no TLS. All API requests — including container start/stop commands, settings reads/writes, and any future authentication tokens — are transmitted in cleartext.

```ts
// index.ts — plain HTTP listener, no TLS options
await app.listen({ port, host: '0.0.0.0' })
```

```yaml
# docker-compose.yml — exposes plain HTTP port
ports:
  - "3001:3001"
```

Anyone on the same network segment (LAN, Wi-Fi, VPN) can passively observe all API traffic using standard tools.

---

## Impact

- API traffic (container control commands, settings) is observable by network eavesdroppers
- Once authentication (SEC-001) is implemented, credentials/tokens would also be transmitted in cleartext without HTTPS
- Particularly relevant on shared or untrusted networks

---

## Suggested Solution

### Option A — Reverse Proxy with TLS (Recommended)

The application should not terminate TLS itself. Instead, place it behind a reverse proxy that handles TLS. This is the standard pattern for containerized applications.

**Using Caddy** (automatic HTTPS with Let's Encrypt):

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks:
      - frontend-net

  dock-dash:
    # Remove public port mapping — only accessible via Caddy internally
    expose:
      - "3001"
    networks:
      - frontend-net
```

```
# Caddyfile
dashboard.yourdomain.com {
    reverse_proxy dock-dash:3001
}
```

**Using nginx:**
```nginx
server {
    listen 443 ssl;
    server_name dashboard.yourdomain.com;
    ssl_certificate     /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    location / {
        proxy_pass http://dock-dash:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Option B — Self-Hosted / Local Network with Self-Signed Certificate

For internal-only deployments, generate a self-signed certificate and configure it in Fastify:

```ts
import fs from 'node:fs'
import https from 'node:https'

const app = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(process.env.TLS_KEY_PATH!),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH!),
  },
})
```

### Connection to SEC-001

Implementing HTTPS becomes critical once authentication (SEC-001) is in place — without HTTPS, auth tokens are transmitted in cleartext, making the authentication mechanism ineffective against network-level attackers.

---

## References

- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Fastify HTTPS](https://fastify.dev/docs/latest/Reference/Server/#https)
- [CWE-319: Cleartext Transmission of Sensitive Information](https://cwe.mitre.org/data/definitions/319.html)
