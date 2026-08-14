import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { USER_ROLES } from '../../../types/roles'
import { pageTitles } from '../../../app/router/routes'
import { logAdminSectionView } from './activityApi'

const throttleMs = 15 * 60 * 1000

function normalizeAdminPath(pathname: string, organizationSlug: string) {
  const prefix = `/${organizationSlug}`
  return pathname.startsWith(prefix) ? pathname.replace(prefix, '') || '/admin' : pathname
}

function getPageTitle(path: string) {
  return pageTitles.find((item) => item.path === path)?.label ?? 'Админка'
}

export function AdminActivityTracker() {
  const location = useLocation()
  const { currentOrganization, organizationId, role, user } = useAuth()

  useEffect(() => {
    if (!currentOrganization?.slug || !organizationId || !user) return
    if (role !== USER_ROLES.organizationAdmin && role !== USER_ROLES.platformOwner) return
    if (!location.pathname.startsWith(`/${currentOrganization.slug}/admin`)) return

    const normalizedPath = normalizeAdminPath(location.pathname, currentOrganization.slug)
    const storageKey = `freedom.audit.section.${organizationId}.${user.id}.${normalizedPath}`
    const lastLoggedAt = Number(window.sessionStorage.getItem(storageKey) ?? 0)

    if (Date.now() - lastLoggedAt < throttleMs) return

    window.sessionStorage.setItem(storageKey, String(Date.now()))
    logAdminSectionView({
      organizationId,
      path: normalizedPath,
      title: getPageTitle(normalizedPath),
    }).catch(() => undefined)
  }, [currentOrganization?.slug, location.pathname, organizationId, role, user])

  return null
}
