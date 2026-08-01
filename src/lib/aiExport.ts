/**
 * aiExport.ts
 *
 * Generates a rich, human-readable study report suitable for pasting into
 * NotebookLM, Claude, or any AI assistant. Unlike the raw JSON backup, this
 * format is narrative-first: IDs are resolved to names, timestamps become
 * readable dates, and data is grouped into meaningful sections (weekly
 * breakdown, subject profiles, metacognition history).
 */

import { getDb } from './db';
import { TECHNIQUES } from './techniques';
import { getAllChapters } from './chapters';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

function fmtShort(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getWeekBounds(date: Date, weekStart: 'monday' | 'sunday'): { start: Date; end: Date } {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun … 6=Sat
    const diffToStart = weekStart === 'monday'
        ? (day === 0 ? -6 : 1 - day)
        : -day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function getWeekKey(date: Date, weekStart: 'monday' | 'sunday'): string {
    return getWeekBounds(date, weekStart).start.toISOString().slice(0, 10);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateAIReport(): Promise<string> {
    const db = await getDb();

    // ── Pull all data ──
    const [subjects, sessions, blocks, metacogLogs, subgoals] = await Promise.all([
        db.select<any[]>('SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY name'),
        db.select<any[]>('SELECT * FROM sessions ORDER BY started_at'),
        db.select<any[]>('SELECT * FROM session_blocks ORDER BY session_id, idx'),
        db.select<any[]>('SELECT * FROM metacognition_logs ORDER BY created_at'),
        db.select<any[]>('SELECT * FROM subgoals'),
    ]);

    // LocalStorage reads
    const weekStart: 'monday' | 'sunday' = (() => {
        try { return JSON.parse(localStorage.getItem('study-buddy-settings') || '{}').weekStart || 'monday'; }
        catch { return 'monday'; }
    })();

    const chapters = getAllChapters();

    const srsState: Record<string, any> = (() => {
        try { return JSON.parse(localStorage.getItem('study-buddy-srs-state') || '{}'); }
        catch { return {}; }
    })();

    const goalDates: any[] = (() => {
        try { return JSON.parse(localStorage.getItem('study-buddy-goal-dates') || '[]'); }
        catch { return []; }
    })();

    // ── Build lookup maps ──
    const subjectMap = new Map(subjects.map(s => [s.id, s]));
    const techMap = new Map(TECHNIQUES.map(t => [t.id, t]));

    const blocksBySession = new Map<string, any[]>();
    for (const b of blocks) {
        if (!blocksBySession.has(b.session_id)) blocksBySession.set(b.session_id, []);
        blocksBySession.get(b.session_id)!.push(b);
    }

    const subgoalsBySubject = new Map<string, any[]>();
    for (const sg of subgoals) {
        if (!subgoalsBySubject.has(sg.subject_id)) subgoalsBySubject.set(sg.subject_id, []);
        subgoalsBySubject.get(sg.subject_id)!.push(sg);
    }

    const chaptersBySubject = new Map<string, typeof chapters>();
    for (const ch of chapters) {
        if (!chaptersBySubject.has(ch.subjectId)) chaptersBySubject.set(ch.subjectId, []);
        chaptersBySubject.get(ch.subjectId)!.push(ch);
    }

    const now = new Date();
    const lines: string[] = [];

    // ── Document header ───────────────────────────────────────────────────────
    lines.push('# Yoridokoro — Rapport d\'étude complet');
    lines.push(`Généré le : ${fmtDate(now.toISOString())}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // ── Suggested AI prompt ───────────────────────────────────────────────────
    lines.push('## Prompt suggéré');
    lines.push('');
    lines.push('Analyse mon historique d\'étude ci-dessous et réponds à ces questions :');
    lines.push('1. Quels patterns récurrents observes-tu (positifs et négatifs) dans mon comportement d\'étude ?');
    lines.push('2. Y a-t-il un écart entre mes priorités déclarées dans les pit stops et le temps réellement investi ?');
    lines.push('3. Mes techniques sont-elles adaptées au type de contenu que je travaille (mémorisation / compréhension / savoir-faire) ?');
    lines.push('4. Quels sujets nécessitent une attention urgente compte tenu de leurs deadlines ?');
    lines.push('5. Donne-moi 3 recommandations concrètes et actionnables pour la semaine prochaine.');
    lines.push('');
    lines.push('---');
    lines.push('');

    // ── Global stats ──────────────────────────────────────────────────────────
    const totalStudyMins = sessions.reduce((s, sess) => s + (sess.actual_minutes || 0), 0);
    const firstSession = sessions[0]?.started_at;
    const activeSubjects = subjects.filter(s => !s.archived);

    lines.push('## Statistiques globales');
    lines.push('');
    lines.push(`- Temps d'étude total : ${fmtMins(totalStudyMins)}`);
    lines.push(`- Sessions totales : ${sessions.length}`);
    if (firstSession) lines.push(`- Étude depuis : ${fmtDate(firstSession)}`);
    lines.push(`- Matières actives : ${activeSubjects.length}`);
    lines.push(`- Chapitres suivis : ${chapters.length}`);
    lines.push(`- Pit Stops métacognitifs effectués : ${metacogLogs.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // ── Weekly breakdown (last 8 weeks with data) ─────────────────────────────
    lines.push('## Activité par semaine (8 dernières semaines actives)');
    lines.push('');

    // Group sessions by week key
    const weekMap = new Map<string, any[]>();
    for (const s of sessions) {
        const key = getWeekKey(new Date(s.started_at), weekStart);
        if (!weekMap.has(key)) weekMap.set(key, []);
        weekMap.get(key)!.push(s);
    }

    const weekKeys = [...weekMap.keys()].sort().reverse().slice(0, 8);

    for (const weekKey of weekKeys) {
        const weekSessions = weekMap.get(weekKey)!;
        const { start, end } = getWeekBounds(new Date(weekKey + 'T12:00:00'), weekStart);

        const totalMins = weekSessions.reduce((s, sess) => s + (sess.actual_minutes || 0), 0);
        const activeDays = new Set(weekSessions.map(s => new Date(s.started_at).toDateString())).size;

        // Aggregate subject time + chapters + techniques for this week
        const subjectMins: Record<string, number> = {};
        const subjectChapters: Record<string, Set<string>> = {};
        const techMins: Record<string, number> = {};

        for (const sess of weekSessions) {
            for (const b of (blocksBySession.get(sess.id) || [])) {
                if (b.type !== 'WORK' || !b.subject_id) continue;
                subjectMins[b.subject_id] = (subjectMins[b.subject_id] || 0) + (b.minutes || 0);
                if (b.chapter_name) {
                    if (!subjectChapters[b.subject_id]) subjectChapters[b.subject_id] = new Set();
                    subjectChapters[b.subject_id].add(b.chapter_name);
                }
                if (b.technique_id) {
                    techMins[b.technique_id] = (techMins[b.technique_id] || 0) + (b.minutes || 0);
                }
            }
        }

        lines.push(`### Semaine du ${fmtShort(start.toISOString())} au ${fmtShort(end.toISOString())}`);
        lines.push(`${weekSessions.length} sessions · ${fmtMins(totalMins)} · ${activeDays}/7 jours actifs`);
        lines.push('');

        // Per-subject breakdown
        const sortedSubjects = Object.entries(subjectMins).sort((a, b) => b[1] - a[1]);
        if (sortedSubjects.length > 0) {
            lines.push('Matières travaillées :');
            for (const [subId, mins] of sortedSubjects) {
                const name = subjectMap.get(subId)?.name || subId;
                const chaps = subjectChapters[subId]
                    ? ` — Chapitres : ${[...subjectChapters[subId]].join(', ')}`
                    : '';
                lines.push(`  - ${name} : ${fmtMins(mins)}${chaps}`);
            }
            lines.push('');
        }

        // Top techniques
        const topTechs = Object.entries(techMins)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([id, mins]) => {
                const t = techMap.get(id);
                return t ? `${t.name} (tier ${t.tier}, ${fmtMins(mins)})` : id;
            });
        if (topTechs.length > 0) {
            lines.push(`Techniques : ${topTechs.join(' · ')}`);
            lines.push('');
        }

        // Metacog log(s) that fall in this week
        const weekMetacog = metacogLogs.filter(m => {
            const d = new Date(m.created_at);
            return d >= start && d <= end;
        });
        if (weekMetacog.length > 0) {
            const log = weekMetacog[weekMetacog.length - 1];
            lines.push('Pit Stop Métacognitif :');
            if (log.memorization_align) lines.push(`  Priorités : ${log.memorization_align}`);
            if (log.focus_drop) lines.push(`  Problèmes : ${log.focus_drop}`);
            if (log.mechanical_fix) lines.push(`  Règle Système : ${log.mechanical_fix}`);
            if (log.retention) lines.push(`  Zones à réviser : ${log.retention}`);
            if (log.free_time_hours != null) lines.push(`  Budget temps libre déclaré : ${log.free_time_hours}h/semaine`);
            lines.push('');
        }
    }

    lines.push('---');
    lines.push('');

    // ── Subject profiles ──────────────────────────────────────────────────────
    lines.push('## Profil des matières');
    lines.push('');

    for (const sub of activeSubjects) {
        lines.push(`### ${sub.name}`);

        if (sub.subject_type) lines.push(`Type : ${sub.subject_type}`);
        lines.push(`Temps total : ${fmtMins(sub.total_minutes || 0)}`);
        if (sub.last_studied_at) lines.push(`Dernière session : ${fmtShort(sub.last_studied_at)}`);

        if (sub.deadline) {
            const daysLeft = Math.ceil(
                (new Date(sub.deadline + 'T00:00:00').getTime() - now.getTime()) / 86400000
            );
            const urgency = daysLeft <= 0 ? ' [PASSÉ]' : daysLeft <= 7 ? ' [URGENT]' : daysLeft <= 30 ? ' [Proche]' : '';
            const rel = daysLeft > 0 ? `dans ${daysLeft} jours` : `il y a ${-daysLeft} jours`;
            lines.push(`Deadline : ${fmtShort(sub.deadline + 'T00:00:00')} (${rel})${urgency}`);
        }
        if (sub.result) lines.push(`Résultat : ${sub.result}`);

        // Subgoals
        const sgs = subgoalsBySubject.get(sub.id) || [];
        if (sgs.length > 0) {
            const done = sgs.filter((sg: any) => sg.done).length;
            lines.push(`Objectifs : ${done}/${sgs.length} complétés`);
            for (const sg of sgs) {
                lines.push(`  [${sg.done ? 'x' : ' '}] ${sg.text}`);
            }
        }

        // Chapters
        const subChaps = chaptersBySubject.get(sub.id) || [];
        if (subChaps.length > 0) {
            lines.push(`Chapitres (${subChaps.length}) :`);
            const sorted = [...subChaps].sort((a, b) => (b.studyCount || 0) - (a.studyCount || 0));
            const shown = sorted.slice(0, 20);
            for (const ch of shown) {
                const srs = srsState[ch.id];
                const level = srs?.level != null ? `, SRS niv.${srs.level}` : '';
                const count = ch.studyCount ? `${ch.studyCount}x` : '0x';
                const focusLabel = ch.focusType
                    ? ` [${ch.focusType === 'memorisation' ? 'Mémoriser' : ch.focusType === 'comprehension' ? 'Comprendre' : 'Savoir Faire'}]`
                    : '';
                lines.push(`  - ${ch.name} — ${count} étudié${focusLabel}${level}`);
            }
            if (sorted.length > 20) lines.push(`  ... et ${sorted.length - 20} autres chapitres`);
        }

        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // ── Full metacognition history ─────────────────────────────────────────────
    if (metacogLogs.length > 0) {
        lines.push('## Historique complet des Pit Stops Métacognitifs');
        lines.push('');
        for (const log of metacogLogs) {
            lines.push(`### ${fmtDate(log.created_at)}`);
            if (log.memorization_align) lines.push(`Priorités & Coefficients : ${log.memorization_align}`);
            if (log.focus_drop) lines.push(`Problèmes & Malaises : ${log.focus_drop}`);
            if (log.mechanical_fix) lines.push(`Règle Système : ${log.mechanical_fix}`);
            if (log.retention) lines.push(`Zones à Réviser (La Boussole) : ${log.retention}`);
            if (log.free_time_hours != null) lines.push(`Budget temps libre : ${log.free_time_hours}h/semaine`);
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    // ── Upcoming deadlines ────────────────────────────────────────────────────
    const allDeadlines = [
        ...subjects
            .filter(s => s.deadline)
            .map(s => ({ label: s.name, date: s.deadline as string })),
        ...goalDates
            .filter((g: any) => g.date)
            .map((g: any) => ({ label: g.label, date: g.date as string })),
    ]
        .map(d => ({
            ...d,
            daysLeft: Math.ceil(
                (new Date(d.date + (d.date.includes('T') ? '' : 'T00:00:00')).getTime() - now.getTime()) / 86400000
            ),
        }))
        .filter(d => d.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft);

    if (allDeadlines.length > 0) {
        lines.push('## Deadlines à venir');
        lines.push('');
        for (const d of allDeadlines) {
            const urgency = d.daysLeft <= 7 ? ' [URGENT]' : d.daysLeft <= 30 ? ' [Proche]' : '';
            lines.push(`- ${d.label} : dans ${d.daysLeft} jours${urgency}`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}
