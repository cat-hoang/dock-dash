import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ContainerRow from '../components/ContainerRow.vue'
import { useContainersStore } from '../stores/containers.store'
import type { Container } from '../api'

vi.mock('../api', () => ({
  api: {
    containers: { list: vi.fn(), start: vi.fn(), stop: vi.fn(), pullRecreate: vi.fn(), logs: vi.fn() },
    settings: { get: vi.fn(), save: vi.fn() },
    compose: { list: vi.fn() },
  },
}))

const runningContainer: Container = {
  id: 'abc123',
  name: 'web-app',
  image: 'nginx:latest',
  status: 'running',
  state: 'running',
  ports: [{ hostIp: '0.0.0.0', hostPort: '8080', containerPort: '80', protocol: 'tcp' }],
  composeProject: 'my-project',
  composeService: 'web',
  created: 1700000000,
  isSelf: false,
}

const stoppedContainer: Container = {
  id: 'def456',
  name: 'db',
  image: 'postgres:16',
  status: 'stopped',
  state: 'exited',
  ports: [],
  created: 1700000000,
  isSelf: false,
}

function mountRow(container: Container) {
  return mount(ContainerRow, {
    props: { container },
    global: { plugins: [createPinia()] },
  })
}

describe('ContainerRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders container name and id', () => {
    const wrapper = mountRow(runningContainer)
    expect(wrapper.text()).toContain('web-app')
    expect(wrapper.text()).toContain('abc123')
  })

  it('shows running badge for running container', () => {
    const wrapper = mountRow(runningContainer)
    expect(wrapper.find('.badge-running').exists()).toBe(true)
  })

  it('shows stopped badge for stopped container', () => {
    const wrapper = mountRow(stoppedContainer)
    expect(wrapper.find('.badge-stopped').exists()).toBe(true)
  })

  it('shows Stop button for running container', () => {
    const wrapper = mountRow(runningContainer)
    const buttons = wrapper.findAll('button')
    expect(buttons.some((b) => b.text().includes('Stop'))).toBe(true)
    expect(buttons.some((b) => b.text().includes('Start'))).toBe(false)
  })

  it('shows Start button for stopped container', () => {
    const wrapper = mountRow(stoppedContainer)
    const buttons = wrapper.findAll('button')
    expect(buttons.some((b) => b.text().includes('Start'))).toBe(true)
    expect(buttons.some((b) => b.text().includes('Stop'))).toBe(false)
  })

  it('renders mapped port tag', () => {
    const wrapper = mountRow(runningContainer)
    const portTag = wrapper.find('.port-tag.mapped')
    expect(portTag.exists()).toBe(true)
    expect(portTag.text()).toContain('8080')
  })

  it('calls stopContainer when Stop is clicked', async () => {
    const wrapper = mountRow(runningContainer)
    const store = useContainersStore()
    store.stopContainer = vi.fn()

    const stopBtn = wrapper.findAll('button').find((b) => b.text().includes('Stop'))!
    await stopBtn.trigger('click')
    expect(store.stopContainer).toHaveBeenCalledWith('abc123')
  })
})
