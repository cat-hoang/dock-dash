# SEC-007 — Full Filesystem Paths Disclosed in API Response

| Field       | Value                                               |
|-------------|-----------------------------------------------------|
| ID          | SEC-007                                             |
| Severity    | **High**                                            |
| Status      | `resolved`                                          |
| Affected    | Compose file list endpoint                          |
| Files       | `packages/backend/src/services/compose.service.ts`  |

---

## Description

The `GET /api/compose` endpoint returns full absolute filesystem paths for every discovered compose file:

```ts
// compose.service.ts
const fullPath = path.join(baseFolder, match)
const folder = path.dirname(fullPath)

files.push({ project, filePath: fullPath, folder })
//                      ↑ e.g. /home/alice/projects/myapp/docker-compose.yml
//                                        ↑ e.g. /home/alice/projects/myapp
```

A sample API response looks like:
```json
[
  {
    "project": "myapp",
    "filePath": "/home/alice/projects/myapp/docker-compose.yml",
    "folder": "/home/alice/projects/myapp"
  }
]
```

This reveals:
- The server's home directory structure and username
- Mount points and disk layout
- The exact path used as `composeFolder` in settings

---

## Impact

- Information useful for planning further attacks (directory structure, usernames, mount points)
- Combined with SEC-003 (path traversal), an attacker can enumerate paths and correlate them with the full filesystem layout

---

## Suggested Solution

### Return Relative Paths Instead of Absolute Paths

Since the frontend only needs to display a project name and does not need the full server path for any UI function, strip the base folder prefix before returning:

```ts
export async function scanComposeFiles(baseFolder: string): Promise<ComposeFile[]> {
  // ... existing glob logic ...

  for (const match of matches) {
    const fullPath = path.join(baseFolder, match)
    const folder = path.dirname(fullPath)
    const project = path.basename(folder)

    if (!files.find((f) => f.folder === folder)) {
      files.push({
        project,
        filePath: match,                          // relative to baseFolder
        folder: path.relative(baseFolder, folder) // relative to baseFolder
      })
    }
  }
```

### Remove `filePath` Entirely if Not Used

Review whether the frontend actually uses `filePath`. If it is only used to display the path to the user, consider whether that is worth the information disclosure trade-off, or replace it with a sanitized display value.

---

## References

- [OWASP: Sensitive Data Exposure (A02:2021)](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
- [CWE-200: Exposure of Sensitive Information](https://cwe.mitre.org/data/definitions/200.html)
