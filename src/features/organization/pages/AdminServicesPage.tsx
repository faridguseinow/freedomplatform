import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Box, Edit3, Loader2, Plus, RotateCcw, Save, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import type {
  CatalogItemStatus,
  ServicePricingType,
  ServiceRow,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  type ServiceInput,
  useCatalogCategories,
  useServiceMutations,
  useServices,
} from '../catalog/catalogApi'
import { uploadCatalogImage } from '../catalog/imageUpload'

const serviceSchema = z
  .object({
    category_id: z.string().uuid().optional().or(z.literal('')),
    name: z.string().trim().min(2, 'Введите название.'),
    description: z.string().trim().optional(),
    characteristics: z.string().trim().optional(),
    pricing_type: z.enum(['fixed', 'hourly']),
    fixed_price: z.number().min(0, 'Цена не может быть отрицательной.').optional(),
    hourly_rate: z.number().min(0, 'Тариф не может быть отрицательным.').optional(),
    minimum_minutes: z.number().int().min(1, 'Минимум должен быть больше 0.').optional(),
    billing_step_minutes: z.number().int().min(1, 'Шаг должен быть больше 0.').optional(),
    sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
    status: z.enum(['active', 'inactive', 'archived']),
    image: z.instanceof(FileList).optional(),
  })
  .superRefine((value, context) => {
    if (value.pricing_type === 'fixed' && value.fixed_price === undefined) {
      context.addIssue({ code: 'custom', path: ['fixed_price'], message: 'Укажите фиксированную цену.' })
    }
    if (
      value.pricing_type === 'hourly' &&
      (!value.hourly_rate || !value.minimum_minutes || !value.billing_step_minutes)
    ) {
      context.addIssue({ code: 'custom', path: ['hourly_rate'], message: 'Для почасовой услуги нужны тариф, минимум и шаг.' })
    }
  })

type ServiceFormValues = z.infer<typeof serviceSchema>
type StatusFilter = CatalogItemStatus | 'all'
type PricingFilter = ServicePricingType | 'all'

const pricingLabel: Record<ServicePricingType, string> = {
  fixed: 'Фиксированная',
  hourly: 'Почасовая',
}

const statusLabel: Record<CatalogItemStatus, string> = {
  active: 'Активна',
  inactive: 'Выключена',
  archived: 'Архив',
}

const statusClass: Record<CatalogItemStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800',
  inactive: 'bg-amber-50 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
}

export function AdminServicesPage() {
  const { organizationId, user } = useAuth()
  const servicesQuery = useServices({ organizationId })
  const categoriesQuery = useCatalogCategories({ organizationId })
  const serviceMutations = useServiceMutations(organizationId)
  const [search, setSearch] = useState('')
  const [pricingFilter, setPricingFilter] = useState<PricingFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [editingService, setEditingService] = useState<ServiceRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { control, formState: { errors, isSubmitting }, handleSubmit, register, reset } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      category_id: '',
      name: '',
      description: '',
      characteristics: '',
      pricing_type: 'fixed',
      fixed_price: 0,
      hourly_rate: undefined,
      minimum_minutes: undefined,
      billing_step_minutes: undefined,
      sort_order: 0,
      status: 'active',
    },
  })

  const pricingType = useWatch({ control, name: 'pricing_type' })
  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data])
  const serviceCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'service' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const visibleServices = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return services.filter((service) => {
      const matchesPricing = pricingFilter === 'all' || service.pricing_type === pricingFilter
      const matchesStatus = statusFilter === 'all' || service.status === statusFilter
      if (!matchesPricing || !matchesStatus) return false
      if (!needle) return true
      return [service.name, service.characteristics, service.description].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [pricingFilter, search, services, statusFilter])

  const openCreate = () => {
    setEditingService(null)
    setFormError(null)
    reset({ category_id: '', name: '', description: '', characteristics: '', pricing_type: 'fixed', fixed_price: 0, hourly_rate: undefined, minimum_minutes: undefined, billing_step_minutes: undefined, sort_order: 0, status: 'active' })
    setIsModalOpen(true)
  }

  const openEdit = (service: ServiceRow) => {
    setEditingService(service)
    setFormError(null)
    reset({ category_id: service.category_id ?? '', name: service.name, description: service.description ?? '', characteristics: service.characteristics ?? '', pricing_type: service.pricing_type, fixed_price: service.fixed_price ?? undefined, hourly_rate: service.hourly_rate ?? undefined, minimum_minutes: service.minimum_minutes ?? undefined, billing_step_minutes: service.billing_step_minutes ?? undefined, sort_order: service.sort_order, status: service.status })
    setIsModalOpen(true)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }
    setFormError(null)
    try {
      const file = values.image?.item(0)

      if (!file && !editingService?.image_path) {
        setFormError('Загрузите фото услуги.')
        return
      }

      const serviceId = editingService?.id ?? crypto.randomUUID()
      let imagePath = editingService?.image_path ?? null

      if (file) {
        imagePath = await uploadCatalogImage({ file, itemId: serviceId, kind: 'services', organizationId })
      }

      const input: ServiceInput = {
        ...(editingService ? {} : { id: serviceId }),
        organization_id: organizationId,
        category_id: values.category_id || null,
        name: values.name,
        description: values.description || null,
        characteristics: values.characteristics || null,
        image_path: imagePath,
        pricing_type: values.pricing_type,
        fixed_price: values.pricing_type === 'fixed' ? values.fixed_price ?? null : null,
        hourly_rate: values.pricing_type === 'hourly' ? values.hourly_rate ?? null : null,
        minimum_minutes: values.pricing_type === 'hourly' ? values.minimum_minutes ?? null : null,
        billing_step_minutes: values.pricing_type === 'hourly' ? values.billing_step_minutes ?? null : null,
        sort_order: values.sort_order,
        status: values.status,
        created_by: editingService?.created_by ?? user.id,
      }
      const saved = await serviceMutations.upsert.mutateAsync({ id: editingService?.id, input })
      void saved
      setIsModalOpen(false)
      setEditingService(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить услугу.')
    }
  })

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Услуги</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Фиксированные и почасовые услуги организации.</p>
        </div>
        <Button onClick={openCreate} type="button"><Plus className="size-4" />Создать услугу</Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" onChange={(event) => setSearch(event.target.value)} placeholder="Название или характеристика" type="search" value={search} /></span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'fixed', 'hourly'] as const).map((item) => <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', pricingFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setPricingFilter(item)} type="button">{item === 'all' ? 'Все типы' : pricingLabel[item]}</button>)}
          {(['all', 'active', 'inactive', 'archived'] as const).map((item) => <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', statusFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setStatusFilter(item)} type="button">{item === 'all' ? 'Все статусы' : statusLabel[item]}</button>)}
        </div>
      </div>

      {servicesQuery.isLoading ? <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600"><Loader2 className="size-4 animate-spin text-emerald-700" />Загрузка услуг</div> : null}
      {servicesQuery.isError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{servicesQuery.error.message}</div> : null}
      {!servicesQuery.isLoading && !visibleServices.length ? <EmptyState description="Создайте первую услугу." icon={Box} title="Услуг пока нет" /> : null}

      {visibleServices.length ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1">
          {visibleServices.map((service) => (
            <article
              className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:gap-3 sm:p-4 lg:grid-cols-[88px_1fr_auto]"
              key={service.id}
            >
              <CatalogImage alt={service.name} className="size-20 self-start sm:size-22" imagePath={service.image_path} />
              <div className="min-w-0">
                <div className="grid gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{service.name}</h3>
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-800 sm:py-1 sm:text-xs">{pricingLabel[service.pricing_type]}</span>
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium sm:py-1 sm:text-xs', statusClass[service.status])}>{statusLabel[service.status]}</span>
                  </div>
                </div>
                <p className="mt-1 hidden text-sm text-slate-600 sm:block">{service.characteristics || service.description || 'Описание не заполнено.'}</p>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs sm:mt-3 sm:grid-cols-4 sm:gap-2 sm:text-sm">
                  <div><dt className="text-xs uppercase text-slate-500">Цена</dt><dd>{service.pricing_type === 'fixed' ? service.fixed_price : service.hourly_rate}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Мин.</dt><dd>{service.minimum_minutes ?? '-'}</dd></div>
                  <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">Шаг</dt><dd>{service.billing_step_minutes ?? '-'}</dd></div>
                  <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">Порядок</dt><dd>{service.sort_order}</dd></div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button className="min-h-9 w-full px-2 text-xs sm:min-h-10 sm:w-auto sm:px-4 sm:text-sm" onClick={() => openEdit(service)} type="button" variant="secondary"><Edit3 className="size-4" />Редактировать</Button>
                <Button className="hidden sm:inline-flex" onClick={() => serviceMutations.setStatus.mutate({ id: service.id, status: service.status === 'archived' ? 'active' : 'archived' })} type="button" variant={service.status === 'archived' ? 'secondary' : 'danger'}>{service.status === 'archived' ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}{service.status === 'archived' ? 'Восстановить' : 'Архивировать'}</Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {isModalOpen ? <Modal onClose={() => setIsModalOpen(false)}><form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-semibold text-slate-950">{editingService ? 'Редактировать услугу' : 'Создать услугу'}</h3><button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button"><X className="size-4" /></button></div><div className="grid gap-4 sm:grid-cols-2"><Input error={errors.name?.message} id="service_name" label="Название" {...register('name')} /><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Категория</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('category_id')}><option value="">Без категории</option>{serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип цены</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('pricing_type')}><option value="fixed">Фиксированная</option><option value="hourly">Почасовая</option></select></label>{pricingType === 'fixed' ? <Input error={errors.fixed_price?.message} id="fixed_price" label="Фиксированная цена" min={0} step="0.01" type="number" {...register('fixed_price', { valueAsNumber: true })} /> : <><Input error={errors.hourly_rate?.message} id="service_hourly_rate" label="Почасовой тариф" min={0} step="0.01" type="number" {...register('hourly_rate', { valueAsNumber: true })} /><Input error={errors.minimum_minutes?.message} id="service_minimum_minutes" label="Минимум минут" min={1} type="number" {...register('minimum_minutes', { valueAsNumber: true })} /><Input error={errors.billing_step_minutes?.message} id="service_billing_step" label="Шаг тарификации" min={1} type="number" {...register('billing_step_minutes', { valueAsNumber: true })} /></>}<Input error={errors.sort_order?.message} id="service_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} /><label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Статус</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('status')}><option value="active">Активна</option><option value="inactive">Выключена</option><option value="archived">Архив</option></select></label><ImageFileInput error={errors.image?.message} id="service_image" label="Фото" {...register('image')} /><label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Характеристики</span><textarea className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('characteristics')} /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Описание</span><textarea className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('description')} /></label></div>{formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button><Button disabled={isSubmitting || serviceMutations.upsert.isPending} type="submit">{isSubmitting || serviceMutations.upsert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button></div></form></Modal> : null}
    </section>
  )
}
