import type { FastifyInstance } from 'fastify'
import { listContainers, startContainer, stopContainer } from '../services/docker.service.js'

export async function containersRoute(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    try {
      const containers = await listContainers()
      return containers
    } catch (err) {
      reply.status(500).send({ error: 'Failed to connect to Docker. Is Docker running?' })
    }
  })

  app.post<{ Params: { id: string } }>('/:id/start', async (req, reply) => {
    try {
      await startContainer(req.params.id)
      return { success: true }
    } catch (err: any) {
      reply.status(500).send({ error: err?.message ?? 'Failed to start container' })
    }
  })

  app.post<{ Params: { id: string } }>('/:id/stop', async (req, reply) => {
    try {
      await stopContainer(req.params.id)
      return { success: true }
    } catch (err: any) {
      reply.status(500).send({ error: err?.message ?? 'Failed to stop container' })
    }
  })
}
