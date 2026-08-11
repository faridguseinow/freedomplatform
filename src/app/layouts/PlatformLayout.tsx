import { useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { AppLayout } from './AppLayout'
import { platformNavItems } from '../router/routes'

export function PlatformLayout() {
  const { clearOrganizationView } = useAuth()

  useEffect(() => {
    clearOrganizationView()
  }, [clearOrganizationView])

  return <AppLayout hideHeader navItems={platformNavItems} productArea="Платформа" />
}
