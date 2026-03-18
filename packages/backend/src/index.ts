import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import { containersRoute } from './routes/containers.route.js'
import { settingsRoute } from './routes/settings.route.js'
import { composeRoute } from './routes/compose.route.js'

const isProd = process.env.NODE_ENV === 'production'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Optional native TLS — set TLS_CERT_PATH and TLS_KEY_PATH env vars to enable
const tlsCert = process.env.TLS_CERT_PATH
const tlsKey = process.env.TLS_KEY_PATH
const httpsOptions =
  tlsCert && tlsKey
    ? { key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCert) }
    : undefined

const app = Fastify({ logger: true, ...(httpsOptions && { https: httpsOptions }) })

// In dev the Vite proxy handles CORS; keep it enabled for direct API testing
if (!isProd) {
  await app.register(cors, { origin: true })
}

await app.register(containersRoute, { prefix: '/api/containers' })
await app.register(settingsRoute, { prefix: '/api/settings' })
await app.register(composeRoute, { prefix: '/api/compose' })

app.get('/api/health', async () => ({ status: 'ok' }))

// Production: serve the built Vue frontend from the same process
if (isProd) {
  const staticDir = path.join(__dirname, '../../frontend/dist')
  await app.register(staticPlugin, { root: staticDir, prefix: '/', wildcard: false })
  // SPA fallback — let Vue Router handle client-side paths
  app.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile('index.html', staticDir)
  })
}

const port = Number(process.env.PORT ?? 3001)
const protocol = httpsOptions ? 'https' : 'http'
try {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Backend listening on ${protocol}://0.0.0.0:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
