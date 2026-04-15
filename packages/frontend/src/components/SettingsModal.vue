<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings.store'

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useSettingsStore()
const folder = ref(store.settings.composeFolder)
const shellCommand = ref(store.settings.shellCommand)

watch(() => store.settings.composeFolder, (v) => { folder.value = v })
watch(() => store.settings.shellCommand, (v) => { shellCommand.value = v })

async function save() {
  const ok = await store.saveSettings({ composeFolder: folder.value, shellCommand: shellCommand.value })
  if (ok) emit('close')
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Settings</h2>

      <div v-if="store.error" class="error-bar">{{ store.error }}</div>

      <div class="form-group">
        <label>Docker Compose Folder</label>
        <input
          v-model="folder"
          type="text"
          placeholder="e.g. C:\projects or /home/user/apps"
        />
        <div style="margin-top:6px; font-size:11px; color:var(--text-muted)">
          All subfolders will be scanned for <code>docker-compose.yml</code> files.
        </div>
      </div>

      <div class="form-group">
        <label>Shell Command</label>
        <input
          v-model="shellCommand"
          type="text"
          placeholder="/bin/bash"
        />
        <div style="margin-top:6px; font-size:11px; color:var(--text-muted)">
          Shell to use for the interactive terminal. Leave empty to auto-detect
          (<code>/bin/bash</code>, <code>/bin/sh</code>, <code>sh</code>).
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn" @click="$emit('close')">Cancel</button>
        <button class="btn btn-blue" :disabled="store.saving" @click="save">
          <span v-if="store.saving" class="spinner"></span>
          Save
        </button>
      </div>
    </div>
  </div>
</template>
