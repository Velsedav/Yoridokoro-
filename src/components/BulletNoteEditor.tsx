import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react'

export interface BulletNoteEditorProps {
  id?: string
  label: string
  icon?: ReactNode
  tone: 'questions' | 'research' | 'advantages' | 'offer' | 'cv-header' | 'cover-letter'
  value: string
  onChange: (nextValue: string) => void
  placeholder?: string
  bulletMode?: boolean
  badge?: ReactNode
  headerAction?: ReactNode
  minRows?: number
}

export function applyBulletKeyDown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
  shiftKey: boolean,
  bulletMode = true,
): { nextValue: string; nextCursor: number } | null {
  if (!bulletMode) return null

  if (key === 'Enter') {
    const before = value.slice(0, selectionStart)
    const after = value.slice(selectionEnd)
    if (shiftKey) {
      const insert = '\n'
      return {
        nextValue: before + insert + after,
        nextCursor: selectionStart + insert.length,
      }
    }
    const prefixFirstLine = before.length === 0 ? '• ' : ''
    const insert = '\n• '
    const nextValue = prefixFirstLine + before + insert + after
    return {
      nextValue,
      nextCursor: prefixFirstLine.length + selectionStart + insert.length,
    }
  }

  if (key === 'Backspace' && selectionStart === selectionEnd) {
    if (selectionStart === 2 && value.startsWith('• ')) {
      return {
        nextValue: value.slice(2),
        nextCursor: 0,
      }
    }
    if (selectionStart >= 3 && value.slice(selectionStart - 3, selectionStart) === '\n• ') {
      return {
        nextValue: value.slice(0, selectionStart - 3) + value.slice(selectionStart),
        nextCursor: selectionStart - 3,
      }
    }
  }

  return null
}

export default function BulletNoteEditor({
  id,
  label,
  icon,
  tone,
  value,
  onChange,
  placeholder,
  bulletMode = true,
  badge,
  headerAction,
  minRows = 3,
}: BulletNoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minRows * 24, el.scrollHeight)}px`
  }, [value, minRows])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return
    const el = event.currentTarget
    const result = applyBulletKeyDown(
      value,
      el.selectionStart ?? value.length,
      el.selectionEnd ?? value.length,
      event.key,
      event.shiftKey,
      bulletMode,
    )
    if (!result) return
    event.preventDefault()
    onChange(result.nextValue)
    const cursor = result.nextCursor
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.selectionStart = cursor
      textareaRef.current.selectionEnd = cursor
    })
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const raw = event.target.value
    if (bulletMode && value === '' && raw.length === 1 && raw !== '•' && raw !== '\n' && raw !== '-') {
      const next = `• ${raw}`
      onChange(next)
      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return
        textareaRef.current.selectionStart = next.length
        textareaRef.current.selectionEnd = next.length
      })
      return
    }
    onChange(raw)
  }

  return (
    <section className={`career-callout career-callout--${tone}`} aria-label={label}>
      <header className="career-callout-header">
        <div className="career-callout-title">
          {icon && <span className="career-callout-icon" aria-hidden="true">{icon}</span>}
          <label htmlFor={id}>{label}</label>
          {badge}
        </div>
        {headerAction && (
          <div className="career-callout-actions">
            {headerAction}
          </div>
        )}
      </header>
      <textarea
        ref={textareaRef}
        id={id}
        className={`career-callout-input${bulletMode ? ' is-bullet-mode' : ''}`}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={minRows}
        placeholder={placeholder ?? (bulletMode ? '• Ajoutez vos points ici…' : 'Écrivez ou collez votre texte ici…')}
      />
    </section>
  )
}
