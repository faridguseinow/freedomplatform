import type { ThemeMode } from './ThemeContext'

export const THEME_STORAGE_KEY = 'freedom-platform:theme'

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark'

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(stored) ? stored : 'light'
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('theme-dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}
