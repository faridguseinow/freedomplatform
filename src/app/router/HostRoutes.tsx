import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { AccessDeniedPage } from '../../pages/AccessDeniedPage'
import { OrganizationNotFoundPage } from '../../pages/OrganizationNotFoundPage'
import { USER_ROLES } from '../../types/roles'

export function PlatformAdminRoute() {
  const { isLoading, role } = useAuth()

  if (isLoading) return <FullPageLoader />
  if (role !== USER_ROLES.platformOwner) return <Navigate replace to="/access-denied" />
  return <Outlet />
}

export function TenantHostBoundary() {
  const { hostOrganizationState } = useAuth()

  if (hostOrganizationState === 'loading') return <FullPageLoader />
  if (hostOrganizationState === 'not-found') return <OrganizationNotFoundPage />
  if (hostOrganizationState === 'unavailable') return <OrganizationNotFoundPage unavailable />
  if (hostOrganizationState === 'error') return <OrganizationNotFoundPage unavailable />

  return <Outlet />
}

export function AccessDeniedRoute() {
  return <AccessDeniedPage />
}

type CanonicalHostRedirectProps = {
  area: 'admin' | 'employee' | 'platform'
}

export function CanonicalHostRedirect({ area }: CanonicalHostRedirectProps) {
  const location = useLocation()
  const params = useParams()
  const wildcard = params['*']
  const basePath = area === 'platform' ? '' : `/${area}`
  const path = wildcard ? `${basePath}/${wildcard}` : basePath || '/'

  return <Navigate replace to={`${path}${location.search}${location.hash}`} />
}
