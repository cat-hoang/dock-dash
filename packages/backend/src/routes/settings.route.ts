import path from 'node:path'
import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { getSettings, saveSettings, type Settings } from '../services/settings.service.js'

function isValidComposeFolder(value: string): boolean {
  if (value === '') return true
  if (!path.isAbsolute(value)) return false

  // Optional allowlist: restrict to a base directory
  const baseDir = process.env.COMPOSE_BASE_DIR
  if (baseDir) {
    const resolved = path.resolve(value)
    const resolvedBase = path.resolve(baseDir)
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      return false
    }
  }

  try {
    return fs.statSync(value).isDirectory()
  } catch {
    return false
  }
}

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
      if (req.body.composeFolder !== undefined && !isValidComposeFolder(req.body.composeFolder)) {
        return reply.status(400).send({ error: 'Invalid composeFolder: must be an absolute path to an existing directory' })
      }
      const current = getSettings()
      const updated = { ...current, ...req.body }
      return saveSettings(updated)
    },
  )
}
