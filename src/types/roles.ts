import type { AppRole } from '../lib/supabase/database.types'
import { getCurrentAppHost, getPlatformRoutePath, getTenantRoutePath } from '../lib/routing/appHost'

export type UserRole = AppRole

export const USER_ROLES = {
  platformOwner: 'platform_owner',
  organizationAdmin: 'organization_admin',
  employee: 'employee',
} as const satisfies Record<string, UserRole>

export const ROLE_HOME_PATH: Record<UserRole, string> = {
  platform_owner: '/platform',
  organization_admin: '/admin',
  employee: '/employee',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  platform_owner: 'Владелец платформы',
  organization_admin: 'Администратор организации',
  employee: 'Сотрудник',
}

export const isUserRole = (value: string | null | undefined): value is UserRole =>
  value === USER_ROLES.platformOwner ||
  value === USER_ROLES.organizationAdmin ||
  value === USER_ROLES.employee

export const getRoleHomePath = (role: UserRole | null, organizationSlug?: string | null): string => {
  if (!role) return '/login'
  const host = getCurrentAppHost()
  if (host.mode === 'platform-admin' && role !== USER_ROLES.platformOwner) return '/access-denied'
  if (role === USER_ROLES.platformOwner) {
    return host.mode === 'tenant'
      ? getTenantRoutePath('/admin', organizationSlug)
      : getPlatformRoutePath('/')
  }
  return getTenantRoutePath(ROLE_HOME_PATH[role], organizationSlug)
}
