export interface IgdbCredentials {
  clientId: string
  clientSecret: string
}

export interface IgdbGameResult {
  id: number
  name: string
  first_release_date?: number
  cover?: { url?: string }
  genres?: Array<{ name?: string }>
  involved_companies?: Array<{ developer?: boolean; company?: { name?: string } }>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

let cachedToken: { key: string; value: string; expiresAt: number } | undefined

const credentialKey = ({ clientId, clientSecret }: IgdbCredentials) => `${clientId}\u0000${clientSecret}`

async function getAccessToken(credentials: IgdbCredentials, fetcher: FetchLike, forceRefresh = false) {
  const key = credentialKey(credentials)
  if (!forceRefresh && cachedToken?.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'client_credentials',
  })
  const response = await fetcher('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })
  const data = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; message?: string } | null
  if (!response.ok || !data?.access_token) {
    throw new Error(response.status === 400 || response.status === 401
      ? 'IGDB rejected the Client ID or Client Secret.'
      : 'IGDB authentication is temporarily unavailable.')
  }
  cachedToken = {
    key,
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

async function igdbRequest(credentials: IgdbCredentials, body: string, fetcher: FetchLike, forceRefresh = false) {
  const token = await getAccessToken(credentials, fetcher, forceRefresh)
  const response = await fetcher('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'text/plain',
      'Client-ID': credentials.clientId,
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  if (response.status === 401 && !forceRefresh) {
    cachedToken = undefined
    return igdbRequest(credentials, body, fetcher, true)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? 'IGDB rejected the configured credentials.'
    : 'IGDB did not respond.')
  return data
}

function escapedSearch(value: string) {
  return value.replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim()
}

export async function testIgdbCredentials(credentials: IgdbCredentials, fetcher: FetchLike = fetch) {
  await igdbRequest(credentials, 'fields id; limit 1;', fetcher)
}

export async function searchIgdbGames(credentials: IgdbCredentials, query: string, fetcher: FetchLike = fetch): Promise<IgdbGameResult[]> {
  const search = escapedSearch(query)
  if (!search) return []
  const body = `search "${search}"; fields name,first_release_date,cover.url,genres.name,involved_companies.developer,involved_companies.company.name; where version_parent = null; limit 12;`
  const data = await igdbRequest(credentials, body, fetcher)
  return Array.isArray(data) ? data as IgdbGameResult[] : []
}

export function resetIgdbTokenCacheForTests() {
  cachedToken = undefined
}
