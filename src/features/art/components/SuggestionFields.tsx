import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { matchSuggestions } from '../lib/suggestions';

interface SuggestionFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  completionField?: boolean;
}

export function SuggestionField({ label, value, options, onChange, required, placeholder, completionField }: SuggestionFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const listId = `${id}-suggestions`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => matchSuggestions(options, value), [options, value]);
  const show = open && suggestions.length > 0;
  const choose = (option: string) => { onChange(option); setOpen(false); setActive(0); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault(); event.stopPropagation(); setOpen(true);
      setActive((current) => event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && show) {
      event.preventDefault(); event.stopPropagation(); choose(suggestions[active] ?? suggestions[0]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    }
  };
  return <div className="field suggestion-field">
    <label htmlFor={id}>{label}{required && <i>{t('required')}</i>}</label>
    <div className="suggestion-control">
      <input id={id} data-completion-field={completionField ? '' : undefined} required={required} value={value} placeholder={placeholder} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={show ? listId : undefined} aria-activedescendant={show ? `${listId}-${active}` : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0); }} onKeyDown={keyDown} />
      {show && <ul id={listId} className="suggestion-menu" role="listbox">
        {suggestions.map((option, index) => <li id={`${listId}-${index}`} key={option} role="option" aria-selected={index === active} className={index === active ? 'active' : ''} onMouseDown={(event) => { event.preventDefault(); choose(option); }}><span>{option}</span>{option === value && <Check />}</li>)}
      </ul>}
    </div>
    <small className="suggestion-hint">{t('Type to reuse an existing value')}</small>
  </div>;
}

interface TagSuggestionFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  completionField?: boolean;
}

export function TagSuggestionField({ label, value, options, onChange, placeholder, completionField }: TagSuggestionFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const listId = `${id}-suggestions`;
  const tags = useMemo(() => value.split(',').map((entry) => entry.trim()).filter(Boolean), [value]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => matchSuggestions(options.filter((option) => !tags.some((tag) => tag.toLocaleLowerCase() === option.toLocaleLowerCase())), query), [options, query, tags]);
  const show = open && suggestions.length > 0;
  const writeTags = (next: string[]) => onChange(next.join(', '));
  const add = (entry: string) => {
    const next = entry.trim();
    if (next && !tags.some((tag) => tag.toLocaleLowerCase() === next.toLocaleLowerCase())) writeTags([...tags, next]);
    setQuery(''); setOpen(false); setActive(0);
  };
  const remove = (entry: string) => writeTags(tags.filter((tag) => tag !== entry));
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault(); event.stopPropagation(); setOpen(true);
      setActive((current) => event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && (show || query.trim())) {
      event.preventDefault(); event.stopPropagation(); add(show ? suggestions[active] ?? suggestions[0] : query);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (event.key === 'Backspace' && !query && tags.length) {
      remove(tags.at(-1)!);
    }
  };
  return <div className="field tag-suggestion-field">
    <label htmlFor={id}>{label}</label>
    <div className="tag-control" onClick={(event) => (event.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {tags.map((tag) => <span className="field-tag" key={tag}>{tag}<button type="button" onClick={() => remove(tag)} aria-label={`${t('Remove')} ${tag}`}><X /></button></span>)}
      <div className="tag-input-wrap"><input id={id} data-completion-field={completionField ? '' : undefined} value={query} placeholder={tags.length ? '' : placeholder} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={show ? listId : undefined} aria-activedescendant={show ? `${listId}-${active}` : undefined} onFocus={() => setOpen(true)} onBlur={() => { if (query.trim()) add(query); else setOpen(false); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={keyDown} />
        {show && <ul id={listId} className="suggestion-menu" role="listbox">{suggestions.map((option, index) => <li id={`${listId}-${index}`} key={option} role="option" aria-selected={index === active} className={index === active ? 'active' : ''} onMouseDown={(event) => { event.preventDefault(); add(option); }}>{option}</li>)}</ul>}
      </div>
    </div>
    <small className="suggestion-hint">{t('Type, then press Enter to add')}</small>
  </div>;
}
