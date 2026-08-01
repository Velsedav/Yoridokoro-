import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    execute: (dbName: 'main' | 'bingo', sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:execute', dbName, sql, params ?? []),
    select: <T>(dbName: 'main' | 'bingo', sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:select', dbName, sql, params ?? []) as Promise<T[]>,
    transaction: (dbName: 'main' | 'bingo', statements: Array<{ sql: string; params?: unknown[] }>) =>
      ipcRenderer.invoke('db:transaction', dbName, statements),
  },

  fs: {
    getUserDataPath: (): Promise<string> =>
      ipcRenderer.invoke('fs:getUserDataPath'),
    readTextFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:readTextFile', filePath),
    writeTextFile: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeTextFile', filePath, content),
    writeTextFileAtomic: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeTextFileAtomic', filePath, content),
    readFile: (filePath: string): Promise<Uint8Array> =>
      ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, data: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('fs:writeFile', filePath, data),
    exists: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:mkdir', dirPath),
  },

  dialog: {
    openFile: (options?: object): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openFile', options),
    openDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (options?: object): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFile', options),
  },

  shell: {
    openPath: (filePath: string): Promise<void> =>
      ipcRenderer.invoke('shell:openPath', filePath),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },

  images: {
    fetchDataUrl: (url: string): Promise<string> =>
      ipcRenderer.invoke('image:fetchDataUrl', url),
  },

  catalogue: {
    fetchJson: <T>(url: string): Promise<{ ok: boolean; status: number; data: T }> =>
      ipcRenderer.invoke('catalogue:fetchJson', url),
  },

  autostart: {
    isEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke('autostart:isEnabled'),
    setEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('autostart:setEnabled', enabled),
  },

  lifecycle: {
    onBeforeClose: (callback: () => void): (() => void) => {
      const listener = () => callback()
      ipcRenderer.on('app:before-close', listener)
      return () => ipcRenderer.removeListener('app:before-close', listener)
    },
    readyToClose: (): void => ipcRenderer.send('app:ready-to-close'),
    forceClose: (): void => ipcRenderer.send('app:force-close'),
  },

  windowControls: {
    toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggleFullscreen'),
  },

  platform: process.platform,
})
