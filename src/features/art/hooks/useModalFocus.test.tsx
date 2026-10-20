// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useModalFocus } from './useModalFocus';

it('traps focus inside an Art shadow-root dialog and restores its trigger', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  shadow.append(mount);
  const root = createRoot(mount);
  function Dialog({ close }: { close: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useModalFocus(ref, close);
    return <div ref={ref} role="dialog"><button data-first>First</button><button data-last>Last</button></div>;
  }
  function Probe() {
    const [open, setOpen] = useState(false);
    return <><button data-trigger onClick={() => setOpen(true)}>Open</button>{open && <Dialog close={() => setOpen(false)} />}</>;
  }
  try {
    await act(async () => root.render(<Probe />));
    const trigger = shadow.querySelector<HTMLButtonElement>('[data-trigger]')!;
    await act(async () => { trigger.focus(); trigger.click(); });
    const first = shadow.querySelector<HTMLButtonElement>('[data-first]')!;
    const last = shadow.querySelector<HTMLButtonElement>('[data-last]')!;
    expect(shadow.activeElement).toBe(first);
    last.focus();
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true })));
    expect(shadow.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, composed: true, cancelable: true })));
    expect(shadow.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true })));
    expect(shadow.querySelector('[role="dialog"]')).toBeNull();
    expect(shadow.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
