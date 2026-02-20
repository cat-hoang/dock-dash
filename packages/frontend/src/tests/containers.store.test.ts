import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useContainersStore } from '../stores/containers.store'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    containers: {
      list: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      save: vi.fn(),
    },
    compose: {
      list: vi.fn(),
    },
  },
}))

const mockContainers = [
  {
    id: 'abc123',
    name: 'web-app',
    image: 'nginx:latest',
    status: 'running' as const,
    state: 'running',
    ports: [{ hostIp: '0.0.0.0', hostPort: '8080', containerPort: '80', protocol: 'tcp' }],
    composeProject: 'my-project',
    composeService: 'web',
    created: 1700000000,
  },
  {
    id: 'def456',
    name: 'db',
    image: 'postgres:16',
    status: 'stopped' as const,
    state: 'exited',
    ports: [],
    created: 1700000000,
  },
]

describe('containersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetches containers and populates state', async () => {
    vi.mocked(api.containers.list).mockResolvedValue(mockContainers)

    const store = useContainersStore()
    await store.fetchContainers()

    expect(store.containers).toHaveLength(2)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('splits running and stopped correctly', async () => {
    vi.mocked(api.containers.list).mockResolvedValue(mockContainers)

    const store = useContainersStore()
    await store.fetchContainers()

    expect(store.running).toHaveLength(1)
    expect(store.running[0].name).toBe('web-app')
    expect(store.stopped).toHaveLength(1)
    expect(store.stopped[0].name).toBe('db')
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(api.containers.list).mockRejectedValue(new Error('Docker not running'))

    const store = useContainersStore()
    await store.fetchContainers()

    expect(store.error).toBe('Docker not running')
    expect(store.containers).toHaveLength(0)
  })

  it('starts a container and refreshes', async () => {
    vi.mocked(api.containers.list).mockResolvedValue(mockContainers)
    vi.mocked(api.containers.start).mockResolvedValue({ success: true })

    const store = useContainersStore()
    await store.startContainer('def456')

    expect(api.containers.start).toHaveBeenCalledWith('def456')
    expect(api.containers.list).toHaveBeenCalled()
  })

  it('stops a container and refreshes', async () => {
    vi.mocked(api.containers.list).mockResolvedValue(mockContainers)
    vi.mocked(api.containers.stop).mockResolvedValue({ success: true })

    const store = useContainersStore()
    await store.stopContainer('abc123')

    expect(api.containers.stop).toHaveBeenCalledWith('abc123')
    expect(api.containers.list).toHaveBeenCalled()
  })
})
