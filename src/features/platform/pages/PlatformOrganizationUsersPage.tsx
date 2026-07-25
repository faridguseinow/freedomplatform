import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, ShieldCheck, UserMinus, Users } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { supabase } from '../../../lib/supabase/client'
import type {
  OrganizationMembershipRow,
  OrganizationRow,
  ProfileRow,
} from '../../../lib/supabase/database.types'

const organizationSelect =
  'id,name,slug,description,logo_path,status,default_locale,timezone,currency_code,created_by,created_at,updated_at,archived_at'

const membershipSelect =
  'id,organization_id,user_id,role,is_active,job_title,phone,notes,sort_order,deactivated_at,created_by,created_at,updated_at'

type MembershipWithProfile = OrganizationMembershipRow & {
  profile: Pick<ProfileRow, 'id' | 'email' | 'full_name' | 'is_active'> | null
}

const assignAdminSchema = z.object({
  user_id: z.string().trim().uuid('Укажите UUID существующего Auth-пользователя.'),
})

type AssignAdminValues = z.infer<typeof assignAdminSchema>

const roleLabel: Record<OrganizationMembershipRow['role'], string> = {
  organization_admin: 'Администратор',
  employee: 'Сотрудник',
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

export function PlatformOrganizationUsersPage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const queryClient = useQueryClient()

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<AssignAdminValues>({
    resolver: zodResolver(assignAdminSchema),
    defaultValues: {
      user_id: '',
    },
  })

  const organizationQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['platform', 'organizations', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(organizationSelect)
        .eq('id', organizationId!)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data satisfies OrganizationRow
    },
  })

  const membershipsQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['platform', 'organizations', organizationId, 'memberships'],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('organization_memberships')
        .select(membershipSelect)
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      const userIds = memberships.map((item) => item.user_id)

      if (!userIds.length) {
        return [] satisfies MembershipWithProfile[]
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,email,full_name,is_active')
        .in('id', userIds)

      if (profilesError) {
        throw new Error(profilesError.message)
      }

      const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

      return memberships.map((membership) => ({
        ...membership,
        profile: profileById.get(membership.user_id) ?? null,
      })) satisfies MembershipWithProfile[]
    },
  })

  const assignAdminMutation = useMutation({
    mutationFn: async (values: AssignAdminValues) => {
      const { data, error } = await supabase.rpc('assign_organization_admin', {
        target_organization_id: organizationId!,
        target_user_id: values.user_id,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      reset()
      await queryClient.invalidateQueries({
        queryKey: ['platform', 'organizations', organizationId, 'memberships'],
      })
      await queryClient.invalidateQueries({ queryKey: ['platform', 'organization-memberships-count'] })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async (membership: OrganizationMembershipRow) => {
      const confirmed = window.confirm('Отключить доступ пользователя к организации?')

      if (!confirmed) {
        return null
      }

      const { data, error } = await supabase
        .from('organization_memberships')
        .update({ is_active: false })
        .eq('id', membership.id)
        .select(membershipSelect)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['platform', 'organizations', organizationId, 'memberships'],
      })
      await queryClient.invalidateQueries({ queryKey: ['platform', 'organization-memberships-count'] })
    },
  })

  const onAssignAdmin = handleSubmit(async (values) => {
    try {
      await assignAdminMutation.mutateAsync(values)
    } catch (error) {
      setError('user_id', {
        message: error instanceof Error ? error.message : 'Не удалось назначить администратора.',
      })
    }
  })

  const organization = organizationQuery.data
  const memberships = membershipsQuery.data ?? []

  return (
    <section className="grid gap-5">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          to="/platform/organizations"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Организации
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              Пользователи организации
            </h2>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              {organization?.name ?? 'Загрузка организации'}
            </p>
          </div>
        </div>
      </header>

      <form
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]"
        noValidate
        onSubmit={onAssignAdmin}
      >
        <Input
          error={errors.user_id?.message}
          id="user_id"
          label="UUID существующего пользователя для роли администратора"
          placeholder="00000000-0000-0000-0000-000000000000"
          {...register('user_id')}
        />
        <div className="flex items-end">
          <Button disabled={isSubmitting || assignAdminMutation.isPending} type="submit">
            {isSubmitting || assignAdminMutation.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4" />
            )}
            Назначить
          </Button>
        </div>
      </form>

      {organizationQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {organizationQuery.error.message}
        </div>
      ) : null}

      {membershipsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
          Загрузка пользователей
        </div>
      ) : null}

      {!membershipsQuery.isLoading && !memberships.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <Users aria-hidden="true" className="mx-auto size-8 text-cyan-700" />
          <h3 className="mt-3 text-base font-semibold text-slate-950">Пользователи не назначены</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Назначьте существующего Auth-пользователя администратором организации.
          </p>
        </div>
      ) : null}

      {memberships.length ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid min-w-[760px] grid-cols-[1.4fr_1fr_0.8fr_0.7fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
            <span>Пользователь</span>
            <span>UUID</span>
            <span>Роль</span>
            <span>Дата</span>
            <span className="text-right">Действие</span>
          </div>
          <div className="overflow-x-auto">
            {memberships.map((membership) => (
              <div
                className="grid min-w-[760px] grid-cols-[1.4fr_1fr_0.8fr_0.7fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                key={membership.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">
                    {membership.profile?.full_name || membership.profile?.email || 'Без профиля'}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {membership.profile?.email ?? 'Email недоступен'}
                  </p>
                </div>
                <span className="truncate font-mono text-xs text-slate-500">{membership.user_id}</span>
                <span className="text-slate-700">{roleLabel[membership.role]}</span>
                <span className="text-slate-600">{formatDate(membership.created_at)}</span>
                <div className="text-right">
                  <Button
                    disabled={!membership.is_active || deactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate(membership)}
                    type="button"
                    variant="danger"
                  >
                    <UserMinus aria-hidden="true" className="size-4" />
                    {membership.is_active ? 'Отключить' : 'Отключен'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
