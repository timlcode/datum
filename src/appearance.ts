// Appearance is a local preference, not part of the schedule file.

export type ThemeName = 'dark' | 'light' | 'hue';
export type AccentName = 'steel' | 'amber' | 'green';

export interface Appearance {
  theme: ThemeName;
  accent: AccentName;
  /** When false, glow pulses and view transitions stop. */
  motion: boolean;
}

const KEY = 'datum.appearance';

export const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'Night shift. Charcoal glass, amber kept quiet.' },
  { id: 'light', label: 'Light', hint: 'Trailer at noon. Paper, concrete, high contrast.' },
  { id: 'hue', label: 'Hue', hint: 'The accent washes the glass. Pick a color and live in it.' },
];

export const ACCENTS: { id: AccentName; label: string }[] = [
  { id: 'steel', label: 'Steel' },
  { id: 'amber', label: 'Amber' },
  { id: 'green', label: 'Green' },
];

export const DEFAULT_APPEARANCE: Appearance = { theme: 'dark', accent: 'amber', motion: true };

export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Appearance>;
    const theme = raw.theme === 'light' || raw.theme === 'hue' || raw.theme === 'dark' ? raw.theme : 'dark';
    const accent = raw.accent === 'steel' || raw.accent === 'amber' || raw.accent === 'green' ? raw.accent : 'amber';
    const motion = raw.motion === false ? false : true;
    return { theme, accent, motion };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function applyAppearance(a: Appearance = readAppearance()): Appearance {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.accent = a.accent;
  root.dataset.motion = a.motion ? 'on' : 'off';
  root.style.colorScheme = a.theme === 'light' ? 'light' : 'dark';
  return a;
}

export function writeAppearance(next: Appearance): Appearance {
  const a = applyAppearance(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* private mode */
  }
  return a;
}
