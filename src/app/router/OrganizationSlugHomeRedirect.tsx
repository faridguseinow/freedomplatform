import { Navigate, useParams } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { USER_ROLES } from '../../types/roles'
import { getRouteOrganizationSlug, getTenantRoutePath } from '../../lib/routing/appHost'

export function OrganizationSlugHomeRedirect() {
  const { isLoading, role } = useAuth()
  const { organizationSlug: routeOrganizationSlug } = useParams<{ organizationSlug: string }>()
  const organizationSlug = getRouteOrganizationSlug(routeOrganizationSlug)

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!organizationSlug) {
    return <Navigate replace to="/access-not-configured" />
  }

  if (role === USER_ROLES.platformOwner || role === USER_ROLES.organizationAdmin) {
    return <Navigate replace to={getTenantRoutePath('/admin', organizationSlug)} />
  }

  if (role === USER_ROLES.employee) {
    return <Navigate replace to={getTenantRoutePath('/employee', organizationSlug)} />
  }

  return <Navigate replace to="/access-denied" />
}
