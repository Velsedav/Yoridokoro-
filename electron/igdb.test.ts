import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetIgdbTokenCacheForTests, searchIgdbGames, testIgdbCredentials } from './igdb'

const credentials = { clientId: 'local-client', clientSecret: 'local-secret' }

describe('IGDB Electron client', () => {
  beforeEach(() => resetIgdbTokenCacheForTests())

  it('authenticates with Twitch then searches only the fields Yoridokoro needs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, name: 'Outer Wilds' }]), { status: 200 }))

    await expect(searchIgdbGames(credentials, 'Outer "Wilds"', fetcher)).resolves.toEqual([{ id: 1, name: 'Outer Wilds' }])
    expect(fetcher.mock.calls[0][0]).toBe('https://id.twitch.tv/oauth2/token')
    expect(String(fetcher.mock.calls[0][1].body)).toContain('client_secret=local-secret')
    expect(fetcher.mock.calls[1][0]).toBe('https://api.igdb.com/v4/games')
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({ 'Client-ID': 'local-client', Authorization: 'Bearer token' })
    expect(fetcher.mock.calls[1][1].body).toContain('search "Outer \\"Wilds\\""')
    expect(fetcher.mock.calls[1][1].body).not.toContain('fields *')
  })

  it('reports invalid credentials clearly', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'invalid client' }), { status: 400 }))
    await expect(testIgdbCredentials(credentials, fetcher)).rejects.toThrow('Client ID or Client Secret')
  })
})
