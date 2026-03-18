<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useContainersStore } from '../stores/containers.store'
import ContainerRow from './ContainerRow.vue'

const store = useContainersStore()

const search = ref('')
const filter = ref<'all' | 'running' | 'stopped'>('all')

function matchesFilters(c: { name: string; image: string; composeProject?: string; status: string }) {
  const matchesSearch =
    !search.value ||
    c.name.toLowerCase().includes(search.value.toLowerCase()) ||
    c.image.toLowerCase().includes(search.value.toLowerCase()) ||
    (c.composeProject ?? '').toLowerCase().includes(search.value.toLowerCase())
  const matchesFilter =
    filter.value === 'all' ||
    (filter.value === 'running' && c.status === 'running') ||
    (filter.value === 'stopped' && c.status !== 'running')
  return matchesSearch && matchesFilter
}

const filteredGroups = computed(() => {
  return store.groupedContainers
    .map((group) => ({
      ...group,
      containers: group.containers.filter(matchesFilters),
    }))
    .filter((group) => group.containers.length > 0)
})

function groupRunning(containers: { status: string }[]) {
  return containers.filter((c) => c.status === 'running').length
}

function groupStatus(containers: { status: string }[]): string {
  const running = groupRunning(containers)
  if (running === containers.length) return 'running'
  if (running === 0) return 'stopped'
  return 'partial'
}

let interval: ReturnType<typeof setInterval>

onMounted(() => {
  store.fetchContainers()
  interval = setInterval(() => store.fetchContainers(), 10_000)
})

onUnmounted(() => clearInterval(interval))
</script>

<template>
  <div>
    <div class="section-header">
      <h2>Containers</h2>
      <div style="display:flex; align-items:center; gap:10px">
        <span class="count-badge">{{ store.running.length }} running / {{ store.stopped.length }} stopped</span>
        <button class="btn btn-sm" :disabled="store.loading" @click="store.fetchContainers()">
          <span v-if="store.loading" class="spinner"></span>
          <span v-else>↻</span>
          Refresh
        </button>
      </div>
    </div>

    <div v-if="store.error" class="error-bar">{{ store.error }}</div>

    <div class="toolbar">
      <input type="text" v-model="search" placeholder="Search by name, image, project…" />
      <button :class="['filter-btn', filter === 'all' && 'active']" @click="filter = 'all'">All</button>
      <button :class="['filter-btn', filter === 'running' && 'active']" @click="filter = 'running'">Running</button>
      <button :class="['filter-btn', filter === 'stopped' && 'active']" @click="filter = 'stopped'">Stopped</button>
    </div>

    <div class="card" style="padding:0; overflow:hidden">
      <template v-if="store.loading && !store.containers.length">
        <div class="empty-state"><span class="spinner"></span></div>
      </template>
      <template v-else-if="!filteredGroups.length">
        <div class="empty-state">
          {{ store.containers.length ? 'No containers match your filter.' : 'No containers found.' }}
        </div>
      </template>
      <template v-else>
        <table class="container-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Image</th>
              <th>Status</th>
              <th>Ports</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody v-for="group in filteredGroups" :key="group.name">
            <!-- Compose project group header -->
            <tr
              v-if="group.type === 'compose'"
              class="group-header"
              @click="store.toggleGroup(group.name)"
            >
              <td colspan="6">
                <div class="group-header-content">
                  <span class="expand-icon">{{ store.isGroupExpanded(group.name) ? '▾' : '▸' }}</span>
                  <span class="group-name">{{ group.name }}</span>
                  <span class="group-stats">{{ group.containers.length }} service{{ group.containers.length !== 1 ? 's' : '' }}</span>
                  <span :class="`badge badge-${groupStatus(group.containers)}`">
                    {{ groupRunning(group.containers) }}/{{ group.containers.length }} running
                  </span>
                </div>
              </td>
            </tr>
            <!-- Container rows: always shown for standalone, toggled for compose -->
            <template v-if="group.type === 'standalone' || store.isGroupExpanded(group.name)">
              <ContainerRow
                v-for="c in group.containers"
                :key="c.id"
                :container="c"
                :nested="group.type === 'compose'"
              />
            </template>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
