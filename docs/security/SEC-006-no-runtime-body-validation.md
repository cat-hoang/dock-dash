# SEC-006 — No Runtime Request Body Schema Validation

| Field       | Value                                              |
|-------------|--------------------------------------------------|
| ID          | SEC-006                                          |
| Severity    | **High**                                         |
| Status      | `resolved`                                       |
| Affected    | Settings POST endpoint                           |
| Files       | `packages/backend/src/routes/settings.route.ts`  |

---

## Description

The `POST /api/settings` handler relies solely on TypeScript types for body shape enforcement. TypeScript types are erased at runtime — the compiled JavaScript accepts any JSON body:

```ts
// TypeScript type provides no runtime protection
app.post<{ Body: Partial<Settings> }>('/', async (req, reply) => {
  const current = getSettings()
  const updated = { ...current, ...req.body }  // req.body is literally `any` at runtime
  return saveSettings(updated)
})
```

An attacker can send:
- Extra properties beyond the defined `Settings` interface, which get spread into the settings object and persisted to disk
- Incorrect types (e.g., `{ "composeFolder": null }`, `{ "composeFolder": { "nested": "object" } }`)
- An excessively large body
- Properties with names that could cause issues (e.g., `__proto__`, `constructor`)

---

## Impact

- Arbitrary properties are merged into the settings JSON file on disk
- Null or non-string values for `composeFolder` may cause unexpected behaviour in `compose.service.ts` which expects a string
- Prototype pollution is mitigated by the spread operator but the settings file can be polluted with unexpected keys
- No input size bounds are enforced at the application level

---

## Suggested Solution

### Use Fastify's Built-in JSON Schema Validation

Register a body schema on the route. Fastify uses [Ajv](https://ajv.js.org/) under the hood and validates the body before the handler runs:

```ts
const postBodySchema = {
  body: {
    type: 'object',
    properties: {
      composeFolder: {
        type: 'string',
        minLength: 0,
        maxLength: 512,
      },
    },
    additionalProperties: false,   // reject unknown fields
    required: [],
  },
}

app.post<{ Body: Partial<Settings> }>(
  '/',
  { schema: postBodySchema },
  async (req, reply) => {
    const current = getSettings()
    const updated = { ...current, ...req.body }
    return saveSettings(updated)
  }
)
```

Key points:
- `additionalProperties: false` blocks unknown fields from entering the settings object
- `maxLength` prevents excessively long strings
- `type: 'string'` rejects null, objects, arrays
- Fastify returns a descriptive `400` automatically on schema failure

---

## References

- [Fastify Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)
- [OWASP: Mass Assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)
