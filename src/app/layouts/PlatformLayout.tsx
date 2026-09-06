import { useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { AppLayout } from './AppLayout'
import { platformNavItems } from '../router/routes'
import { getPlatformRoutePath } from '../../lib/routing/appHost'

export function PlatformLayout() {
  const { clearOrganizationView } = useAuth()

  useEffect(() => {
    clearOrganizationView()
  }, [clearOrganizationView])

  const navItems = platformNavItems.map((item) => ({
    ...item,
    path: getPlatformRoutePath(item.path),
  }))

  return <AppLayout hideHeader navItems={navItems} productArea="Freedom Platform" />
}
