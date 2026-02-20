<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useContainersStore } from '../stores/containers.store'
import ContainerRow from './ContainerRow.vue'

const store = useContainersStore()

const search = ref('')
const filter = ref<'all' | 'running' | 'stopped'>('all')

const filtered = computed(() => {
  return store.containers.filter((c) => {
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
  })
})

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
      <template v-else-if="!filtered.length">
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
          <tbody>
            <ContainerRow v-for="c in filtered" :key="c.id" :container="c" />
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
