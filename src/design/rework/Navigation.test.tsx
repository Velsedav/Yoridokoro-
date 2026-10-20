// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { BookOpen, Home } from 'lucide-react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Navigation } from './Navigation'
import { useRework } from './useRework'
let root:Root, host:HTMLDivElement
beforeEach(() => { Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 0});host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async()=>{await act(async()=>root.unmount());host.remove();delete document.documentElement.dataset.theme;vi.unstubAllGlobals()})
it('finds a destination by keyboard and preserves the navigation guard callback',async()=>{
 const navigate=vi.fn((event)=>event.preventDefault())
 await act(async()=>root.render(<MemoryRouter><Navigation french items={[{path:'/',label:'Aujourd’hui',icon:Home},{path:'/study',label:'Sujets',icon:BookOpen}]} onNavigate={navigate} onDev={()=>{}} /></MemoryRouter>))
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})))
 const input=host.querySelector('input')!
 expect(document.activeElement).toBe(input)
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'suj');input.dispatchEvent(new Event('input',{bubbles:true}))})
 expect(host.querySelectorAll('.rw-command-results a')).toHaveLength(1)
 await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
 expect(navigate).toHaveBeenCalledWith(expect.anything(),'/study')
 expect(host.querySelector('[role="dialog"]')).toBeNull()
})
it('updates structural components during live theme preview and restores them',async()=>{
 function Probe(){return <span>{useRework()?'rework':'original'}</span>}
 await act(async()=>root.render(<><Probe/><Probe/></>))
 expect(host.textContent).toBe('originaloriginal')
 await act(async()=>{document.documentElement.dataset.theme='yoridokoro-rework';await Promise.resolve()})
 expect(host.textContent).toBe('reworkrework')
 await act(async()=>{document.documentElement.dataset.theme='yoridokoro-keystone';await Promise.resolve()})
 expect(host.textContent).toBe('reworkrework')
 await act(async()=>{document.documentElement.dataset.theme='yoridokoro-dracula';await Promise.resolve()})
 expect(host.textContent).toBe('reworkrework')
 await act(async()=>{delete document.documentElement.dataset.theme;await Promise.resolve()})
 expect(host.textContent).toBe('originaloriginal')
})
