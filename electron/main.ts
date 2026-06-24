import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

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
      chapters TEXT NULL, result TEXT NULL, deleted_at TEXT NULL, subject_type TEXT NULL
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
      template TEXT, repeats INT, planned_minutes INT, actual_minutes INT
    );
    CREATE TABLE IF NOT EXISTS session_blocks(
      id TEXT PRIMARY KEY, session_id TEXT, idx INT, type TEXT, minutes INT,
      subject_id TEXT NULL, technique_id TEXT NULL, started_at TEXT NULL, ended_at TEXT NULL,
      chapter_name TEXT NULL, confidence_score INTEGER NULL,
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
  `)

  // Safety patches — ignore if column already exists
  const safeAlter = (sql: string) => { try { db.exec(sql) } catch {} }
  safeAlter('ALTER TABLE subjects ADD COLUMN deadline TEXT NULL')
  safeAlter('ALTER TABLE subjects ADD COLUMN archived INT DEFAULT 0')
  safeAlter('ALTER TABLE subjects ADD COLUMN focus_type TEXT NULL')
  safeAlter('ALTER TABLE subjects ADD COLUMN chapters TEXT NULL')
  safeAlter('ALTER TABLE subjects ADD COLUMN result TEXT NULL')
  safeAlter('ALTER TABLE subjects ADD COLUMN deleted_at TEXT NULL')
  safeAlter('ALTER TABLE subjects ADD COLUMN subject_type TEXT NULL')
  safeAlter('ALTER TABLE session_blocks ADD COLUMN chapter_name TEXT NULL')
  safeAlter('ALTER TABLE session_blocks ADD COLUMN confidence_score INTEGER NULL')
  safeAlter('ALTER TABLE metacognition_logs ADD COLUMN free_time_hours REAL NULL')
  safeAlter('ALTER TABLE metacognition_logs ADD COLUMN priority_subject_ids TEXT NULL')
}

function applyBingoSchema(db: Database.Database) {
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
    CREATE TABLE IF NOT EXISTS bingo_quotes(id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL);
  `)
}

// Convert Tauri-style $1,$2 params to better-sqlite3 positional ?
function normalizeSql(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?')
}

// ── IPC: database ─────────────────────────────────────────────────────────────

ipcMain.handle('db:execute', (_e, dbName: 'main' | 'bingo', sql: string, params: unknown[] = []) => {
  const db = dbName === 'main' ? mainDb : bingoDb
  const result = db.prepare(normalizeSql(sql)).run(params)
  return { lastInsertRowid: result.lastInsertRowid, changes: result.changes }
})

ipcMain.handle('db:select', (_e, dbName: 'main' | 'bingo', sql: string, params: unknown[] = []) => {
  const db = dbName === 'main' ? mainDb : bingoDb
  return db.prepare(normalizeSql(sql)).all(params)
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

ipcMain.handle('shell:openExternal', (_e, url: string) => {
  shell.openExternal(url)
})

// ── IPC: autostart ────────────────────────────────────────────────────────────

ipcMain.handle('autostart:isEnabled', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('autostart:setEnabled', (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false })
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
    },
    backgroundColor: '#1a1625',
    icon: iconPath,
    show: false,
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.velsedav.study-buddy')
  initDatabases()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
