import { useEffect, useState } from 'react'
import { ArrowRight, BrainCircuit } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from '../lib/i18n'
import { getMetacognitionWindow, isMetacognitionDue } from '../lib/metacognitionSchedule'
import { getLatestMetacognitionCompletion, METACOGNITION_UPDATED_EVENT } from '../lib/metacognitionStatus'
import { useSettings } from '../lib/settings'
import './MetacognitionGate.css'

function dailySnoozeKey(date: Date) {
  return `study-buddy-metacognition-snooze-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export default function MetacognitionGate() {
  const { metacognitionDay } = useSettings()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [due, setDue] = useState(false)

  async function checkDue() {
    const now = new Date()
    if (!getMetacognitionWindow(now, metacognitionDay)) {
      setDue(false)
      return
    }

    const latestCompletion = await getLatestMetacognitionCompletion()

    const snoozedToday = sessionStorage.getItem(dailySnoozeKey(now)) === '1'
    setDue(isMetacognitionDue(now, metacognitionDay, latestCompletion) && !snoozedToday)
  }

  useEffect(() => {
    void checkDue()
    const intervalId = window.setInterval(() => void checkDue(), 60 * 60 * 1000)
    const handleFocus = () => void checkDue()
    window.addEventListener('focus', handleFocus)
    window.addEventListener(METACOGNITION_UPDATED_EVENT, handleFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener(METACOGNITION_UPDATED_EVENT, handleFocus)
    }
    // checkDue intentionally reads current local/database state on each invocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metacognitionDay])

  function dismissToday() {
    sessionStorage.setItem(dailySnoozeKey(new Date()), '1')
    setDue(false)
  }

  const inStudySession = location.pathname === '/session'
  const onMetacognitionPage = location.pathname === '/metacognition'

  return (
    <>
      {due && !inStudySession && !onMetacognitionPage && (
        <aside className="mc-global-prompt" role="status" aria-labelledby="mc-global-title">
          <span className="mc-global-icon" aria-hidden="true"><BrainCircuit size={18} /></span>
          <span className="mc-global-copy">
            <strong id="mc-global-title">{t('metacog.prompt_title') || 'Weekly reflection due'}</strong>
            <span>{t('metacog.prompt_desc') || 'Review the week and adjust your system.'}</span>
          </span>
          <span className="mc-global-actions">
            <button type="button" className="mc-global-later" onClick={dismissToday}>
              {t('metacog.prompt_later') || 'Not now'}
            </button>
            <button type="button" className="mc-global-start" onClick={() => navigate('/metacognition')}>
              {t('metacog.prompt_start') || 'Start reflection'} <ArrowRight size={14} aria-hidden="true" />
            </button>
          </span>
        </aside>
      )}

    </>
  )
}
