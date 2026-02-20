import type { FastifyInstance } from 'fastify'
import { getSettings, saveSettings, type Settings } from '../services/settings.service.js'

export async function settingsRoute(app: FastifyInstance) {
  app.get('/', async () => {
    return getSettings()
  })

  app.post<{ Body: Partial<Settings> }>('/', async (req, reply) => {
    const current = getSettings()
    const updated = { ...current, ...req.body }
    return saveSettings(updated)
  })
}
