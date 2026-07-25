import { LogOut, Menu, UserRound } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_LABEL } from '../../types/roles'
import { pageTitles, type NavItem } from '../router/routes'

type AppLayoutProps = {
  productArea: string
  navItems: NavItem[]
}

const isActivePath = (currentPath: string, item: NavItem) => {
  if (item.end) {
    return currentPath === item.path
  }

  return currentPath === item.path || currentPath.startsWith(`${item.path}/`)
}

export function AppLayout({ navItems, productArea }: AppLayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentOrganization, profile, role, signOut, user } = useAuth()

  const currentTitle =
    pageTitles.find((item) => item.path === location.pathname)?.label ?? productArea

  const displayName = profile?.full_name || user?.email || 'Пользователь'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh bg-slate-50 text-slate-950">
      <div className="flex min-h-svh">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-sm font-semibold text-slate-950">Freedom Platform</p>
            <p className="mt-1 truncate text-xs text-slate-500">
              {currentOrganization?.name ?? productArea}
            </p>
          </div>

          <nav className="grid gap-1 px-3 py-4" aria-label={productArea}>
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  [
                    'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  ].join(' ')
                }
                key={item.path}
                to={item.path}
                {...(item.end ? { end: true } : {})}
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500 md:hidden">
                  <Menu aria-hidden="true" className="size-4" />
                  {productArea}
                </div>
                <h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl">
                  {currentTitle}
                </h1>
              </div>

              <details className="relative">
                <summary className="flex min-h-10 list-none items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-700">
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
                </summary>

                <div className="absolute right-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
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
              </details>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-6">
            <div className="mx-auto grid w-full max-w-6xl gap-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        aria-label={`${productArea}: мобильная навигация`}
      >
        {navItems.map((item) => {
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
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
