import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { getHistoryTimeEntries, type HistoryTimeEntry } from '../lib/activityTime'
import { useTranslation } from '../lib/i18n'
import { PLAYNITE_TIME_ENTRIES_CHANGED_EVENT } from '../lib/playniteImport'
import { syncLegacyTime } from '../lib/timeSync'
import {
  buildTimeDistribution,
  TIME_DISTRIBUTION_PERIODS,
  timeDistributionRange,
  type TimeDistributionPeriod,
} from '../lib/timeDistribution'

function formatRecordedTime(seconds: number) {
  const roundedMinutes = Math.round(seconds / 60)
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`
  return `${minutes} min`
}

export default function TimeDistributionPanel() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<TimeDistributionPeriod>('week')
  const [entries, setEntries] = useState<HistoryTimeEntry[]>([])
  const [range, setRange] = useState(() => timeDistributionRange('week'))
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const nextRange = timeDistributionRange(period)
    setRange(nextRange)
    setLoading(true)
    try {
      await syncLegacyTime()
      setEntries(await getHistoryTimeEntries(nextRange.from, nextRange.to))
    } catch (error) {
      console.error('Could not load History time distribution', error)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const changed = () => void refresh()
    window.addEventListener(PLAYNITE_TIME_ENTRIES_CHANGED_EVENT, changed)
    window.addEventListener('yoridokoro-activity-timer-changed', changed)
    return () => {
      window.removeEventListener(PLAYNITE_TIME_ENTRIES_CHANGED_EVENT, changed)
      window.removeEventListener('yoridokoro-activity-timer-changed', changed)
    }
  }, [refresh])

  const distribution = useMemo(
    () => buildTimeDistribution(entries, range.from, range.to),
    [entries, range],
  )

  return <section className="yd-time-distribution" aria-labelledby="time-distribution-title" aria-busy={loading}>
    <header>
      <div>
        <span className="yd-eyebrow"><Clock3 size={14} /> {t('time_distribution.eyebrow')}</span>
        <h2 id="time-distribution-title">{t('time_distribution.title')} <strong>{formatRecordedTime(distribution.totalSeconds)}</strong></h2>
      </div>
      <div className="yd-time-periods" role="group" aria-label={t('time_distribution.period_aria')}>
        {TIME_DISTRIBUTION_PERIODS.map(value => <button
          type="button"
          key={value}
          aria-pressed={period === value}
          onClick={() => setPeriod(value)}
        >{t(`time_distribution.period_${value}`)}</button>)}
      </div>
    </header>

    <div className="yd-time-stack" aria-label={t('time_distribution.chart_aria')}>
      {distribution.segments.filter(segment => segment.seconds > 0).map(segment => <span
        key={segment.category}
        className={`yd-time-segment yd-time-segment--${segment.category}`}
        style={{ width: `${segment.seconds / Math.max(1, distribution.totalSeconds) * 100}%` }}
        title={`${t(`time_distribution.category_${segment.category}`)} · ${segment.percent}% · ${formatRecordedTime(segment.seconds)}`}
      />)}
      {distribution.totalSeconds === 0 && <span className="yd-time-segment yd-time-segment--empty" />}
    </div>

    <ul className="yd-time-legend">
      {distribution.segments.filter(segment => segment.seconds > 0).map(segment => <li key={segment.category}>
        <i className={`yd-time-key yd-time-key--${segment.category}`} aria-hidden="true" />
        <span>{t(`time_distribution.category_${segment.category}`)}</span>
        <strong>{segment.percent}%</strong>
        <small>{formatRecordedTime(segment.seconds)}</small>
      </li>)}
    </ul>
  </section>
}
