export type PlatformPreferences = {
  defaultLocale: 'ru' | 'az' | 'en'
  defaultTimezone: string
  defaultCurrency: string
}

const storageKey = 'freedom-platform.platform-settings'

export const defaultPlatformPreferences: PlatformPreferences = {
  defaultLocale: 'az',
  defaultTimezone: 'Asia/Baku',
  defaultCurrency: 'AZN',
}

export function loadPlatformPreferences(): PlatformPreferences {
  if (typeof window === 'undefined') return defaultPlatformPreferences

  const stored = window.localStorage.getItem(storageKey)
  if (!stored) return defaultPlatformPreferences

  try {
    const parsed = JSON.parse(stored) as Partial<PlatformPreferences>
    const defaultLocale = ['az', 'ru', 'en'].includes(parsed.defaultLocale ?? '')
      ? parsed.defaultLocale as PlatformPreferences['defaultLocale']
      : defaultPlatformPreferences.defaultLocale
    const defaultTimezone = parsed.defaultTimezone?.trim() || defaultPlatformPreferences.defaultTimezone
    const defaultCurrency = parsed.defaultCurrency?.trim().toUpperCase() || defaultPlatformPreferences.defaultCurrency

    return { defaultCurrency, defaultLocale, defaultTimezone }
  } catch {
    window.localStorage.removeItem(storageKey)
    return defaultPlatformPreferences
  }
}

export function savePlatformPreferences(preferences: PlatformPreferences) {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences))
}
