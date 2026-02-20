import Fastify from 'fastify'
import cors from '@fastify/cors'
import { containersRoute } from './routes/containers.route.js'
import { settingsRoute } from './routes/settings.route.js'
import { composeRoute } from './routes/compose.route.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(containersRoute, { prefix: '/api/containers' })
await app.register(settingsRoute, { prefix: '/api/settings' })
await app.register(composeRoute, { prefix: '/api/compose' })

app.get('/api/health', async () => ({ status: 'ok' }))

try {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('Backend listening on http://localhost:3001')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
