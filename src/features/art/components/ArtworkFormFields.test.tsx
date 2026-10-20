// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArtworkFormFields, advanceArtworkField, revealInvalidArtworkField } from '../App';

type Form = Parameters<typeof ArtworkFormFields>[0]['form'];
let host: HTMLDivElement, root: Root, saved: Form | undefined;
const initial: Form = { title: 'An artwork', creator: 'An author', year: '2007', durationMinutes: '', genre: 'Adventure', country: 'France', series: 'A series', movement: '', imageUrl: '', notes: 'Personal note', quotes: [{ id: 'quote', text: 'Remember this', comment: 'A comment' }] };
function Probe() {
  const [form, setForm] = useState(initial);
  return <form onSubmit={event => { event.preventDefault(); saved = form; }} onKeyDown={advanceArtworkField} onInvalidCapture={revealInvalidArtworkField}><ArtworkFormFields form={form} category="games" existing={[]} onChange={setForm} /><button type="submit">Save</button></form>;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function(this: HTMLElement) { return (this.hidden || this.closest('details:not([open])') && this.tagName !== 'SUMMARY' ? [] : [{}]) as unknown as DOMRectList; });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); saved = undefined;
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('starts with three collapsed optional sections and saves existing notes, quotes and metadata intact', async () => {
  expect([...host.querySelectorAll('details')].every(section => !section.open)).toBe(true);
  const title = host.querySelector<HTMLInputElement>('[data-add-primary]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'A new title');
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(saved).toEqual({ ...initial, title: 'A new title' });
});

it('advances to a visible disclosure instead of a hidden metadata input', async () => {
  const creator = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => {
    creator.focus();
    creator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).toBe(host.querySelector('details summary'));
});

it('reveals and focuses an invalid field inside a collapsed section', async () => {
  const year = host.querySelector<HTMLInputElement>('input[list]')!;
  await act(async () => year.dispatchEvent(new Event('invalid', { bubbles: false, cancelable: true })));
  expect(year.closest('details')!.open).toBe(true);
  expect(document.activeElement).toBe(year);
});
