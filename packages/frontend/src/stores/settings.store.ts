import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type Settings } from '../api'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ composeFolder: '' })
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function fetchSettings() {
    loading.value = true
    try {
      settings.value = await api.settings.get()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function saveSettings(data: Partial<Settings>) {
    saving.value = true
    error.value = null
    try {
      settings.value = await api.settings.save(data)
      return true
    } catch (e: any) {
      error.value = e.message
      return false
    } finally {
      saving.value = false
    }
  }

  return { settings, loading, saving, error, fetchSettings, saveSettings }
})
