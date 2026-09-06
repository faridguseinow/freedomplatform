import { AppLayout } from './AppLayout'
import { adminNavItems } from '../router/routes'
import { AdminActivityTracker } from '../../features/organization/activity/AdminActivityTracker'
import { useAuth } from '../../hooks/useAuth'
import { getTenantRoutePath } from '../../lib/routing/appHost'

export function AdminLayout() {
  const { currentOrganization } = useAuth()
  const organizationSlug = currentOrganization?.slug
  const navItems = adminNavItems.map((item) => ({
    ...item,
    path: getTenantRoutePath(item.path, organizationSlug),
  }))

  return (
    <>
      <AdminActivityTracker />
      <AppLayout hideHeader navItems={navItems} productArea="Организация" />
    </>
  )
}
