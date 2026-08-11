import { Navigate, Outlet } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { getRoleHomePath, type UserRole } from '../../types/roles'

type RoleRouteProps = {
  allowedRoles: readonly UserRole[]
}

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { currentOrganization, isLoading, role, user } = useAuth()

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!user) {
    return <Navigate replace to="/login" />
  }

  if (!role) {
    return <Navigate replace to="/access-not-configured" />
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate replace to={getRoleHomePath(role, currentOrganization?.slug)} />
  }

  return <Outlet />
}
