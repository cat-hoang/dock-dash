const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = options?.body ? { 'Content-Type': 'application/json' } : {}
  const res = await fetch(`${BASE}${path}`, {
    headers,
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
  isSelf: boolean
}

export interface ContainerGroup {
  type: 'compose' | 'standalone'
  name: string
  containers: Container[]
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
    pullRecreate: (id: string) => request<{ success: boolean }>(`/containers/${id}/pull-recreate`, { method: 'POST' }),
    logs: (id: string) => request<{ logs: string }>(`/containers/${id}/logs`),
    remove: (id: string) => request<{ success: boolean }>(`/containers/${id}`, { method: 'DELETE' }),
    removeGroup: (ids: string[]) => request<{ success: boolean }>('/containers/remove-group', { method: 'POST', body: JSON.stringify({ ids }) }),
  },
  settings: {
    get: () => request<Settings>('/settings'),
    save: (data: Partial<Settings>) => request<Settings>('/settings', { method: 'POST', body: JSON.stringify(data) }),
  },
  compose: {
    list: () => request<ComposeFile[]>('/compose'),
  },
}
