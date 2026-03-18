import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type Container } from '../api'

export const useContainersStore = defineStore('containers', () => {
  const containers = ref<Container[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const actionLoading = ref<Record<string, boolean>>({})
  const containerLogs = ref<Record<string, string>>({})
  const logsVisible = ref<Record<string, boolean>>({})
  const logsSeverity = ref<Record<string, string>>({})

  const running = computed(() => containers.value.filter((c) => c.status === 'running'))
  const stopped = computed(() => containers.value.filter((c) => c.status !== 'running'))

  async function fetchContainers() {
    loading.value = true
    error.value = null
    try {
      containers.value = await api.containers.list()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function startContainer(id: string) {
    actionLoading.value[id] = true
    try {
      await api.containers.start(id)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  async function stopContainer(id: string) {
    actionLoading.value[id] = true
    try {
      await api.containers.stop(id)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  async function pullRecreateContainer(id: string) {
    actionLoading.value[id] = true
    try {
      await api.containers.pullRecreate(id)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  async function toggleLogs(id: string) {
    if (logsVisible.value[id]) {
      logsVisible.value[id] = false
      return
    }
    actionLoading.value[id] = true
    try {
      const { logs } = await api.containers.logs(id)
      containerLogs.value[id] = logs
      logsVisible.value[id] = true
      if (!logsSeverity.value[id]) {
        logsSeverity.value[id] = 'all'
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  function setLogsSeverity(id: string, severity: string) {
    logsSeverity.value[id] = severity
  }

  function getFilteredLogs(id: string): string {
    const raw = containerLogs.value[id] ?? ''
    const severity = logsSeverity.value[id] ?? 'all'
    if (severity === 'all' || !raw) return raw

    const patterns: Record<string, RegExp> = {
      error: /\b(error|err|fatal|crit(ical)?|panic)\b/i,
      warn:  /\b(warn(ing)?|caution)\b/i,
      info:  /\b(info|notice)\b/i,
      debug: /\b(debug|trace|verbose)\b/i,
    }
    const pattern = patterns[severity]
    if (!pattern) return raw

    return raw
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n') || `No ${severity.toUpperCase()} lines found.`
  }

  return { containers, loading, error, actionLoading, containerLogs, logsVisible, logsSeverity, running, stopped, fetchContainers, startContainer, stopContainer, pullRecreateContainer, toggleLogs, setLogsSeverity, getFilteredLogs }
})
