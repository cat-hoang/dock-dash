<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

const props = defineProps<{ containerId: string }>()
const emit = defineEmits<{ close: [] }>()

const terminalEl = ref<HTMLDivElement>()
let term: Terminal
let fitAddon: FitAddon
let ws: WebSocket
let resizeObserver: ResizeObserver

onMounted(() => {
  term = new Terminal({
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#264f78',
    },
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(terminalEl.value!)
  fitAddon.fit()

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${window.location.host}/api/containers/${props.containerId}/exec`)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
  }

  ws.onmessage = (event) => {
    const data = event.data instanceof ArrayBuffer
      ? new TextDecoder().decode(event.data)
      : event.data as string
    term.write(data)
  }

  ws.onclose = () => {
    term.write('\r\n\x1b[2m[Session closed]\x1b[0m\r\n')
  }

  ws.onerror = () => {
    term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n')
  }

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data)
  })

  resizeObserver = new ResizeObserver(() => {
    fitAddon.fit()
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
  })
  resizeObserver.observe(terminalEl.value!)

  term.focus()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  ws?.close()
  term?.dispose()
})
</script>

<template>
  <div class="terminal-panel">
    <div class="terminal-toolbar">
      <span class="terminal-title">⬢ Shell — {{ containerId }}</span>
      <button class="btn btn-sm" @click="emit('close')">✕ Close</button>
    </div>
    <div ref="terminalEl" class="terminal-body" />
  </div>
</template>
