import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { ThemeContext, type ThemeContextValue, type ThemeMode } from './ThemeContext'
import { applyTheme, getStoredTheme, THEME_STORAGE_KEY } from './theme'

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme)

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
    setThemeState(nextTheme)
    window.dispatchEvent(new CustomEvent('freedom-platform:theme-change', { detail: nextTheme }))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  useEffect(() => {
    applyTheme(theme)

    const syncTheme = () => {
      const nextTheme = getStoredTheme()
      applyTheme(nextTheme)
      setThemeState(nextTheme)
    }

    window.addEventListener('storage', syncTheme)
    window.addEventListener('freedom-platform:theme-change', syncTheme)
    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('freedom-platform:theme-change', syncTheme)
    }
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({
    setTheme,
    theme,
    toggleTheme,
  }), [setTheme, theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
