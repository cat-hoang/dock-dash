import fs from 'node:fs'
import type { Duplex } from 'node:stream'
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

export async function restartContainer(id: string): Promise<void> {
  const container = docker.getContainer(id)
  await container.restart()
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

/** Ordered list of shell candidates to try during auto-detection. */
const SHELL_CANDIDATES = ['/bin/bash', '/bin/sh', 'sh']

/**
 * Probe whether a given shell binary exists and is executable inside a container.
 * Runs `<shell> -c 'exit 0'` as a detached exec and checks the exit code.
 * Returns true if the shell exits with code 0 or is still running after the
 * 500ms deadline (which means it started successfully and is awaiting input).
 */
async function probeShell(container: Dockerode.Container, shell: string): Promise<boolean> {
  try {
    const exec = await container.exec({
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      Cmd: [shell, '-c', 'exit 0'],
    })
    // Detach: true starts the exec without attaching a stream, avoiding stream leaks
    await exec.start({ Detach: true })
    // Poll until the process exits or timeout
    const deadline = Date.now() + 500
    while (Date.now() < deadline) {
      const info = await exec.inspect()
      if (!info.Running) return info.ExitCode === 0
      await new Promise(r => setTimeout(r, 50))
    }
    // Still running after 500ms → the shell is live (treat as available)
    return true
  } catch {
    return false
  }
}

/**
 * Detect the first available shell from SHELL_CANDIDATES.
 * Returns the shell path if found, or null if none are available.
 */
async function detectShell(container: Dockerode.Container): Promise<string | null> {
  for (const shell of SHELL_CANDIDATES) {
    if (await probeShell(container, shell)) {
      return shell
    }
  }
  return null
}

export async function startExecStream(
  id: string,
  options?: { shellCommand?: string },
): Promise<{ stream: Duplex; exec: Dockerode.Exec; shell: string }> {
  const container = docker.getContainer(id)
  const info = await container.inspect()
  if (!info.State.Running) {
    throw Object.assign(new Error('Container is not running'), { statusCode: 409 })
  }

  // Determine which shell to use: explicit override > auto-detection
  let shell: string
  const override = options?.shellCommand?.trim()
  if (override) {
    // User-configured shell: skip probing and use it directly
    shell = override
  } else {
    // Auto-detect: try candidates in order
    const detected = await detectShell(container)
    if (!detected) {
      throw Object.assign(
        new Error('No compatible shell found in container'),
        { statusCode: 404 },
      )
    }
    shell = detected
  }

  const exec = await container.exec({
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: [shell],
  })
  const stream = await exec.start({ hijack: true, stdin: true }) as unknown as Duplex
  return { stream, exec, shell }
}
