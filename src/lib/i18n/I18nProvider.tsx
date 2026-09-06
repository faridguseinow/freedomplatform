import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n'
import { I18nContext, type I18nContextValue } from './I18nContext'
import type { SystemLanguage } from './translations'
import {
  getCurrentLocale,
  translateDom,
  translateText,
} from './translator'
import { getStoredSystemLanguage, saveStoredSystemLanguage } from './translations'

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<SystemLanguage>(getStoredSystemLanguage)

  const setLanguage = useCallback((nextLanguage: SystemLanguage) => {
    saveStoredSystemLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }, [])

  useEffect(() => {
    const syncLanguage = () => setLanguageState(getStoredSystemLanguage())
    window.addEventListener('storage', syncLanguage)
    window.addEventListener('freedom-platform:system-language-change', syncLanguage)
    return () => {
      window.removeEventListener('storage', syncLanguage)
      window.removeEventListener('freedom-platform:system-language-change', syncLanguage)
    }
  }, [])

  useEffect(() => {
    void i18n.changeLanguage(language)
    document.documentElement.lang = language
    translateDom(document.body, language)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          translateDom(mutation.target.parentNode ?? document.body, language)
          continue
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) translateDom(node, language)
          else if (node instanceof Text) translateDom(node.parentNode ?? document.body, language)
        }
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-label', 'placeholder', 'title', 'alt'],
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: getCurrentLocale(language),
    setLanguage,
    t: (text, options) => translateText(text, language, options),
  }), [language, setLanguage])

  return (
    <I18nextProvider i18n={i18n}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </I18nextProvider>
  )
}
