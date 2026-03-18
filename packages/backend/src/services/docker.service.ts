import fs from 'node:fs'
import Dockerode from 'dockerode'

/**
 * Build a Dockerode client respecting the DOCKER_HOST environment variable.
 * - unix:///var/run/docker.sock    → Unix socket (Linux/macOS default)
 * - npipe:////./pipe/docker_engine → Windows named pipe
 * - tcp://host:2376               → TLS-authenticated TCP (set DOCKER_TLS_CA,
 *                                    DOCKER_TLS_CERT, DOCKER_TLS_KEY)
 * - tcp://host:2375               → Plain TCP (internal socket-proxy only)
 * Unset → Dockerode auto-detects the platform default.
 */
function createDockerClient(): Dockerode {
  const host = process.env.DOCKER_HOST
  if (host) {
    if (host.startsWith('tcp://')) {
      const url = new URL(host)

      const ca = process.env.DOCKER_TLS_CA
      const cert = process.env.DOCKER_TLS_CERT
      const key = process.env.DOCKER_TLS_KEY
      const hasTls = ca && cert && key

      const port = Number(url.port) || (hasTls ? 2376 : 2375)

      if (hasTls) {
        return new Dockerode({
          host: url.hostname,
          port,
          ca: fs.readFileSync(ca),
          cert: fs.readFileSync(cert),
          key: fs.readFileSync(key),
        })
      }

      // Plain TCP — acceptable for container-internal socket-proxy traffic;
      // warn so operators notice if this is pointed at a real Docker daemon.
      console.warn(
        'WARNING: Connecting to Docker over unencrypted TCP (%s:%d). ' +
          'This is expected for the internal socket-proxy but insecure ' +
          'for direct daemon access. Set DOCKER_TLS_CA, DOCKER_TLS_CERT, ' +
          'and DOCKER_TLS_KEY to enable TLS.',
        url.hostname,
        port,
      )
      return new Dockerode({ host: url.hostname, port })
    }
    if (host.startsWith('unix://')) {
      return new Dockerode({ socketPath: host.slice('unix://'.length) })
    }
    if (host.startsWith('npipe://')) {
      return new Dockerode({ socketPath: host.slice('npipe://'.length) })
    }
  }
  return new Dockerode()
}

const docker = createDockerClient()

export interface PortBinding {
  hostIp: string
  hostPort: string
  containerPort: string
  protocol: string
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: 'running' | 'stopped' | 'paused' | 'other'
  state: string
  ports: PortBinding[]
  composeProject?: string
  composeService?: string
  created: number
  isSelf: boolean
}

function mapStatus(state: string): ContainerInfo['status'] {
  switch (state) {
    case 'running': return 'running'
    case 'exited': case 'stopped': return 'stopped'
    case 'paused': return 'paused'
    default: return 'other'
  }
}

/** Deduplicate port bindings – exported for testing. */
export function deduplicatePorts(rawPorts: PortBinding[]): PortBinding[] {
  // First pass: collapse entries that share the same hostPort+containerPort+protocol
  // (e.g. IPv4 and IPv6 duplicates like 0.0.0.0:8080→80 and :::8080→80).
  const seen = new Map<string, PortBinding>()
  for (const p of rawPorts) {
    const key = `${p.hostPort}:${p.containerPort}/${p.protocol}`
    if (!seen.has(key)) {
      seen.set(key, p)
    }
  }

  // Second pass: drop unmapped entries when a mapped entry exists for the
  // same containerPort/protocol (Docker returns both EXPOSE and -p entries).
  const mapped = new Set<string>()
  for (const p of seen.values()) {
    if (p.hostPort) {
      mapped.add(`${p.containerPort}/${p.protocol}`)
    }
  }
  return [...seen.values()].filter(
    (p) => p.hostPort || !mapped.has(`${p.containerPort}/${p.protocol}`),
  )
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const containers = await docker.listContainers({ all: true })
  const selfHostname = (process.env.HOSTNAME ?? '').toLowerCase()

  return containers.map((c) => {
    const rawPorts: PortBinding[] = (c.Ports || []).map((p) => ({
      hostIp: p.IP ?? '',
      hostPort: p.PublicPort ? String(p.PublicPort) : '',
      containerPort: String(p.PrivatePort),
      protocol: p.Type,
    }))

    const ports = deduplicatePorts(rawPorts)

    const labels = c.Labels || {}
    const fullId = c.Id.toLowerCase()

    return {
      id: c.Id.slice(0, 12),
      name: (c.Names?.[0] ?? '').replace(/^\//, ''),
      image: c.Image,
      status: mapStatus(c.State),
      state: c.State,
      ports,
      composeProject: labels['com.docker.compose.project'],
      composeService: labels['com.docker.compose.service'],
      created: c.Created,
      isSelf: selfHostname !== '' && fullId.startsWith(selfHostname),
    }
  })
}

export async function startContainer(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.start()
}

export async function stopContainer(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.stop()
}

export async function getContainerLogs(id: string, tail: number = 50): Promise<string> {
  const container = docker.getContainer(id)
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  })
  // Dockerode may return a Buffer or string; strip Docker stream headers (8-byte prefix per frame)
  const raw = typeof logs === 'string' ? logs : logs.toString('utf-8')
  return raw
    .split('\n')
    .map((line: string) => {
      // Docker multiplexed stream: first 8 bytes are header per frame
      // If the line has non-printable chars in the first 8 bytes, strip them
      if (line.length > 8 && line.charCodeAt(0) <= 2) {
        return line.slice(8)
      }
      return line
    })
    .join('\n')
    .trim()
}

export async function pullAndRecreate(id: string): Promise<void> {
  const container = docker.getContainer(id)
  const info = await container.inspect()

  const image = info.Config.Image
  // Pull latest image
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err)
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) return reject(err)
        resolve()
      })
    })
  })

  const wasRunning = info.State.Running

  // Stop if running
  if (wasRunning) {
    await container.stop()
  }

  // Remove old container
  await container.remove()

  // Recreate with same config
  const newContainer = await docker.createContainer({
    ...info.Config,
    name: info.Name.replace(/^\//, ''),
    HostConfig: info.HostConfig,
    NetworkingConfig: {
      EndpointsConfig: info.NetworkSettings.Networks,
    },
  })

  // Start if it was running before
  if (wasRunning) {
    await newContainer.start()
  }
}

export async function removeContainer(id: string): Promise<void> {
  const container = docker.getContainer(id)
  const info = await container.inspect()
  if (info.State.Running) {
    await container.stop()
  }
  await container.remove()
}

export async function removeContainers(ids: string[]): Promise<void> {
  for (const id of ids) {
    await removeContainer(id)
  }
}
