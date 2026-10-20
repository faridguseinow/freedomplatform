import { AppLayout } from './AppLayout'
import { employeeNavItems } from '../router/routes'
import { useAuth } from '../../hooks/useAuth'
import { getTenantRoutePath } from '../../lib/routing/appHost'

export function EmployeeLayout() {
  const { currentOrganization } = useAuth()
  const organizationSlug = currentOrganization?.slug
  const navItems = employeeNavItems.map((item) => ({
    ...item,
    path: getTenantRoutePath(item.path, organizationSlug),
  }))

  return <AppLayout fullWidthContent hideHeader navItems={navItems} productArea="Рабочее место" />
}
