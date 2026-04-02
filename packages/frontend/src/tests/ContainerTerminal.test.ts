import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ContainerTerminal from '../components/ContainerTerminal.vue'

const terminalInstances: any[] = []
const fitInstances: any[] = []

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80
    rows = 24
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    private _onData: ((data: string) => void) | undefined

    constructor() {
      terminalInstances.push(this)
    }

    onData(cb: (data: string) => void) {
      this._onData = cb
      return { dispose: vi.fn() }
    }

    emitData(data: string) {
      this._onData?.(data)
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn()

    constructor() {
      fitInstances.push(this)
    }
  },
}))

class MockWebSocket {
  static OPEN = 1
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.OPEN
  binaryType = ''
  sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = []
  onopen: ((ev: Event) => any) | null = null
  onmessage: ((ev: MessageEvent) => any) | null = null
  onclose: ((ev: CloseEvent) => any) | null = null
  onerror: ((ev: Event) => any) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(data)
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  callback: ResizeObserverCallback
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

describe('ContainerTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    terminalInstances.length = 0
    fitInstances.length = 0
    MockWebSocket.instances.length = 0
    MockResizeObserver.instances.length = 0
    ;(globalThis as any).WebSocket = MockWebSocket
    ;(globalThis as any).ResizeObserver = MockResizeObserver
  })

  afterEach(() => {
    delete (globalThis as any).WebSocket
    delete (globalThis as any).ResizeObserver
  })

  it('opens websocket with the container exec path', () => {
    mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toContain('/api/containers/abc123def456/exec')
  })

  it('sends initial resize payload on websocket open', () => {
    mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    const ws = MockWebSocket.instances[0]
    ws.onopen?.(new Event('open'))

    expect(ws.sent).toHaveLength(1)
    expect(JSON.parse(ws.sent[0] as string)).toEqual({ type: 'resize', cols: 80, rows: 24 })
  })

  it('forwards terminal user input to websocket', () => {
    mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    const ws = MockWebSocket.instances[0]
    terminalInstances[0].emitData('ls -la\n')

    expect(ws.sent).toContain('ls -la\n')
  })

  it('writes websocket messages to terminal', () => {
    mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    const ws = MockWebSocket.instances[0]
    ws.onmessage?.({ data: 'hello from shell' } as MessageEvent)

    expect(terminalInstances[0].write).toHaveBeenCalledWith('hello from shell')
  })

  it('fits and resends resize on observer callback', () => {
    mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    const ws = MockWebSocket.instances[0]
    ws.onopen?.(new Event('open'))
    MockResizeObserver.instances[0].trigger()

    expect(fitInstances[0].fit).toHaveBeenCalled()
    const lastPayload = JSON.parse(ws.sent[ws.sent.length - 1] as string)
    expect(lastPayload).toEqual({ type: 'resize', cols: 80, rows: 24 })
  })

  it('emits close when close button is clicked', async () => {
    const wrapper = mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('cleans up websocket, observer, and terminal on unmount', () => {
    const wrapper = mount(ContainerTerminal, { props: { containerId: 'abc123def456' } })
    const ws = MockWebSocket.instances[0]

    wrapper.unmount()

    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalled()
    expect(terminalInstances[0].dispose).toHaveBeenCalled()
  })
})
