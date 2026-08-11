import type { Session } from '@supabase/supabase-js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { supabase } from '../../lib/supabase/client'
import type {
  AppRole,
  OrganizationMembershipRow,
  OrganizationRow,
  ProfileRow,
} from '../../lib/supabase/database.types'
import { USER_ROLES } from '../../types/roles'
import { AuthContext, type AuthContextValue, type SignInCredentials } from './AuthContext'

const profileSelect =
  'id,email,full_name,avatar_path,preferred_locale,is_active,created_at,updated_at'

const membershipSelect =
  'id,organization_id,user_id,role,is_active,job_title,phone,notes,sort_order,deactivated_at,created_by,created_at,updated_at'

const organizationSelect =
  'id,name,slug,description,logo_path,status,default_locale,timezone,currency_code,created_by,created_at,updated_at,archived_at'

type AccessContext = {
  profile: ProfileRow
  role: AppRole
  organizationId: string | null
  currentOrganization: OrganizationRow | null
  memberships: OrganizationMembershipRow[]
  availableOrganizations: OrganizationRow[]
}

const pickMembership = (memberships: OrganizationMembershipRow[]) =>
  [...memberships].sort((first, second) => {
    if (first.role === second.role) {
      return first.created_at.localeCompare(second.created_at)
    }

    return first.role === 'organization_admin' ? -1 : 1
  })[0] ?? null

const getOrganizationSlugFromPath = () => {
  if (typeof window === 'undefined') return null

  const [firstSegment, secondSegment] = window.location.pathname.split('/').filter(Boolean)

  if (!firstSegment || ['platform', 'login', 'access-not-configured'].includes(firstSegment)) {
    return null
  }

  if (['admin', 'employee'].includes(firstSegment)) {
    return null
  }

  if (!secondSegment || ['admin', 'employee'].includes(secondSegment)) {
    return firstSegment
  }

  return null
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [role, setRole] = useState<AppRole | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationRow | null>(null)
  const [memberships, setMemberships] = useState<OrganizationMembershipRow[]>([])
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentUserIdRef.current = session?.user.id ?? null
  }, [session?.user.id])

  const clearAccess = useCallback(() => {
    setProfile(null)
    setRole(null)
    setOrganizationId(null)
    setCurrentOrganization(null)
    setMemberships([])
    setAvailableOrganizations([])
  }, [])

  const applyAccessContext = useCallback((context: AccessContext | null) => {
    if (!context) {
      setProfile(null)
      setRole(null)
      setOrganizationId(null)
      setCurrentOrganization(null)
      setMemberships([])
      setAvailableOrganizations([])
      return
    }

    setProfile(context.profile)
    setRole(context.role)
    setOrganizationId(context.organizationId)
    setCurrentOrganization(context.currentOrganization)
    setMemberships(context.memberships)
    setAvailableOrganizations(context.availableOrganizations)
  }, [])

  const loadAccessContext = useCallback(async (userId: string) => {
    const { data: nextProfile, error: profileLoadError } = await supabase
      .from('profiles')
      .select(profileSelect)
      .eq('id', userId)
      .maybeSingle()

    if (profileLoadError) {
      setAuthError('Не удалось загрузить профиль пользователя.')
      return null
    }

    if (!nextProfile) {
      setAuthError('Профиль пользователя пока не создан.')
      return null
    }

    if (!nextProfile.is_active) {
      setAuthError('Аккаунт отключен. Обратитесь к владельцу Freedom Platform.')
      return null
    }

    const { data: platformRole, error: platformRoleError } = await supabase
      .from('platform_user_roles')
      .select('user_id,role,created_by,created_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (platformRoleError) {
      setAuthError('Не удалось проверить глобальную роль пользователя.')
      return null
    }

    if (platformRole?.role === USER_ROLES.platformOwner) {
      const { data: organizations, error: organizationsError } = await supabase
        .from('organizations')
        .select(organizationSelect)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (organizationsError) {
        setAuthError('Не удалось загрузить организации платформы.')
        return null
      }

      const requestedOrganizationSlug = getOrganizationSlugFromPath()
      const selectedOrganization = requestedOrganizationSlug
        ? (organizations ?? []).find((item) => item.slug === requestedOrganizationSlug) ?? null
        : null

      setAuthError(null)
      return {
        profile: nextProfile,
        role: USER_ROLES.platformOwner,
        organizationId: selectedOrganization?.id ?? null,
        currentOrganization: selectedOrganization,
        memberships: [],
        availableOrganizations: organizations ?? [],
      } satisfies AccessContext
    }

    const { data: nextMemberships, error: membershipsError } = await supabase
      .from('organization_memberships')
      .select(membershipSelect)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (membershipsError) {
      setAuthError('Не удалось загрузить доступ к организациям.')
      return null
    }

    if (!nextMemberships.length) {
      setAuthError('Ваш аккаунт создан, но доступ к организации еще не настроен.')
      return null
    }

    const organizationIds = [...new Set(nextMemberships.map((item) => item.organization_id))]
    const { data: organizations, error: organizationsError } = await supabase
      .from('organizations')
      .select(organizationSelect)
      .in('id', organizationIds)
      .eq('status', 'active')

    if (organizationsError) {
      setAuthError('Не удалось загрузить активные организации.')
      return null
    }

    if (!organizations.length) {
      setAuthError('Организация отключена или архивирована. Рабочий доступ временно недоступен.')
      return null
    }

    const activeOrganizationIds = new Set(organizations.map((item) => item.id))
    const activeMemberships = nextMemberships.filter((item) =>
      activeOrganizationIds.has(item.organization_id),
    )
    const requestedOrganizationSlug = getOrganizationSlugFromPath()
    const requestedOrganization = requestedOrganizationSlug
      ? organizations.find((item) => item.slug === requestedOrganizationSlug)
      : null
    const requestedMembership = requestedOrganization
      ? activeMemberships.find((item) => item.organization_id === requestedOrganization.id)
      : null
    const selectedMembership = requestedMembership ?? pickMembership(activeMemberships)

    if (!selectedMembership) {
      setAuthError('Для аккаунта нет активного доступа к организации.')
      return null
    }

    const selectedOrganization =
      organizations.find((item) => item.id === selectedMembership.organization_id) ?? null

    setAuthError(null)
    return {
      profile: nextProfile,
      role: selectedMembership.role,
      organizationId: selectedMembership.organization_id,
      currentOrganization: selectedOrganization,
      memberships: activeMemberships,
      availableOrganizations: organizations,
    } satisfies AccessContext
  }, [])

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession)

      if (!nextSession?.user) {
        clearAccess()
        setAuthError(null)
        return null
      }

      const context = await loadAccessContext(nextSession.user.id)
      applyAccessContext(context)
      return context?.role ?? null
    },
    [applyAccessContext, clearAccess, loadAccessContext],
  )

  useEffect(() => {
    let isMounted = true

    const bootstrap = async () => {
      setIsLoading(true)
      clearAccess()

      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        setSession(null)
        clearAccess()
        setAuthError('Не удалось проверить текущую сессию.')
        setIsLoading(false)
        return
      }

      await applySession(data.session)

      if (isMounted) {
        setIsLoading(false)
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void (async () => {
        if (event === 'SIGNED_OUT' || !nextSession?.user) {
          setSession(null)
          currentUserIdRef.current = null
          clearAccess()
          setAuthError(null)
          setIsLoading(false)
          return
        }

        setSession(nextSession)

        const currentUserId = currentUserIdRef.current
        const nextUserId = nextSession.user.id
        currentUserIdRef.current = nextUserId
        const shouldReloadAccess =
          event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          currentUserId !== nextUserId

        if (!shouldReloadAccess) {
          return
        }

        if (!currentUserId) {
          setIsLoading(true)
        }

        const context = await loadAccessContext(nextUserId)
        applyAccessContext(context)
        setIsLoading(false)
      })()
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [applyAccessContext, applySession, clearAccess, loadAccessContext])

  const userId = session?.user.id

  const refreshAccessContext = useCallback(async () => {
    if (!userId) {
      clearAccess()
      return null
    }

    const context = await loadAccessContext(userId)
    applyAccessContext(context)
    return context?.role ?? null
  }, [applyAccessContext, clearAccess, loadAccessContext, userId])

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return null
    }

    const context = await loadAccessContext(userId)
    applyAccessContext(context)
    return context?.profile ?? null
  }, [applyAccessContext, loadAccessContext, userId])

  const selectOrganizationBySlug = useCallback(
    (slug: string) => {
      const nextOrganization = availableOrganizations.find((organization) => organization.slug === slug)

      if (!nextOrganization) {
        return null
      }

      if (role === USER_ROLES.platformOwner) {
        setOrganizationId(nextOrganization.id)
        setCurrentOrganization(nextOrganization)
        setRole(USER_ROLES.platformOwner)

        return USER_ROLES.platformOwner
      }

      const nextMembership =
        memberships.find((membership) => membership.organization_id === nextOrganization.id) ?? null

      if (!nextMembership) {
        return null
      }

      setOrganizationId(nextOrganization.id)
      setCurrentOrganization(nextOrganization)
      setRole(nextMembership.role)

      return nextMembership.role
    },
    [availableOrganizations, memberships, role],
  )

  const clearOrganizationView = useCallback(() => {
    if (role !== USER_ROLES.platformOwner) return

    setOrganizationId(null)
    setCurrentOrganization(null)
  }, [role])

  const signIn = useCallback(
    async ({ login, password }: SignInCredentials) => {
      setIsLoading(true)
      setAuthError(null)
      clearAccess()

      const { data, error } = await supabase.auth.signInWithPassword({
        email: login.trim(),
        password,
      })

      if (error) {
        setIsLoading(false)
        throw new Error(error.message || 'Не удалось войти.')
      }

      setSession(data.session)
      const context = data.user ? await loadAccessContext(data.user.id) : null
      applyAccessContext(context)
      setIsLoading(false)

      return context?.role ?? null
    },
    [applyAccessContext, clearAccess, loadAccessContext],
  )

  const signOut = useCallback(async () => {
    setIsLoading(true)
    await supabase.auth.signOut()
    setSession(null)
    clearAccess()
    setAuthError(null)
    setIsLoading(false)
  }, [clearAccess])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      role,
      organizationId,
      currentOrganization,
      memberships,
      availableOrganizations,
      isLoading,
      authError,
      profileError: authError,
      signIn,
      signOut,
      refreshProfile,
      refreshAccessContext,
      selectOrganizationBySlug,
      clearOrganizationView,
    }),
    [
      authError,
      availableOrganizations,
      clearOrganizationView,
      currentOrganization,
      isLoading,
      memberships,
      organizationId,
      profile,
      refreshAccessContext,
      refreshProfile,
      selectOrganizationBySlug,
      role,
      session,
      signIn,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
