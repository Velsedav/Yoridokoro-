// Universal WebAssembly SQLite + File/Dialog/Shell bridge for Android (Capacitor) & Web
// Automatically activates when window.electronAPI is not provided by Electron preload.

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

const IDB_NAME = 'yoridokoro-mobile-sqlite-v1'
const IDB_STORE_DB = 'databases'
const IDB_STORE_FS = 'files'

function normalizeSqlStatement(sql: string, params: unknown[] = []) {
  if (!/\$\d+/.test(sql)) return { sql, params }
  const orderedParams: unknown[] = []
  const normalizedSql = sql.replace(/\$(\d+)/g, (_placeholder, rawIndex: string) => {
    const index = Number(rawIndex) - 1
    orderedParams.push(params[index] === undefined ? null : params[index])
    return '?'
  })
  return { sql: normalizedSql, params: orderedParams }
}

const MAIN_SCHEMA_SQL = `
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
    PRIMARY KEY(subject_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS subgoals(
    id TEXT PRIMARY KEY, subject_id TEXT, text TEXT, done INT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions(
    id TEXT PRIMARY KEY, started_at TEXT, ended_at TEXT NULL,
    template TEXT, repeats INT, planned_minutes INT, actual_minutes INT,
    actual_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed', evaluated_at TEXT NULL
  );
  CREATE TABLE IF NOT EXISTS session_blocks(
    id TEXT PRIMARY KEY, session_id TEXT, idx INT, type TEXT, minutes INT,
    actual_seconds INTEGER NOT NULL DEFAULT 0,
    subject_id TEXT NULL, technique_id TEXT NULL, started_at TEXT NULL, ended_at TEXT NULL,
    chapter_id TEXT NULL, chapter_name TEXT NULL, confidence_score INTEGER NULL
  );
  CREATE TABLE IF NOT EXISTS session_effects(
    session_id TEXT NOT NULL, effect_type TEXT NOT NULL, target_id TEXT NOT NULL,
    applied_at TEXT NULL, applied INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(session_id, effect_type, target_id)
  );
  CREATE TABLE IF NOT EXISTS session_evidence(
    session_id TEXT PRIMARY KEY,
    subject_id TEXT NULL, chapter_id TEXT NULL, chapter_name TEXT NULL,
    created_at TEXT NOT NULL,
    did_text TEXT NULL, action_text TEXT NULL, result_text TEXT NULL,
    meaning_text TEXT NULL, resume_point TEXT NULL
  );
  CREATE TABLE IF NOT EXISTS session_context(
    session_id TEXT PRIMARY KEY,
    surface TEXT NULL,
    entry_source TEXT NOT NULL,
    app_version TEXT NOT NULL,
    feature_version TEXT NOT NULL,
    recommendation_kind TEXT NULL,
    recommendation_reason TEXT NULL,
    chapter_position INTEGER NULL,
    chapter_count INTEGER NULL,
    study_count_before INTEGER NULL,
    resume_point_present INTEGER NOT NULL DEFAULT 0,
    return_support_tag TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
    channel TEXT NOT NULL DEFAULT 'other', direction TEXT NULL, summary TEXT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS person_notes(
    id TEXT PRIMARY KEY, person_id TEXT NOT NULL, text TEXT NOT NULL, category TEXT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'general',
    color TEXT NULL, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_links(
    activity_id TEXT NOT NULL, domain TEXT NOT NULL, entity_id TEXT NOT NULL,
    PRIMARY KEY(activity_id, domain, entity_id)
  );
  CREATE TABLE IF NOT EXISTS activity_resources(
    id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_entries(
    id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL, note TEXT NULL, source TEXT NOT NULL DEFAULT 'timer', source_ref TEXT NULL,
    source_detail_ref TEXT NULL, source_detail_label TEXT NULL, exercise_tag INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_entry_deletions(
    source_ref TEXT PRIMARY KEY, deleted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_events(
    id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
    event_kind TEXT NOT NULL, delta_value REAL NULL, value_after REAL NULL,
    unit TEXT NULL, note TEXT NULL, source TEXT NOT NULL, source_ref TEXT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS eisenhower_tasks(
    id TEXT PRIMARY KEY, title TEXT NOT NULL,
    quadrant TEXT NOT NULL DEFAULT 'schedule', done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
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
  CREATE TABLE IF NOT EXISTS cultural_events(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'cultural',
    country TEXT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NULL,
    recurrence_type TEXT NOT NULL DEFAULT 'specific',
    show_before_days INTEGER NOT NULL DEFAULT 14,
    show_after_days INTEGER NOT NULL DEFAULT 3,
    image_data TEXT NULL,
    image_position_x REAL NOT NULL DEFAULT 50,
    image_position_y REAL NOT NULL DEFAULT 50,
    image_zoom REAL NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    retired_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS study_data_snapshots(
    kind TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS career_cvs(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_header TEXT NULL,
    idx INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS career_companies(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location_url TEXT NULL,
    email TEXT NULL,
    phone TEXT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS career_applications(
    id TEXT PRIMARY KEY,
    job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    applied_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'en_cours',
    contract_type TEXT NOT NULL DEFAULT 'CDI',
    application_type TEXT NOT NULL DEFAULT 'Offre',
    location TEXT NULL,
    offer_url TEXT NULL,
    contact_email TEXT NULL,
    contact_phone TEXT NULL,
    follow_up_date TEXT NULL,
    cv_id TEXT NULL,
    cv_name TEXT NULL,
    offer_content TEXT NULL,
    cv_header TEXT NULL,
    cover_letter TEXT NULL,
    questions_notes TEXT NULL,
    research_notes TEXT NULL,
    advantages_notes TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS career_rome_searches(
    id TEXT PRIMARY KEY,
    sector_group TEXT NOT NULL DEFAULT 'Autres secteurs',
    job_title TEXT NOT NULL,
    rome_code TEXT NOT NULL,
    lm_label TEXT NULL,
    lm_url TEXT NULL,
    lm_last_used_at TEXT NULL,
    cv_id TEXT NULL,
    cv_label TEXT NULL,
    cv_url TEXT NULL,
    cv_last_used_at TEXT NULL,
    cities_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT NULL,
    idx INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`

const BINGO_SCHEMA_SQL = `
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
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_sessions(
    id TEXT PRIMARY KEY, subobjective_id TEXT NOT NULL,
    started_at INTEGER NOT NULL, ended_at INTEGER NULL, duration_ms INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS media_items(
    id TEXT PRIMARY KEY, subobjective_id TEXT NOT NULL,
    kind TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
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
    delta_value REAL NULL, value_after REAL NULL, unit TEXT NULL, label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bingo_quotes(id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL);
`

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE_DB)) {
        db.createObjectStore(IDB_STORE_DB)
      }
      if (!db.objectStoreNames.contains(IDB_STORE_FS)) {
        db.createObjectStore(IDB_STORE_FS)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(storeName: string, key: string, value: unknown): Promise<void> {
  const idb = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let mainSqlDb: SqlJsDatabase | null = null
let bingoSqlDb: SqlJsDatabase | null = null
let initPromise: Promise<void> | null = null
let saveTimer: number | null = null

export async function flushWebSqliteToIndexedDb(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  if (mainSqlDb) {
    await idbSet(IDB_STORE_DB, 'main', mainSqlDb.export())
  }
  if (bingoSqlDb) {
    await idbSet(IDB_STORE_DB, 'bingo', bingoSqlDb.export())
  }
}

function scheduleSave() {
  if (saveTimer !== null) return
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void flushWebSqliteToIndexedDb()
  }, 120)
}

async function ensureSqlInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs({
        locateFile: () => './sql-wasm.wasm',
      })
      const [savedMain, savedBingo] = await Promise.all([
        idbGet<Uint8Array>(IDB_STORE_DB, 'main'),
        idbGet<Uint8Array>(IDB_STORE_DB, 'bingo'),
      ])
      mainSqlDb = savedMain ? new SQL.Database(savedMain) : new SQL.Database()
      mainSqlDb.run(MAIN_SCHEMA_SQL)

      bingoSqlDb = savedBingo ? new SQL.Database(savedBingo) : new SQL.Database()
      bingoSqlDb.run(BINGO_SCHEMA_SQL)

      await flushWebSqliteToIndexedDb()

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          void flushWebSqliteToIndexedDb()
        }
      })
      window.addEventListener('pagehide', () => {
        void flushWebSqliteToIndexedDb()
      })
    })()
  }
  return initPromise
}

function getTargetDb(target: 'main' | 'bingo'): SqlJsDatabase {
  const db = target === 'bingo' ? bingoSqlDb : mainSqlDb
  if (!db) throw new Error('SQLite WebAssembly database not initialized')
  return db
}

function sanitizeParams(params: unknown[]): any[] {
  return params.map(v => {
    if (v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    return v
  })
}

async function pickFileFromDevice(accept = '.json,application/json'): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const finish = (val: string | null) => {
      if (settled) return
      settled = true
      if (input.parentNode) input.parentNode.removeChild(input)
      resolve(val)
    }
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      const text = await file.text()
      const virtualPath = `/mobile-picker/${file.name}`
      await idbSet(IDB_STORE_FS, virtualPath, text)
      finish(virtualPath)
    }
    input.oncancel = () => finish(null)
    input.click()
  })
}

function triggerMobileDownload(filename: string, textContent: string) {
  const mime = filename.endsWith('.html') ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8'
  const blob = new Blob([textContent], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function ensureMobileElectronShim(): Promise<void> {
  if (typeof window === 'undefined') return
  if ((window as any).electronAPI?.db) return

  await ensureSqlInitialized()

  ;(window as any).electronAPI = {
    isMobileOrWeb: true,
    db: {
      execute: async (target: 'main' | 'bingo', rawSql: string, rawParams: unknown[] = []) => {
        await ensureSqlInitialized()
        const db = getTargetDb(target)
        const { sql, params } = normalizeSqlStatement(rawSql, rawParams)
        const cleanParams = sanitizeParams(params)
        db.run(sql, cleanParams)
        const changes = db.getRowsModified()
        scheduleSave()
        return { lastInsertRowid: 0, changes }
      },
      select: async <T = any>(target: 'main' | 'bingo', rawSql: string, rawParams: unknown[] = []): Promise<T> => {
        await ensureSqlInitialized()
        const db = getTargetDb(target)
        const { sql, params } = normalizeSqlStatement(rawSql, rawParams)
        const cleanParams = sanitizeParams(params)
        const stmt = db.prepare(sql)
        stmt.bind(cleanParams)
        const rows: Record<string, unknown>[] = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows as unknown as T
      },
    },
    fs: {
      getUserDataPath: async () => '/yoridokoro-mobile-data',
      mkdir: async () => {},
      exists: async (filePath: string) => {
        const val = await idbGet(IDB_STORE_FS, filePath)
        return val !== undefined
      },
      readFile: async (filePath: string) => {
        const val = await idbGet<Uint8Array>(IDB_STORE_FS, filePath)
        if (!val) throw new Error(`File not found: ${filePath}`)
        return val
      },
      writeFile: async (filePath: string, data: Uint8Array) => {
        await idbSet(IDB_STORE_FS, filePath, data)
      },
      readTextFile: async (filePath: string) => {
        const val = await idbGet<string>(IDB_STORE_FS, filePath)
        if (typeof val !== 'string') throw new Error(`Text file not found: ${filePath}`)
        return val
      },
      writeTextFile: async (filePath: string, content: string) => {
        await idbSet(IDB_STORE_FS, filePath, content)
        if (filePath.startsWith('/mobile-download/')) {
          triggerMobileDownload(filePath.replace('/mobile-download/', ''), content)
        }
      },
      writeTextFileAtomic: async (filePath: string, content: string) => {
        await idbSet(IDB_STORE_FS, filePath, content)
        if (filePath.startsWith('/mobile-download/')) {
          triggerMobileDownload(filePath.replace('/mobile-download/', ''), content)
        }
      },
    },
    dialog: {
      open: async (options?: { directory?: boolean; filters?: Array<{ extensions?: string[] }> }) => {
        if (options?.directory) {
          return '/mobile-download'
        }
        const exts = options?.filters?.flatMap(f => f.extensions ?? []).map(e => `.${e}`).join(',') || '.json,application/json'
        return pickFileFromDevice(exts)
      },
      save: async (options?: { defaultPath?: string }) => {
        const name = options?.defaultPath?.split(/[/\\]/).pop() || 'yoridokoro-backup.json'
        return `/mobile-download/${name}`
      },
    },
    shell: {
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    },
    windowControls: {
      minimize: async () => {},
      maximize: async () => {},
      close: async () => {},
      toggleFullscreen: async () => {},
    },
    lifecycle: {
      onBeforeClose: () => {},
      readyToClose: () => {},
      forceClose: () => {},
    },
  }
}
