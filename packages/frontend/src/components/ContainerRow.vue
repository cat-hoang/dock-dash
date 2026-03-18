<script setup lang="ts">
import type { Container } from '../api'
import { useContainersStore } from '../stores/containers.store'

const props = defineProps<{ container: Container }>()
const store = useContainersStore()

const isLoading = () => !!store.actionLoading[props.container.id]

function formatCreated(ts: number) {
  return new Date(ts * 1000).toLocaleDateString()
}
</script>

<template>
  <tr>
    <td>
      <div class="container-name">{{ container.name }}</div>
      <div class="container-sub">{{ container.id }}</div>
    </td>
    <td>
      <div>{{ container.image }}</div>
      <div v-if="container.composeProject" class="container-sub">
        {{ container.composeProject }} / {{ container.composeService }}
      </div>
    </td>
    <td>
      <span :class="`badge badge-${container.status}`">{{ container.status }}</span>
    </td>
    <td>
      <div class="port-list">
        <template v-if="container.ports.length">
          <span
            v-for="p in container.ports"
            :key="`${p.containerPort}${p.protocol}`"
            :class="['port-tag', p.hostPort ? 'mapped' : '']"
          >
            <template v-if="p.hostPort">{{ p.hostPort }}→</template>{{ p.containerPort }}/{{ p.protocol }}
          </span>
        </template>
        <span v-else class="container-sub">—</span>
      </div>
    </td>
    <td>{{ formatCreated(container.created) }}</td>
    <td>
      <div style="display:flex; gap:6px; justify-content:flex-end">
        <button
          v-if="container.status !== 'running'"
          class="btn btn-sm btn-green"
          :disabled="isLoading()"
          @click="store.startContainer(container.id)"
        >
          <span v-if="isLoading()" class="spinner"></span>
          Start
        </button>
        <button
          v-if="container.status === 'running' && !container.isSelf"
          class="btn btn-sm btn-red"
          :disabled="isLoading()"
          @click="store.stopContainer(container.id)"
        >
          <span v-if="isLoading()" class="spinner"></span>
          Stop
        </button>
      </div>
    </td>
  </tr>
</template>
