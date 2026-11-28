import { ArrowLeft, Building2, Languages, LayoutDashboard, LogOut } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher'
import { ThemeToggle } from '../../components/common/ThemeToggle'
import { useI18n } from '../../lib/i18n/I18nContext'
import { cn } from '../../lib/utils/cn'

type UserMenuPanelProps = {
  className?: string
  displayName: string
  roleLabel: string | null
  organizationName: string | null
  showPreferences: boolean
  onExitOrganizationView?: (() => void) | undefined
  onBackToAdmin?: (() => void) | undefined
  onSignOut: () => void
  /** Направление появления: из-под кнопки вверх (боковое/мобильное меню) или вниз (шапка). */
  origin: 'bottom' | 'top'
}

function MenuAction({
  children,
  icon,
  onClick,
  tone = 'default',
}: {
  children: ReactNode
  icon: ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      className={cn(
        'flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700',
        tone === 'danger' ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="text-sm font-medium">{children}</span>
    </button>
  )
}

export const UserMenuPanel = forwardRef<HTMLDivElement, UserMenuPanelProps>(function UserMenuPanel(
  {
    className,
    displayName,
    onBackToAdmin,
    onExitOrganizationView,
    onSignOut,
    organizationName,
    origin,
    roleLabel,
    showPreferences,
  },
  ref,
) {
  const { t } = useI18n()

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl',
        origin === 'bottom' ? 'animate-pop-up origin-bottom' : 'animate-pop-down origin-top',
        className,
      )}
      ref={ref}
      role="menu"
    >
      <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
          {roleLabel ? <p className="truncate text-xs text-slate-500">{roleLabel}</p> : null}
          {organizationName ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <Building2 aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{organizationName}</span>
            </p>
          ) : null}
        </div>
      </div>

      {showPreferences ? (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 border-b border-slate-100 px-1 pb-1.5 pt-1">
          <div className="flex min-h-10 min-w-0 items-center justify-between gap-2 px-1.5">
            <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium text-slate-700">
              <Languages aria-hidden="true" className="size-4 text-slate-500" />
              {t('ui.yazyk_ed3f0e5')}
            </span>
            <LanguageSwitcher className="shrink-0 shadow-none" />
          </div>
          <ThemeToggle className="w-full border-0 bg-transparent px-1.5 shadow-none hover:bg-slate-100" />
        </div>
      ) : null}

      {onExitOrganizationView ? (
        <MenuAction icon={<ArrowLeft aria-hidden="true" className="size-4 text-slate-500" />} onClick={onExitOrganizationView}>
          {t('ui.vernutsya_v_platformu_07e0df4')}
        </MenuAction>
      ) : null}
      {onBackToAdmin ? (
        <MenuAction icon={<LayoutDashboard aria-hidden="true" className="size-4 text-slate-500" />} onClick={onBackToAdmin}>
          {t('ui.v_adminku_52b63ae')}
        </MenuAction>
      ) : null}
      <MenuAction icon={<LogOut aria-hidden="true" className="size-4" />} onClick={onSignOut} tone="danger">
        {t('ui.vyyti_026abb1')}
      </MenuAction>
    </div>
  )
})
