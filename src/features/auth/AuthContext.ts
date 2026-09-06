import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type {
  AppRole,
  OrganizationMembershipRow,
  OrganizationRow,
  ProfileRow,
} from '../../lib/supabase/database.types'
import type { UserRole } from '../../types/roles'

export type SignInCredentials = {
  login: string
  password: string
}

export type DemoRole = Extract<AppRole, 'organization_admin' | 'employee'>

export type OrganizationLoginBrand = Pick<
  OrganizationRow,
  'id' | 'name' | 'slug' | 'logo_path' | 'status'
>

export type HostOrganizationState =
  | 'not-applicable'
  | 'loading'
  | 'resolved'
  | 'not-found'
  | 'unavailable'
  | 'error'

export type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: ProfileRow | null
  role: UserRole | null
  organizationId: string | null
  currentOrganization: OrganizationRow | null
  memberships: OrganizationMembershipRow[]
  availableOrganizations: OrganizationRow[]
  hostOrganization: OrganizationLoginBrand | null
  hostOrganizationState: HostOrganizationState
  isLoading: boolean
  authError: string | null
  profileError: string | null
  signIn: (credentials: SignInCredentials) => Promise<AppRole | null>
  signInDemo: (role: DemoRole) => Promise<AppRole | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<ProfileRow | null>
  refreshAccessContext: () => Promise<AppRole | null>
  selectOrganizationBySlug: (slug: string) => AppRole | null
  clearOrganizationView: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
