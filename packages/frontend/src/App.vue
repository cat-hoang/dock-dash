<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from './stores/settings.store'
import ContainerList from './components/ContainerList.vue'
import SettingsModal from './components/SettingsModal.vue'

const settingsStore = useSettingsStore()
const showSettings = ref(false)

onMounted(() => settingsStore.fetchSettings())
</script>

<template>
  <div class="app">
    <header>
      <h1>Dock<span>Dash</span></h1>
      <div style="display:flex; gap:8px; align-items:center">
        <span v-if="settingsStore.settings.composeFolder" style="font-size:12px; color:var(--text-muted)">
          📁 {{ settingsStore.settings.composeFolder }}
        </span>
        <button class="btn" @click="showSettings = true">⚙ Settings</button>
      </div>
    </header>

    <ContainerList />

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>
