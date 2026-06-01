import { useEffect, useState } from 'react';

export type Density = 'compact' | 'regular' | 'comfy';

export interface ThemeState {
  dark: boolean;
  accent: string;
  density: Density;
}

/** Accent swatch -> oklch value applied to --accent. */
export const ACCENT_MAP: Record<string, string> = {
  '#5A6CDB': 'oklch(0.55 0.16 265)', // indigo
  '#1F8A5B': 'oklch(0.55 0.14 155)', // emerald
  '#D2691E': 'oklch(0.62 0.14 55)', //  amber
  '#7A5AE0': 'oklch(0.55 0.18 295)', // violet
};

export const ACCENT_SWATCHES = Object.keys(ACCENT_MAP);

const STORAGE_KEY = 'nyit.theme';

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
}

function load(): ThemeState {
  const fallback: ThemeState = { dark: prefersDark(), accent: '#5A6CDB', density: 'regular' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<ThemeState>) };
  } catch {
    return fallback;
  }
}

/**
 * Theme state synced to <html> data-attributes/CSS vars and persisted to
 * localStorage. Mirrors the design's Tweaks: dark mode, accent, row density.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeState>(load);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme.dark ? 'dark' : 'light');
    root.setAttribute('data-density', theme.density);
    root.style.setProperty('--accent', ACCENT_MAP[theme.accent] ?? ACCENT_MAP['#5A6CDB']);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, [theme]);

  const set = <K extends keyof ThemeState>(key: K, value: ThemeState[K]) =>
    setTheme((t) => ({ ...t, [key]: value }));

  return { theme, set } as const;
}
