import Dockerode from 'dockerode'

/**
 * Build a Dockerode client respecting the DOCKER_HOST environment variable.
 * - unix:///var/run/docker.sock  → Unix socket (Linux/macOS default)
 * - npipe:////./pipe/docker_engine → Windows named pipe
 * - tcp://host:2375              → TCP (useful inside Docker on Windows)
 * Unset → Dockerode auto-detects the platform default.
 */
function createDockerClient(): Dockerode {
  const host = process.env.DOCKER_HOST
  if (host) {
    if (host.startsWith('tcp://')) {
      const url = new URL(host)
      return new Dockerode({ host: url.hostname, port: Number(url.port) || 2375 })
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
}

function mapStatus(state: string): ContainerInfo['status'] {
  switch (state) {
    case 'running': return 'running'
    case 'exited': case 'stopped': return 'stopped'
    case 'paused': return 'paused'
    default: return 'other'
  }
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const containers = await docker.listContainers({ all: true })

  return containers.map((c) => {
    const ports: PortBinding[] = (c.Ports || []).map((p) => ({
      hostIp: p.IP ?? '',
      hostPort: p.PublicPort ? String(p.PublicPort) : '',
      containerPort: String(p.PrivatePort),
      protocol: p.Type,
    }))

    const labels = c.Labels || {}

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
