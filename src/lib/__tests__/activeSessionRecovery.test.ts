// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('../db', () => ({ getStudyDataSnapshots: mocks.read, saveStudyDataSnapshots: mocks.save }))
const session = { sessionId: 'recover-me', startedAt: '2026-10-07T12:00:00Z', nowBlockIdx: 0,
  remainingSeconds: 223, paused: false, draft: [{ id: 'work', type: 'WORK', minutes: 5, subject_id: 'subject', chapter_id: 'chapter' }],
  elapsedSecondsByBlock: { work: 77 }, progressPersisted: true, postSession: { step: 'evidence', resumePoint: 'Next question' } }
let api: typeof import('../activeSessionRecovery')

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear()
  mocks.read.mockReset().mockResolvedValue([]); mocks.save.mockReset().mockResolvedValue(undefined)
  api = await import('../activeSessionRecovery')
})
afterEach(async () => { await api.flushActiveSessionRecovery().catch(() => {}); vi.useRealTimers(); vi.restoreAllMocks() })

it('recovers the timer and post-session step from SQLite when both local copies are lost', async () => {
  mocks.read.mockResolvedValue([{ kind: 'active-session', version: 1, payload_json: JSON.stringify({ savedAt: Date.now(), session }) }])
  expect(await api.recoverActiveSession()).toBe('recovered')
  expect(JSON.parse(localStorage.getItem('activeSession')!)).toMatchObject({ ...session, paused: true })
})

it('uses the local recovery copy when the primary JSON is corrupt', async () => {
  api.persistActiveSession(JSON.stringify(session)); await api.flushActiveSessionRecovery()
  localStorage.setItem('activeSession', '{broken')
  expect(await api.recoverActiveSession()).toBe('recovered')
  expect(localStorage.getItem('study-buddy-invalid-active-session')).toBe('{broken')
})

it('does not resurrect a closed session from an older durable copy', async () => {
  mocks.read.mockResolvedValue([{ kind: 'active-session', version: 1, payload_json: JSON.stringify({ savedAt: Date.now() - 1000, session }) }])
  api.clearActiveSession(); await api.flushActiveSessionRecovery()
  expect(await api.recoverActiveSession()).toBe('none')
  expect(localStorage.getItem('activeSession')).toBeNull()
})

it('can still recover the local copy if SQLite is temporarily unavailable', async () => {
  api.persistActiveSession(JSON.stringify(session)); await api.flushActiveSessionRecovery()
  localStorage.removeItem('activeSession')
  mocks.read.mockRejectedValueOnce(new Error('Database unavailable'))
  expect(await api.recoverActiveSession()).toBe('recovered')
  expect(JSON.parse(localStorage.getItem('activeSession')!).remainingSeconds).toBe(223)
})

it('keeps the latest local timer on restart and pauses without counting time away', async () => {
  localStorage.setItem('activeSession', JSON.stringify(session))
  expect(await api.recoverActiveSession()).toBe('kept')
  expect(JSON.parse(localStorage.getItem('activeSession')!)).toMatchObject({ remainingSeconds: 223, paused: true })
})

it('coalesces timer ticks and persists a block change immediately', async () => {
  api.persistActiveSession(JSON.stringify({ ...session, progressPersisted: false }))
  await api.flushActiveSessionRecovery(); mocks.save.mockClear()
  for (const remainingSeconds of [222, 221, 220]) api.persistActiveSession(JSON.stringify({ ...session, progressPersisted: false, remainingSeconds }))
  expect(mocks.save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(5000)
  expect(mocks.save).toHaveBeenCalledTimes(1)
  expect(JSON.parse(mocks.save.mock.calls[0][0][0].payload_json).session.remainingSeconds).toBe(220)
})

it('retries a failed durable write and keeps the closure after older write failures', async () => {
  mocks.save.mockRejectedValueOnce(new Error('Disk busy'))
  api.persistActiveSession(JSON.stringify(session))
  api.clearActiveSession()
  await api.flushActiveSessionRecovery()
  expect(JSON.parse(mocks.save.mock.calls.at(-1)![0][0].payload_json).session).toBeNull()
  expect(await api.recoverActiveSession()).toBe('none')
})

it('rejects malformed drafts without replacing the current session', () => {
  localStorage.setItem('activeSession', JSON.stringify(session))
  expect(() => api.persistActiveSession(JSON.stringify({ ...session, draft: [{ id: 'bad', type: 'WORK', minutes: -5 }] }))).toThrow()
  expect(JSON.parse(localStorage.getItem('activeSession')!)).toEqual(session)
})
