import type { AppRole } from '../lib/supabase/database.types'

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
  if (role === USER_ROLES.platformOwner) return ROLE_HOME_PATH[role]
  return organizationSlug ? `/${organizationSlug}${ROLE_HOME_PATH[role]}` : ROLE_HOME_PATH[role]
}
