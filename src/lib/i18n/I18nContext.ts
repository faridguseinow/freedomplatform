import { createContext, useContext } from 'react'
import type { SystemLanguage } from './translations'

export type I18nContextValue = {
  language: SystemLanguage
  setLanguage: (language: SystemLanguage) => void
  t: (value: string) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider.')
  }

  return context
}
