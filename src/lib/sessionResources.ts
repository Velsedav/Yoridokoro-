export type SessionResource = { id: string; label: string; url: string; enabled: boolean }

const STORAGE_KEY = 'yoridokoro-session-resources-v1'

export function loadSessionResources(): SessionResource[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.url === 'string') : []
  } catch {
    return []
  }
}

export function saveSessionResources(resources: SessionResource[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resources))
}

export function normalizeWebUrl(value: string): string | null {
  const candidate = value.trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function openEnabledSessionResources() {
  const shell = (window as any).electronAPI?.shell
  if (!shell?.openExternal) return
  const urls = [...new Set(loadSessionResources().filter(resource => resource.enabled).map(resource => normalizeWebUrl(resource.url)).filter((url): url is string => Boolean(url)))]
  for (const url of urls) await shell.openExternal(url)
}
