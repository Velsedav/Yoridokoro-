import { ArrowRight, BookOpenCheck, Play, Zap } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { TECHNIQUES } from '../lib/techniques'
import { guidedObjectiveKey } from '../lib/guidedSession'
import type { PlannerRecommendation } from '../lib/plannerRecommendations'
import './NextStudyStep.css'

interface NextStudyStepProps {
  recommendation: PlannerRecommendation
  onStart: () => void
  onJustFive?: () => void
  onOther?: () => void
  autoFocus?: boolean
  compact?: boolean
}

export default function NextStudyStep({ recommendation, onStart, onJustFive, onOther, autoFocus = false, compact = false }: NextStudyStepProps) {
  const { t } = useTranslation()
  const technique = TECHNIQUES.find(item => item.id === recommendation.suggestedTechniqueId)
  const reason = recommendation.allocationInfluenced
    ? t('planner.reason_underallocated')
    : recommendation.reason === 'overdue'
      ? t('planner.reason_overdue', { days: recommendation.daysOverdue })
      : t(`planner.reason_${recommendation.reason.replace('-', '_')}`)

  return (
    <article className={`next-study-step${compact ? ' is-compact' : ''}`} aria-labelledby="next-study-step-title">
      <div className="next-study-step-main">
        <span className={`next-study-step-kicker is-${recommendation.kind}`}>
          {recommendation.kind === 'progress' ? <ArrowRight size={14} /> : <BookOpenCheck size={14} />}
          {t(recommendation.isReentry ? 'planner.kind_reentry' : `planner.kind_${recommendation.kind}`)}
        </span>
        <p className="next-study-step-subject">{recommendation.subjectName}</p>
        <h2 id="next-study-step-title">{recommendation.chapterName}</h2>
        <p className="next-study-step-meta">
          {t('planner.chapter_position', { current: recommendation.chapterPosition, total: recommendation.chapterCount })}
          <span aria-hidden="true"> · </span>{t(recommendation.isReentry ? 'planner.reentry_duration' : 'planner.focus_duration')}
        </p>
        <details className="next-study-step-explanation"><summary>{t('planner.why_label')}</summary><p className="next-study-step-reason">{recommendation.isReentry ? t('planner.reentry_reason') : reason}</p>
        {!compact && <p className="next-study-step-technique"><strong>{t('planner.technique_label')}</strong> {technique?.name ?? t('planner.technique_fallback')}</p>}</details>
        {recommendation.resumePoint && <p className="next-study-step-resume"><strong>{t('planner.resume_point')}</strong> {recommendation.resumePoint}</p>}
        {(!compact || recommendation.isReentry) && <p className="next-study-step-goal">{t(guidedObjectiveKey(recommendation))}</p>}
      </div>
      <div className="next-study-step-actions">
        <button autoFocus={autoFocus} type="button" className="next-study-step-start" onClick={onStart} aria-keyshortcuts="Enter">
          <Play size={17} fill="currentColor" />
          <span>{t(recommendation.isReentry ? 'planner.start_reentry' : 'planner.start_preparation')}<small>{t(recommendation.isReentry ? 'planner.reentry_structure' : 'planner.session_structure')}</small></span>
          <kbd aria-hidden="true">↵</kbd>
        </button>
        {onJustFive && !recommendation.isReentry && <button type="button" className="next-study-step-five" onClick={onJustFive} aria-keyshortcuts="5">
          <Zap size={16} fill="currentColor" />
          <span>{t('planner.just_five')}<small>{t('planner.just_five_hint')}</small></span>
          <kbd aria-hidden="true">5</kbd>
        </button>}
        {onOther && <button type="button" className="next-study-step-other" onClick={onOther}>{t('planner.other_suggestion')} <ArrowRight size={14} /></button>}
      </div>
    </article>
  )
}
