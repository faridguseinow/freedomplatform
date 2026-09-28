import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../../lib/i18n/I18nContext'
import { supportedLanguages, type SystemLanguage } from '../../lib/i18n/translations'

type LanguageSwitcherProps = {
  className?: string
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { language, setLanguage, t } = useI18n()

  const changeLanguage = (nextLanguage: SystemLanguage) => {
    setLanguage(nextLanguage)

    const searchParams = new URLSearchParams(location.search)
    searchParams.set('lang', nextLanguage)
    navigate(
      { pathname: location.pathname, search: searchParams.toString(), hash: location.hash },
      { replace: true },
    )
  }

  return (
    <div
      aria-label={t('ui.yazyk_interfeysa_d9396e7')}
      className={`flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm ${className}`}
      role="group"
    >
      {supportedLanguages.map((item) => (
        <button
          aria-label={`${t('ui.yazyk_ed3f0e5')}: ${item.toUpperCase()}`}
          aria-pressed={language === item}
          className={[
            'grid h-8 min-w-9 place-items-center rounded-full px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700',
            language === item
              ? 'bg-emerald-700 text-white'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
          ].join(' ')}
          key={item}
          onClick={() => changeLanguage(item)}
          type="button"
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
