import { LogOut, Monitor, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { AppLayout } from './AppLayout'
import { employeeNavItems } from '../router/routes'
import { useAuth } from '../../hooks/useAuth'
import { USER_ROLES } from '../../types/roles'

const desktopMediaQuery = '(min-width: 768px)'

const getIsDesktopViewport = () => {
  if (typeof window === 'undefined') return true
  return window.matchMedia(desktopMediaQuery).matches
}

export function EmployeeLayout() {
  const navigate = useNavigate()
  const { clearOrganizationView, currentOrganization, role, signOut } = useAuth()
  const [isDesktopViewport, setIsDesktopViewport] = useState(getIsDesktopViewport)
  const organizationSlug = currentOrganization?.slug
  const navItems = organizationSlug
    ? employeeNavItems.map((item) => ({ ...item, path: `/${organizationSlug}${item.path}` }))
    : employeeNavItems

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopMediaQuery)
    const handleChange = () => setIsDesktopViewport(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const handleBackToPlatform = () => {
    clearOrganizationView()
    navigate('/platform', { replace: true })
  }

  if (!isDesktopViewport) {
    return (
      <main className="grid min-h-svh place-items-center bg-slate-950 px-5 py-8 text-white">
        <section className="grid w-full max-w-sm gap-5 rounded-lg border border-white/10 bg-white/10 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-white text-slate-950">
              <Monitor aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">Рабочее место только на компьютере</h1>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Сотрудники могут работать с заказами, сменами и оплатами только в десктопной версии.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm leading-6 text-cyan-50">
            <Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Откройте эту страницу на компьютере или планшете в горизонтальном режиме.</span>
          </div>

          <div className="grid gap-2">
            {role === USER_ROLES.platformOwner ? (
              <Button onClick={handleBackToPlatform} type="button" variant="secondary">
                В платформу
              </Button>
            ) : null}
            <Button onClick={handleSignOut} type="button" variant="danger">
              <LogOut aria-hidden="true" className="size-4" />
              Выйти из аккаунта
            </Button>
          </div>
        </section>
      </main>
    )
  }

  return <AppLayout fullWidthContent hideHeader navItems={navItems} productArea="Рабочее место" />
}
