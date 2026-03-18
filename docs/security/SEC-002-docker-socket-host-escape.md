# SEC-002 — Docker Socket Mount Enables Host Container Escape

| Field       | Value                                      |
|-------------|--------------------------------------------|
| ID          | SEC-002                                    |
| Severity    | **Critical**                               |
| Status      | `resolved`                                 |
| Affected    | Container runtime                          |
| Files       | `docker-compose.yml`                       |

---

## Description

The `docker-compose.yml` mounts the Docker Unix socket directly into the container:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

Access to `/var/run/docker.sock` is functionally equivalent to unrestricted root access on the host. Any process inside the container that can write to this socket can:

- Spawn new privileged containers with `--privileged` and host filesystem mounts
- Mount the host's root filesystem (`/`) into a new container
- Read secrets from other containers' environments and filesystems
- Kill or remove any container on the host
- Install persistent backdoors on the host

This is a necessary trade-off for a Docker management dashboard, but it must be paired with strict controls (authentication, network isolation) to limit who can reach the application. Without SEC-001 (authentication) being addressed, this socket is exposed to any network-accessible client.

---

## Impact

If an attacker reaches the unauthenticated API, they have a clear path to full host root compromise via the mounted socket — for example, by hitting `POST /api/containers/:id/start` to start a crafted container, or by using the Docker API directly through the socket.

---

## Suggested Solution

This socket mount cannot be fully eliminated for this type of application, but the risk can be significantly reduced:

### 1. Fix SEC-001 First

Authentication (SEC-001) is the most important mitigation. Without it, the socket exposure is trivially exploitable.

### 2. Run the Container as a Non-Root User

Add a non-root user to the `Dockerfile` and drop capabilities:

```dockerfile
# In the production stage
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

Add `docker` group socket permissions or use a socket proxy (see below).

### 3. Use a Docker Socket Proxy (Recommended)

Instead of mounting the raw socket, use [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) which is a HAProxy-based filter that only allows specific Docker API calls.

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1   # allow read
      POST: 1         # allow start/stop
      NETWORKS: 0
      VOLUMES: 0
      IMAGES: 0
      BUILD: 0
      SWARM: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - socket-proxy-net

  dock-dash:
    environment:
      - DOCKER_HOST=tcp://socket-proxy:2375
    networks:
      - socket-proxy-net
    # No docker.sock volume here
```

This restricts the app to only the Docker API calls it actually needs.

### 4. Restrict Docker Socket Permissions on the Host

Ensure the Docker socket is only accessible to the `docker` group on the host, and that the container user is only added to that group — not running as root.

### 5. Network Isolation

Use Docker networks to ensure the container is not directly accessible from the internet. Put it behind a reverse proxy that terminates TLS and enforces authentication.

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Tecnativa docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
