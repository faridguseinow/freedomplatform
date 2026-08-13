import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { I18nContext, type I18nContextValue } from './I18nContext'
import type { SystemLanguage } from './translations'
import {
  getStoredSystemLanguage,
  saveStoredSystemLanguage,
  translateDom,
  translateText,
} from './translator'

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<SystemLanguage>(getStoredSystemLanguage)

  const setLanguage = (nextLanguage: SystemLanguage) => {
    saveStoredSystemLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }

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
    translateDom(document.body, language)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateDom(mutation.target.parentNode ?? document.body, language)
          continue
        }

        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element || node instanceof Text) {
            translateDom(node.parentNode ?? document.body, language)
          }
        }

        if (mutation.type === 'attributes') {
          translateDom(mutation.target.parentNode ?? document.body, language)
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

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (text) => translateText(text, language),
    }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
