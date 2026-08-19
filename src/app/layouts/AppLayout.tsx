import { ArrowLeft, LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmployeeLockScreen } from '../../features/employee/components/EmployeeLockScreen'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../lib/i18n/I18nContext'
import { ROLE_LABEL, USER_ROLES } from '../../types/roles'
import { pageTitles, type NavItem } from '../router/routes'

type AppLayoutProps = {
  productArea: string
  navItems: NavItem[]
  hideHeader?: boolean
  fullWidthContent?: boolean
}

const isActivePath = (currentPath: string, item: NavItem) => {
  if (item.end) {
    return currentPath === item.path
  }

  return currentPath === item.path || currentPath.startsWith(`${item.path}/`)
}

export function AppLayout({ fullWidthContent = false, hideHeader = false, navItems, productArea }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearOrganizationView, currentOrganization, profile, role, signOut, user } = useAuth()
  const { t } = useI18n()
  const sidebarProfileMenuRef = useRef<HTMLDivElement | null>(null)
  const headerProfileMenuRef = useRef<HTMLDivElement | null>(null)
  const sidebarStorageKey = `freedom.sidebarCollapsed.${productArea}`
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(sidebarStorageKey) === '1'
  })
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const normalizedPath =
    currentOrganization && location.pathname.startsWith(`/${currentOrganization.slug}/`)
      ? location.pathname.replace(`/${currentOrganization.slug}`, '')
      : location.pathname
  const currentTitle =
    pageTitles.find((item) => item.path === normalizedPath)?.label ?? productArea
  const productAreaLabel = t(productArea)

  const displayName = profile?.full_name || user?.email || 'Пользователь'
  const mobileNavItems = navItems.filter((item) => item.mobile !== false)
  const isSettingsPage = normalizedPath === '/platform/settings' || normalizedPath.endsWith('/settings')
  const isPlatformOwnerOrganizationView =
    role === USER_ROLES.platformOwner && Boolean(currentOrganization)
  const isOrganizationAdminEmployeeView =
    role === USER_ROLES.organizationAdmin &&
    productArea === 'Рабочее место' &&
    Boolean(currentOrganization)

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed, sidebarStorageKey])

  useEffect(() => {
    if (!isUserMenuOpen) return

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (
        sidebarProfileMenuRef.current?.contains(target) ||
        headerProfileMenuRef.current?.contains(target)
      ) {
        return
      }

      setIsUserMenuOpen(false)
    }

    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', closeFromOutside)
    window.addEventListener('keydown', closeFromEscape)
    return () => {
      window.removeEventListener('pointerdown', closeFromOutside)
      window.removeEventListener('keydown', closeFromEscape)
    }
  }, [isUserMenuOpen])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleExitOrganizationView = () => {
    clearOrganizationView()
    setIsUserMenuOpen(false)
    navigate('/platform', { replace: true })
  }

  const handleBackToAdmin = () => {
    setIsUserMenuOpen(false)
    navigate(currentOrganization?.slug ? `/${currentOrganization.slug}/admin` : '/admin', { replace: true })
  }

  return (
    <div className="min-h-svh bg-slate-50 text-slate-950">
      <div className="flex min-h-svh">
        <aside
          className={[
            'sticky top-0 hidden h-svh shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 md:flex md:flex-col',
            sidebarCollapsed ? 'w-16' : 'w-64',
          ].join(' ')}
        >
          <div className={sidebarCollapsed ? 'border-b border-slate-200 p-3' : 'border-b border-slate-200 px-5 py-4'}>
            <div className={sidebarCollapsed ? 'flex justify-center' : 'flex items-start justify-between gap-3'}>
              {sidebarCollapsed ? null : (
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">Freedom Platform</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {currentOrganization?.name ?? productAreaLabel}
                  </p>
                </div>
              )}
              <button
                aria-label={sidebarCollapsed ? 'Открыть боковое меню' : 'Скрыть боковое меню'}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                onClick={() => setSidebarCollapsed((current) => !current)}
                title={sidebarCollapsed ? 'Открыть меню' : 'Скрыть меню'}
                type="button"
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="size-4" />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
          </div>

          <nav className={sidebarCollapsed ? 'grid gap-1 px-2 py-4' : 'grid gap-1 px-3 py-4'} aria-label={productAreaLabel}>
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  [
                    'flex min-h-10 items-center rounded-md text-sm font-medium transition-colors',
                    sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    isActive
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  ].join(' ')
                }
                key={item.path}
                title={sidebarCollapsed ? t(item.label) : undefined}
                to={item.path}
                {...(item.end ? { end: true } : {})}
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                {sidebarCollapsed ? null : <span className="truncate">{t(item.label)}</span>}
              </NavLink>
            ))}
          </nav>

          {hideHeader ? (
            <div className="mt-auto border-t border-slate-200">
              {role === 'employee' ? (
                <div className="border-b border-slate-200 py-2">
                  <EmployeeLockScreen collapsed={sidebarCollapsed} />
                </div>
              ) : null}

              <div className="relative p-3" ref={sidebarProfileMenuRef}>
                <button
                  className={[
                    'flex min-h-11 list-none items-center rounded-md text-left text-sm outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-700',
                    sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-2',
                  ].join(' ')}
                  onClick={() => setIsUserMenuOpen((current) => !current)}
                  title={sidebarCollapsed ? displayName : undefined}
                  type="button"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                    <UserRound aria-hidden="true" className="size-4" />
                  </span>
                  {sidebarCollapsed ? null : (
                    <span className="grid min-w-0">
                      <span className="truncate font-medium text-slate-800">{displayName}</span>
                      <span className="text-xs text-slate-500">
                        {role ? ROLE_LABEL[role] : 'Роль не задана'}
                      </span>
                    </span>
                  )}
                </button>

                {isUserMenuOpen ? (
                  <div
                    style={{ zIndex: 9999 }}
                    className={[
                      'absolute rounded-lg border border-slate-200 bg-white p-2 shadow-lg',
                      sidebarCollapsed
                        ? 'bottom-0 left-full ml-2 w-64'
                        : 'bottom-full left-0 mb-2 w-full',
                    ].join(' ')}
                  >
                    <div className="border-b border-slate-100 px-2 pb-2">
                      <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {role ? ROLE_LABEL[role] : 'Роль не задана'}
                      </p>
                      {currentOrganization ? (
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {currentOrganization.name} · {currentOrganization.status}
                        </p>
                      ) : null}
                    </div>
                    {isPlatformOwnerOrganizationView ? (
                      <Button
                        className="mt-2 w-full justify-start px-2"
                        onClick={handleExitOrganizationView}
                        type="button"
                        variant="secondary"
                      >
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        Вернуться в платформу
                      </Button>
                    ) : null}
                    {isOrganizationAdminEmployeeView ? (
                      <Button
                        className="mt-2 w-full justify-start px-2"
                        onClick={handleBackToAdmin}
                        type="button"
                        variant="secondary"
                      >
                        <ArrowLeft aria-hidden="true" className="size-4" />
                        В админку
                      </Button>
                    ) : null}
                    <Button
                      className="mt-2 w-full justify-start px-2"
                      onClick={handleSignOut}
                      type="button"
                      variant="danger"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                      Выйти
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {hideHeader ? null : (
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 md:hidden">
                    <Menu aria-hidden="true" className="size-4" />
                    {productAreaLabel}
                  </div>
                  <h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl">
                    {t(currentTitle)}
                  </h1>
                </div>

                <div className="relative" ref={headerProfileMenuRef}>
                  <button
                    className="flex min-h-10 list-none items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-700"
                    onClick={() => setIsUserMenuOpen((current) => !current)}
                    type="button"
                  >
                    <span className="inline-flex size-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                      <UserRound aria-hidden="true" className="size-4" />
                    </span>
                    <span className="hidden min-w-0 sm:grid">
                      <span className="max-w-44 truncate font-medium text-slate-800">
                        {displayName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {role ? ROLE_LABEL[role] : 'Роль не задана'}
                      </span>
                    </span>
                  </button>

                  {isUserMenuOpen ? (
                    <div style={{ zIndex: 9999999 }} className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      <div className="border-b border-slate-100 px-2 pb-2">
                        <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {role ? ROLE_LABEL[role] : 'Роль не задана'}
                        </p>
                        {currentOrganization ? (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {currentOrganization.name} · {currentOrganization.status}
                          </p>
                        ) : null}
                      </div>
                      {isPlatformOwnerOrganizationView ? (
                        <Button
                          className="mt-2 w-full justify-start px-2"
                          onClick={handleExitOrganizationView}
                          type="button"
                          variant="secondary"
                        >
                          <ArrowLeft aria-hidden="true" className="size-4" />
                          Вернуться в платформу
                        </Button>
                      ) : null}
                      {isOrganizationAdminEmployeeView ? (
                        <Button
                          className="mt-2 w-full justify-start px-2"
                          onClick={handleBackToAdmin}
                          type="button"
                          variant="secondary"
                        >
                          <ArrowLeft aria-hidden="true" className="size-4" />
                          В админку
                        </Button>
                      ) : null}
                      <Button
                        className="mt-2 w-full justify-start px-2"
                        onClick={handleSignOut}
                        type="button"
                        variant="danger"
                      >
                        <LogOut aria-hidden="true" className="size-4" />
                        Выйти
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </header>
          )}

          <main
            className={
              fullWidthContent
                ? 'min-w-0 flex-1 px-2 py-2 pb-24 sm:px-3 md:pb-3'
                : 'min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-6'
            }
          >
            <div
              className={
                fullWidthContent
                  ? 'grid h-full w-full gap-3'
                  : 'mx-auto grid w-full max-w-6xl gap-5'
              }
            >
              {isPlatformOwnerOrganizationView ? (
                <div className="flex flex-col gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    Просмотр организации от имени владельца платформы: {currentOrganization?.name}
                  </span>
                  <Button
                    className="shrink-0"
                    onClick={handleExitOrganizationView}
                    type="button"
                    variant="secondary"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    В платформу
                  </Button>
                </div>
              ) : null}
              <Outlet />
              {isSettingsPage ? (
                <div className="md:hidden">
                  <Button
                    className="w-full justify-center"
                    onClick={handleSignOut}
                    type="button"
                    variant="danger"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    Выйти из аккаунта
                  </Button>
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
        aria-label={`${productAreaLabel}: ${t('мобильная навигация')}`}
      >
        {mobileNavItems.map((item) => {
          const active = isActivePath(location.pathname, item)

          return (
            <NavLink
              className={[
                'grid min-h-14 place-items-center gap-0.5 rounded-md px-1 py-1 text-[11px] font-medium',
                active ? 'text-emerald-800' : 'text-slate-500',
              ].join(' ')}
              key={item.path}
              to={item.path}
              {...(item.end ? { end: true } : {})}
            >
              <item.icon aria-hidden="true" className="size-5" />
              <span className="max-w-full truncate">{t(item.label)}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
