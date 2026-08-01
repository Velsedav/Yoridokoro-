import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { setAudioTheme, preloadCustomSounds } from './sounds';
import { applyYoridokoroTheme, getYoridokoroTheme, type YoridokoroThemeId } from './yoridokoroThemes';

export type Theme = YoridokoroThemeId;

/** Classic theme ids removed in the redesign unification → obsidian equivalents. */
/** Map a possibly-legacy stored theme id to a valid current Theme. */
export function migrateTheme(theme: string): Theme {
  if (theme === 'obsidian-kokedera') return 'kokedera';
  return getYoridokoroTheme(theme).id;
}

export type WeekStart = 'monday' | 'sunday';
export type MetacognitionDay = 'friday' | 'saturday' | 'sunday';
const METACOGNITION_FRIDAY_MIGRATION_KEY = 'study-buddy-metacognition-friday-default-v1';

export function migrateMetacognitionDay(day: MetacognitionDay | undefined, migrationDone: boolean): MetacognitionDay {
  if (migrationDone) return day ?? 'friday';
  // Saturday was the historical default. Move existing default installs to the
  // intended Friday-Sunday window once; users can still choose another day later.
  return day === 'saturday' || day === undefined ? 'friday' : day;
}

interface Settings {
    theme: Theme;
    weekStart: WeekStart;
    language: string;
    zoomLevel: number;
    metacognitionDay: MetacognitionDay;
    performanceMode: boolean;
}

const isLinux = (window as any).electronAPI?.platform === 'linux';

const defaultSettings: Settings = {
    theme: 'keystone',
    weekStart: 'monday',
    language: 'en',
    zoomLevel: 100,
    metacognitionDay: 'friday',
    performanceMode: isLinux,
};

interface SettingsContextType extends Settings {
    setTheme: (t: Theme) => void;
    setWeekStart: (w: WeekStart) => void;
    setLanguage: (l: string) => void;
    setZoomLevel: (z: number) => void;
    setMetacognitionDay: (d: MetacognitionDay) => void;
    setPerformanceMode: (v: boolean) => void;
    updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettingsState] = useState<Settings>(() => {
        const saved = localStorage.getItem('study-buddy-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const migrationDone = localStorage.getItem(METACOGNITION_FRIDAY_MIGRATION_KEY) === '1';
                const merged = {
                    ...defaultSettings,
                    ...parsed,
                    metacognitionDay: migrateMetacognitionDay(parsed.metacognitionDay, migrationDone),
                };
                if (!migrationDone) localStorage.setItem(METACOGNITION_FRIDAY_MIGRATION_KEY, '1');
                return { ...merged, theme: migrateTheme(merged.theme) };
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
        return defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('study-buddy-settings', JSON.stringify(settings));

        applyYoridokoroTheme(settings.theme);
        setAudioTheme(settings.theme);
        (document.body.style as any).zoom = (settings.zoomLevel / 100).toString();
        document.documentElement.classList.toggle('linux-perf', settings.performanceMode);
    }, [settings]);

    // Preload user-supplied custom sounds once at startup
    useEffect(() => {
        void preloadCustomSounds();
    }, []);

    // Global Ctrl+Scroll listener
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setSettingsState(prev => {
                    const newZoom = e.deltaY > 0
                        ? Math.max(50, prev.zoomLevel - 10)
                        : Math.min(200, prev.zoomLevel + 10);
                    return { ...prev, zoomLevel: newZoom };
                });
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettingsState(s => ({ ...s, [key]: value }));
    };

    return (
        <SettingsContext.Provider value={{
            ...settings,
            setTheme: (t) => updateSetting('theme', t),
            setWeekStart: (w) => updateSetting('weekStart', w),
            setLanguage: (l) => updateSetting('language', l),
            setZoomLevel: (z) => updateSetting('zoomLevel', z),
            setMetacognitionDay: (d) => updateSetting('metacognitionDay', d),
            setPerformanceMode: (v) => updateSetting('performanceMode', v),
            updateSetting
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) throw new Error("useSettings must be used within SettingsProvider");
    return context;
}
