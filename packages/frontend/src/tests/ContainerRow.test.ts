import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ContainerRow from '../components/ContainerRow.vue'
import { useContainersStore } from '../stores/containers.store'
import type { Container } from '../api'

vi.mock('../api', () => ({
  api: {
    containers: { list: vi.fn(), start: vi.fn(), stop: vi.fn(), restart: vi.fn(), pullRecreate: vi.fn(), logs: vi.fn(), remove: vi.fn(), removeGroup: vi.fn() },
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

const selfContainer: Container = {
  id: 'fff999',
  name: 'dock-dash',
  image: 'dock-dash:latest',
  status: 'running',
  state: 'running',
  ports: [{ hostIp: '0.0.0.0', hostPort: '3001', containerPort: '3001', protocol: 'tcp' }],
  created: 1700000000,
  isSelf: true,
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

  it('shows Pull & Reload button for non-self container', () => {
    const wrapper = mountRow(runningContainer)
    const buttons = wrapper.findAll('button')
    expect(buttons.some((b) => b.text().includes('Pull'))).toBe(true)
  })

  it('calls pullRecreateContainer when Pull & Reload is clicked', async () => {
    const wrapper = mountRow(runningContainer)
    const store = useContainersStore()
    store.pullRecreateContainer = vi.fn()

    const pullBtn = wrapper.findAll('button').find((b) => b.text().includes('Pull'))!
    await pullBtn.trigger('click')
    expect(store.pullRecreateContainer).toHaveBeenCalledWith('abc123')
  })

  it('shows Logs button for any container', () => {
    const wrapper = mountRow(runningContainer)
    const buttons = wrapper.findAll('button')
    expect(buttons.some((b) => b.text().includes('Logs'))).toBe(true)
  })

  it('calls toggleLogs when Logs button is clicked', async () => {
    const wrapper = mountRow(runningContainer)
    const store = useContainersStore()
    store.toggleLogs = vi.fn()

    const logsBtn = wrapper.findAll('button').find((b) => b.text().includes('Logs'))!
    await logsBtn.trigger('click')
    expect(store.toggleLogs).toHaveBeenCalledWith('abc123')
  })

  it('hides Stop and Pull & Reload buttons for self container', () => {
    const wrapper = mountRow(selfContainer)
    const buttons = wrapper.findAll('button')
    expect(buttons.some((b) => b.text().includes('Stop'))).toBe(false)
    expect(buttons.some((b) => b.text().includes('Pull'))).toBe(false)
    // Logs should still be visible
    expect(buttons.some((b) => b.text().includes('Logs'))).toBe(true)
  })

  describe('restart button', () => {
    it('shows Restart button for running non-self container', () => {
      const wrapper = mountRow(runningContainer)
      const buttons = wrapper.findAll('button')
      expect(buttons.some((b) => b.text().includes('Restart'))).toBe(true)
    })

    it('hides Restart button for stopped container', () => {
      const wrapper = mountRow(stoppedContainer)
      const buttons = wrapper.findAll('button')
      expect(buttons.some((b) => b.text().includes('Restart'))).toBe(false)
    })

    it('hides Restart button for self container', () => {
      const wrapper = mountRow(selfContainer)
      const buttons = wrapper.findAll('button')
      expect(buttons.some((b) => b.text().includes('Restart'))).toBe(false)
    })

    it('calls restartContainer when Restart is clicked', async () => {
      const wrapper = mountRow(runningContainer)
      const store = useContainersStore()
      store.restartContainer = vi.fn()

      const restartBtn = wrapper.findAll('button').find((b) => b.text().includes('Restart'))!
      await restartBtn.trigger('click')
      expect(store.restartContainer).toHaveBeenCalledWith('abc123')
    })
  })

  describe('nested mode', () => {
    function mountNestedRow(container: Container) {
      return mount(ContainerRow, {
        props: { container, nested: true },
        global: { plugins: [createPinia()] },
      })
    }

    it('renders compose service name instead of container name when nested', () => {
      const wrapper = mountNestedRow(runningContainer)
      const nameEl = wrapper.find('.container-name')
      expect(nameEl.text()).toBe('web')
    })

    it('applies nested-row class when nested', () => {
      const wrapper = mountNestedRow(runningContainer)
      expect(wrapper.find('tr.nested-row').exists()).toBe(true)
    })

    it('does not apply nested-row class when not nested', () => {
      const wrapper = mountRow(runningContainer)
      expect(wrapper.find('tr.nested-row').exists()).toBe(false)
    })

    it('renders container name when nested but no composeService', () => {
      const wrapper = mountNestedRow(stoppedContainer)
      const nameEl = wrapper.find('.container-name')
      expect(nameEl.text()).toBe('db')
    })
  })

  describe('port rendering', () => {
    it('renders multiple port tags for different host ports on the same container port', () => {
      const container: Container = {
        ...runningContainer,
        ports: [
          { hostIp: '0.0.0.0', hostPort: '8080', containerPort: '80', protocol: 'tcp' },
          { hostIp: '0.0.0.0', hostPort: '8081', containerPort: '80', protocol: 'tcp' },
        ],
      }
      const wrapper = mountRow(container)
      const portTags = wrapper.findAll('.port-tag')
      expect(portTags).toHaveLength(2)
      expect(portTags[0].text()).toContain('8080')
      expect(portTags[1].text()).toContain('8081')
    })

    it('renders unmapped port without arrow', () => {
      const container: Container = {
        ...runningContainer,
        ports: [
          { hostIp: '', hostPort: '', containerPort: '80', protocol: 'tcp' },
        ],
      }
      const wrapper = mountRow(container)
      const portTag = wrapper.find('.port-tag')
      expect(portTag.text()).toBe('80/tcp')
      expect(portTag.classes()).not.toContain('mapped')
    })
  })

  describe('delete button', () => {
    it('shows Delete button for non-self container', () => {
      const wrapper = mountRow(runningContainer)
      const buttons = wrapper.findAll('button')
      expect(buttons.some((b) => b.text().includes('Delete'))).toBe(true)
    })

    it('hides Delete button for self container', () => {
      const wrapper = mountRow(selfContainer)
      const buttons = wrapper.findAll('button')
      expect(buttons.some((b) => b.text().includes('Delete'))).toBe(false)
    })

    it('calls removeContainer when Delete is clicked', async () => {
      const wrapper = mountRow(stoppedContainer)
      const store = useContainersStore()
      store.removeContainer = vi.fn()

      const deleteBtn = wrapper.findAll('button').find((b) => b.text().includes('Delete'))!
      await deleteBtn.trigger('click')
      expect(store.removeContainer).toHaveBeenCalledWith('def456')
    })
  })
})
