import { useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { FullPageLoader } from '../../components/common/StateView'
import { useAuth } from '../../hooks/useAuth'
import { getRoleHomePath, USER_ROLES } from '../../types/roles'

export function OrganizationSlugRoute() {
  const {
    availableOrganizations,
    currentOrganization,
    isLoading,
    memberships,
    role,
    selectOrganizationBySlug,
  } = useAuth()
  const { organizationSlug } = useParams<{ organizationSlug: string }>()

  const targetOrganization = availableOrganizations.find(
    (organization) => organization.slug === organizationSlug,
  )
  const targetMembership = targetOrganization
    ? memberships.find((membership) => membership.organization_id === targetOrganization.id)
    : null
  const isPlatformOwner = role === USER_ROLES.platformOwner
  const canAccessTarget = Boolean(targetOrganization && (isPlatformOwner || targetMembership))
  const expectedRole = isPlatformOwner ? USER_ROLES.platformOwner : targetMembership?.role

  useEffect(() => {
    if (!organizationSlug || isLoading || currentOrganization?.slug === organizationSlug) return
    selectOrganizationBySlug(organizationSlug)
  }, [currentOrganization?.slug, isLoading, organizationSlug, selectOrganizationBySlug])

  if (isLoading) {
    return <FullPageLoader />
  }

  if (!organizationSlug || !canAccessTarget) {
    return <Navigate replace to={getRoleHomePath(role, currentOrganization?.slug)} />
  }

  if (currentOrganization?.slug !== organizationSlug || role !== expectedRole) {
    return <FullPageLoader />
  }

  return <Outlet />
}
