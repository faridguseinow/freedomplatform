import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Building2,
  BriefcaseBusiness,
  Edit3,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { supabase } from '../../../lib/supabase/client'
import type { OrganizationRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { uploadOrganizationLogo } from '../../organization/catalog/imageUpload'

const organizationSelect =
  'id,name,slug,description,logo_path,status,default_locale,timezone,currency_code,created_by,created_at,updated_at,archived_at'

const slugTransliterationMap: Record<string, string> = {
  ə: 'e',
  ı: 'i',
  ö: 'o',
  ü: 'u',
  ğ: 'g',
  ş: 's',
  ç: 'c',
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

const buildSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => slugTransliterationMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const buildOrganizationUrl = (slug: string) => `https://freedom-platform.vercel.app/${slug}`

const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Введите название организации.'),
  slug: z
    .string()
    .trim()
    .transform(buildSlug)
    .pipe(
      z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug: lowercase, цифры и дефисы.'),
    ),
  description: z.string().trim().optional(),
  logo_path: z.string().trim().optional(),
  logo_file: z.any().optional(),
  default_locale: z.enum(['ru', 'az', 'en']),
  timezone: z.string().trim().min(3, 'Укажите часовой пояс.'),
  currency_code: z
    .string()
    .trim()
    .length(3, 'Код валюты должен содержать 3 символа.')
    .transform((value) => value.toUpperCase()),
  admin_user_id: z.string().trim().uuid('Укажите UUID пользователя Auth.').optional().or(z.literal('')),
})

type OrganizationFormValues = z.input<typeof organizationSchema>

const statusLabel: Record<OrganizationRow['status'], string> = {
  active: 'Активна',
  suspended: 'Приостановлена',
  archived: 'Архив',
}

const statusClass: Record<OrganizationRow['status'], string> = {
  active: 'bg-emerald-50 text-emerald-800',
  suspended: 'bg-amber-50 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

export function PlatformOrganizationsPage() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingOrganization, setEditingOrganization] = useState<OrganizationRow | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const organizationsQuery = useQuery({
    queryKey: ['platform', 'organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(organizationSelect)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })

  const membershipsCountQuery = useQuery({
    queryKey: ['platform', 'organization-memberships-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('is_active', true)

      if (error) {
        throw new Error(error.message)
      }

      return data.reduce<Record<string, number>>((acc, item) => {
        acc[item.organization_id] = (acc[item.organization_id] ?? 0) + 1
        return acc
      }, {})
    },
  })

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    control,
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      logo_path: '',
      logo_file: undefined,
      default_locale: 'ru',
      timezone: 'Asia/Baku',
      currency_code: 'AZN',
      admin_user_id: '',
    },
  })

  const watchedName = useWatch({ control, name: 'name' })
  const watchedSlug = useWatch({ control, name: 'slug' })
  const watchedLogoPath = useWatch({ control, name: 'logo_path' })
  const normalizedSlug = buildSlug(watchedSlug ?? '')
  const organizationUrl = normalizedSlug ? buildOrganizationUrl(normalizedSlug) : ''

  useEffect(() => {
    if (!editingOrganization && watchedName && !watchedSlug) {
      setValue('slug', buildSlug(watchedName), { shouldValidate: true })
    }
  }, [editingOrganization, setValue, watchedName, watchedSlug])

  const openCreateModal = () => {
    setEditingOrganization(null)
    setFormError(null)
    reset({
      name: '',
      slug: '',
      description: '',
      logo_path: '',
      logo_file: undefined,
      default_locale: 'ru',
      timezone: 'Asia/Baku',
      currency_code: 'AZN',
      admin_user_id: '',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (organization: OrganizationRow) => {
    setEditingOrganization(organization)
    setFormError(null)
    reset({
      name: organization.name,
      slug: organization.slug,
      description: organization.description ?? '',
      logo_path: organization.logo_path ?? '',
      logo_file: undefined,
      default_locale: organization.default_locale,
      timezone: organization.timezone,
      currency_code: organization.currency_code,
      admin_user_id: '',
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingOrganization(null)
    setFormError(null)
  }

  const createMutation = useMutation({
    mutationFn: async (values: z.output<typeof organizationSchema>) => {
      const { data, error } = await supabase.rpc('create_organization_with_admin', {
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        logo_path: values.logo_path || null,
        default_locale: values.default_locale,
        timezone: values.timezone,
        currency_code: values.currency_code,
        admin_user_id: values.admin_user_id || null,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (values: z.output<typeof organizationSchema>) => {
      if (!editingOrganization) {
        throw new Error('Организация не выбрана.')
      }

      const { data, error } = await supabase
        .from('organizations')
        .update({
          name: values.name,
          slug: values.slug,
          description: values.description || null,
          logo_path: values.logo_path || null,
          default_locale: values.default_locale,
          timezone: values.timezone,
          currency_code: values.currency_code,
        })
        .eq('id', editingOrganization.id)
        .select(organizationSelect)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async (organization: OrganizationRow) => {
      const confirmed = window.confirm(
        `Архивировать организацию "${organization.name}"? Рабочий доступ пользователей будет заблокирован.`,
      )

      if (!confirmed) {
        return null
      }

      const { data, error } = await supabase
        .from('organizations')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
        })
        .eq('id', organization.id)
        .select(organizationSelect)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
  })

  const onSubmit = handleSubmit(async (rawValues) => {
    setFormError(null)
    const values = organizationSchema.parse(rawValues)
    const logoFile = rawValues.logo_file?.item?.(0) as File | undefined

    try {
      if (editingOrganization) {
        const logoPath = logoFile
          ? await uploadOrganizationLogo({ file: logoFile, organizationId: editingOrganization.id })
          : values.logo_path

        await updateMutation.mutateAsync({ ...values, logo_path: logoPath || '' })
      } else {
        const createdOrganization = await createMutation.mutateAsync(values)

        if (logoFile) {
          const logoPath = await uploadOrganizationLogo({
            file: logoFile,
            organizationId: createdOrganization.id,
          })

          const { error } = await supabase
            .from('organizations')
            .update({ logo_path: logoPath })
            .eq('id', createdOrganization.id)

          if (error) {
            throw new Error(error.message)
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['platform'] })
      closeModal()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить организацию.')
    }
  })

  const organizations = useMemo(() => organizationsQuery.data ?? [], [organizationsQuery.data])
  const activeCount = useMemo(
    () => organizations.filter((item) => item.status === 'active').length,
    [organizations],
  )

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Организации
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Управление tenant-организациями, статусами и первичными администраторами.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
              Всего: {organizations.length}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">
              Активны: {activeCount}
            </span>
          </div>
        </div>

        <Button className="shrink-0" onClick={openCreateModal} type="button">
          <Plus aria-hidden="true" className="size-4" />
          Создать организацию
        </Button>
      </header>

      {organizationsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
          Загрузка организаций
        </div>
      ) : null}

      {organizationsQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {organizationsQuery.error.message}
        </div>
      ) : null}

      {!organizationsQuery.isLoading && !organizations.length ? (
        <EmptyState
          description="Создайте первую организацию и назначьте администратора из существующих Auth-пользователей."
          icon={Building2}
          title="Организации еще не созданы"
        />
      ) : null}

      {organizations.length ? (
        <div className="grid gap-3">
          {organizations.map((organization) => (
            <article
              className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              key={organization.id}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <CatalogImage
                    alt={organization.name}
                    className="size-12"
                    imagePath={organization.logo_path}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        {organization.name}
                      </h3>
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-xs font-medium',
                          statusClass[organization.status],
                        )}
                      >
                        {statusLabel[organization.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {organization.description || 'Описание не заполнено.'}
                    </p>
                    <a
                      className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-emerald-700 hover:text-emerald-800"
                      href={buildOrganizationUrl(organization.slug)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="truncate">{buildOrganizationUrl(organization.slug)}</span>
                      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {organization.status === 'active' ? (
                    <>
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                        to={`/${organization.slug}/admin`}
                      >
                        <ShieldCheck aria-hidden="true" className="size-4" />
                        Админка
                      </Link>
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-800 transition-colors hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
                        to={`/${organization.slug}/employee`}
                      >
                        <BriefcaseBusiness aria-hidden="true" className="size-4" />
                        Сотрудник
                      </Link>
                    </>
                  ) : null}
                  <Link
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                    to={`/platform/organizations/${organization.id}/users`}
                  >
                    <Users aria-hidden="true" className="size-4" />
                    Пользователи
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                    to={`/platform/organizations/${organization.id}/setup`}
                  >
                    <ListChecks aria-hidden="true" className="size-4" />
                    Setup
                  </Link>
                  <Button onClick={() => openEditModal(organization)} type="button" variant="secondary">
                    <Edit3 aria-hidden="true" className="size-4" />
                    Редактировать
                  </Button>
                  <Button
                    disabled={organization.status === 'archived' || archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate(organization)}
                    type="button"
                    variant="danger"
                  >
                    <Archive aria-hidden="true" className="size-4" />
                    Архивировать
                  </Button>
                </div>
              </div>

              <dl className="grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Язык</dt>
                  <dd className="mt-1 text-slate-900">{organization.default_locale}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Валюта</dt>
                  <dd className="mt-1 text-slate-900">{organization.currency_code}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Часовой пояс</dt>
                  <dd className="mt-1 text-slate-900">{organization.timezone}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Создана</dt>
                  <dd className="mt-1 text-slate-900">{formatDate(organization.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-slate-500">Активные доступы</dt>
                  <dd className="mt-1 text-slate-900">
                    {membershipsCountQuery.data?.[organization.id] ?? 0}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      {isModalOpen ? (
        <Modal onClose={closeModal}>
          <form
            className="grid max-h-[calc(100svh-3rem)] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            noValidate
            onSubmit={onSubmit}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {editingOrganization ? 'Редактировать организацию' : 'Создать организацию'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Администратор выбирается из уже созданных Supabase Auth пользователей.
                </p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={closeModal}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input error={errors.name?.message} id="name" label="Название" {...register('name')} />
              <Input
                error={errors.slug?.message}
                id="slug"
                label="Slug"
                {...register('slug')}
                onBlur={(event) => {
                  setValue('slug', buildSlug(event.target.value), { shouldValidate: true })
                }}
                onChange={(event) => {
                  setValue('slug', buildSlug(event.target.value), { shouldValidate: true })
                }}
              />
              {organizationUrl ? (
                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 sm:col-span-2">
                  Ссылка организации: {organizationUrl}
                </div>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Описание</span>
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...register('description')}
                />
              </label>
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <div className="flex items-center gap-3">
                  <CatalogImage
                    alt={watchedName || 'Логотип организации'}
                    className="size-14"
                    imagePath={watchedLogoPath}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">Логотип организации</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      PNG, JPG или WebP до 5 MB. Файл будет сжат и сохранён в Storage.
                    </div>
                  </div>
                </div>
                <ImageFileInput
                  id="organization_logo_file"
                  label="Загрузить логотип"
                  {...register('logo_file')}
                />
                <Input id="logo_path" label="Путь логотипа" {...register('logo_path')} />
              </div>
              <Input
                error={errors.admin_user_id?.message}
                id="admin_user_id"
                label="UUID администратора"
                {...register('admin_user_id')}
                disabled={Boolean(editingOrganization)}
              />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Язык</span>
                <select
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...register('default_locale')}
                >
                  <option value="ru">ru</option>
                  <option value="az">az</option>
                  <option value="en">en</option>
                </select>
              </label>
              <Input error={errors.timezone?.message} id="timezone" label="Часовой пояс" {...register('timezone')} />
              <Input
                error={errors.currency_code?.message}
                id="currency_code"
                label="Валюта"
                maxLength={3}
                {...register('currency_code')}
              />
            </div>

            {formError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                {formError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={closeModal} type="button" variant="secondary">
                Отмена
              </Button>
              <Button disabled={isSubmitting || createMutation.isPending || updateMutation.isPending} type="submit">
                {isSubmitting || createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                Сохранить
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
