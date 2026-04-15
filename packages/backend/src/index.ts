import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import { containersRoute } from './routes/containers.route.js'
import { settingsRoute } from './routes/settings.route.js'
import { composeRoute } from './routes/compose.route.js'
import { startExecStream } from './services/docker.service.js'
import { getSettings } from './services/settings.service.js'

const isProd = process.env.NODE_ENV === 'production'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Optional native TLS — set TLS_CERT_PATH and TLS_KEY_PATH env vars to enable
const tlsCert = process.env.TLS_CERT_PATH
const tlsKey = process.env.TLS_KEY_PATH
const httpsOptions =
  tlsCert && tlsKey
    ? { key: fs.readFileSync(tlsKey), cert: fs.readFileSync(tlsCert) }
    : undefined

const app = Fastify({ logger: true, ...(httpsOptions && { https: httpsOptions }) })

// In dev, allow only the Vite dev server origin for CORS
if (!isProd) {
  const vitePort = process.env.VITE_PORT ?? '5173'
  await app.register(cors, {
    origin: [`http://localhost:${vitePort}`, `http://127.0.0.1:${vitePort}`],
    methods: ['GET', 'POST'],
  })
}

await app.register(containersRoute, { prefix: '/api/containers' })
await app.register(settingsRoute, { prefix: '/api/settings' })
await app.register(composeRoute, { prefix: '/api/compose' })

app.get('/api/health', async () => ({ status: 'ok' }))

// Production: serve the built Vue frontend from the same process
if (isProd) {
  const staticDir = path.join(__dirname, '../../frontend/dist')
  await app.register(staticPlugin, { root: staticDir, prefix: '/', wildcard: false })
  // SPA fallback — let Vue Router handle client-side paths
  app.setNotFoundHandler(async (_req, reply) => {
    return reply.sendFile('index.html', staticDir)
  })
}

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'
const protocol = httpsOptions ? 'https' : 'http'
try {
  await app.listen({ port, host })
  console.log(`Backend listening on ${protocol}://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// ── WebSocket exec server ─────────────────────────────────────────────────────
const EXEC_PATH = /^\/api\/containers\/([a-f0-9]{12,64})\/exec$/
const wss = new WebSocketServer({ noServer: true })

async function handleExecConnection(ws: WebSocket, containerId: string): Promise<void> {
  let stream: Duplex | undefined
  try {
    const { shellCommand } = getSettings()
    const result = await startExecStream(containerId, { shellCommand: shellCommand || undefined })
    stream = result.stream
    const exec = result.exec

    stream.on('data', (chunk: Buffer) => {
      if (ws.readyState === 1 /* OPEN */) ws.send(chunk)
    })
    stream.on('end', () => ws.close())
    stream.on('error', () => ws.close())

    ws.on('message', (data: Buffer | string) => {
      try {
        const parsed = JSON.parse(typeof data === 'string' ? data : data.toString())
        if (parsed.type === 'resize') {
          exec.resize({ h: parsed.rows ?? 24, w: parsed.cols ?? 80 }).catch(() => {})
          return
        }
      } catch { /* not JSON → raw stdin */ }
      stream?.write(data)
    })

    ws.on('close', () => stream?.destroy())
    ws.on('error', () => stream?.destroy())
  } catch (err: any) {
    const msg = err?.statusCode === 409
      ? '\r\nContainer is not running.\r\n'
      : err?.statusCode === 404
        ? '\r\nNo compatible shell found in this container. Set a custom shell command in Settings.\r\n'
        : '\r\nFailed to start shell session.\r\n'
    if (ws.readyState === 1) ws.send(msg)
    ws.close()
  }
}

;(app.server as HttpServer).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
  const match = request.url?.match(EXEC_PATH)
  if (!match) { socket.destroy(); return }

  // Validate Origin to prevent cross-site WebSocket hijacking
  const origin = request.headers.origin ?? ''
  if (origin) {
    try {
      const { hostname } = new URL(origin)
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
  }

  wss.handleUpgrade(request, socket, head, (ws) => handleExecConnection(ws, match[1]))
})
