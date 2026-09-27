import { useCallback, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
    theme: ThemeMode;
    isDark: boolean;
}

// Module-level singleton state
let currentTheme: ThemeMode = 'system';
let currentIsDark: boolean = false;
let isInitialized = false;
const listeners = new Set<() => void>();

function getSystemPrefersDark(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getStoredTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'system';
    try {
        const saved = localStorage.getItem('theme') as ThemeMode | null;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
            return saved;
        }
    } catch {}
    return 'system';
}

function calculateIsDark(mode: ThemeMode): boolean {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return getSystemPrefersDark();
}

function updateDOM(darkActive: boolean) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (darkActive) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

function initThemeStore() {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    // Read initial theme and apply immediately
    currentTheme = getStoredTheme();
    currentIsDark = document.documentElement.classList.contains('dark') || calculateIsDark(currentTheme);
    updateDOM(currentIsDark);

    // 1. Cross-tab storage synchronization
    window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === 'theme') {
            const newTheme = (e.newValue as ThemeMode) || 'system';
            setThemeInternal(newTheme, false);
        }
    });

    // 2. OS color scheme change listener
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
        if (currentTheme === 'system') {
            const nextDark = getSystemPrefersDark();
            if (nextDark !== currentIsDark) {
                currentIsDark = nextDark;
                updateDOM(currentIsDark);
                notifyListeners();
            }
        }
    });
}

function notifyListeners() {
    for (const listener of listeners) {
        listener();
    }
}

function setThemeInternal(newTheme: ThemeMode, persist: boolean = true) {
    if (persist && typeof window !== 'undefined') {
        try {
            localStorage.setItem('theme', newTheme);
        } catch {}
    }

    const nextIsDark = calculateIsDark(newTheme);
    const changed = currentTheme !== newTheme || currentIsDark !== nextIsDark;

    currentTheme = newTheme;
    currentIsDark = nextIsDark;

    // Use native View Transition API if supported for butter-smooth GPU crossfade
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
        try {
            (document as any).startViewTransition(() => {
                updateDOM(nextIsDark);
            });
        } catch {
            updateDOM(nextIsDark);
        }
    } else {
        updateDOM(nextIsDark);
    }

    if (changed) {
        notifyListeners();
    }
}

function subscribe(callback: () => void) {
    initThemeStore();
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

let cachedSnapshot: ThemeState = { theme: 'system', isDark: false };
function getSnapshot(): ThemeState {
    initThemeStore();
    if (cachedSnapshot.theme !== currentTheme || cachedSnapshot.isDark !== currentIsDark) {
        cachedSnapshot = { theme: currentTheme, isDark: currentIsDark };
    }
    return cachedSnapshot;
}

const serverSnapshot: ThemeState = { theme: 'system', isDark: false };
function getServerSnapshot(): ThemeState {
    return serverSnapshot;
}

export function useTheme() {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const setTheme = useCallback((newTheme: ThemeMode) => {
        setThemeInternal(newTheme, true);
    }, []);

    const toggleTheme = useCallback(() => {
        const nextMode: ThemeMode = currentIsDark ? 'light' : 'dark';
        setThemeInternal(nextMode, true);
    }, []);

    return {
        theme: state.theme,
        isDark: state.isDark,
        setTheme,
        toggleTheme,
    };
}
