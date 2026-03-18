# SEC-003 — Path Traversal via Unvalidated `composeFolder`

| Field       | Value                                           |
|-------------|-------------------------------------------------|
| ID          | SEC-003                                         |
| Severity    | **Critical**                                    |
| Status      | `resolved`                                      |
| Affected    | Compose file scanner, settings endpoint         |
| Files       | `packages/backend/src/routes/settings.route.ts` |
|             | `packages/backend/src/services/compose.service.ts` |

---

## Description

The `composeFolder` value is saved from the user-supplied request body without any path validation, and is then passed directly to `glob` as the `cwd` base directory:

**`settings.route.ts`**
```ts
// No validation — any string is accepted and persisted
const updated = { ...current, ...req.body }
return saveSettings(updated)
```

**`compose.service.ts`**
```ts
// composeFolder comes from user-controlled settings, no sanitization
const matches = await glob(`**/${pattern}`, {
  cwd: baseFolder,    // ← attacker-controlled
  absolute: false,
  ignore: ['**/node_modules/**'],
})

// Full paths returned in API response
files.push({ project, filePath: fullPath, folder })
```

An attacker can set `composeFolder` to any path (`/`, `/etc`, `/var/run`, `/home`, etc.) and trigger a directory traversal through `GET /api/compose`. The full absolute `filePath` and `folder` are returned in the JSON response, exposing the host's directory structure.

---

## Impact

- **Filesystem enumeration:** Any directory on the server can be scanned for files matching compose filename patterns.
- **Information disclosure:** Full absolute paths are returned, revealing directory structure, usernames, and mount points.
- **Amplified by SEC-001:** Without authentication, any remote client can exploit this.

---

## Suggested Solution

### 1. Validate `composeFolder` is an Absolute Path and Exists

```ts
import path from 'node:path'
import fs from 'node:fs'

function isValidComposeFolder(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  if (!path.isAbsolute(value)) return false
  try {
    const stat = fs.statSync(value)
    return stat.isDirectory()
  } catch {
    return false
  }
}
```

### 2. Use Fastify JSON Schema Body Validation

```ts
const postSchema = {
  body: {
    type: 'object',
    properties: {
      composeFolder: { type: 'string', minLength: 1, maxLength: 512 },
    },
    additionalProperties: false,
  },
}

app.post('/', { schema: postSchema }, async (req, reply) => {
  const body = req.body as Partial<Settings>
  if (body.composeFolder !== undefined && !isValidComposeFolder(body.composeFolder)) {
    return reply.status(400).send({ error: 'Invalid composeFolder path' })
  }
  const current = getSettings()
  const updated = { ...current, ...body }
  return saveSettings(updated)
})
```

### 3. Strip Full Paths from API Response

Return only relative or masked path information to clients (see also SEC-007):

```ts
files.push({
  project,
  filePath: match,          // relative to baseFolder, not absolute
  folder: path.basename(folder),
})
```

### 4. Optionally Allowlist Specific Base Paths

Accept a `COMPOSE_BASE_DIR` environment variable and reject any `composeFolder` that is not inside it:

```ts
const baseDir = process.env.COMPOSE_BASE_DIR
if (baseDir) {
  const resolved = path.resolve(composeFolder)
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    return reply.status(400).send({ error: 'composeFolder outside allowed base directory' })
  }
}
```

---

## References

- [OWASP: Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [CWE-22: Improper Limitation of a Pathname](https://cwe.mitre.org/data/definitions/22.html)
