import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n/I18nContext'
import { isSystemLanguage } from '../../lib/i18n/translations'

export function LanguageUrlSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const { language, setLanguage } = useI18n()

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const requestedLanguage = searchParams.get('lang')

    if (isSystemLanguage(requestedLanguage) && requestedLanguage !== language) {
      setLanguage(requestedLanguage)
      return
    }

    if (requestedLanguage === language) return

    searchParams.set('lang', language)
    navigate(
      { pathname: location.pathname, search: searchParams.toString(), hash: location.hash },
      { replace: true },
    )
  }, [language, location.hash, location.pathname, location.search, navigate, setLanguage])

  return null
}
