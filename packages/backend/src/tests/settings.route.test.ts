import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { settingsRoute } from '../../src/routes/settings.route.js'

vi.mock('../../src/services/settings.service.js', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}))

import { getSettings, saveSettings } from '../../src/services/settings.service.js'

describe('settings route', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    await app.register(settingsRoute, { prefix: '/api/settings' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── GET / ──────────────────────────────────────────────────────

  it('GET / returns current settings', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '/apps' })

    const res = await app.inject({ method: 'GET', url: '/api/settings' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ composeFolder: '/apps' })
  })

  // ── POST / ─────────────────────────────────────────────────────

  it('POST / saves and returns updated settings', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/new/path' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/new/path' },
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/new/path' })
    expect(res.json()).toEqual({ composeFolder: '/new/path' })
  })

  it('POST / strips unknown properties (additionalProperties: false)', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/ok' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/ok', malicious: 'payload' },
    })

    // Fastify's default Ajv config strips additional properties rather than rejecting
    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/ok' })
  })

  it('POST / coerces numeric composeFolder to string', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '12345' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: 12345 },
    })

    // Fastify's default Ajv config coerces types
    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '12345' })
  })

  it('POST / rejects composeFolder exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: 'x'.repeat(513) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST / accepts empty body (partial update)', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '/existing' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/existing' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/existing' })
  })
})
