import { createBackupObject, importBackupFromJsonString } from './export'
import { flushWebSqliteToIndexedDb } from './webSqliteBridge'

const GDRIVE_CONFIG_KEY = 'yoridokoro-gdrive-sync-config-v1'
const BACKUP_FILE_NAME = 'yoridokoro-backup.json'

export interface GoogleDriveSyncConfig {
  /** Mode 1: Google Apps Script Web App URL (permanent, zero token expiry, stores directly in Google Drive) */
  appsScriptUrl: string
  /** Optional secret key for the Apps Script bridge */
  syncSecret: string
  /** Mode 2: Direct Google Drive OAuth2 Access Token */
  accessToken: string
  /** Cached Google Drive File ID */
  driveFileId: string
  /** Auto-check on startup */
  autoCheckOnStartup: boolean
  /** Last synced ISO timestamp */
  lastSyncedAt: string | null
  /** Last remote backup exported_at timestamp */
  lastRemoteExportedAt: string | null
}

const DEFAULT_CONFIG: GoogleDriveSyncConfig = {
  appsScriptUrl: '',
  syncSecret: '',
  accessToken: '',
  driveFileId: '',
  autoCheckOnStartup: true,
  lastSyncedAt: null,
  lastRemoteExportedAt: null,
}

export function getGoogleDriveSyncConfig(): GoogleDriveSyncConfig {
  try {
    const raw = localStorage.getItem(GDRIVE_CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG }
}

export const loadGoogleDriveSyncConfig = getGoogleDriveSyncConfig

export function saveGoogleDriveSyncConfig(patch: Partial<GoogleDriveSyncConfig>): GoogleDriveSyncConfig {
  const next = { ...getGoogleDriveSyncConfig(), ...patch }
  try {
    localStorage.setItem(GDRIVE_CONFIG_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('yoridokoro-gdrive-config-changed'))
  } catch {
    // ignore
  }
  return next
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// 1. Ouvrez https://script.google.com -> "Nouveau projet"
// 2. Collez ce code, puis cliquez sur "Déployer" -> "Nouveau déploiement"
// 3. Choisissez "Application Web", Exécuter en tant que : "Moi", Accès : "Tout le monde"
// 4. Copiez l'URL de l'application Web dans Yoridokoro (PC et S23 Ultra) !

const FILE_NAME = 'yoridokoro-backup.json';

function getOrCreateFile() {
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (files.hasNext()) return files.next();
  return DriveApp.createFile(FILE_NAME, '{}', MimeType.PLAIN_TEXT);
}

function doGet(e) {
  const file = getOrCreateFile();
  const content = file.getBlob().getDataAsString();
  return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = e.postData ? e.postData.contents : '';
  if (!body) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Empty body' })).setMimeType(ContentService.MimeType.JSON);
  const file = getOrCreateFile();
  file.setContent(body);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, updatedAt: new Date().toISOString() })).setMimeType(ContentService.MimeType.JSON);
}`

export interface RemoteBackupMeta {
  exists: boolean
  exportedAt: string | null
  rawJson?: string
}

async function findDriveFileIdByToken(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Erreur Google Drive API (${res.status}) : vérifiez votre jeton d'accès.`)
  }
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

/** Push current local database & settings to Google Drive */
export async function pushBackupToGoogleDrive(): Promise<{ exportedAt: string; method: 'apps-script' | 'oauth' }> {
  const config = getGoogleDriveSyncConfig()
  const backup = await createBackupObject()
  const json = JSON.stringify(backup)

  if (config.appsScriptUrl.trim()) {
    const url = config.appsScriptUrl.trim()
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: json,
    })
    if (!res.ok) {
      throw new Error(`Échec de l'envoi vers Google Drive (${res.status}).`)
    }
    const now = new Date().toISOString()
    saveGoogleDriveSyncConfig({
      lastSyncedAt: now,
      lastRemoteExportedAt: backup.exported_at,
    })
    return { exportedAt: backup.exported_at, method: 'apps-script' }
  }

  if (config.accessToken.trim()) {
    const token = config.accessToken.trim()
    let fileId = config.driveFileId.trim() || (await findDriveFileIdByToken(token)) || ''

    if (fileId) {
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json;charset=utf-8',
        },
        body: json,
      })
      if (!res.ok) throw new Error(`Échec mise à jour Google Drive (${res.status}).`)
    } else {
      const metadata = { name: BACKUP_FILE_NAME, mimeType: 'application/json' }
      const boundary = 'yoridokoro_gdrive_boundary'
      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      })
      if (!res.ok) throw new Error(`Échec création du fichier Google Drive (${res.status}).`)
      const created = await res.json()
      fileId = created.id || ''
    }

    const now = new Date().toISOString()
    saveGoogleDriveSyncConfig({
      driveFileId: fileId,
      lastSyncedAt: now,
      lastRemoteExportedAt: backup.exported_at,
    })
    return { exportedAt: backup.exported_at, method: 'oauth' }
  }

  throw new Error('Configurez d’abord votre lien Google Drive (Apps Script ou Token) dans Paramètres → Synchronisation Google Drive.')
}

/** Pull and merge backup from Google Drive into local database */
export async function pullBackupFromGoogleDrive(): Promise<{ exportedAt: string | null }> {
  const config = getGoogleDriveSyncConfig()
  let rawJson = ''

  if (config.appsScriptUrl.trim()) {
    const res = await fetch(config.appsScriptUrl.trim(), { method: 'GET' })
    if (!res.ok) {
      throw new Error(`Échec de lecture depuis Google Drive (${res.status}).`)
    }
    rawJson = await res.text()
  } else if (config.accessToken.trim()) {
    const token = config.accessToken.trim()
    const fileId = config.driveFileId.trim() || (await findDriveFileIdByToken(token))
    if (!fileId) {
      throw new Error(`Aucun fichier "${BACKUP_FILE_NAME}" trouvé sur votre Google Drive.`)
    }
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Échec du téléchargement Google Drive (${res.status}).`)
    }
    rawJson = await res.text()
  } else {
    throw new Error('Configurez d’abord votre lien Google Drive dans Paramètres → Synchronisation Google Drive.')
  }

  if (!rawJson || rawJson.trim() === '{}') {
    throw new Error('Le fichier sur Google Drive est encore vide. Envoyez d’abord votre sauvegarde depuis votre PC.')
  }

  const parsed = JSON.parse(rawJson)
  await importBackupFromJsonString(rawJson)
  await flushWebSqliteToIndexedDb()

  const now = new Date().toISOString()
  saveGoogleDriveSyncConfig({
    lastSyncedAt: now,
    lastRemoteExportedAt: parsed.exported_at || now,
  })
  return { exportedAt: parsed.exported_at || null }
}

/** Share or save backup file directly on Android (opens Google Drive / Files sheet on S23 Ultra) */
export async function shareOrDownloadBackupForDrive(): Promise<void> {
  const backup = await createBackupObject()
  const json = JSON.stringify(backup, null, 2)
  const file = new File([json], BACKUP_FILE_NAME, { type: 'application/json' })

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: 'Sauvegarde Yoridokoro',
      text: `Sauvegarde Yoridokoro (${new Date().toLocaleDateString('fr-FR')})`,
      files: [file],
    })
    return
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = BACKUP_FILE_NAME
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Pick a yoridokoro-backup.json directly from Android file picker (including Google Drive) */
export async function pickAndImportBackupFromDevice(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = async () => {
      const file = input.files?.[0]
      if (input.parentNode) input.parentNode.removeChild(input)
      if (!file) {
        resolve(false)
        return
      }
      try {
        const text = await file.text()
        await importBackupFromJsonString(text)
        await flushWebSqliteToIndexedDb()
        saveGoogleDriveSyncConfig({ lastSyncedAt: new Date().toISOString() })
        resolve(true)
      } catch (err) {
        reject(err)
      }
    }
    input.oncancel = () => {
      if (input.parentNode) input.parentNode.removeChild(input)
      resolve(false)
    }
    input.click()
  })
}
