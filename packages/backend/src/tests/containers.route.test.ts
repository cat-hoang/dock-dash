import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { containersRoute } from '../../src/routes/containers.route.js'

// Mock the docker service
vi.mock('../../src/services/docker.service.js', () => ({
  listContainers: vi.fn(),
  startContainer: vi.fn(),
  stopContainer: vi.fn(),
  pullAndRecreate: vi.fn(),
  getContainerLogs: vi.fn(),
  removeContainer: vi.fn(),
  removeContainers: vi.fn(),
}))

import { listContainers, startContainer, stopContainer, pullAndRecreate, getContainerLogs, removeContainer, removeContainers } from '../../src/services/docker.service.js'

const mockContainers = [
  {
    id: 'abc123def456',
    name: 'web-app',
    image: 'nginx:latest',
    status: 'running' as const,
    state: 'running',
    ports: [{ hostIp: '0.0.0.0', hostPort: '8080', containerPort: '80', protocol: 'tcp' }],
    composeProject: 'my-project',
    composeService: 'web',
    created: 1700000000,
    isSelf: false,
  },
]

describe('containers route', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    await app.register(containersRoute, { prefix: '/api/containers' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── GET / ──────────────────────────────────────────────────────

  it('GET / returns container list', async () => {
    vi.mocked(listContainers).mockResolvedValue(mockContainers)

    const res = await app.inject({ method: 'GET', url: '/api/containers' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('web-app')
  })

  it('GET / returns 500 when Docker is unavailable', async () => {
    vi.mocked(listContainers).mockRejectedValue(new Error('connect ENOENT'))

    const res = await app.inject({ method: 'GET', url: '/api/containers' })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toContain('Docker')
  })

  // ── POST /:id/start ───────────────────────────────────────────

  it('POST /:id/start starts a container', async () => {
    vi.mocked(startContainer).mockResolvedValue()

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/start' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
    expect(startContainer).toHaveBeenCalledWith('abc123def456')
  })

  it('POST /:id/start returns 404 for missing container', async () => {
    const err = new Error('not found') as any
    err.statusCode = 404
    vi.mocked(startContainer).mockRejectedValue(err)

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/start' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Container not found')
  })

  it('POST /:id/start returns 409 for already running', async () => {
    const err = new Error('already started') as any
    err.statusCode = 304
    vi.mocked(startContainer).mockRejectedValue(err)

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/start' })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('Container is already running')
  })

  it('POST /:id/start returns 500 for unknown error', async () => {
    vi.mocked(startContainer).mockRejectedValue(new Error('boom'))

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/start' })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Failed to start container')
  })

  it('POST /:id/start rejects invalid container ID', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/containers/INVALID!!/start' })

    expect(res.statusCode).toBe(400)
  })

  // ── POST /:id/stop ────────────────────────────────────────────

  it('POST /:id/stop stops a container', async () => {
    vi.mocked(stopContainer).mockResolvedValue()

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/stop' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
    expect(stopContainer).toHaveBeenCalledWith('abc123def456')
  })

  it('POST /:id/stop returns 409 for already stopped', async () => {
    const err = new Error('already stopped') as any
    err.statusCode = 304
    vi.mocked(stopContainer).mockRejectedValue(err)

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/stop' })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('Container is already stopped')
  })

  it('POST /:id/stop rejects invalid container ID', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/containers/ZZZINVALID!!/stop' })

    expect(res.statusCode).toBe(400)
  })

  // ── POST /:id/pull-recreate ───────────────────────────────────

  it('POST /:id/pull-recreate succeeds', async () => {
    vi.mocked(pullAndRecreate).mockResolvedValue()

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/pull-recreate' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
    expect(pullAndRecreate).toHaveBeenCalledWith('abc123def456')
  })

  it('POST /:id/pull-recreate returns 404 for missing container', async () => {
    const err = new Error('not found') as any
    err.statusCode = 404
    vi.mocked(pullAndRecreate).mockRejectedValue(err)

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/pull-recreate' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Container not found')
  })

  it('POST /:id/pull-recreate returns 500 on failure', async () => {
    vi.mocked(pullAndRecreate).mockRejectedValue(new Error('pull failed'))

    const res = await app.inject({ method: 'POST', url: '/api/containers/abc123def456/pull-recreate' })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Failed to pull and recreate container')
  })

  // ── GET /:id/logs ─────────────────────────────────────────────

  it('GET /:id/logs returns logs', async () => {
    vi.mocked(getContainerLogs).mockResolvedValue('2024-01-01T00:00:00Z hello world')

    const res = await app.inject({ method: 'GET', url: '/api/containers/abc123def456/logs' })

    expect(res.statusCode).toBe(200)
    expect(res.json().logs).toContain('hello world')
    expect(getContainerLogs).toHaveBeenCalledWith('abc123def456')
  })

  it('GET /:id/logs returns 404 for missing container', async () => {
    const err = new Error('not found') as any
    err.statusCode = 404
    vi.mocked(getContainerLogs).mockRejectedValue(err)

    const res = await app.inject({ method: 'GET', url: '/api/containers/abc123def456/logs' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Container not found')
  })

  it('GET /:id/logs returns 500 on failure', async () => {
    vi.mocked(getContainerLogs).mockRejectedValue(new Error('logs error'))

    const res = await app.inject({ method: 'GET', url: '/api/containers/abc123def456/logs' })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Failed to get container logs')
  })

  it('GET /:id/logs rejects invalid container ID', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/containers/not-valid-hex/logs' })

    expect(res.statusCode).toBe(400)
  })

  // ── DELETE /:id ───────────────────────────────────────────────

  it('DELETE /:id removes a container', async () => {
    vi.mocked(removeContainer).mockResolvedValue()

    const res = await app.inject({ method: 'DELETE', url: '/api/containers/abc123def456' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
    expect(removeContainer).toHaveBeenCalledWith('abc123def456')
  })

  it('DELETE /:id returns 404 for missing container', async () => {
    const err = new Error('not found') as any
    err.statusCode = 404
    vi.mocked(removeContainer).mockRejectedValue(err)

    const res = await app.inject({ method: 'DELETE', url: '/api/containers/abc123def456' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Container not found')
  })

  it('DELETE /:id returns 500 on failure', async () => {
    vi.mocked(removeContainer).mockRejectedValue(new Error('remove failed'))

    const res = await app.inject({ method: 'DELETE', url: '/api/containers/abc123def456' })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Failed to remove container')
  })

  it('DELETE /:id rejects invalid container ID', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/containers/INVALID!!' })

    expect(res.statusCode).toBe(400)
  })

  // ── POST /remove-group ────────────────────────────────────────

  it('POST /remove-group removes multiple containers', async () => {
    vi.mocked(removeContainers).mockResolvedValue()

    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/remove-group',
      payload: { ids: ['abc123def456', 'def456abc123'] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
    expect(removeContainers).toHaveBeenCalledWith(['abc123def456', 'def456abc123'])
  })

  it('POST /remove-group returns 500 on failure', async () => {
    vi.mocked(removeContainers).mockRejectedValue(new Error('remove failed'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/remove-group',
      payload: { ids: ['abc123def456'] },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Failed to remove container group')
  })

  it('POST /remove-group rejects invalid container IDs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/remove-group',
      payload: { ids: ['INVALID!!'] },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /remove-group rejects empty ids array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/remove-group',
      payload: { ids: [] },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /remove-group rejects missing ids field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/containers/remove-group',
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })
})
