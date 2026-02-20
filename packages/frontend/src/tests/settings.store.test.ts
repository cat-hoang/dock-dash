import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../stores/settings.store'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    containers: { list: vi.fn(), start: vi.fn(), stop: vi.fn() },
    settings: { get: vi.fn(), save: vi.fn() },
    compose: { list: vi.fn() },
  },
}))

describe('settingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetches settings', async () => {
    vi.mocked(api.settings.get).mockResolvedValue({ composeFolder: '/home/user/apps' })

    const store = useSettingsStore()
    await store.fetchSettings()

    expect(store.settings.composeFolder).toBe('/home/user/apps')
    expect(store.loading).toBe(false)
  })

  it('saves settings and updates state', async () => {
    const updated = { composeFolder: '/new/path' }
    vi.mocked(api.settings.save).mockResolvedValue(updated)

    const store = useSettingsStore()
    const result = await store.saveSettings(updated)

    expect(result).toBe(true)
    expect(store.settings.composeFolder).toBe('/new/path')
    expect(store.saving).toBe(false)
  })

  it('returns false and sets error on save failure', async () => {
    vi.mocked(api.settings.save).mockRejectedValue(new Error('write error'))

    const store = useSettingsStore()
    const result = await store.saveSettings({ composeFolder: '/bad' })

    expect(result).toBe(false)
    expect(store.error).toBe('write error')
  })
})
