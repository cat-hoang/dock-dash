import type { FastifyInstance } from 'fastify'
import { getSettings } from '../services/settings.service.js'
import { scanComposeFiles } from '../services/compose.service.js'

export async function composeRoute(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    const settings = getSettings()
    if (!settings.composeFolder) {
      return []
    }
    try {
      const files = await scanComposeFiles(settings.composeFolder)
      return files
    } catch (err: any) {
      reply.status(500).send({ error: err?.message ?? 'Failed to scan compose files' })
    }
  })
}
