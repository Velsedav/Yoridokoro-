import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Building2, CalendarClock, Mail, MessageCircle, Phone, Plus, Search, StickyNote, UserRound, Users, Video, X } from 'lucide-react'
import { addInteraction, addPersonNote, createPerson, daysSinceContact, getInteractions, getPeople, getPersonNotes, updatePerson, type InteractionChannel, type Person, type PersonInteraction, type PersonNote, type RelationshipKind } from '../lib/relations'
import './Relations.css'

const kindLabels: Record<RelationshipKind, string> = { family: 'Famille', friend: 'Ami·e', professional: 'Professionnel', community: 'Communauté', other: 'Autre' }
const channelLabels: Record<InteractionChannel, string> = { in_person: 'En personne', phone: 'Téléphone', message: 'Message', email: 'E-mail', video: 'Visio', social: 'Réseau social', other: 'Autre' }

function contactLabel(person: Person) {
  const days = daysSinceContact(person)
  if (days === null) return 'Aucun échange enregistré'
  if (days === 0) return 'Aujourd’hui'
  if (days === 1) return 'Hier'
  return `Il y a ${days} jours`
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase()).join('') || '?'
}

function AccessibleDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  useEffect(() => {
    const dialog = ref.current
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || [])
    focusables()[0]?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0], last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); restoreRef.current?.focus() }
  }, [onClose])
  return <div className="rel-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}><div ref={ref} className="rel-dialog" role="dialog" aria-modal="true" aria-labelledby="rel-dialog-title"><header><h2 id="rel-dialog-title">{title}</h2><button onClick={onClose} aria-label="Fermer"><X /></button></header>{children}</div></div>
}

export default function Relations() {
  const [people, setPeople] = useState<Person[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [interactions, setInteractions] = useState<PersonInteraction[]>([])
  const [notes, setNotes] = useState<PersonNote[]>([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<RelationshipKind | 'all'>('all')
  const [dialog, setDialog] = useState<'person' | 'interaction' | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const selected = people.find(person => person.id === selectedId) ?? null

  async function refreshPeople(preferredId?: string) {
    const next = await getPeople()
    setPeople(next)
    setSelectedId(current => preferredId ?? (next.some(person => person.id === current) ? current : next[0]?.id ?? null))
    setLoading(false)
  }

  useEffect(() => { void refreshPeople() }, [])
  useEffect(() => {
    if (!selectedId) { setInteractions([]); setNotes([]); return }
    void Promise.all([getInteractions(selectedId), getPersonNotes(selectedId)]).then(([nextInteractions, nextNotes]) => { setInteractions(nextInteractions); setNotes(nextNotes) })
  }, [selectedId, people])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return people.filter(person => (kind === 'all' || person.relationship_kind === kind) && (!needle || [person.display_name, person.organization, person.role].some(value => value?.toLocaleLowerCase().includes(needle))))
  }, [people, query, kind])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    if (!name) return
    const person = await createPerson({ displayName: name, relationshipKind: data.get('kind') as RelationshipKind, organization: String(data.get('organization') || ''), role: String(data.get('role') || ''), birthday: String(data.get('birthday') || '') })
    setDialog(null); setNotice(`${name} a été ajouté·e.`); await refreshPeople(person.id)
  }

  async function handleInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const data = new FormData(event.currentTarget)
    await addInteraction(selected.id, { occurredAt: new Date(String(data.get('occurredAt'))).toISOString(), channel: data.get('channel') as InteractionChannel, summary: String(data.get('summary') || '') })
    setDialog(null); setNotice(`Échange avec ${selected.display_name} enregistré.`); await refreshPeople(selected.id)
  }

  async function handleNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const form = event.currentTarget, data = new FormData(form), text = String(data.get('note') || '').trim()
    if (!text) return
    await addPersonNote(selected.id, text); form.reset(); setNotes(await getPersonNotes(selected.id)); setNotice('Note enregistrée.')
  }

  async function handleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const data = new FormData(event.currentTarget)
    await updatePerson(selected, { follow_up_at: String(data.get('followUp') || '') || null, follow_up_note: String(data.get('followUpNote') || '') || null })
    setNotice('Relance mise à jour.'); await refreshPeople(selected.id)
  }

  async function archiveSelected() {
    if (!selected) return
    await updatePerson(selected, { archived: 1 }); setNotice(`${selected.display_name} a été archivé·e.`); await refreshPeople()
  }

  if (loading) return <div className="rel-loading">Ouverture de vos relations…</div>

  return <div className="rel-page">
    <header className="rel-topbar"><div><span className="rel-eyebrow"><Users size={14} /> Mémoire relationnelle</span><h1>Relations</h1><p>Gardez les personnes importantes dans votre champ de vision.</p></div><button className="rel-primary" onClick={() => setDialog('person')}><Plus size={17} /> Ajouter une personne</button></header>
    {notice && <div className="rel-notice" role="status" aria-live="polite">{notice}<button onClick={() => setNotice('')} aria-label="Fermer le message"><X size={14} /></button></div>}
    <div className="rel-shell">
      <aside className="rel-list-pane" aria-label="Liste des personnes">
        <div className="rel-search"><Search size={16} aria-hidden="true" /><label className="sr-only" htmlFor="rel-search">Rechercher une personne</label><input id="rel-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher…" /></div>
        <div className="rel-kind-filter" aria-label="Filtrer par relation">{(['all', 'family', 'friend', 'professional'] as const).map(value => <button key={value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)} aria-pressed={kind === value}>{value === 'all' ? 'Toutes' : kindLabels[value]}</button>)}</div>
        <ol className="rel-person-list">{filtered.map(person => <li key={person.id}><button className={selectedId === person.id ? 'active' : ''} onClick={() => setSelectedId(person.id)}><span className={`rel-avatar kind-${person.relationship_kind}`} aria-hidden="true">{initials(person.display_name)}</span><span><strong>{person.display_name}</strong><small>{contactLabel(person)}</small></span>{person.follow_up_at && <CalendarClock size={15} aria-label="Relance planifiée" />}</button></li>)}{filtered.length === 0 && <li className="rel-empty">Aucune personne ne correspond.</li>}</ol>
      </aside>
      <main className="rel-detail">
        {selected ? <>
          <section className="rel-profile"><div className={`rel-profile-avatar kind-${selected.relationship_kind}`} aria-hidden="true">{initials(selected.display_name)}</div><div><span className="rel-kind">{kindLabels[selected.relationship_kind]}</span><h2>{selected.display_name}</h2><p>{[selected.role, selected.organization].filter(Boolean).join(' · ') || 'Informations à compléter'}</p></div><div className="rel-profile-actions"><button className="rel-primary" onClick={() => setDialog('interaction')}><MessageCircle size={16} /> Enregistrer un échange</button><button className="rel-icon-button" onClick={archiveSelected} aria-label={`Archiver ${selected.display_name}`} title="Archiver"><Archive size={17} /></button></div></section>
          <div className="rel-summary"><div><small>Dernier contact</small><strong>{contactLabel(selected)}</strong></div><div><small>Échanges enregistrés</small><strong>{selected.interaction_count}</strong></div><div><small>Prochaine relance</small><strong>{selected.follow_up_at ? new Date(selected.follow_up_at + 'T00:00:00').toLocaleDateString('fr-FR') : 'Non planifiée'}</strong></div></div>
          <div className="rel-detail-grid">
            <section className="rel-card"><header><h3><MessageCircle size={16} /> Historique</h3><button onClick={() => setDialog('interaction')}>+ Ajouter</button></header><ol className="rel-timeline">{interactions.map(item => <li key={item.id}><span className="rel-timeline-dot" /><div><strong>{channelLabels[item.channel]}</strong><time>{new Date(item.occurred_at).toLocaleString('fr-FR')}</time>{item.summary && <p>{item.summary}</p>}</div></li>)}{interactions.length === 0 && <li className="rel-empty">Enregistrez votre premier échange.</li>}</ol></section>
            <div className="rel-side-stack">
              <section className="rel-card"><header><h3><CalendarClock size={16} /> Relance</h3></header><form className="rel-form compact" onSubmit={handleFollowUp}><label>Date<input name="followUp" type="date" defaultValue={selected.follow_up_at || ''} /></label><label>Intention<input name="followUpNote" defaultValue={selected.follow_up_note || ''} placeholder="Prendre des nouvelles…" /></label><button className="rel-secondary" type="submit">Enregistrer</button></form></section>
              <section className="rel-card"><header><h3><StickyNote size={16} /> Notes</h3></header><form className="rel-note-form" onSubmit={handleNote}><label className="sr-only" htmlFor="person-note">Nouvelle note</label><textarea id="person-note" name="note" required placeholder="Informations, centres d’intérêt, contexte…" /><button className="rel-secondary" type="submit">Ajouter la note</button></form><ul className="rel-notes">{notes.map(note => <li key={note.id}>{note.text}<time>{new Date(note.created_at).toLocaleDateString('fr-FR')}</time></li>)}</ul></section>
            </div>
          </div>
        </> : <div className="rel-detail-empty"><UserRound size={40} /><h2>Votre carnet relationnel</h2><p>Ajoutez une personne pour commencer.</p><button className="rel-primary" onClick={() => setDialog('person')}><Plus size={17} /> Ajouter une personne</button></div>}
      </main>
    </div>
    {dialog === 'person' && <AccessibleDialog title="Ajouter une personne" onClose={() => setDialog(null)}><form className="rel-form" onSubmit={handleCreate}><label>Nom complet <span>requis</span><input name="name" required autoComplete="name" /></label><label>Relation<select name="kind" defaultValue="friend">{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="rel-form-grid"><label>Organisation<input name="organization" /></label><label>Rôle<input name="role" /></label></div><label>Anniversaire<input name="birthday" type="date" /></label><div className="rel-dialog-actions"><button type="button" className="rel-secondary" onClick={() => setDialog(null)}>Annuler</button><button className="rel-primary" type="submit">Ajouter</button></div></form></AccessibleDialog>}
    {dialog === 'interaction' && selected && <AccessibleDialog title={`Échange avec ${selected.display_name}`} onClose={() => setDialog(null)}><form className="rel-form" onSubmit={handleInteraction}><label>Date et heure<input name="occurredAt" type="datetime-local" required defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} /></label><label>Canal<select name="channel" defaultValue="message">{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Résumé<textarea name="summary" placeholder="De quoi avez-vous parlé ?" /></label><div className="rel-dialog-actions"><button type="button" className="rel-secondary" onClick={() => setDialog(null)}>Annuler</button><button className="rel-primary" type="submit">Enregistrer</button></div></form></AccessibleDialog>}
  </div>
}
