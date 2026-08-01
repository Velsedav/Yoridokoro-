import { useState, useEffect, useRef } from 'react';
import { X, Plus, Pencil, Check, Trash2 } from 'lucide-react';
import type { Quote } from '../lib/db';
import { getQuotes, addQuote, updateQuote, deleteQuote } from '../lib/db';
import { useTranslation } from '../lib/i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface QuoteEditorModalProps {
    onClose: () => void;
    onChanged: () => void;
}

export default function QuoteEditorModal({ onClose, onChanged }: QuoteEditorModalProps) {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [newText, setNewText] = useState('');

    useDialogFocus(dialogRef, onClose, '[data-dialog-initial-focus]');

    useEffect(() => { load(); }, []);

    async function load() {
        const q = await getQuotes();
        setQuotes(q);
    }

    async function handleAdd() {
        if (!newText.trim()) return;
        await addQuote(newText.trim());
        setNewText('');
        await load();
        onChanged();
    }

    async function handleSaveEdit() {
        if (!editingId || !editText.trim()) return;
        await updateQuote(editingId, editText.trim());
        setEditingId(null);
        setEditText('');
        await load();
        onChanged();
    }

    async function handleDelete(id: string) {
        await deleteQuote(id);
        await load();
        onChanged();
    }

    function startEdit(q: Quote) {
        setEditingId(q.id);
        setEditText(q.text);
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                ref={dialogRef}
                className="modal-content"
                role="dialog"
                aria-modal="true"
                aria-labelledby="quote-editor-title"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '520px' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 id="quote-editor-title" style={{ margin: 0 }}>{t('quotes.title')}</h2>
                    <button className="btn-icon" onClick={onClose} aria-label={t('plan.close')}><X size={20} /></button>
                </div>

                <div className="quote-list">
                    {quotes.map(q => (
                        <div key={q.id} className="quote-list-item">
                            {editingId === q.id ? (
                                <div className="quote-edit-row">
                                    <input
                                        value={editText}
                                        onChange={e => setEditText(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                        autoFocus
                                        aria-label={t('quotes.edit_label')}
                                    />
                                    <button className="btn-icon" onClick={handleSaveEdit} aria-label={t('quotes.save')}><Check size={16} /></button>
                                    <button className="btn-icon" onClick={() => setEditingId(null)} aria-label={t('home.cancel')}><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="quote-display-row">
                                    <span className="quote-text">{q.text}</span>
                                    <div className="quote-actions">
                                        <button className="btn-icon" onClick={() => startEdit(q)} aria-label={t('quotes.edit_label')}><Pencil size={14} /></button>
                                        <button className="btn-icon" onClick={() => handleDelete(q.id)} aria-label={t('quotes.delete')} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="quote-add-row">
                    <input
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        placeholder={t('quotes.add_placeholder')}
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                        data-dialog-initial-focus
                        aria-label={t('quotes.add_placeholder')}
                    />
                    <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '8px 16px' }}>
                        <Plus size={16} /> {t('quotes.add')}
                    </button>
                </div>
            </div>
        </div>
    );
}
