# SEC-004 — Unencrypted TCP Docker Connection (Port 2375)

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| ID          | SEC-004                                          |
| Severity    | **High**                                         |
| Status      | `resolved`                                       |
| Affected    | Docker client initialization                     |
| Files       | `packages/backend/src/services/docker.service.ts` |
|             | `docker-compose.yml`                             |

---

## Description

When `DOCKER_HOST` is set to a `tcp://` URI, the Docker client is created without TLS:

```ts
// docker.service.ts
if (host.startsWith('tcp://')) {
  const url = new URL(host)
  return new Dockerode({ host: url.hostname, port: Number(url.port) || 2375 })
  // ↑ No ca, cert, or key options — plaintext, unauthenticated TCP
}
```

The `docker-compose.yml` explicitly documents and hints at using port 2375 for Windows:

```yaml
# - DOCKER_HOST=tcp://host.docker.internal:2375
```

Port 2375 is Docker's unauthenticated plaintext TCP port. Any process or host on the network that can reach this port can issue arbitrary Docker API commands — start/stop/delete containers, pull images, access container logs, read filesystem contents — with no authentication.

---

## Impact

- Full Docker daemon takeover by any network-adjacent attacker
- No confidentiality of Docker API traffic (observable by network eavesdroppers)
- This is independent of the application's own authentication layer

---

## Suggested Solution

### Option A — Avoid TCP Entirely (Preferred)

Use the Docker socket proxy approach from SEC-002 instead of exposing the TCP daemon. This eliminates the TCP attack surface entirely.

### Option B — Use TLS-Authenticated TCP (Port 2376)

If TCP is required, enable Docker's TLS listener. Docker supports mutual TLS (mTLS) on port 2376:

**On the Docker host**, configure the daemon with TLS:
```json
// /etc/docker/daemon.json
{
  "tls": true,
  "tlscacert": "/etc/docker/certs/ca.pem",
  "tlscert": "/etc/docker/certs/server-cert.pem",
  "tlskey": "/etc/docker/certs/server-key.pem",
  "tlsverify": true,
  "hosts": ["tcp://0.0.0.0:2376"]
}
```

**In `docker.service.ts`**, supply the client certificate:
```ts
if (host.startsWith('tcp://')) {
  const url = new URL(host)
  return new Dockerode({
    host: url.hostname,
    port: Number(url.port) || 2376,
    ca: fs.readFileSync(process.env.DOCKER_TLS_CA!),
    cert: fs.readFileSync(process.env.DOCKER_TLS_CERT!),
    key: fs.readFileSync(process.env.DOCKER_TLS_KEY!),
  })
}
```

### Option C — Add a Warning Log

At minimum, log a warning when connecting to an unencrypted TCP endpoint:

```ts
if (host.startsWith('tcp://')) {
  const url = new URL(host)
  const port = Number(url.port) || 2375
  if (port === 2375) {
    console.warn(
      'WARNING: Connecting to Docker over unencrypted TCP port 2375. ' +
      'This is insecure. Use port 2376 with TLS in production.'
    )
  }
  return new Dockerode({ host: url.hostname, port })
}
```

---

## References

- [Docker: Protect the Docker daemon socket](https://docs.docker.com/engine/security/protect-access/)
- [CWE-319: Cleartext Transmission of Sensitive Information](https://cwe.mitre.org/data/definitions/319.html)
