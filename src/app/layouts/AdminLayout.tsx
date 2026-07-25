import { AppLayout } from './AppLayout'
import { adminNavItems } from '../router/routes'

export function AdminLayout() {
  return <AppLayout navItems={adminNavItems} productArea="Организация" />
}
