import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'

import { SettingsProvider } from './lib/settings.tsx'

import Layout from './components/Layout'
import './styles/linux-perf.css'
import './styles/yoridokoro-legacy.css'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'

const TodayDashboard = lazy(() => import('./pages/TodayDashboard.tsx'))
const Home = lazy(() => import('./pages/Home.tsx'))
const SubjectDetail = lazy(() => import('./pages/SubjectDetail.tsx'))
const Plan = lazy(() => import('./pages/Plan.tsx'))
const ActivityCalendar = lazy(() => import('./pages/ActivityCalendar.tsx'))
const Session = lazy(() => import('./pages/Session.tsx'))
const Learning = lazy(() => import('./pages/Learning.tsx'))
const Analytics = lazy(() => import('./pages/Analytics.tsx'))
const MetacognitionLogs = lazy(() => import('./pages/MetacognitionLogs.tsx'))
const Metacognition = lazy(() => import('./pages/Metacognition.tsx'))
const Settings = lazy(() => import('./pages/Settings.tsx'))
const DevPage = lazy(() => import('./pages/Dev.tsx'))
const BingoDashboard = lazy(() => import('./pages/bingoals/BingoDashboard.tsx'))
const BingoObjectivePage = lazy(() => import('./pages/bingoals/BingoObjectivePage.tsx'))
const ArtModule = lazy(() => import('./pages/ArtModule.tsx'))
const Relations = lazy(() => import('./pages/Relations.tsx'))

// F11: toggle fullscreen via Electron
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    void (window as any).electronAPI?.windowControls?.toggleFullscreen();
  }
});

// Electron pauses window closure until every configured local/cloud-folder
// export has finished. This avoids the unreliable async-beforeunload pattern.
const lifecycle = (window as any).electronAPI?.lifecycle;
let closeInProgress = false;
lifecycle?.onBeforeClose(async () => {
  if (closeInProgress) return;
  closeInProgress = true;
  window.dispatchEvent(new Event('app-close-start'));
  try {
    const { autoExportToConfiguredPaths } = await import('./lib/export');
    await autoExportToConfiguredPaths((path, status, slot) => {
      window.dispatchEvent(new CustomEvent('app-close-path', { detail: { path, status, slot } }));
    });
  } catch {
    // The main process still provides a timeout and the overlay offers force quit.
  } finally {
    window.dispatchEvent(new Event('app-close-done'));
    setTimeout(() => lifecycle.readyToClose(), 250);
  }
});
(window as any).__forceQuit = () => lifecycle?.forceClose();

// Strip any accidental zoom property
const clearNativeZoom = () => {
  if (document.documentElement.style.zoom) document.documentElement.style.removeProperty('zoom');
  if (document.body?.style.zoom) document.body.style.removeProperty('zoom');
};
new MutationObserver(clearNativeZoom).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
new MutationObserver(clearNativeZoom).observe(document.body, { attributes: true, attributeFilter: ['style'] });

async function startRenderer() {
  try {
    const { synchronizeStudyDataDurability } = await import('./lib/chapters')
    await synchronizeStudyDataDurability()
  } catch (error) {
    console.warn('Study data durability check could not complete', error)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <SettingsProvider>
          <HashRouter>
          <Suspense fallback={<div className="route-loading" role="status">Ouverture de votre espace…</div>}>
            <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<TodayDashboard />} />
              <Route path="study" element={<Home />} />
              <Route path="subject/:id" element={<SubjectDetail />} />
              <Route path="plan" element={<Plan />} />
              <Route path="calendar" element={<ActivityCalendar />} />
              <Route path="session" element={<Session />} />
              <Route path="learning" element={<Learning />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="metacognition-logs" element={<MetacognitionLogs />} />
              <Route path="metacognition" element={<Metacognition />} />
              <Route path="settings" element={<Settings />} />
              <Route path="dev" element={<DevPage />} />
              <Route path="bingoals" element={<BingoDashboard />} />
              <Route path="bingoals/objective/:id" element={<BingoObjectivePage />} />
              <Route path="art" element={<ArtModule />} />
              <Route path="relations" element={<Relations />} />
            </Route>
            </Routes>
          </Suspense>
          </HashRouter>
        </SettingsProvider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void startRenderer()
