import { AppLayout } from './AppLayout'
import { employeeNavItems } from '../router/routes'

export function EmployeeLayout() {
  return <AppLayout navItems={employeeNavItems} productArea="Рабочее место" />
}
