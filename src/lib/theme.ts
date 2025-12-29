export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_KEY = 'theme'

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** The next choice when the toggle is pressed: system, light, dark, back to system. */
export function nextTheme(current: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system'
}

export function parseTheme(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * Runs in <head> before the first paint, as a plain string, so the page
 * never flashes the wrong theme. Kept tiny and dependency free; storage can
 * throw in private windows, and then the system setting simply applies.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`
