import { Navigate, useParams } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { USER_ROLES } from '../../types/roles'

export function OrganizationSlugHomeRedirect() {
  const { isLoading, role } = useAuth()
  const { organizationSlug } = useParams<{ organizationSlug: string }>()

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!organizationSlug) {
    return <Navigate replace to="/access-not-configured" />
  }

  if (role === USER_ROLES.platformOwner || role === USER_ROLES.organizationAdmin) {
    return <Navigate replace to={`/${organizationSlug}/admin`} />
  }

  if (role === USER_ROLES.employee) {
    return <Navigate replace to={`/${organizationSlug}/employee`} />
  }

  return <Navigate replace to="/platform" />
}
