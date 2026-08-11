import { Navigate, useLocation } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'

type LegacyOrganizationRedirectProps = {
  area: 'admin' | 'employee'
}

export function LegacyOrganizationRedirect({ area }: LegacyOrganizationRedirectProps) {
  const { currentOrganization, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!currentOrganization) {
    return <Navigate replace to="/access-not-configured" />
  }

  const suffix = location.pathname.replace(new RegExp(`^/${area}`), '')

  return (
    <Navigate
      replace
      to={`/${currentOrganization.slug}/${area}${suffix}${location.search}${location.hash}`}
    />
  )
}
