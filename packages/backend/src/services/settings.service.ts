import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json')

export interface Settings {
  composeFolder: string
  shellCommand: string   // '' = auto-detect
}

const DEFAULT_SETTINGS: Settings = {
  composeFolder: '',
  shellCommand: '',
}

function ensureDataDir() {
  const dir = path.dirname(SETTINGS_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function getSettings(): Settings {
  ensureDataDir()
  if (!fs.existsSync(SETTINGS_FILE)) {
    return { ...DEFAULT_SETTINGS }
  }
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    return JSON.parse(raw) as Settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): Settings {
  ensureDataDir()
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
  return settings
}
