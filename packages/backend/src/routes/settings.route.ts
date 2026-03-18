import type { FastifyInstance } from 'fastify'
import { getSettings, saveSettings, type Settings } from '../services/settings.service.js'

export async function settingsRoute(app: FastifyInstance) {
  app.get('/', async () => {
    return getSettings()
  })

  app.post<{ Body: Partial<Settings> }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            composeFolder: { type: 'string', minLength: 0, maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const current = getSettings()
      const updated = { ...current, ...req.body }
      return saveSettings(updated)
    },
  )
}
