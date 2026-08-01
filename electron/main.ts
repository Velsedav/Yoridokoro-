import { app, BrowserWindow, ipcMain, dialog, net, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { normalizeSqlStatement } from './sqlParams'
import { normalizeExternalUrl, normalizeRemoteImageUrl } from './security'

// ── Linux GPU fixes ───────────────────────────────────────────────────────────
// White screen on Debian/GNOME caused by DMABUF buffer sharing failing in
// Chromium's GPU process. Force desktop GL path and X11 ozone platform.
// Force French locale so <input type="date"> renders dd/mm/yyyy in Chromium
app.commandLine.appendSwitch('lang', 'fr-FR')

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('use-gl', 'desktop')
  app.commandLine.appendSwitch('ozone-platform', 'x11')
  app.commandLine.appendSwitch('disable-features', 'UseChromeOSDirectVideoDecoder,VaapiVideoDecoder,VaapiVideoEncoder')
}

// ── SQLite setup ──────────────────────────────────────────────────────────────

const userData = app.getPath('userData')
let mainDb: Database.Database
let bingoDb: Database.Database

function initDatabases() {
  mainDb = new Database(path.join(userData, 'study_buddy.db'))
  mainDb.pragma('journal_mode = WAL')
  mainDb.pragma('foreign_keys = ON')
  applyMainSchema(mainDb)

  bingoDb = new Database(path.join(userData, 'bingo.db'))
  bingoDb.pragma('journal_mode = WAL')
  bingoDb.pragma('foreign_keys = ON')
  applyBingoSchema(bingoDb)
}

function applyMainSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects(
      id TEXT PRIMARY KEY, name TEXT, cover_path TEXT NULL, pinned INT,
      created_at TEXT, last_studied_at TEXT NULL, total_minutes INT,
      deadline TEXT NULL, archived INT DEFAULT 0, focus_type TEXT NULL,
      chapters TEXT NULL, result TEXT NULL, deleted_at TEXT NULL, subject_type TEXT NULL,
      importance_weight INTEGER NOT NULL DEFAULT 5, default_focus_type TEXT NULL,
      default_spacing TEXT NULL, default_source_label TEXT NULL, default_source_url TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY, name TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS subject_tags(
      subject_id TEXT, tag_id TEXT,
      PRIMARY KEY(subject_id, tag_id),
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS subgoals(
      id TEXT PRIMARY KEY, subject_id TEXT, text TEXT, done INT, created_at TEXT,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY, started_at TEXT, ended_at TEXT NULL,
      template TEXT, repeats INT, planned_minutes INT, actual_minutes INT,
      actual_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed', evaluated_at TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS session_blocks(
      id TEXT PRIMARY KEY, session_id TEXT, idx INT, type TEXT, minutes INT,
      subject_id TEXT NULL, technique_id TEXT NULL, started_at TEXT NULL, ended_at TEXT NULL,
      chapter_id TEXT NULL, chapter_name TEXT NULL, confidence_score INTEGER NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS session_effects(
      session_id TEXT NOT NULL, effect_type TEXT NOT NULL, target_id TEXT NOT NULL,
      applied_at TEXT NULL, applied INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(session_id, effect_type, target_id),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quotes(
      id TEXT PRIMARY KEY, text TEXT NOT NULL, idx INT NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO quotes(id, text, idx) VALUES ('default_1', 'Let''s do our best today! ✨', 0);
    INSERT OR IGNORE INTO quotes(id, text, idx) VALUES ('default_2', 'You''re doing amazing! 💖', 1);
    INSERT OR IGNORE INTO quotes(id, text, idx) VALUES ('default_3', 'Keep going, you got this! 🌟', 2);
    INSERT OR IGNORE INTO quotes(id, text, idx) VALUES ('default_4', 'Every minute counts! ⏰', 3);
    CREATE TABLE IF NOT EXISTS metacognition_logs(
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
      retention TEXT, focus_drop TEXT, memorization_align TEXT, mechanical_fix TEXT,
      free_time_hours REAL NULL, priority_subject_ids TEXT NULL
    );
    CREATE TABLE IF NOT EXISTS error_log(
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
      subject_id TEXT NULL, chapter_name TEXT NULL, text TEXT, resolved INT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS people(
      id TEXT PRIMARY KEY, display_name TEXT NOT NULL, relationship_kind TEXT NOT NULL DEFAULT 'other',
      organization TEXT NULL, role TEXT NULL, birthday TEXT NULL,
      follow_up_at TEXT NULL, follow_up_note TEXT NULL,
      archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS person_interactions(
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'other', direction TEXT NULL, summary TEXT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_person_interactions_person_date ON person_interactions(person_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS person_notes(
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, text TEXT NOT NULL, category TEXT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_person_notes_person_date ON person_notes(person_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS activities(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'general',
      color TEXT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_links(
      activity_id TEXT NOT NULL, domain TEXT NOT NULL, entity_id TEXT NOT NULL,
      PRIMARY KEY(activity_id, domain, entity_id),
      FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS activity_resources(
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_activity_resources_activity ON activity_resources(activity_id, created_at);
    CREATE TABLE IF NOT EXISTS time_entries(
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL, note TEXT NULL, source TEXT NOT NULL DEFAULT 'timer', source_ref TEXT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS time_entry_deletions(
      source_ref TEXT PRIMARY KEY, deleted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_events(
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
      event_kind TEXT NOT NULL, delta_value REAL NULL, value_after REAL NULL,
      unit TEXT NULL, note TEXT NULL, source TEXT NOT NULL, source_ref TEXT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_time_entries_activity_date ON time_entries(activity_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_time_entries_started_at ON time_entries(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_events_date ON activity_events(occurred_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_source_ref ON activity_events(source_ref) WHERE source_ref IS NOT NULL;
    CREATE TABLE IF NOT EXISTS eisenhower_tasks(
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      quadrant TEXT NOT NULL DEFAULT 'schedule', done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eisenhower_tasks_quadrant ON eisenhower_tasks(quadrant, done, created_at);
    CREATE TABLE IF NOT EXISTS analytics_events(
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_version INTEGER NOT NULL DEFAULT 1,
      occurred_at TEXT NOT NULL,
      timezone_offset_minutes INTEGER NOT NULL,
      monotonic_ms REAL NULL,
      visit_id TEXT NOT NULL,
      opportunity_id TEXT NULL,
      recommendation_id TEXT NULL,
      session_id TEXT NULL,
      block_id TEXT NULL,
      subject_id TEXT NULL,
      chapter_id TEXT NULL,
      policy_id TEXT NULL,
      policy_version TEXT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      quality_flags TEXT NOT NULL DEFAULT '[]',
      dedupe_key TEXT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_opportunity ON analytics_events(opportunity_id, occurred_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_dedupe ON analytics_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS study_data_snapshots(
      kind TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const hasColumn = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(item => item.name === column)
  const ensureColumn = (table: string, column: string, definition: string) => {
    if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  const migrate = db.transaction(() => {
    ensureColumn('subjects', 'deadline', 'TEXT NULL')
    ensureColumn('subjects', 'archived', 'INT DEFAULT 0')
    ensureColumn('subjects', 'focus_type', 'TEXT NULL')
    ensureColumn('subjects', 'chapters', 'TEXT NULL')
    ensureColumn('subjects', 'result', 'TEXT NULL')
    ensureColumn('subjects', 'deleted_at', 'TEXT NULL')
    ensureColumn('subjects', 'subject_type', 'TEXT NULL')
    ensureColumn('subjects', 'importance_weight', 'INTEGER NOT NULL DEFAULT 5')
    ensureColumn('subjects', 'default_focus_type', 'TEXT NULL')
    ensureColumn('subjects', 'default_spacing', 'TEXT NULL')
    ensureColumn('subjects', 'default_source_label', 'TEXT NULL')
    ensureColumn('subjects', 'default_source_url', 'TEXT NULL')
    ensureColumn('session_blocks', 'chapter_id', 'TEXT NULL')
    ensureColumn('session_blocks', 'chapter_name', 'TEXT NULL')
    ensureColumn('session_blocks', 'confidence_score', 'INTEGER NULL')
    ensureColumn('session_effects', 'applied', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn('metacognition_logs', 'free_time_hours', 'REAL NULL')
    ensureColumn('metacognition_logs', 'priority_subject_ids', 'TEXT NULL')
    ensureColumn('time_entries', 'source_ref', 'TEXT NULL')
    ensureColumn('sessions', 'actual_seconds', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn('sessions', 'status', "TEXT NOT NULL DEFAULT 'completed'")
    ensureColumn('sessions', 'evaluated_at', 'TEXT NULL')
    db.exec("UPDATE sessions SET actual_seconds = actual_minutes * 60 WHERE actual_seconds = 0 AND actual_minutes > 0")
    // Old retries could leave more than one row for the same logical block.
    // Keep the first durable copy before enforcing the new idempotency key.
    db.exec(`DELETE FROM session_blocks
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM session_blocks GROUP BY session_id, idx
      )`)
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_session_blocks_session_idx ON session_blocks(session_id, idx)')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_source_ref ON time_entries(source_ref) WHERE source_ref IS NOT NULL')
    db.exec('UPDATE subjects SET importance_weight = 5 WHERE importance_weight IS NULL OR importance_weight < 1 OR importance_weight > 10')
    db.pragma('user_version = 4')
  })
  migrate()
}

function applyBingoSchema(db: Database.Database) {
  const previousVersion = db.pragma('user_version', { simple: true }) as number
  db.exec(`
    CREATE TABLE IF NOT EXISTS slots(slot_index INTEGER PRIMARY KEY, objective_id TEXT NULL);
    CREATE TABLE IF NOT EXISTS objectives(
      id TEXT PRIMARY KEY, title TEXT NOT NULL, goal_kind TEXT NOT NULL,
      goal_target REAL NULL, goal_unit TEXT NULL, cover_data TEXT NULL,
      current_value REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, pin_bottom INTEGER NOT NULL DEFAULT 0,
      frequency_days INTEGER NULL
    );
    CREATE TABLE IF NOT EXISTS subobjectives(
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, title TEXT NOT NULL,
      note TEXT NULL, target_total REAL NULL, progress_current REAL NOT NULL DEFAULT 0,
      unit TEXT NULL, is_done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      FOREIGN KEY(objective_id) REFERENCES objectives(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS time_sessions(
      id TEXT PRIMARY KEY, subobjective_id TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER NULL, duration_ms INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(subobjective_id) REFERENCES subobjectives(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS media_items(
      id TEXT PRIMARY KEY, subobjective_id TEXT NOT NULL,
      kind TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY(subobjective_id) REFERENCES subobjectives(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bingo_year_slots(
      slot_index INTEGER NOT NULL, year INTEGER NOT NULL, objective_id TEXT NULL,
      PRIMARY KEY(slot_index, year)
    );
    CREATE TABLE IF NOT EXISTS bingo_year_settings(
      year INTEGER PRIMARY KEY, layout TEXT NOT NULL DEFAULT '4x4'
    );
    CREATE TABLE IF NOT EXISTS objective_progress_events(
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, subobjective_id TEXT NULL,
      occurred_at INTEGER NOT NULL, event_kind TEXT NOT NULL,
      delta_value REAL NULL, value_after REAL NULL, unit TEXT NULL, label TEXT NOT NULL,
      FOREIGN KEY(objective_id) REFERENCES objectives(id) ON DELETE CASCADE,
      FOREIGN KEY(subobjective_id) REFERENCES subobjectives(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_quotes(id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_bingo_year_slots_year ON bingo_year_slots(year, slot_index);
    CREATE INDEX IF NOT EXISTS idx_bingo_subobjectives_objective ON subobjectives(objective_id);
    CREATE INDEX IF NOT EXISTS idx_bingo_time_sessions_subobjective ON time_sessions(subobjective_id, ended_at);
    CREATE INDEX IF NOT EXISTS idx_bingo_media_subobjective_kind_created ON media_items(subobjective_id, kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bingo_progress_events_objective_date ON objective_progress_events(objective_id, occurred_at DESC);
  `)

  if (previousVersion < 4) {
    const migrateUnifiedObjectiveProgress = db.transaction(() => {
      const legacyObjectives = db.prepare(`
        SELECT id, title, goal_kind, goal_target, goal_unit, current_value, created_at, updated_at
        FROM objectives
        WHERE goal_kind <> 'count'
      `).all() as Array<{
        id: string
        title: string
        goal_kind: string
        goal_target: number | null
        goal_unit: string | null
        current_value: number
        created_at: number
        updated_at: number
      }>

      for (const objective of legacyObjectives) {
        const existingStepCount = (db.prepare(
          'SELECT COUNT(*) AS count FROM subobjectives WHERE objective_id = ?'
        ).get(objective.id) as { count: number }).count
        const carriesMeasurement = objective.goal_kind === 'metric'
          || objective.goal_kind === 'amount'
          || (objective.current_value ?? 0) !== 0
          || (objective.goal_target ?? 0) > 0

        if (carriesMeasurement) {
          const measuredTarget = (objective.goal_target ?? 0) > 0
            ? objective.goal_target!
            : 100
          const measuredUnit = objective.goal_unit
            || (objective.goal_kind === 'manual' ? '%' : null)
          db.prepare(`
            INSERT INTO subobjectives
              (id, objective_id, title, note, target_total, progress_current, unit, is_done, created_at, updated_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            objective.id,
            objective.title,
            measuredTarget,
            objective.current_value ?? 0,
            measuredUnit,
            (objective.current_value ?? 0) >= measuredTarget ? 1 : 0,
            objective.created_at,
            objective.updated_at,
          )
        }

        const plannedSteps = carriesMeasurement
          ? Math.max(1, existingStepCount + 1)
          : (existingStepCount > 0 ? existingStepCount : null)
        db.prepare(`
          UPDATE objectives
          SET goal_kind = 'count', goal_target = ?, goal_unit = NULL, current_value = 0
          WHERE id = ?
        `).run(plannedSteps, objective.id)
      }

      db.pragma('user_version = 4')
    })
    migrateUnifiedObjectiveProgress()
  } else {
    db.pragma('user_version = 4')
  }
}

// ── IPC: database ─────────────────────────────────────────────────────────────

ipcMain.handle('db:execute', (_e, dbName: 'main' | 'bingo', sql: string, params: unknown[] = []) => {
  const db = dbName === 'main' ? mainDb : bingoDb
  const normalized = normalizeSqlStatement(sql, params)
  const result = db.prepare(normalized.sql).run(normalized.params)
  return { lastInsertRowid: result.lastInsertRowid, changes: result.changes }
})

ipcMain.handle('db:select', (_e, dbName: 'main' | 'bingo', sql: string, params: unknown[] = []) => {
  const db = dbName === 'main' ? mainDb : bingoDb
  const normalized = normalizeSqlStatement(sql, params)
  return db.prepare(normalized.sql).all(normalized.params)
})

// ── IPC: file system ──────────────────────────────────────────────────────────

ipcMain.handle('fs:getUserDataPath', () => userData)

ipcMain.handle('fs:readTextFile', (_e, filePath: string) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('fs:writeTextFile', (_e, filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
})

ipcMain.handle('db:transaction', (_e, dbName: 'main' | 'bingo', statements: Array<{ sql: string; params?: unknown[] }>) => {
  const db = dbName === 'main' ? mainDb : bingoDb
  const run = db.transaction(() => statements.map(statement => {
    const normalized = normalizeSqlStatement(statement.sql, statement.params ?? [])
    const result = db.prepare(normalized.sql).run(normalized.params)
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes }
  }))
  return run()
})

ipcMain.handle('fs:writeTextFileAtomic', (_e, filePath: string, content: string) => {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true })
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = fs.openSync(temporaryPath, 'w')
    fs.writeFileSync(descriptor, content, 'utf-8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try { fs.unlinkSync(temporaryPath) } catch { /* Nothing to clean up. */ }
    throw error
  }
})

ipcMain.handle('fs:readFile', (_e, filePath: string) => {
  return fs.readFileSync(filePath)
})

ipcMain.handle('fs:writeFile', (_e, filePath: string, data: Uint8Array) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, data)
})

ipcMain.handle('fs:exists', (_e, filePath: string) => {
  return fs.existsSync(filePath)
})

ipcMain.handle('fs:mkdir', (_e, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
})

// ── IPC: dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_e, options: Electron.OpenDialogOptions = {}) => {
  const result = await dialog.showOpenDialog({ ...options, properties: ['openFile'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:saveFile', async (_e, options: Electron.SaveDialogOptions = {}) => {
  const result = await dialog.showSaveDialog(options)
  return result.canceled ? null : result.filePath
})

// ── IPC: shell ────────────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', (_e, filePath: string) => {
  shell.openPath(filePath)
})

async function openExternalSafely(rawUrl: unknown) {
  const url = normalizeExternalUrl(rawUrl)
  if (!url) throw new Error('External URL is not allowed.')
  await shell.openExternal(url)
}

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  await openExternalSafely(url)
})

const REMOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const REMOTE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

ipcMain.handle('image:fetchDataUrl', async (_e, rawUrl: string) => {
  let currentUrl = normalizeRemoteImageUrl(rawUrl)
  if (!currentUrl) throw new Error('Cette adresse d’image n’est pas autorisée.')

  let response: Response | null = null
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    response = await net.fetch(currentUrl, {
      redirect: 'manual',
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    })
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get('location')
    currentUrl = location ? normalizeRemoteImageUrl(new URL(location, currentUrl).toString()) : null
    if (!currentUrl) throw new Error('La redirection de cette image n’est pas autorisée.')
  }

  if (!response?.ok) throw new Error(`L’image n’a pas pu être téléchargée (${response?.status ?? 'réseau'}).`)
  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!REMOTE_IMAGE_TYPES.has(mimeType)) throw new Error('Le lien ne pointe pas vers une image compatible.')
  const announcedSize = Number(response.headers.get('content-length') ?? 0)
  if (announcedSize > REMOTE_IMAGE_MAX_BYTES) throw new Error('Cette image dépasse la limite de 10 Mo.')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > REMOTE_IMAGE_MAX_BYTES) throw new Error('Cette image dépasse la limite de 10 Mo.')
  return `data:${mimeType};base64,${bytes.toString('base64')}`
})

// ── IPC: allowlisted public catalogues ───────────────────────────────────────

const catalogueHosts = new Set(['collectionapi.metmuseum.org', 'poetrydb.org'])

ipcMain.handle('catalogue:fetchJson', async (_e, rawUrl: string) => {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || !catalogueHosts.has(url.hostname)) {
    throw new Error('This catalogue host is not allowed.')
  }
  const response = await net.fetch(url.toString(), { headers: { Accept: 'application/json' } })
  let data: unknown
  try { data = await response.json() }
  catch { data = null }
  return { ok: response.ok, status: response.status, data }
})

// ── IPC: autostart ────────────────────────────────────────────────────────────

ipcMain.handle('autostart:isEnabled', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('autostart:setEnabled', (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false })
})

// ── Graceful close: let the renderer finish local/cloud-folder exports ───────

const closeAuthorized = new WeakSet<BrowserWindow>()
const closeRequested = new WeakSet<BrowserWindow>()
const closeTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()

function authorizeAndClose(win: BrowserWindow) {
  const timer = closeTimers.get(win)
  if (timer) clearTimeout(timer)
  closeAuthorized.add(win)
  if (!win.isDestroyed()) win.close()
}

ipcMain.on('app:ready-to-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) authorizeAndClose(win)
})

ipcMain.on('app:force-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) win.destroy()
})

ipcMain.handle('window:toggleFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  win.setFullScreen(!win.isFullScreen())
  return win.isFullScreen()
})

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'public', 'icon-dark-academia.png')
    : path.join(app.getAppPath(), 'src', 'public', 'icon-dark-academia.png')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    backgroundColor: '#1a1625',
    icon: iconPath,
    show: false,
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.on('close', (event) => {
    if (closeAuthorized.has(win)) return
    event.preventDefault()
    if (closeRequested.has(win)) return
    closeRequested.add(win)
    win.webContents.send('app:before-close')
    closeTimers.set(win, setTimeout(() => authorizeAndClose(win), 20_000))
  })

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url).catch(error => console.warn('Blocked external window', error))
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    void openExternalSafely(url).catch(error => console.warn('Blocked renderer navigation', error))
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

}

app.whenReady().then(() => {
  app.setAppUserModelId('com.velsedav.yoridokoro')
  initDatabases()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
