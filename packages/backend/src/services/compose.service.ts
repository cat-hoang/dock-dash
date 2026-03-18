import fs from 'node:fs'
import path from 'node:path'
import { glob } from 'glob'

export interface ComposeFile {
  project: string
  filePath: string
  folder: string
}

export async function scanComposeFiles(baseFolder: string): Promise<ComposeFile[]> {
  if (!baseFolder || !fs.existsSync(baseFolder)) {
    return []
  }

  const patterns = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ]

  const files: ComposeFile[] = []

  for (const pattern of patterns) {
    const matches = await glob(`**/${pattern}`, {
      cwd: baseFolder,
      absolute: false,
      ignore: ['**/node_modules/**'],
    })

    for (const match of matches) {
      const relFolder = path.dirname(match)
      const project = relFolder === '.' ? path.basename(baseFolder) : path.basename(relFolder)

      // Avoid duplicate projects — compare by relative path
      if (!files.find((f) => f.filePath === match)) {
        files.push({ project, filePath: match, folder: relFolder === '.' ? '' : relFolder })
      }
    }
  }

  return files.sort((a, b) => a.project.localeCompare(b.project))
}
