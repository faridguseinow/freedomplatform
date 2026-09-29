import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../../lib/i18n/I18nContext'
import { useTheme } from '../../lib/theme/ThemeContext'
import { cn } from '../../lib/utils/cn'

type ThemeToggleProps = {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { t } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      aria-label={t(isDark ? 'theme.switchToLight' : 'theme.switchToDark')}
      aria-pressed={isDark}
      className={cn(
        'flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700',
        compact ? 'justify-start' : 'justify-between',
        className,
      )}
      onClick={toggleTheme}
      type="button"
    >
      <span className="flex items-center gap-2">
        {isDark ? (
          <Moon aria-hidden="true" className="size-4 text-emerald-700" />
        ) : (
          <Sun aria-hidden="true" className="size-4 text-amber-600" />
        )}
        <span>{t('theme.darkTheme')}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          isDark ? 'bg-emerald-700' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'theme-toggle-thumb absolute left-0 top-1 size-4 rounded-full bg-white shadow-sm transition-transform',
            isDark ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}
