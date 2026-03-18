# SEC-010 — Wildcard CORS in Development Mode

| Field       | Value                                    |
|-------------|------------------------------------------|
| ID          | SEC-010                                  |
| Severity    | **Medium**                               |
| Status      | `resolved`                               |
| Affected    | CORS configuration                       |
| Files       | `packages/backend/src/index.ts`          |

---

## Description

In development mode, CORS is configured to reflect any origin:

```ts
if (!isProd) {
  await app.register(cors, { origin: true })
}
```

Setting `origin: true` causes `@fastify/cors` to echo back whatever `Origin` header the request sends. This means any website — including malicious ones — can make cross-origin requests to the development API from a user's browser.

While this is development-only, the development API is a fully functional Docker management interface. Developers who run the dev server on a shared machine, or who visit malicious websites while the dev server is running, are at risk.

---

## Impact

- A malicious website visited by a developer can issue any API request (start/stop containers, read/write settings) via the developer's browser
- Since the API has no authentication (SEC-001), there is no token to steal — the browser simply makes the requests and they succeed
- This is a CSRF-like attack vector enabled by the permissive CORS policy

---

## Suggested Solution

### Restrict CORS to the Known Vite Dev Server Origin

```ts
if (!isProd) {
  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
  })
}
```

The Vite dev server always runs on port 5173 (as configured in `vite.config.ts`). Allowing only this origin restricts cross-origin requests to the expected development workflow while still supporting direct API testing on the same host.

If the Vite port needs to be configurable, read it from an environment variable:

```ts
const vitePort = process.env.VITE_PORT ?? '5173'
await app.register(cors, {
  origin: [`http://localhost:${vitePort}`, `http://127.0.0.1:${vitePort}`],
})
```

---

## References

- [MDN: Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [OWASP: CORS Misconfiguration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-Side_Testing/07-Testing_Cross_Origin_Resource_Sharing)
