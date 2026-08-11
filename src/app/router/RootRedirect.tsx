import { Navigate } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { getRoleHomePath } from '../../types/roles'

export function RootRedirect() {
  const { currentOrganization, isLoading, role, user } = useAuth()

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!user) {
    return <Navigate replace to="/login" />
  }

  return (
    <Navigate
      replace
      to={role ? getRoleHomePath(role, currentOrganization?.slug) : '/access-not-configured'}
    />
  )
}
