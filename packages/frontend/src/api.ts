const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as any).error ?? res.statusText)
  }
  return res.json()
}

export interface PortBinding {
  hostIp: string
  hostPort: string
  containerPort: string
  protocol: string
}

export interface Container {
  id: string
  name: string
  image: string
  status: 'running' | 'stopped' | 'paused' | 'other'
  state: string
  ports: PortBinding[]
  composeProject?: string
  composeService?: string
  created: number
}

export interface Settings {
  composeFolder: string
}

export interface ComposeFile {
  project: string
  filePath: string
  folder: string
}

export const api = {
  containers: {
    list: () => request<Container[]>('/containers'),
    start: (id: string) => request<{ success: boolean }>(`/containers/${id}/start`, { method: 'POST' }),
    stop: (id: string) => request<{ success: boolean }>(`/containers/${id}/stop`, { method: 'POST' }),
  },
  settings: {
    get: () => request<Settings>('/settings'),
    save: (data: Partial<Settings>) => request<Settings>('/settings', { method: 'POST', body: JSON.stringify(data) }),
  },
  compose: {
    list: () => request<ComposeFile[]>('/compose'),
  },
}
