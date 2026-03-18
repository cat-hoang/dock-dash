# SEC-009 — Internal Error Messages Forwarded to Clients

| Field       | Value                                              |
|-------------|--------------------------------------------------|
| ID          | SEC-009                                          |
| Severity    | **Medium**                                       |
| Status      | `resolved`                                       |
| Affected    | Container start/stop error responses             |
| Files       | `packages/backend/src/routes/containers.route.ts` |

---

## Description

When Docker operations fail, the raw exception message from Dockerode is forwarded directly to the client:

```ts
// containers.route.ts
} catch (err: any) {
  reply.status(500).send({ error: err?.message ?? 'Failed to start container' })
}
```

Docker and Node.js error messages can contain:
- Internal file paths (e.g., socket paths, module paths)
- Docker API version strings
- Daemon version information
- Network addresses
- Detailed state information about the Docker environment

Example of a real Dockerode error message that would be forwarded:
```
connect ENOENT /var/run/docker.sock
```
or
```
(HTTP code 409) unexpected - Cannot start container abc123: container already started
```

---

## Impact

- Reveals implementation details useful for reconnaissance
- Exposes filesystem paths, daemon versions, and API internals
- Aids attackers in tailoring subsequent attacks based on exact error conditions

---

## Suggested Solution

### Log Internally, Return Generic Message to Client

Keep detailed errors in server logs (they are already logged by Fastify's built-in logger) but return only a generic message to the client:

```ts
app.post<{ Params: { id: string } }>('/:id/start', async (req, reply) => {
  try {
    await startContainer(req.params.id)
    return { success: true }
  } catch (err: any) {
    req.log.error({ err, containerId: req.params.id }, 'Failed to start container')
    reply.status(500).send({ error: 'Failed to start container' })
  }
})

app.post<{ Params: { id: string } }>('/:id/stop', async (req, reply) => {
  try {
    await stopContainer(req.params.id)
    return { success: true }
  } catch (err: any) {
    req.log.error({ err, containerId: req.params.id }, 'Failed to stop container')
    reply.status(500).send({ error: 'Failed to stop container' })
  }
})
```

### Consider Returning Specific Business-Level Errors

For known error conditions (e.g., container already running, container not found), return a specific but non-leaking message:

```ts
} catch (err: any) {
  req.log.error({ err }, 'startContainer failed')
  const statusCode = err?.statusCode ?? 500
  if (statusCode === 404) {
    return reply.status(404).send({ error: 'Container not found' })
  }
  if (statusCode === 304 || statusCode === 409) {
    return reply.status(409).send({ error: 'Container is already running' })
  }
  reply.status(500).send({ error: 'Failed to start container' })
}
```

---

## References

- [OWASP: Improper Error Handling](https://owasp.org/www-community/Improper_Error_Handling)
- [CWE-209: Information Exposure Through an Error Message](https://cwe.mitre.org/data/definitions/209.html)
