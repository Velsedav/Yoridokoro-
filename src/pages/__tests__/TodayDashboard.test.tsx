// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({tasks:[{id:'open',title:'Tâche à faire',quadrant:'do',done:0,created_at:'',updated_at:''},{id:'old',title:'Ancienne tâche terminée',quadrant:'do',done:1,created_at:'',updated_at:''}]}))
vi.mock('../../lib/db',()=>({getSubjects:async()=>[],getSessions:async()=>[],getSessionEvidence:async()=>[]}))
vi.mock('../../lib/settings',()=>({useSettings:()=>({language:'fr'})}))
vi.mock('../../lib/relations',()=>({getPeople:async()=>[],daysSinceContact:()=>null}))
vi.mock('../../lib/chapters',()=>({getAllChapters:()=>[]}))
vi.mock('../../lib/plannerAllocation',()=>({usePlannerAllocation:()=>({})}))
vi.mock('../../lib/behaviorAnalytics',()=>({recordBehaviorEvent:vi.fn(),ANALYTICS_POLICY_ID:'test',ANALYTICS_POLICY_VERSION:1}))
vi.mock('../../components/CulturalBanner',()=>({default:()=>null}))
vi.mock('../../components/TimeDistributionPanel',()=>({default:()=>null}))
vi.mock('../../lib/eisenhower',()=>({EISENHOWER_QUADRANTS:['do','schedule','delegate','eliminate'],getEisenhowerTasks:async()=>fixture.tasks.map(t=>({...t})),setEisenhowerTaskDone:vi.fn(async()=>{}),createEisenhowerTask:vi.fn(),moveEisenhowerTask:vi.fn(),deleteEisenhowerTask:vi.fn(async()=>{})}))
import TodayDashboard from '../TodayDashboard'
import { setEisenhowerTaskDone } from '../../lib/eisenhower'
let root:Root,host:HTMLDivElement
const check=()=>host.querySelector<HTMLButtonElement>('.yd-task-check')!
beforeEach(async()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.clearAllMocks();document.documentElement.dataset.theme='yoridokoro-rework';host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<MemoryRouter><TodayDashboard/></MemoryRouter>))})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete document.documentElement.dataset.theme;vi.useRealTimers()})
it('hides previously completed tasks and keeps a new completion for exactly ten seconds',async()=>{
 expect(host.textContent).not.toContain('Ancienne tâche terminée')
 await act(async()=>check().click())
 expect(setEisenhowerTaskDone).toHaveBeenCalledWith('open',true)
 expect(check().getAttribute('aria-pressed')).toBe('true')
 await act(async()=>vi.advanceTimersByTime(9999))
 expect(host.textContent).toContain('Tâche à faire')
 await act(async()=>vi.advanceTimersByTime(1))
 expect(host.textContent).not.toContain('Tâche à faire')
})
it('allows undo during the grace period and starts a fresh delay on recompletion',async()=>{
 await act(async()=>check().click())
 await act(async()=>vi.advanceTimersByTime(8000))
 await act(async()=>check().click())
 expect(setEisenhowerTaskDone).toHaveBeenLastCalledWith('open',false)
 await act(async()=>vi.advanceTimersByTime(10000))
 expect(check().getAttribute('aria-pressed')).toBe('false')
 await act(async()=>check().click())
 await act(async()=>vi.advanceTimersByTime(9999))
 expect(host.textContent).toContain('Tâche à faire')
 await act(async()=>vi.advanceTimersByTime(1))
 expect(host.textContent).not.toContain('Tâche à faire')
})
it('cleans up completion timers when leaving the page',async()=>{
 await act(async()=>check().click())
 await act(async()=>root.unmount())
 expect(vi.getTimerCount()).toBe(0)
 root=createRoot(host)
})
