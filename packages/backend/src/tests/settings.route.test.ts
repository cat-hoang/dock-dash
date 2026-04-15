import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
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
    // Default: make statSync say the path is a valid directory
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any)
  })

  afterEach(async () => {
    await app.close()
    delete process.env.COMPOSE_BASE_DIR
  })

  // ── GET / ──────────────────────────────────────────────────────

  it('GET / returns current settings', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '/apps', shellCommand: '' })

    const res = await app.inject({ method: 'GET', url: '/api/settings' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ composeFolder: '/apps', shellCommand: '' })
  })

  // ── POST / ─────────────────────────────────────────────────────

  it('POST / saves and returns updated settings', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/new/path', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/new/path' },
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/new/path', shellCommand: '' })
    expect(res.json()).toEqual({ composeFolder: '/new/path', shellCommand: '' })
  })

  it('POST / strips unknown properties (additionalProperties: false)', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/ok', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/ok', malicious: 'payload' },
    })

    // Fastify's default Ajv config strips additional properties rather than rejecting
    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/ok', shellCommand: '' })
  })

  it('POST / coerces numeric composeFolder to string then rejects (not absolute path)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: 12345 },
    })

    // Fastify coerces to '12345', but it's not an absolute path
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Invalid composeFolder')
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
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '/existing', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/existing', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '/existing', shellCommand: '' })
  })

  // ── Path traversal prevention (SEC-003) ────────────────────────

  it('POST / rejects relative path for composeFolder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '../../../etc' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Invalid composeFolder')
  })

  it('POST / rejects composeFolder that does not exist', async () => {
    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('ENOENT') })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/nonexistent/path' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Invalid composeFolder')
  })

  it('POST / rejects composeFolder that is a file, not a directory', async () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any)

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/etc/passwd' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Invalid composeFolder')
  })

  it('POST / accepts empty string composeFolder (clears setting)', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '/old', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('POST / rejects path outside COMPOSE_BASE_DIR when set', async () => {
    process.env.COMPOSE_BASE_DIR = '/allowed/base'

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/etc/secrets' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('Invalid composeFolder')
  })

  it('POST / accepts path inside COMPOSE_BASE_DIR', async () => {
    process.env.COMPOSE_BASE_DIR = '/allowed/base'
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '/allowed/base/projects', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { composeFolder: '/allowed/base/projects' },
    })

    expect(res.statusCode).toBe(200)
  })

  // ── shellCommand field ─────────────────────────────────────────

  it('POST / accepts shellCommand with a valid custom path', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '', shellCommand: '/bin/zsh' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { shellCommand: '/bin/zsh' },
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '', shellCommand: '/bin/zsh' })
  })

  it('POST / rejects shellCommand exceeding max length (256 chars)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { shellCommand: '/bin/' + 'a'.repeat(252) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST / accepts empty shellCommand (clears override, re-enables auto-detect)', async () => {
    vi.mocked(getSettings).mockReturnValue({ composeFolder: '', shellCommand: '/bin/zsh' })
    vi.mocked(saveSettings).mockReturnValue({ composeFolder: '', shellCommand: '' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: { shellCommand: '' },
    })

    expect(res.statusCode).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith({ composeFolder: '', shellCommand: '' })
  })
})
