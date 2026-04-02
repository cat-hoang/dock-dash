import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec, mockContainer, mockDockerClient } = vi.hoisted(() => {
  const hoistedMockExec = {
    start: vi.fn(),
    resize: vi.fn(),
  }

  const hoistedMockContainer = {
    inspect: vi.fn(),
    exec: vi.fn(),
  }

  const hoistedMockDockerClient = {
    getContainer: vi.fn(() => hoistedMockContainer),
    listContainers: vi.fn(),
  }

  return {
    mockExec: hoistedMockExec,
    mockContainer: hoistedMockContainer,
    mockDockerClient: hoistedMockDockerClient,
  }
})

vi.mock('dockerode', () => ({
  default: vi.fn(function MockDockerode() {
    return mockDockerClient
  }),
}))

import { deduplicatePorts, startExecStream } from '../services/docker.service.js'
import type { PortBinding } from '../services/docker.service.js'

function port(overrides: Partial<PortBinding> = {}): PortBinding {
  return { hostIp: '0.0.0.0', hostPort: '8080', containerPort: '80', protocol: 'tcp', ...overrides }
}

describe('deduplicatePorts', () => {
  it('deduplicates IPv4/IPv6 entries with same hostPort and containerPort', () => {
    const result = deduplicatePorts([
      port({ hostIp: '0.0.0.0' }),
      port({ hostIp: '::' }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(port({ hostIp: '0.0.0.0' }))
  })

  it('keeps distinct ports on different host ports', () => {
    const result = deduplicatePorts([
      port({ hostPort: '8080' }),
      port({ hostPort: '8081' }),
    ])

    expect(result).toHaveLength(2)
  })

  it('keeps distinct ports on different protocols', () => {
    const result = deduplicatePorts([
      port({ protocol: 'tcp' }),
      port({ protocol: 'udp' }),
    ])

    expect(result).toHaveLength(2)
  })

  it('prefers mapped entry over unmapped for the same container port', () => {
    const result = deduplicatePorts([
      port({ hostIp: '', hostPort: '' }),               // unmapped
      port({ hostIp: '0.0.0.0', hostPort: '8080' }),    // mapped
    ])

    expect(result).toHaveLength(1)
    expect(result[0].hostPort).toBe('8080')
  })

  it('deduplicates multiple unmapped entries for the same container port', () => {
    const result = deduplicatePorts([
      port({ hostIp: '', hostPort: '' }),
      port({ hostIp: '', hostPort: '' }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].hostPort).toBe('')
  })

  it('deduplicates triple IPv4/IPv6/unmapped entries', () => {
    const result = deduplicatePorts([
      port({ hostIp: '', hostPort: '' }),
      port({ hostIp: '0.0.0.0', hostPort: '8080' }),
      port({ hostIp: '::', hostPort: '8080' }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].hostPort).toBe('8080')
  })

  it('keeps ports on different container ports', () => {
    const result = deduplicatePorts([
      port({ containerPort: '80' }),
      port({ containerPort: '443' }),
    ])

    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(deduplicatePorts([])).toEqual([])
  })
})

describe('startExecStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an interactive tty exec stream for running container', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    mockContainer.exec.mockResolvedValue(mockExec)
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')

    expect(mockDockerClient.getContainer).toHaveBeenCalledWith('abc123def456')
    expect(mockContainer.exec).toHaveBeenCalledWith({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['/bin/sh'],
    })
    expect(mockExec.start).toHaveBeenCalledWith({ hijack: true, stdin: true })
    expect(result).toEqual({ stream: fakeStream, exec: mockExec })
  })

  it('throws 409 when container is not running', async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: false } })

    const err = await startExecStream('abc123def456').catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Container is not running')
    expect(err.statusCode).toBe(409)
    expect(mockContainer.exec).not.toHaveBeenCalled()
  })
})
