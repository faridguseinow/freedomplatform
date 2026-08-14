import { AppLayout } from './AppLayout'
import { adminNavItems } from '../router/routes'
import { AdminActivityTracker } from '../../features/organization/activity/AdminActivityTracker'
import { useAuth } from '../../hooks/useAuth'

export function AdminLayout() {
  const { currentOrganization } = useAuth()
  const organizationSlug = currentOrganization?.slug
  const navItems = organizationSlug
    ? adminNavItems.map((item) => ({ ...item, path: `/${organizationSlug}${item.path}` }))
    : adminNavItems

  return (
    <>
      <AdminActivityTracker />
      <AppLayout hideHeader navItems={navItems} productArea="Организация" />
    </>
  )
}
