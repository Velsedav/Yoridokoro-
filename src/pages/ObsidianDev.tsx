import { useEffect, useState } from 'react';
import { Database, FlaskConical, Sparkles, Trash2, Dumbbell, Brain } from 'lucide-react';
import { isDevMode, setDevMode, isWorkoutMode, setWorkoutMode } from '../lib/devMode';
import { MUSCLE_GROUPS, CATEGORY_LABELS, loadWorkoutLog, isMuscleEligible } from '../lib/workout';
import {
    clearSeedData, hasSeedData, seedAll, seedMetacognitionLogs,
    seedSessions, seedSubjectsAndChapters, type SeedSummary,
} from '../lib/devSeed';
import { playSFX, SFX } from '../lib/sounds';
import MetacognitionMode from '../components/MetacognitionMode';
import './ObsidianDev.css';

type SeedStatus =
    | { kind: 'idle' }
    | { kind: 'running'; label: string }
    | { kind: 'ok'; message: string }
    | { kind: 'err'; message: string };

export default function ObsidianDev() {
    const [noLimits, setNoLimits] = useState(isDevMode);
    const [workoutMode, setWorkoutModeState] = useState(isWorkoutMode);
    const [showMetacognition, setShowMetacognition] = useState(false);
    const [seedStatus, setSeedStatus] = useState<SeedStatus>({ kind: 'idle' });
    const [seedActive, setSeedActive] = useState(false);

    useEffect(() => {
        hasSeedData().then(setSeedActive).catch(() => setSeedActive(false));
    }, []);

    async function runSeed<T>(label: string, fn: () => Promise<T>, formatOk: (out: T) => string) {
        setSeedStatus({ kind: 'running', label });
        try {
            const out = await fn();
            setSeedStatus({ kind: 'ok', message: formatOk(out) });
            setSeedActive(await hasSeedData());
        } catch (e) {
            setSeedStatus({ kind: 'err', message: e instanceof Error ? e.message : String(e) });
        }
    }

    const handleSeedAll = () =>
        runSeed('Seeding all data…', seedAll, (s: SeedSummary) =>
            `Seeded ${s.subjects} subjects · ${s.chapters} chapters · ${s.sessions} sessions · ${s.metacognitionLogs} metacognition logs.`,
        );
    const handleSeedSubjects = () =>
        runSeed('Seeding subjects…', seedSubjectsAndChapters, (out) =>
            `Seeded ${out.subjects} subjects + ${out.chapters} chapters.`,
        );
    const handleSeedSessions = () =>
        runSeed('Seeding analytics sessions…', () => seedSessions(), (n) => `Seeded ${n} fake sessions.`);
    const handleSeedMetacognition = () =>
        runSeed('Seeding metacognition logs…', seedMetacognitionLogs, (n) => `Seeded ${n} metacognition logs.`);
    const handleClearSeed = () =>
        runSeed('Clearing seeded data…', async () => { await clearSeedData(); return null; }, () =>
            'Cleared all seeded data.',
        );

    function handleNoLimitsToggle() {
        const next = !noLimits;
        setDevMode(next);
        setNoLimits(next);
        playSFX(SFX.CHECK);
    }

    function handleWorkoutToggle() {
        const next = !workoutMode;
        setWorkoutMode(next);
        setWorkoutModeState(next);
        playSFX(SFX.CHECK);
    }

    const workoutLog = loadWorkoutLog();
    const eligibleCount = MUSCLE_GROUPS.filter(m => isMuscleEligible(m.id, workoutLog)).length;

    if (showMetacognition) {
        return <MetacognitionMode onComplete={() => setShowMetacognition(false)} onCancel={() => setShowMetacognition(false)} />;
    }

    const running = seedStatus.kind === 'running';

    return (
        <div className="obs-dev-page">
            <div className="obs-dev-content">
                <header className="obs-dev-head">
                    <div className="obs-dev-head-eyebrow">
                        <FlaskConical size={12} />
                        <span>Dev</span>
                    </div>
                    <h1 className="obs-dev-head-title">Bac à sable</h1>
                    <p className="obs-dev-head-subtitle">
                        Bascules de développement, données de démonstration et outils de test.
                    </p>
                </header>

                {/* ── Toggles ── */}
                <section className="obs-dev-section">
                    <h2 className="obs-dev-section-label">Bascules</h2>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">Supprimer les limites quotidiennes</div>
                            <div className="obs-dev-row-desc">Débloque les liens « Learn more » et les sections verrouillées dans le centre d'apprentissage.</div>
                        </div>
                        <button
                            className={`obs-dev-switch${noLimits ? ' is-on' : ''}`}
                            onClick={handleNoLimitsToggle}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            role="switch"
                            aria-checked={noLimits}
                        >
                            <span className="obs-dev-switch-knob" />
                            <span className="obs-dev-switch-label">{noLimits ? 'ON' : 'OFF'}</span>
                        </button>
                    </div>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">Mode Musculation 💪</div>
                            <div className="obs-dev-row-desc">Affiche une section exercices pendant les pauses. Chaque muscle ou étirement s'affiche uniquement s'il n'a pas été pratiqué depuis 2 jours ou plus.</div>
                        </div>
                        <button
                            className={`obs-dev-switch${workoutMode ? ' is-on' : ''}`}
                            onClick={handleWorkoutToggle}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            role="switch"
                            aria-checked={workoutMode}
                        >
                            <span className="obs-dev-switch-knob" />
                            <span className="obs-dev-switch-label">{workoutMode ? 'ON' : 'OFF'}</span>
                        </button>
                    </div>
                </section>

                {/* ── Metacognition ── */}
                <section className="obs-dev-section">
                    <h2 className="obs-dev-section-label">
                        <Brain size={13} className="obs-dev-section-icon" />
                        Pit Stop Métacognitif
                    </h2>
                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-desc">Lance le mode métacognition directement pour tester sans attendre la fin de semaine.</div>
                        </div>
                        <button
                            className="obs-dev-btn"
                            onClick={() => { playSFX(SFX.CHECK); setShowMetacognition(true); }}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                        >
                            Lancer
                        </button>
                    </div>
                </section>

                {/* ── Seed data ── */}
                <section className="obs-dev-section">
                    <h2 className="obs-dev-section-label">
                        <Database size={13} className="obs-dev-section-icon" />
                        Données de démonstration
                    </h2>
                    <p className="obs-dev-hint">
                        Insère des données fictives (sujets, sessions, logs métacognitifs) pour prévisualiser le style sur un profil vide.
                        Toutes les lignes utilisent l'identifiant <code>seed-*</code> et peuvent être supprimées d'un clic.
                        {seedActive && (
                            <span className="obs-dev-hint-active"> · Données de démonstration actuellement chargées.</span>
                        )}
                    </p>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">
                                <Sparkles size={13} className="obs-dev-row-title-icon" />
                                Tout générer
                            </div>
                            <div className="obs-dev-row-desc">6 sujets + chapitres, 70 jours de sessions analytiques, 12 logs métacognitifs sur 3 mois.</div>
                        </div>
                        <button className="obs-dev-btn" onClick={handleSeedAll} onMouseEnter={() => playSFX(SFX.HOVER)} disabled={running}>
                            Générer
                        </button>
                    </div>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">Sujets uniquement</div>
                            <div className="obs-dev-row-desc">Crée 6 sujets variés avec tags, type, deadline et chapitres.</div>
                        </div>
                        <button className="obs-dev-btn" onClick={handleSeedSubjects} onMouseEnter={() => playSFX(SFX.HOVER)} disabled={running}>
                            Générer
                        </button>
                    </div>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">Analytics uniquement</div>
                            <div className="obs-dev-row-desc">Insère des sessions sur les 70 derniers jours (alimente Analytics / Home). Génère les sujets d'abord si nécessaire.</div>
                        </div>
                        <button className="obs-dev-btn" onClick={handleSeedSessions} onMouseEnter={() => playSFX(SFX.HOVER)} disabled={running}>
                            Générer
                        </button>
                    </div>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">Logs métacognitifs uniquement</div>
                            <div className="obs-dev-row-desc">4 entrées par mois sur les 3 derniers mois.</div>
                        </div>
                        <button className="obs-dev-btn" onClick={handleSeedMetacognition} onMouseEnter={() => playSFX(SFX.HOVER)} disabled={running}>
                            Générer
                        </button>
                    </div>

                    <div className="obs-dev-row">
                        <div className="obs-dev-row-info">
                            <div className="obs-dev-row-title">
                                <Trash2 size={13} className="obs-dev-row-title-icon" />
                                Supprimer toutes les données de démonstration
                            </div>
                            <div className="obs-dev-row-desc">Supprime uniquement les lignes <code>seed-*</code>. Vos vraies données sont préservées.</div>
                        </div>
                        <button
                            className="obs-dev-btn is-danger"
                            onClick={handleClearSeed}
                            onMouseEnter={() => playSFX(SFX.HOVER)}
                            disabled={running || !seedActive}
                        >
                            Supprimer
                        </button>
                    </div>

                    {seedStatus.kind !== 'idle' && (
                        <p className={`obs-dev-status is-${seedStatus.kind}`}>
                            {seedStatus.kind === 'running' ? seedStatus.label : seedStatus.message}
                        </p>
                    )}
                </section>

                {/* ── Workout preview ── */}
                {workoutMode && (
                    <section className="obs-dev-section">
                        <h2 className="obs-dev-section-label">
                            <Dumbbell size={13} className="obs-dev-section-icon" />
                            Muscles & étirements disponibles
                        </h2>
                        <p className="obs-dev-hint">{eligibleCount} / {MUSCLE_GROUPS.length} éléments affichés en ce moment</p>
                        {(['upper', 'lower', 'core', 'stretch'] as const).map(cat => (
                            <div key={cat} className="obs-dev-muscle-group">
                                <div className="obs-dev-category-label">{CATEGORY_LABELS[cat]}</div>
                                <div className="obs-dev-muscle-grid">
                                    {MUSCLE_GROUPS.filter(m => m.category === cat).map(m => {
                                        const eligible = isMuscleEligible(m.id, workoutLog);
                                        return (
                                            <div key={m.id} className={`obs-dev-muscle-chip${eligible ? '' : ' is-resting'}`}>
                                                <span>{m.emoji} {m.label}</span>
                                                {!eligible && <span className="obs-dev-muscle-rest">Repos J+2</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}
