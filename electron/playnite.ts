import fs from 'node:fs/promises'
import path from 'node:path'
import { parsePlayniteGameActivity, type PlayniteReadResult, type PlayniteSession } from '../src/lib/playniteSessions'

const GAME_ACTIVITY_EXTENSION_DATA_ID = 'afbb1a0d-04a1-4d0c-9afa-c6e42ca855b4'

async function findGameActivityDirectory(appDataPath: string): Promise<string | null> {
  const extensionsData = path.join(appDataPath, 'Playnite', 'ExtensionsData')
  const preferred = path.join(extensionsData, GAME_ACTIVITY_EXTENSION_DATA_ID, 'GameActivity')
  try {
    if ((await fs.stat(preferred)).isDirectory()) return preferred
  } catch { /* Try discovering the extension data directory below. */ }

  try {
    const extensions = await fs.readdir(extensionsData, { withFileTypes: true })
    for (const extension of extensions) {
      if (!extension.isDirectory()) continue
      const candidate = path.join(extensionsData, extension.name, 'GameActivity')
      try {
        if ((await fs.stat(candidate)).isDirectory()) return candidate
      } catch { /* This extension does not expose GameActivity data. */ }
    }
  } catch { return null }
  return null
}

export async function readPlayniteSessions(appDataPath: string): Promise<PlayniteReadResult> {
  const directory = await findGameActivityDirectory(appDataPath)
  if (!directory) return { sessions: [], warning: 'not-found' }

  let files: string[]
  try {
    files = (await fs.readdir(directory)).filter(file => file.toLowerCase().endsWith('.json'))
  } catch {
    return { sessions: [], warning: 'read-error' }
  }

  const sessions: PlayniteSession[] = []
  let readError = false
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(directory, file), 'utf8')
      sessions.push(...parsePlayniteGameActivity(raw, path.basename(file, path.extname(file))))
    } catch { readError = true }
  }

  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.sourceRef.localeCompare(b.sourceRef))
  return { sessions, warning: readError ? 'read-error' : null }
}
