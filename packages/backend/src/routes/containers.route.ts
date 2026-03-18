import type { FastifyInstance } from 'fastify'
import { listContainers, startContainer, stopContainer, pullAndRecreate, getContainerLogs } from '../services/docker.service.js'

export async function containersRoute(app: FastifyInstance) {
  const containerParamSchema = {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-f0-9]{12,64}$' },
      },
      required: ['id'],
    },
  }

  app.get('/', async (_req, reply) => {
    try {
      const containers = await listContainers()
      return containers
    } catch (err) {
      reply.status(500).send({ error: 'Failed to connect to Docker. Is Docker running?' })
    }
  })

  app.post<{ Params: { id: string } }>('/:id/start', { schema: containerParamSchema }, async (req, reply) => {
    try {
      await startContainer(req.params.id)
      return { success: true }
    } catch (err: any) {
      req.log.error({ err, containerId: req.params.id }, 'Failed to start container')
      const statusCode = err?.statusCode ?? 500
      if (statusCode === 404) {
        return reply.status(404).send({ error: 'Container not found' })
      }
      if (statusCode === 304 || statusCode === 409) {
        return reply.status(409).send({ error: 'Container is already running' })
      }
      reply.status(500).send({ error: 'Failed to start container' })
    }
  })

  app.post<{ Params: { id: string } }>('/:id/stop', { schema: containerParamSchema }, async (req, reply) => {
    try {
      await stopContainer(req.params.id)
      return { success: true }
    } catch (err: any) {
      req.log.error({ err, containerId: req.params.id }, 'Failed to stop container')
      const statusCode = err?.statusCode ?? 500
      if (statusCode === 404) {
        return reply.status(404).send({ error: 'Container not found' })
      }
      if (statusCode === 304 || statusCode === 409) {
        return reply.status(409).send({ error: 'Container is already stopped' })
      }
      reply.status(500).send({ error: 'Failed to stop container' })
    }
  })

  app.post<{ Params: { id: string } }>('/:id/pull-recreate', { schema: containerParamSchema }, async (req, reply) => {
    try {
      await pullAndRecreate(req.params.id)
      return { success: true }
    } catch (err: any) {
      req.log.error({ err, containerId: req.params.id }, 'Failed to pull and recreate container')
      const statusCode = err?.statusCode ?? 500
      if (statusCode === 404) {
        return reply.status(404).send({ error: 'Container not found' })
      }
      reply.status(500).send({ error: 'Failed to pull and recreate container' })
    }
  })

  app.get<{ Params: { id: string } }>('/:id/logs', { schema: containerParamSchema }, async (req, reply) => {
    try {
      const logs = await getContainerLogs(req.params.id)
      return { logs }
    } catch (err: any) {
      req.log.error({ err, containerId: req.params.id }, 'Failed to get container logs')
      const statusCode = err?.statusCode ?? 500
      if (statusCode === 404) {
        return reply.status(404).send({ error: 'Container not found' })
      }
      reply.status(500).send({ error: 'Failed to get container logs' })
    }
  })
}
