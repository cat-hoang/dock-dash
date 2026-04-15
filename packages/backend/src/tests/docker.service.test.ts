import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec, mockProbeExec, mockContainer, mockDockerClient } = vi.hoisted(() => {
  const hoistedMockProbeExec = {
    start: vi.fn(),
    inspect: vi.fn(),
  }

  const hoistedMockExec = {
    start: vi.fn(),
    resize: vi.fn(),
    inspect: vi.fn(),
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
    mockProbeExec: hoistedMockProbeExec,
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

  it('creates an interactive tty exec stream for running container (auto-detects /bin/bash)', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // First call: probe for /bin/bash (succeeds)
    // Second call: interactive exec
    mockContainer.exec
      .mockResolvedValueOnce(mockProbeExec)
      .mockResolvedValueOnce(mockExec)
    mockProbeExec.start.mockResolvedValue(undefined)
    mockProbeExec.inspect.mockResolvedValue({ Running: false, ExitCode: 0 })
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')

    expect(mockDockerClient.getContainer).toHaveBeenCalledWith('abc123def456')
    // The interactive exec should use /bin/bash (first candidate that succeeded)
    expect(mockContainer.exec).toHaveBeenLastCalledWith({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['/bin/bash'],
    })
    expect(mockExec.start).toHaveBeenCalledWith({ hijack: true, stdin: true })
    expect(result).toEqual({ stream: fakeStream, exec: mockExec, shell: '/bin/bash' })
  })

  it('throws 409 when container is not running', async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: false } })

    const err = await startExecStream('abc123def456').catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Container is not running')
    expect(err.statusCode).toBe(409)
    expect(mockContainer.exec).not.toHaveBeenCalled()
  })

  it('probeShell returns true when exec exits with code 0', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    mockContainer.exec
      .mockResolvedValueOnce(mockProbeExec)
      .mockResolvedValueOnce(mockExec)
    mockProbeExec.start.mockResolvedValue(undefined)
    mockProbeExec.inspect.mockResolvedValue({ Running: false, ExitCode: 0 })
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')
    // /bin/bash probe succeeded → used as shell
    expect(result.shell).toBe('/bin/bash')
  })

  it('probeShell returns false when exec exits with non-zero code', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // /bin/bash probe fails (exit 127), /bin/sh probe succeeds, then interactive
    const mockProbeExecSh = { start: vi.fn(), inspect: vi.fn() }
    mockContainer.exec
      .mockResolvedValueOnce(mockProbeExec)      // /bin/bash probe
      .mockResolvedValueOnce(mockProbeExecSh)    // /bin/sh probe
      .mockResolvedValueOnce(mockExec)           // interactive
    mockProbeExec.start.mockResolvedValue(undefined)
    mockProbeExec.inspect.mockResolvedValue({ Running: false, ExitCode: 127 })
    mockProbeExecSh.start.mockResolvedValue(undefined)
    mockProbeExecSh.inspect.mockResolvedValue({ Running: false, ExitCode: 0 })
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')
    // /bin/bash failed, fell through to /bin/sh
    expect(result.shell).toBe('/bin/sh')
  })

  it('probeShell returns false when exec throws', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // /bin/bash probe throws, /bin/sh probe succeeds, then interactive
    const mockProbeExecSh = { start: vi.fn(), inspect: vi.fn() }
    mockContainer.exec
      .mockRejectedValueOnce(new Error('exec failed'))  // /bin/bash probe throws
      .mockResolvedValueOnce(mockProbeExecSh)           // /bin/sh probe
      .mockResolvedValueOnce(mockExec)                  // interactive
    mockProbeExecSh.start.mockResolvedValue(undefined)
    mockProbeExecSh.inspect.mockResolvedValue({ Running: false, ExitCode: 0 })
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')
    // /bin/bash threw, fell through to /bin/sh
    expect(result.shell).toBe('/bin/sh')
  })

  it('startExecStream uses first available shell from candidates', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // /bin/bash probe exits 127, /bin/sh probe exits 0
    const mockProbeExecSh = { start: vi.fn(), inspect: vi.fn() }
    mockContainer.exec
      .mockResolvedValueOnce(mockProbeExec)    // /bin/bash probe
      .mockResolvedValueOnce(mockProbeExecSh)  // /bin/sh probe
      .mockResolvedValueOnce(mockExec)         // interactive
    mockProbeExec.start.mockResolvedValue(undefined)
    mockProbeExec.inspect.mockResolvedValue({ Running: false, ExitCode: 127 })
    mockProbeExecSh.start.mockResolvedValue(undefined)
    mockProbeExecSh.inspect.mockResolvedValue({ Running: false, ExitCode: 0 })
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456')

    // Interactive exec should use /bin/sh (first candidate that succeeded)
    expect(mockContainer.exec).toHaveBeenLastCalledWith({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['/bin/sh'],
    })
    expect(result.shell).toBe('/bin/sh')
  })

  it('startExecStream uses shellCommand override when provided (no probe calls)', async () => {
    const fakeStream = { write: vi.fn(), on: vi.fn(), destroy: vi.fn() }
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // With override, only one exec call (no probes)
    mockContainer.exec.mockResolvedValueOnce(mockExec)
    mockExec.start.mockResolvedValue(fakeStream)

    const result = await startExecStream('abc123def456', { shellCommand: '/bin/zsh' })

    // Should call exec only once (no probe), with the provided shell
    expect(mockContainer.exec).toHaveBeenCalledTimes(1)
    expect(mockContainer.exec).toHaveBeenCalledWith({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['/bin/zsh'],
    })
    expect(result.shell).toBe('/bin/zsh')
  })

  it('startExecStream throws 404 when no shell is found', async () => {
    mockContainer.inspect.mockResolvedValue({ State: { Running: true } })
    // All three candidate probes fail
    const mockProbeExecSh = { start: vi.fn(), inspect: vi.fn() }
    const mockProbeExecShBare = { start: vi.fn(), inspect: vi.fn() }
    mockContainer.exec
      .mockResolvedValueOnce(mockProbeExec)          // /bin/bash probe
      .mockResolvedValueOnce(mockProbeExecSh)        // /bin/sh probe
      .mockResolvedValueOnce(mockProbeExecShBare)    // sh probe
    mockProbeExec.start.mockResolvedValue(undefined)
    mockProbeExec.inspect.mockResolvedValue({ Running: false, ExitCode: 127 })
    mockProbeExecSh.start.mockResolvedValue(undefined)
    mockProbeExecSh.inspect.mockResolvedValue({ Running: false, ExitCode: 127 })
    mockProbeExecShBare.start.mockResolvedValue(undefined)
    mockProbeExecShBare.inspect.mockResolvedValue({ Running: false, ExitCode: 127 })

    const err = await startExecStream('abc123def456').catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.statusCode).toBe(404)
    // No interactive exec should have been started
    expect(mockExec.start).not.toHaveBeenCalled()
  })
})
