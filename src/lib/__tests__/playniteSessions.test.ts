import { describe, expect, it } from 'vitest'
import { parsePlayniteGameActivity } from '../playniteSessions'

describe('parsePlayniteGameActivity', () => {
  it('normalizes dated GameActivity sessions and builds stable source references', () => {
    const sessions = parsePlayniteGameActivity(JSON.stringify({
      Id: 'game-42',
      Name: 'Slay the Spire 2',
      Items: [
        { DateSession: '2026-08-07T05:00:06.2941301Z', ElapsedSeconds: 453 },
        { DateSession: '2026-08-06T12:00:00Z', ElapsedSeconds: 120 },
      ],
    }), 'file-id')

    expect(sessions).toEqual([
      {
        gameId: 'game-42', gameName: 'Slay the Spire 2',
        startedAt: '2026-08-07T05:00:06.294Z', endedAt: '2026-08-07T05:07:39.294Z',
        durationSeconds: 453, sourceRef: 'playnite-gameactivity:game-42:2026-08-07T05:00:06.294Z',
      },
      {
        gameId: 'game-42', gameName: 'Slay the Spire 2',
        startedAt: '2026-08-06T12:00:00.000Z', endedAt: '2026-08-06T12:02:00.000Z',
        durationSeconds: 120, sourceRef: 'playnite-gameactivity:game-42:2026-08-06T12:00:00.000Z',
      },
    ])
  })

  it('ignores zero, invalid and duplicate sessions', () => {
    const sessions = parsePlayniteGameActivity(JSON.stringify({
      Name: 'Game',
      Items: [
        { DateSession: '2026-08-07T10:00:00Z', ElapsedSeconds: 60 },
        { DateSession: '2026-08-07T10:00:00Z', ElapsedSeconds: 60 },
        { DateSession: 'invalid', ElapsedSeconds: 60 },
        { DateSession: '2026-08-07T11:00:00Z', ElapsedSeconds: 0 },
      ],
    }), 'file-game')

    expect(sessions).toHaveLength(1)
    expect(sessions[0].gameId).toBe('file-game')
  })
})
