import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'

import { SettingsProvider } from './lib/settings.tsx'

import Layout from './components/Layout'
import Home from './pages/Home.tsx'
import Plan from './pages/Plan.tsx'
import Session from './pages/Session.tsx'
import SubjectDetail from './pages/SubjectDetail.tsx'
import Learning from './pages/Learning.tsx'
import Analytics from './pages/Analytics.tsx'
import Settings from './pages/Settings.tsx'
import MetacognitionLogs from './pages/MetacognitionLogs.tsx'
import Metacognition from './pages/Metacognition.tsx'
import DevPage from './pages/Dev.tsx'
import BingoDashboard from './pages/bingoals/BingoDashboard.tsx'
import BingoObjectivePage from './pages/bingoals/BingoObjectivePage.tsx'
import './styles/bingoals.css'
import './styles/linux-perf.css'

// CTRL+Scroll: scale font-size
let rootFontScale = 1.0;
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    rootFontScale = Math.max(0.7, Math.min(1.5, rootFontScale + direction * 0.05));
    document.documentElement.style.fontSize = `${rootFontScale * 100}%`;
  }
}, { passive: false });

// CTRL+0: reset font scale
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    rootFontScale = 1.0;
    document.documentElement.style.removeProperty('font-size');
  }
});

// F11: toggle fullscreen via Electron
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    // Electron handles fullscreen toggling natively via main process
  }
});

// Auto-export on close via Electron window close event
window.addEventListener('beforeunload', async () => {
  try {
    const { autoExportToConfiguredPaths } = await import('./lib/export');
    await autoExportToConfiguredPaths();
  } catch {}
});

// Strip any accidental zoom property
const clearNativeZoom = () => {
  if (document.documentElement.style.zoom) document.documentElement.style.removeProperty('zoom');
  if (document.body?.style.zoom) document.body.style.removeProperty('zoom');
};
new MutationObserver(clearNativeZoom).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
new MutationObserver(clearNativeZoom).observe(document.body, { attributes: true, attributeFilter: ['style'] });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="subject/:id" element={<SubjectDetail />} />
            <Route path="plan" element={<Plan />} />
            <Route path="session" element={<Session />} />
            <Route path="learning" element={<Learning />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="metacognition-logs" element={<MetacognitionLogs />} />
            <Route path="metacognition" element={<Metacognition />} />
            <Route path="settings" element={<Settings />} />
            <Route path="dev" element={<DevPage />} />
            <Route path="bingoals" element={<BingoDashboard />} />
            <Route path="bingoals/objective/:id" element={<BingoObjectivePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </SettingsProvider>
  </StrictMode>,
)
