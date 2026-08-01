// ── Sound Effect Registry ──
// Naming convention: {theme}_{category}_{action}
// Themes: glass_ | term_
// Categories: ui_ | session_ | timer_ | reward_ | bingo_

export const SFX = {
    // UI — ambient/functional
    HOVER:          'glass_ui_hover',
    CHECK:          'glass_ui_check',
    CANCEL:         'glass_ui_cancel',
    DROP:           'glass_ui_drop',
    DRAG_UP:        'glass_ui_drag_up',
    DRAG_DOWN:      'glass_ui_drag_down',
    ENTER_MENU:     'glass_enter_menu',
    // Session
    SESSION_START:  'glass_session_start',
    SESSION_SWITCH: 'glass_session_switch',
    SESSION_END:    'glass_session_end',
    SESSION_FINISH: 'glass_session_finish',
    ENTER_LESSON:   'glass_session_enter_lesson',
    // Timer — play over ongoing sounds
    WARN_10:        'glass_timer_warn10',
    FIVE_MIN_ALERT: 'glass_timer_five_min',
    INTERVAL_WORK:  'glass_timer_interval_work',
    INTERVAL_REST:  'glass_timer_interval_rest',
    // Reward
    REWARD_CORRECT: 'glass_reward_correct',
    REWARD_PERFECT: 'glass_reward_perfect',
    // Bingoals
    BINGO_CHECK:    'glass_bingo_check',
    BINGO_LINE:     'glass_bingo_line',
    BINGO_COMPLETE: 'glass_bingo_complete',
    BINGO_ADD:      'glass_bingo_add',
} as const;

export type SoundEffect = typeof SFX[keyof typeof SFX];

/** Human-friendly display names for each sound effect */
export const SFX_LABELS: Record<SoundEffect, string> = {
    glass_ui_hover:               'Hover',
    glass_ui_check:               'Check',
    glass_ui_cancel:              'Cancel / Error',
    glass_ui_drop:                'Drop',
    glass_ui_drag_up:             'Drag Up',
    glass_ui_drag_down:           'Drag Down',
    glass_enter_menu:             'Open Menu',
    glass_session_start:          'Start',
    glass_session_switch:         'Switch Task',
    glass_session_end:            'End',
    glass_session_finish:         'Finish',
    glass_session_enter_lesson:   'Enter Lesson',
    glass_timer_warn10:           '10s Warning',
    glass_timer_five_min:         '5-Min Alert',
    glass_timer_interval_work:    'Work Interval',
    glass_timer_interval_rest:    'Rest Interval',
    glass_reward_correct:         'Correct Answer',
    glass_reward_perfect:         'Perfect Score',
    glass_bingo_check:            'Check Goal',
    glass_bingo_line:             'Complete Line',
    glass_bingo_complete:         'Bingo!',
    glass_bingo_add:              'Add Goal',
};

export interface SFXGroup {
    labelKey: string;
    icon: string;
    effects: SoundEffect[];
}

/** Logical groups for rendering the audio settings panel */
export const SFX_GROUPS: SFXGroup[] = [
    {
        labelKey: 'settings.audio_group_ui',
        icon: '🖱️',
        effects: [
            SFX.HOVER, SFX.CHECK, SFX.CANCEL,
            SFX.DROP, SFX.DRAG_UP, SFX.DRAG_DOWN, SFX.ENTER_MENU,
        ],
    },
    {
        labelKey: 'settings.audio_group_session',
        icon: '📚',
        effects: [
            SFX.SESSION_START, SFX.SESSION_SWITCH,
            SFX.SESSION_END, SFX.SESSION_FINISH, SFX.ENTER_LESSON,
        ],
    },
    {
        labelKey: 'settings.audio_group_timer',
        icon: '⏱️',
        effects: [
            SFX.WARN_10, SFX.FIVE_MIN_ALERT,
            SFX.INTERVAL_WORK, SFX.INTERVAL_REST,
        ],
    },
    {
        labelKey: 'settings.audio_group_rewards',
        icon: '⭐',
        effects: [SFX.REWARD_CORRECT, SFX.REWARD_PERFECT],
    },
    {
        labelKey: 'settings.audio_group_bingoals',
        icon: '🎯',
        effects: [SFX.BINGO_CHECK, SFX.BINGO_LINE, SFX.BINGO_COMPLETE, SFX.BINGO_ADD],
    },
];

// ── Volume Management ──

/** Audio profile override — 'auto' follows visual theme, others force that profile regardless of theme */
export type AudioProfile = 'auto' | 'glass' | 'terminal';

export interface VolumeSettings {
    master: number; // 0–100
    individual: Partial<Record<SoundEffect, number>>; // 0–100 per effect
    profile: AudioProfile;
    /** Per-effect absolute paths to user-supplied audio files that override the built-in pack */
    custom: Partial<Record<SoundEffect, string>>;
}

const DEFAULT_VOLUMES: VolumeSettings = {
    master: 100,
    individual: {},
    profile: 'auto',
    custom: {},
};

let volumeSettings: VolumeSettings = DEFAULT_VOLUMES;

export function loadVolumeSettings(): VolumeSettings {
    try {
        const saved = localStorage.getItem('study-buddy-volume');
        if (saved) {
            volumeSettings = { ...DEFAULT_VOLUMES, ...JSON.parse(saved) };
            return volumeSettings;
        }
    } catch { }
    return DEFAULT_VOLUMES;
}

export function saveVolumeSettings(settings: VolumeSettings) {
    const prev = volumeSettings;
    volumeSettings = settings;
    localStorage.setItem('study-buddy-volume', JSON.stringify(settings));

    // Reconcile the custom-sound cache with what's now in settings
    const prevCustom = prev.custom ?? {};
    const nextCustom = settings.custom ?? {};
    const keys = new Set([...Object.keys(prevCustom), ...Object.keys(nextCustom)]) as Set<SoundEffect>;
    for (const effect of keys) {
        if (prevCustom[effect] !== nextCustom[effect]) {
            if (nextCustom[effect]) void loadCustomSound(effect, nextCustom[effect]!);
            else clearCustomSound(effect);
        }
    }
}

export function getEffectiveVolume(effectName: SoundEffect): number {
    const master = (volumeSettings.master ?? 100) / 100;
    const individual = (volumeSettings.individual[effectName] ?? 100) / 100;
    return master * individual;
}

// Initialize on load
loadVolumeSettings();

// ── Theme Resolution ──

/** Module-level active theme — updated by SettingsProvider on every theme change */
let currentTheme: string = 'glassmorphism';
export function setAudioTheme(theme: string) { currentTheme = theme; }

/** Built-in sound files that are recorded and available on disk, without extension. */
const BUILT_IN_SOUNDS = new Set([
    // Glass UI
    'glass_ui_hover',
    'glass_ui_check',
    'glass_ui_cancel',
    'glass_ui_drop',
    'glass_ui_drag_up',
    'glass_ui_drag_down',
    'glass_enter_menu',
    // Glass Session
    'glass_session_start',
    'glass_session_switch',
    'glass_session_end',
    'glass_session_finish',
    'glass_session_enter_lesson',
    // Glass Timer
    'glass_timer_warn10',
    // Glass Rewards
    'glass_reward_correct',
    'glass_reward_perfect',
    // Glass Bingoals
    'glass_bingo_check',
    // Terminal UI
    'term_ui_hover',
    'term_ui_check',
    'term_ui_cancel',
    'term_ui_drop',
    'term_ui_drag_up',
    'term_ui_drag_down',
    // Navigation
    'term_enter_menu',
    // Session
    'term_session_start',
    'term_session_switch',
    'term_session_end',
    'term_session_enter_lesson',
    // Timer
    'term_timer_warn10',
    'term_timer_five_min',
    'term_timer_interval_work',
    'term_timer_interval_rest',
    // Bingo
    'term_bingo_check',
]);

const MISSING_SOUND_FALLBACKS: Partial<Record<SoundEffect, { glass: string; terminal: string }>> = {
    glass_timer_five_min: { glass: 'term_timer_five_min', terminal: 'term_timer_five_min' },
    glass_timer_interval_work: { glass: 'term_timer_interval_work', terminal: 'term_timer_interval_work' },
    glass_timer_interval_rest: { glass: 'term_timer_interval_rest', terminal: 'term_timer_interval_rest' },
    glass_bingo_line: { glass: 'glass_bingo_check', terminal: 'term_bingo_check' },
    glass_bingo_complete: { glass: 'glass_bingo_check', terminal: 'term_bingo_check' },
    glass_bingo_add: { glass: 'glass_bingo_check', terminal: 'term_bingo_check' },
};

/** Resolve the actual file name to play, swapping glass_ → term_ when the active profile requests terminal */
function resolveFileName(effectName: SoundEffect, theme: string): string {
    const profile = volumeSettings.profile ?? 'auto';
    let wantTerminal: boolean;
    if (profile === 'glass') wantTerminal = false;
    else if (profile === 'terminal') wantTerminal = true;
    else wantTerminal = theme.includes('terminal');

    if (!wantTerminal) {
        if (BUILT_IN_SOUNDS.has(effectName)) return effectName;
        return MISSING_SOUND_FALLBACKS[effectName]?.glass ?? effectName;
    }

    const termVariant = effectName.replace(/^glass_/, 'term_');
    if (BUILT_IN_SOUNDS.has(termVariant)) return termVariant;
    if (BUILT_IN_SOUNDS.has(effectName)) return effectName;
    return MISSING_SOUND_FALLBACKS[effectName]?.terminal ?? effectName;
}

// ── Custom user-supplied sounds ──

/** Audio elements keyed by effect for user-overridden sounds. Built from blob URLs. */
const customAudioCache: Partial<Record<SoundEffect, HTMLAudioElement>> = {};
/** Blob URLs we own, so we can revoke them when replaced or cleared. */
const customBlobUrls: Partial<Record<SoundEffect, string>> = {};

function guessMimeFromPath(path: string): string {
    const ext = path.toLowerCase().split('.').pop() ?? '';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
    if (ext === 'm4a' || ext === 'aac') return 'audio/aac';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'opus') return 'audio/opus';
    if (ext === 'webm') return 'audio/webm';
    return 'audio/mpeg';
}

/** Load a user-supplied sound file from disk into the in-memory cache. Idempotent: replaces any prior entry. */
export async function loadCustomSound(effect: SoundEffect, filePath: string): Promise<boolean> {
    try {
        const fsAPI = (window as any).electronAPI?.fs;
        if (!fsAPI) return false;
        const bytes: Uint8Array = await fsAPI.readFile(filePath);
        const blob = new Blob([bytes], { type: guessMimeFromPath(filePath) });
        const url = URL.createObjectURL(blob);

        // Revoke any previous URL for this effect
        if (customBlobUrls[effect]) URL.revokeObjectURL(customBlobUrls[effect]!);

        customBlobUrls[effect] = url;
        customAudioCache[effect] = new Audio(url);
        return true;
    } catch (e) {
        console.warn(`Could not load custom sound for ${effect} from ${filePath}:`, e);
        return false;
    }
}

/** Drop a user-supplied sound from the cache and revoke its blob URL. */
export function clearCustomSound(effect: SoundEffect) {
    const url = customBlobUrls[effect];
    if (url) URL.revokeObjectURL(url);
    delete customBlobUrls[effect];
    delete customAudioCache[effect];
}

/** Preload every custom sound listed in settings. Call once at app startup after settings hydrate. */
export async function preloadCustomSounds(): Promise<void> {
    const custom = volumeSettings.custom ?? {};
    await Promise.all(
        (Object.entries(custom) as [SoundEffect, string | undefined][])
            .filter(([, p]) => !!p)
            .map(([effect, p]) => loadCustomSound(effect, p!))
    );
}

// ── Audio Cache & Playback ──

const audioCache: { [key: string]: HTMLAudioElement } = {};
let lastHoverPlayedAt = 0;

/** Stop all currently playing sounds */
export function stopAllSounds() {
    for (const key in audioCache) {
        const audio = audioCache[key];
        if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
    for (const key of Object.keys(customAudioCache) as SoundEffect[]) {
        const audio = customAudioCache[key];
        if (audio && !audio.paused) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}

/** Timer-category sounds play over ongoing audio — they are never blocked by stopAllSounds */
function isTimerSound(effectName: string): boolean {
    return effectName.includes('timer_');
}

export function playSFX(effectName: SoundEffect, theme: string = currentTheme) {
    try {
        // A delegated hover listener covers the whole application, while a few
        // legacy controls still call playSFX themselves. Coalesce those events so
        // entering one control always produces one clean sound instead of a stack.
        if (effectName === SFX.HOVER) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (now - lastHoverPlayedAt < 55) return;
            lastHoverPlayedAt = now;
        }

        // Timer and hover sounds play over ongoing audio; all others stop the current sound first
        if (!isTimerSound(effectName) && effectName !== 'glass_ui_hover') {
            stopAllSounds();
        }

        const custom = customAudioCache[effectName];
        const audio = custom ?? (() => {
            const resolved = resolveFileName(effectName, theme);
            const filePath = `audio/${resolved}.mp3`;
            if (!audioCache[filePath]) audioCache[filePath] = new Audio(filePath);
            return audioCache[filePath];
        })();

        audio.volume = getEffectiveVolume(effectName);
        audio.currentTime = 0;

        audio.play().catch(e => {
            console.warn(`Could not play sound for ${effectName}:`, e.message);
        });
    } catch (e) {
        console.error("Audio playback error:", e);
    }
}

/** Play a specific SFX for testing in settings — respects current theme */
export function testSFX(effectName: SoundEffect) {
    playSFX(effectName);
}
