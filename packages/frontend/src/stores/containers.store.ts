import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type Container, type ContainerGroup } from '../api'

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

  const expandedGroups = ref<Record<string, boolean>>({})

  const groupedContainers = computed<ContainerGroup[]>(() => {
    const composeMap = new Map<string, Container[]>()
    const standalone: Container[] = []

    for (const c of containers.value) {
      if (c.composeProject) {
        if (!composeMap.has(c.composeProject)) {
          composeMap.set(c.composeProject, [])
        }
        composeMap.get(c.composeProject)!.push(c)
      } else {
        standalone.push(c)
      }
    }

    const groups: ContainerGroup[] = []
    for (const [name, members] of composeMap) {
      groups.push({ type: 'compose', name, containers: members })
    }
    for (const c of standalone) {
      groups.push({ type: 'standalone', name: c.name, containers: [c] })
    }
    return groups
  })

  function toggleGroup(name: string) {
    expandedGroups.value[name] = !expandedGroups.value[name]
  }

  function isGroupExpanded(name: string) {
    return !!expandedGroups.value[name]
  }

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

  async function removeContainer(id: string) {
    actionLoading.value[id] = true
    try {
      await api.containers.remove(id)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  async function restartContainer(id: string) {
    actionLoading.value[id] = true
    try {
      await api.containers.restart(id)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete actionLoading.value[id]
    }
  }

  const groupLoading = ref<Record<string, boolean>>({})

  async function removeGroup(name: string) {
    const group = groupedContainers.value.find((g) => g.name === name)
    if (!group) return
    groupLoading.value[name] = true
    try {
      const ids = group.containers.map((c) => c.id)
      await api.containers.removeGroup(ids)
      await fetchContainers()
    } catch (e: any) {
      error.value = e.message
    } finally {
      delete groupLoading.value[name]
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

  return { containers, loading, error, actionLoading, containerLogs, logsVisible, logsSeverity, running, stopped, groupedContainers, expandedGroups, groupLoading, toggleGroup, isGroupExpanded, fetchContainers, startContainer, stopContainer, restartContainer, pullRecreateContainer, removeContainer, removeGroup, toggleLogs, setLogsSeverity, getFilteredLogs }
})
