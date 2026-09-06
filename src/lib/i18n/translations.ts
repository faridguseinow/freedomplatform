export type SystemLanguage = 'ru' | 'az'

export const SYSTEM_LANGUAGE_STORAGE_KEY = 'freedom-platform:system-language'

export const languageLabels: Record<SystemLanguage, string> = {
  ru: 'Русский',
  az: 'Azərbaycan dili',
}

export const supportedLanguages: SystemLanguage[] = ['ru', 'az']

export const localeByLanguage: Record<SystemLanguage, string> = {
  ru: 'ru-RU',
  az: 'az-AZ',
}

const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined'

export function isSystemLanguage(value: unknown): value is SystemLanguage {
  return typeof value === 'string' && supportedLanguages.includes(value as SystemLanguage)
}

export function getStoredSystemLanguage(): SystemLanguage {
  if (!hasDom()) return 'ru'
  const stored = window.localStorage.getItem(SYSTEM_LANGUAGE_STORAGE_KEY)
  return isSystemLanguage(stored) ? stored : 'ru'
}

export function saveStoredSystemLanguage(language: SystemLanguage) {
  if (!hasDom()) return
  window.localStorage.setItem(SYSTEM_LANGUAGE_STORAGE_KEY, language)
  window.dispatchEvent(new CustomEvent('freedom-platform:system-language-change', { detail: language }))
}
