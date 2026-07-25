import { AppLayout } from './AppLayout'
import { platformNavItems } from '../router/routes'

export function PlatformLayout() {
  return <AppLayout navItems={platformNavItems} productArea="Платформа" />
}
