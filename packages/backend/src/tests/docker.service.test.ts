import { describe, it, expect } from 'vitest'
import { deduplicatePorts } from '../services/docker.service.js'
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
