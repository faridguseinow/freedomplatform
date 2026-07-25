import { Navigate } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { getRoleHomePath } from '../../types/roles'

export function RootRedirect() {
  const { isLoading, role, user } = useAuth()

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!user) {
    return <Navigate replace to="/login" />
  }

  return <Navigate replace to={role ? getRoleHomePath(role) : '/access-not-configured'} />
}
