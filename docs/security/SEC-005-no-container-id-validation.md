# SEC-005 — No Container ID Parameter Validation

| Field       | Value                                              |
|-------------|--------------------------------------------------|
| ID          | SEC-005                                          |
| Severity    | **High**                                         |
| Status      | `resolved`                                       |
| Affected    | Container start/stop endpoints                   |
| Files       | `packages/backend/src/routes/containers.route.ts` |

---

## Description

The `:id` route parameter for the start and stop endpoints is passed directly to Dockerode without any format validation:

```ts
app.post<{ Params: { id: string } }>('/:id/start', async (req, reply) => {
  try {
    await startContainer(req.params.id)   // no validation of req.params.id
    return { success: true }
  } catch (err: any) {
    reply.status(500).send({ error: err?.message ?? 'Failed to start container' })
  }
})
```

Docker container IDs are either 12-character or 64-character lowercase hexadecimal strings. The application does not verify this format before passing the value to the Docker API. While Dockerode will reject malformed IDs, this represents a lack of defense-in-depth at the API boundary.

---

## Impact

- Arbitrary strings are forwarded to the Docker daemon, increasing the attack surface
- Internal Docker error messages (which may be verbose) are returned to the client (see SEC-009)
- A future code change that does more processing with the ID (e.g., building a shell command, a file path, or a log query) could be vulnerable to injection

---

## Suggested Solution

### Add a JSON Schema Validation on the Route Params

Fastify supports parameter-level schema validation natively. Add a regex pattern that matches valid container ID formats:

```ts
const containerParamSchema = {
  params: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-f0-9]{12,64}$',
      },
    },
    required: ['id'],
  },
}

app.post<{ Params: { id: string } }>(
  '/:id/start',
  { schema: containerParamSchema },
  async (req, reply) => {
    try {
      await startContainer(req.params.id)
      return { success: true }
    } catch (err: any) {
      reply.status(500).send({ error: 'Failed to start container' })
    }
  }
)
```

Fastify will automatically return a `400 Bad Request` with a descriptive error if the parameter doesn't match the pattern, before any handler code runs.

---

## References

- [Fastify Schema Validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)
