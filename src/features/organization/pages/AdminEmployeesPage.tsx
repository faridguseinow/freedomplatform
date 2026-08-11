import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  CheckCircle2,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  UserMinus,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase/client'
import type {
  AvailableUserSearchResult,
  OrganizationMembershipWithProfile,
  ProfileRow,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'

const membershipSelect =
  'id,organization_id,user_id,role,is_active,job_title,phone,notes,sort_order,deactivated_at,created_by,created_at,updated_at'

const addEmployeeSchema = z.object({
  email: z.string().trim().email('Введите корректный email.'),
  full_name: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

const editEmployeeSchema = z.object({
  full_name: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
})

type AddEmployeeValues = z.infer<typeof addEmployeeSchema>
type EditEmployeeValues = z.infer<typeof editEmployeeSchema>
type EmployeeFilter = 'all' | 'active' | 'inactive'

type EmployeeLockState = {
  membership_id: string
  has_pin: boolean
  pin_set_at: string | null
  has_pending_pin_change: boolean
  pending_pin_change_requested_at: string | null
}

const filterLabels: Record<EmployeeFilter, string> = {
  all: 'Все',
  active: 'Активные',
  inactive: 'Отключенные',
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const getDisplayName = (employee: OrganizationMembershipWithProfile) =>
  employee.profile?.full_name || employee.profile?.email || 'Без имени'

const getInitial = (profile: Pick<ProfileRow, 'full_name' | 'email'> | null) =>
  (profile?.full_name?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()

const normalizeSearch = (value: string) => value.trim().toLowerCase()
const normalizePin = (value: string) => value.replace(/\D/g, '').slice(0, 4)
const isPinValid = (value: string) => /^\d{4}$/.test(value)

export function AdminEmployeesPage() {
  const queryClient = useQueryClient()
  const { currentOrganization, organizationId, refreshAccessContext } = useAuth()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<EmployeeFilter>('active')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AvailableUserSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [employeePin, setEmployeePin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] =
    useState<OrganizationMembershipWithProfile | null>(null)

  const addForm = useForm<AddEmployeeValues>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: {
      email: '',
      full_name: '',
      job_title: '',
      phone: '',
      notes: '',
    },
  })

  const editForm = useForm<EditEmployeeValues>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      full_name: '',
      job_title: '',
      phone: '',
      notes: '',
      sort_order: 0,
    },
  })

  const employeesQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'employees', organizationId],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('organization_memberships')
        .select(membershipSelect)
        .eq('organization_id', organizationId!)
        .eq('role', 'employee')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      const userIds = memberships.map((item) => item.user_id)

      if (!userIds.length) {
        return [] satisfies OrganizationMembershipWithProfile[]
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,email,full_name,avatar_path,preferred_locale,is_active')
        .in('id', userIds)

      if (profilesError) {
        throw new Error(profilesError.message)
      }

      const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

      return memberships.map((membership) => ({
        ...membership,
        profile: profileById.get(membership.user_id) ?? null,
      })) satisfies OrganizationMembershipWithProfile[]
    },
  })

  const employeeLockStatesQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'employee-lock-states', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_organization_employee_lock_states', {
        target_organization_id: organizationId!,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data as EmployeeLockState[]
    },
  })

  const findUserMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!organizationId) {
        throw new Error('Организация не выбрана.')
      }

      const { data, error } = await supabase.rpc('find_available_user_by_email', {
        target_email: email,
        target_organization_id: organizationId,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data[0] ?? null
    },
    onSuccess: (user) => {
      setSelectedUser(user)
      addForm.setValue('full_name', user?.full_name ?? '')
      setSearchError(user ? null : 'Пользователь с таким email не найден. Сначала создайте его в Supabase Authentication.')
    },
    onError: (error) => {
      setSelectedUser(null)
      setSearchError(error instanceof Error ? error.message : 'Не удалось найти пользователя.')
    },
  })

  const addEmployeeMutation = useMutation({
    mutationFn: async (values: AddEmployeeValues) => {
      if (!organizationId || !selectedUser) {
        throw new Error('Сначала найдите существующего пользователя.')
      }

      const { data, error } = await supabase.rpc('assign_organization_employee', {
        target_organization_id: organizationId,
        target_user_id: selectedUser.user_id,
        target_full_name: values.full_name || null,
        target_job_title: values.job_title || null,
        target_phone: values.phone || null,
        target_notes: values.notes || null,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employees', organizationId] })
      setIsAddOpen(false)
      setSelectedUser(null)
      setSearchError(null)
      addForm.reset()
    },
    onError: (error) => {
      setSearchError(error instanceof Error ? error.message : 'Не удалось добавить сотрудника.')
    },
  })

  const updateEmployeeMutation = useMutation({
    mutationFn: async (values: EditEmployeeValues) => {
      if (!selectedEmployee) {
        throw new Error('Сотрудник не выбран.')
      }

      const { data, error } = await supabase.rpc('update_organization_employee', {
        target_membership_id: selectedEmployee.id,
        target_full_name: values.full_name || null,
        target_job_title: values.job_title || null,
        target_phone: values.phone || null,
        target_notes: values.notes || null,
        target_sort_order: values.sort_order,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employees', organizationId] })
      setSelectedEmployee(null)
    },
  })

  const setActiveMutation = useMutation({
    mutationFn: async ({
      employee,
      isActive,
    }: {
      employee: OrganizationMembershipWithProfile
      isActive: boolean
    }) => {
      if (!isActive) {
        const confirmed = window.confirm(
          'Сотрудник больше не сможет войти в рабочий интерфейс этой организации. История его действий и операций сохранится.',
        )

        if (!confirmed) {
          return null
        }
      }

      const { data, error } = await supabase.rpc('set_organization_employee_active', {
        target_membership_id: employee.id,
        target_is_active: isActive,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employees', organizationId] })

      if (selectedEmployee?.id === variables.employee.id) {
        setSelectedEmployee(null)
      }

      await refreshAccessContext()
    },
  })

  const setEmployeePinMutation = useMutation({
    mutationFn: async ({ employee, pin }: { employee: OrganizationMembershipWithProfile; pin: string }) => {
      const { error } = await supabase.rpc('set_employee_lock_pin', {
        target_membership_id: employee.id,
        target_pin: pin,
      })

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employee-lock-states', organizationId] })
      setEmployeePin('')
      setPinError(null)
    },
    onError: (error) => {
      setPinError(error instanceof Error ? error.message : 'Не удалось сохранить PIN.')
    },
  })

  const approveEmployeePinMutation = useMutation({
    mutationFn: async (employee: OrganizationMembershipWithProfile) => {
      const { error } = await supabase.rpc('approve_employee_lock_pin_change', {
        target_membership_id: employee.id,
      })

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employee-lock-states', organizationId] })
      setPinError(null)
    },
    onError: (error) => {
      setPinError(error instanceof Error ? error.message : 'Не удалось одобрить PIN.')
    },
  })

  const rejectEmployeePinMutation = useMutation({
    mutationFn: async (employee: OrganizationMembershipWithProfile) => {
      const { error } = await supabase.rpc('reject_employee_lock_pin_change', {
        target_membership_id: employee.id,
      })

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'employee-lock-states', organizationId] })
      setPinError(null)
    },
    onError: (error) => {
      setPinError(error instanceof Error ? error.message : 'Не удалось отклонить заявку.')
    },
  })

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])
  const visibleEmployees = useMemo(() => {
    const normalizedSearch = normalizeSearch(search)

    return employees.filter((employee) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && employee.is_active) ||
        (filter === 'inactive' && !employee.is_active)

      if (!matchesFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const searchable = [
        employee.profile?.full_name,
        employee.profile?.email,
        employee.job_title,
        employee.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(normalizedSearch)
    })
  }, [employees, filter, search])
  const lockStateByMembershipId = useMemo(
    () =>
      new Map(
        (employeeLockStatesQuery.data ?? []).map((state) => [state.membership_id, state]),
      ),
    [employeeLockStatesQuery.data],
  )

  const activeCount = employees.filter((employee) => employee.is_active).length
  const inactiveCount = employees.length - activeCount
  const selectedEmployeeLockState = selectedEmployee
    ? lockStateByMembershipId.get(selectedEmployee.id)
    : null

  const openAddModal = () => {
    setSelectedUser(null)
    setSearchError(null)
    addForm.reset({
      email: '',
      full_name: '',
      job_title: '',
      phone: '',
      notes: '',
    })
    setIsAddOpen(true)
  }

  const openEditModal = (employee: OrganizationMembershipWithProfile) => {
    setSelectedEmployee(employee)
    setEmployeePin('')
    setPinError(null)
    editForm.reset({
      full_name: employee.profile?.full_name ?? '',
      job_title: employee.job_title ?? '',
      phone: employee.phone ?? '',
      notes: employee.notes ?? '',
      sort_order: employee.sort_order,
    })
  }

  const handleFindUser = addForm.handleSubmit(async (values) => {
    setSearchError(null)
    setSelectedUser(null)
    await findUserMutation.mutateAsync(values.email)
  })

  const handleAddEmployee = addForm.handleSubmit(async (values) => {
    await addEmployeeMutation.mutateAsync(values)
  })

  const handleUpdateEmployee = editForm.handleSubmit(async (values) => {
    await updateEmployeeMutation.mutateAsync(values)
  })

  const handleSetEmployeePin = (employee: OrganizationMembershipWithProfile) => {
    if (!isPinValid(employeePin)) {
      setPinError('PIN должен состоять из 4 цифр.')
      return
    }

    setEmployeePinMutation.mutate({ employee, pin: employeePin })
  }

  if (!organizationId || !currentOrganization) {
    return (
      <EmptyState
        description="Активная организация не выбрана или доступ был приостановлен."
        icon={BriefcaseBusiness}
        title="Сотрудники недоступны"
      />
    )
  }

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Сотрудники
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Управление сотрудниками и их доступом к организации.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
              Всего: {employees.length}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
              Активные: {activeCount}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
              Отключенные: {inactiveCount}
            </span>
          </div>
        </div>

        <Button className="shrink-0" onClick={openAddModal} type="button">
          <Plus aria-hidden="true" className="size-4" />
          Добавить сотрудника
        </Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, email, должность или телефон"
              type="search"
              value={search}
            />
          </span>
        </label>

        <div className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Фильтр</span>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            {(['all', 'active', 'inactive'] satisfies EmployeeFilter[]).map((item) => (
              <button
                className={cn(
                  'min-h-9 rounded px-3 text-sm font-medium transition-colors',
                  filter === item ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-950',
                )}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {filterLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {employeesQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
          Загрузка сотрудников
        </div>
      ) : null}

      {employeesQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {employeesQuery.error.message}
        </div>
      ) : null}

      {!employeesQuery.isLoading && !employees.length ? (
        <EmptyState
          description="Добавьте существующего Supabase Auth пользователя как employee этой организации."
          icon={BriefcaseBusiness}
          title="Сотрудники пока не добавлены"
        />
      ) : null}

      {!employeesQuery.isLoading && employees.length > 0 && !visibleEmployees.length ? (
        <EmptyState
          description="Измените поиск или фильтр, чтобы увидеть сотрудников."
          icon={Search}
          title="Ничего не найдено"
        />
      ) : null}

      {visibleEmployees.length ? (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Сотрудник</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Должность</th>
                  <th className="px-4 py-3">Телефон</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">PIN</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee) => (
                  <tr className="border-t border-slate-100" key={employee.id}>
                    <td className="px-4 py-3">
                      <button
                        className="flex min-w-0 items-center gap-3 text-left"
                        onClick={() => openEditModal(employee)}
                        type="button"
                      >
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-sm font-semibold text-cyan-700">
                          {getInitial(employee.profile)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-950">
                            {getDisplayName(employee)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {employee.profile?.preferred_locale ?? 'ru'}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{employee.profile?.email ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{employee.job_title ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{employee.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium',
                          employee.is_active
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {employee.is_active ? 'Активен' : 'Отключен'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lockStateByMembershipId.get(employee.id)?.has_pending_pin_change ? (
                        <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800">
                          Заявка
                        </span>
                      ) : lockStateByMembershipId.get(employee.id)?.has_pin ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                          Задан
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                          Не задан
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(employee.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => openEditModal(employee)} type="button" variant="secondary">
                          <Edit3 aria-hidden="true" className="size-4" />
                          Открыть
                        </Button>
                        <Button
                          disabled={setActiveMutation.isPending}
                          onClick={() =>
                            setActiveMutation.mutate({
                              employee,
                              isActive: !employee.is_active,
                            })
                          }
                          type="button"
                          variant={employee.is_active ? 'danger' : 'secondary'}
                        >
                          {employee.is_active ? (
                            <UserMinus aria-hidden="true" className="size-4" />
                          ) : (
                            <CheckCircle2 aria-hidden="true" className="size-4" />
                          )}
                          {employee.is_active ? 'Отключить' : 'Восстановить'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {visibleEmployees.map((employee) => (
              <article
                className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                key={employee.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-base font-semibold text-cyan-700">
                    {getInitial(employee.profile)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-slate-950">
                      {getDisplayName(employee)}
                    </h3>
                    <p className="truncate text-sm text-slate-600">{employee.profile?.email ?? '-'}</p>
                    <p className="mt-1 truncate text-sm text-slate-700">
                      {employee.job_title || 'Должность не указана'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PIN:{' '}
                      {lockStateByMembershipId.get(employee.id)?.has_pending_pin_change
                        ? 'ожидает одобрения'
                        : lockStateByMembershipId.get(employee.id)?.has_pin
                          ? 'задан'
                          : 'не задан'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-xs font-medium',
                      employee.is_active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {employee.is_active ? 'Активен' : 'Отключен'}
                  </span>
                </div>
                <Button className="w-full" onClick={() => openEditModal(employee)} type="button" variant="secondary">
                  <Edit3 aria-hidden="true" className="size-4" />
                  Открыть
                </Button>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {isAddOpen ? (
        <Modal onClose={() => setIsAddOpen(false)}>
          <section className="grid max-h-[calc(100svh-3rem)] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Добавить сотрудника</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Пользователь должен уже существовать в Supabase Authentication.
                </p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setIsAddOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <form className="grid gap-3 sm:grid-cols-[1fr_auto]" noValidate onSubmit={handleFindUser}>
              <Input
                error={addForm.formState.errors.email?.message}
                id="employee_email"
                label="Email существующего пользователя"
                placeholder="name@company.com"
                type="email"
                {...addForm.register('email')}
              />
              <div className="flex items-end">
                <Button disabled={findUserMutation.isPending} type="submit" variant="secondary">
                  {findUserMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Search aria-hidden="true" className="size-4" />
                  )}
                  Найти
                </Button>
              </div>
            </form>

            {searchError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                {searchError}
              </div>
            ) : null}

            {selectedUser ? (
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-base font-semibold text-cyan-700">
                    {getInitial(selectedUser)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">
                      {selectedUser.full_name || selectedUser.email}
                    </p>
                    <p className="truncate text-sm text-slate-600">{selectedUser.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedUser.membership_id
                        ? selectedUser.membership_is_active
                          ? 'У пользователя уже есть активный доступ.'
                          : 'Доступ найден, но отключен. Можно восстановить.'
                        : 'Доступа к этой организации пока нет.'}
                    </p>
                  </div>
                </div>

                <form className="grid gap-4" noValidate onSubmit={handleAddEmployee}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="employee_full_name"
                      label="Имя"
                      placeholder="Имя сотрудника"
                      {...addForm.register('full_name')}
                    />
                    <Input id="employee_job_title" label="Должность" {...addForm.register('job_title')} />
                    <Input id="employee_phone" label="Телефон" {...addForm.register('phone')} />
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                      <span>Комментарий</span>
                      <textarea
                        className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        {...addForm.register('notes')}
                      />
                    </label>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={() => setIsAddOpen(false)} type="button" variant="secondary">
                      Отмена
                    </Button>
                    <Button
                      disabled={
                        addEmployeeMutation.isPending ||
                        (selectedUser.membership_is_active === true &&
                          selectedUser.membership_role === 'employee')
                      }
                      type="submit"
                    >
                      {addEmployeeMutation.isPending ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      ) : selectedUser.membership_is_active ? (
                        <UserRoundCheck aria-hidden="true" className="size-4" />
                      ) : (
                        <Plus aria-hidden="true" className="size-4" />
                      )}
                      {selectedUser.membership_id ? 'Восстановить доступ' : 'Добавить сотрудника'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        </Modal>
      ) : null}

      {selectedEmployee ? (
        <Modal onClose={() => setSelectedEmployee(null)}>
          <form
            className="grid max-h-[calc(100svh-3rem)] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            noValidate
            onSubmit={handleUpdateEmployee}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-lg font-semibold text-cyan-700">
                  {getInitial(selectedEmployee.profile)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-950">
                    {getDisplayName(selectedEmployee)}
                  </h3>
                  <p className="truncate text-sm text-slate-600">
                    {selectedEmployee.profile?.email ?? 'Email недоступен'}
                  </p>
                </div>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setSelectedEmployee(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Роль</dt>
                <dd className="mt-1 text-slate-900">employee</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Статус</dt>
                <dd className="mt-1 text-slate-900">
                  {selectedEmployee.is_active ? 'Активен' : 'Отключен'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Дата добавления</dt>
                <dd className="mt-1 text-slate-900">{formatDate(selectedEmployee.created_at)}</dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-xs font-medium uppercase text-slate-500">UUID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-slate-700">
                  {selectedEmployee.user_id}
                </dd>
              </div>
            </dl>

            <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-950">PIN блокировки сайта</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {employeeLockStatesQuery.isLoading
                      ? 'Загрузка статуса PIN...'
                      : selectedEmployeeLockState?.has_pending_pin_change
                        ? `Сотрудник запросил смену PIN${
                            selectedEmployeeLockState.pending_pin_change_requested_at
                              ? ` ${formatDateTime(selectedEmployeeLockState.pending_pin_change_requested_at)}`
                              : ''
                          }.`
                        : selectedEmployeeLockState?.has_pin
                          ? 'PIN задан и может использоваться для блокировки рабочего экрана.'
                          : 'PIN ещё не задан.'}
                  </p>
                </div>
                <span
                  className={cn(
                    'w-fit rounded-md px-2 py-1 text-xs font-medium',
                    selectedEmployeeLockState?.has_pending_pin_change
                      ? 'bg-orange-50 text-orange-800'
                      : selectedEmployeeLockState?.has_pin
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {selectedEmployeeLockState?.has_pending_pin_change
                    ? 'Нужна проверка'
                    : selectedEmployeeLockState?.has_pin
                      ? 'Активен'
                      : 'Не задан'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  <span>Новый PIN</span>
                  <input
                    className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-center text-lg font-semibold tracking-[0.35em] text-slate-950 outline-none transition-colors placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) => {
                      setPinError(null)
                      setEmployeePin(normalizePin(event.target.value))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleSetEmployeePin(selectedEmployee)
                      }
                    }}
                    placeholder="0000"
                    type="password"
                    value={employeePin}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    disabled={setEmployeePinMutation.isPending}
                    onClick={() => handleSetEmployeePin(selectedEmployee)}
                    type="button"
                    variant="secondary"
                  >
                    {setEmployeePinMutation.isPending ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <KeyRound aria-hidden="true" className="size-4" />
                    )}
                    Задать PIN
                  </Button>
                </div>
              </div>

              {selectedEmployeeLockState?.has_pending_pin_change ? (
                <div className="flex flex-col gap-2 rounded-md border border-orange-100 bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-orange-900">Одобрите заявку, чтобы новый PIN начал работать.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      disabled={approveEmployeePinMutation.isPending || rejectEmployeePinMutation.isPending}
                      onClick={() => approveEmployeePinMutation.mutate(selectedEmployee)}
                      type="button"
                    >
                      {approveEmployeePinMutation.isPending ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <ShieldCheck aria-hidden="true" className="size-4" />
                      )}
                      Одобрить
                    </Button>
                    <Button
                      disabled={approveEmployeePinMutation.isPending || rejectEmployeePinMutation.isPending}
                      onClick={() => rejectEmployeePinMutation.mutate(selectedEmployee)}
                      type="button"
                      variant="secondary"
                    >
                      Отклонить
                    </Button>
                  </div>
                </div>
              ) : null}

              {pinError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                  {pinError}
                </div>
              ) : null}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                error={editForm.formState.errors.full_name?.message}
                id="edit_full_name"
                label="Имя"
                placeholder="Имя сотрудника"
                {...editForm.register('full_name')}
              />
              <Input
                error={editForm.formState.errors.job_title?.message}
                id="edit_job_title"
                label="Должность"
                {...editForm.register('job_title')}
              />
              <Input
                error={editForm.formState.errors.phone?.message}
                id="edit_phone"
                label="Телефон"
                {...editForm.register('phone')}
              />
              <Input
                error={editForm.formState.errors.sort_order?.message}
                id="edit_sort_order"
                label="Порядок"
                min={0}
                type="number"
                {...editForm.register('sort_order', { valueAsNumber: true })}
              />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Комментарий</span>
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...editForm.register('notes')}
                />
              </label>
            </div>

            {updateEmployeeMutation.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                {updateEmployeeMutation.error.message}
              </div>
            ) : null}

            {setActiveMutation.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                {setActiveMutation.error.message}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                disabled={setActiveMutation.isPending}
                onClick={() =>
                  setActiveMutation.mutate({
                    employee: selectedEmployee,
                    isActive: !selectedEmployee.is_active,
                  })
                }
                type="button"
                variant={selectedEmployee.is_active ? 'danger' : 'secondary'}
              >
                {selectedEmployee.is_active ? (
                  <UserMinus aria-hidden="true" className="size-4" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                )}
                {selectedEmployee.is_active ? 'Отключить доступ' : 'Восстановить доступ'}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button onClick={() => setSelectedEmployee(null)} type="button" variant="secondary">
                  Отмена
                </Button>
                <Button disabled={updateEmployeeMutation.isPending} type="submit">
                  {updateEmployeeMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Edit3 aria-hidden="true" className="size-4" />
                  )}
                  Сохранить
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
