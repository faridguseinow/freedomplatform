import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Edit3, Loader2, MapPin, Plus, RotateCcw, Save, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import type { CatalogItemStatus, PlaceRow, PlaceType } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { type PlaceInput, useCatalogCategories, usePlaceMutations, usePlaces } from '../catalog/catalogApi'
import { uploadCatalogImage } from '../catalog/imageUpload'

const placeSchema = z
  .object({
    category_id: z.string().uuid().optional().or(z.literal('')),
    name: z.string().trim().min(2, 'Введите название.'),
    type: z.enum(['table', 'vip_room', 'playstation', 'billiard', 'racing', 'private_room', 'service_area', 'other']),
    custom_type_name: z.string().trim().optional(),
    description: z.string().trim().optional(),
    has_timer: z.boolean(),
    hourly_rate: z.number().min(0, 'Тариф не может быть отрицательным.').optional(),
    minimum_minutes: z.number().int().min(1, 'Минимум должен быть больше 0.').optional(),
    billing_step_minutes: z.number().int().min(1, 'Шаг должен быть больше 0.').optional(),
    capacity: z.number().int().min(1, 'Вместимость должна быть больше 0.').optional(),
    sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
    status: z.enum(['active', 'inactive', 'archived']),
    image: z.instanceof(FileList).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'other' && !value.custom_type_name) {
      context.addIssue({ code: 'custom', path: ['custom_type_name'], message: 'Укажите пользовательский тип.' })
    }
    if (value.has_timer && (!value.hourly_rate || !value.minimum_minutes || !value.billing_step_minutes)) {
      context.addIssue({ code: 'custom', path: ['hourly_rate'], message: 'Для таймера нужны тариф, минимум и шаг.' })
    }
  })

type PlaceFormValues = z.infer<typeof placeSchema>
type StatusFilter = CatalogItemStatus | 'all'
type TypeFilter = PlaceType | 'all'

const placeTypeLabel: Record<PlaceType, string> = {
  table: 'Стол',
  vip_room: 'VIP',
  playstation: 'PlayStation',
  billiard: 'Бильярд',
  racing: 'Руль',
  private_room: 'Кабинет',
  service_area: 'Зона',
  other: 'Другое',
}

const statusLabel: Record<CatalogItemStatus, string> = {
  active: 'Активно',
  inactive: 'Выключено',
  archived: 'Архив',
}

const statusClass: Record<CatalogItemStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800',
  inactive: 'bg-amber-50 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
}

export function AdminPlacesPage() {
  const { organizationId, user } = useAuth()
  const placesQuery = usePlaces({ organizationId })
  const categoriesQuery = useCatalogCategories({ organizationId })
  const placeMutations = usePlaceMutations(organizationId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [editingPlace, setEditingPlace] = useState<PlaceRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { control, formState: { errors, isSubmitting }, handleSubmit, register, reset } = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      category_id: '',
      name: '',
      type: 'table',
      custom_type_name: '',
      description: '',
      has_timer: false,
      hourly_rate: undefined,
      minimum_minutes: undefined,
      billing_step_minutes: undefined,
      capacity: undefined,
      sort_order: 0,
      status: 'active',
    },
  })

  const hasTimer = useWatch({ control, name: 'has_timer' })
  const selectedType = useWatch({ control, name: 'type' })
  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data])
  const placeCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'place' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const visiblePlaces = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return places.filter((place) => {
      const matchesType = typeFilter === 'all' || place.type === typeFilter
      const matchesStatus = statusFilter === 'all' || place.status === statusFilter
      if (!matchesType || !matchesStatus) return false
      if (!needle) return true
      return [place.name, place.custom_type_name, place.description].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [places, search, statusFilter, typeFilter])

  const openCreate = () => {
    setEditingPlace(null)
    setFormError(null)
    reset({ category_id: '', name: '', type: 'table', custom_type_name: '', description: '', has_timer: false, hourly_rate: undefined, minimum_minutes: undefined, billing_step_minutes: undefined, capacity: undefined, sort_order: 0, status: 'active' })
    setIsModalOpen(true)
  }

  const openEdit = (place: PlaceRow) => {
    setEditingPlace(place)
    setFormError(null)
    reset({ category_id: place.category_id ?? '', name: place.name, type: place.type, custom_type_name: place.custom_type_name ?? '', description: place.description ?? '', has_timer: place.has_timer, hourly_rate: place.hourly_rate ?? undefined, minimum_minutes: place.minimum_minutes ?? undefined, billing_step_minutes: place.billing_step_minutes ?? undefined, capacity: place.capacity ?? undefined, sort_order: place.sort_order, status: place.status })
    setIsModalOpen(true)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }
    setFormError(null)
    try {
      const input: PlaceInput = {
        organization_id: organizationId,
        category_id: values.category_id || null,
        name: values.name,
        type: values.type,
        custom_type_name: values.type === 'other' ? values.custom_type_name || null : null,
        description: values.description || null,
        image_path: editingPlace?.image_path ?? null,
        has_timer: values.has_timer,
        hourly_rate: values.has_timer ? values.hourly_rate ?? null : null,
        minimum_minutes: values.has_timer ? values.minimum_minutes ?? null : null,
        billing_step_minutes: values.has_timer ? values.billing_step_minutes ?? null : null,
        capacity: values.capacity ?? null,
        sort_order: values.sort_order,
        status: values.status,
        created_by: editingPlace?.created_by ?? user.id,
      }
      const saved = await placeMutations.upsert.mutateAsync({ id: editingPlace?.id, input })
      const file = values.image?.item(0)
      if (file) {
        const imagePath = await uploadCatalogImage({ file, itemId: saved.id, kind: 'places', organizationId })
        await placeMutations.upsert.mutateAsync({ id: saved.id, input: { ...input, image_path: imagePath } })
      }
      setIsModalOpen(false)
      setEditingPlace(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить место.')
    }
  })

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Места</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Столы, кабинеты, игровые зоны и другие места обслуживания.</p>
        </div>
        <Button onClick={openCreate} type="button"><Plus className="size-4" />Создать место</Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" onChange={(event) => setSearch(event.target.value)} placeholder="Название или описание" type="search" value={search} />
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'table', 'vip_room', 'playstation', 'billiard', 'racing', 'private_room', 'service_area', 'other'] as const).map((item) => (
            <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', typeFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setTypeFilter(item)} type="button">
              {item === 'all' ? 'Все типы' : placeTypeLabel[item]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'active', 'inactive', 'archived'] as const).map((item) => (
            <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', statusFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setStatusFilter(item)} type="button">
              {item === 'all' ? 'Все статусы' : statusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {placesQuery.isLoading ? <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600"><Loader2 className="size-4 animate-spin text-emerald-700" />Загрузка мест</div> : null}
      {placesQuery.isError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{placesQuery.error.message}</div> : null}
      {!placesQuery.isLoading && !visiblePlaces.length ? <EmptyState description="Создайте первое место обслуживания." icon={MapPin} title="Мест пока нет" /> : null}

      {visiblePlaces.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePlaces.map((place) => (
            <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={place.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-950">{place.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{placeTypeLabel[place.type]}{place.custom_type_name ? ` · ${place.custom_type_name}` : ''}</p>
                </div>
                <span className={cn('rounded-md px-2 py-1 text-xs font-medium', statusClass[place.status])}>{statusLabel[place.status]}</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs uppercase text-slate-500">Таймер</dt><dd>{place.has_timer ? 'Да' : 'Нет'}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Тариф</dt><dd>{place.hourly_rate ?? '-'}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Минимум</dt><dd>{place.minimum_minutes ?? '-'}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Шаг</dt><dd>{place.billing_step_minutes ?? '-'}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => openEdit(place)} type="button" variant="secondary"><Edit3 className="size-4" />Редактировать</Button>
                <Button onClick={() => placeMutations.setStatus.mutate({ id: place.id, status: place.status === 'archived' ? 'active' : 'archived' })} type="button" variant={place.status === 'archived' ? 'secondary' : 'danger'}>
                  {place.status === 'archived' ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}{place.status === 'archived' ? 'Восстановить' : 'Архивировать'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{editingPlace ? 'Редактировать место' : 'Создать место'}</h3>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input error={errors.name?.message} id="place_name" label="Название" {...register('name')} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('type')}>{Object.entries(placeTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {selectedType === 'other' ? <Input error={errors.custom_type_name?.message} id="custom_type_name" label="Название типа" {...register('custom_type_name')} /> : null}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Категория</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('category_id')}><option value="">Без категории</option>{placeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700"><input type="checkbox" {...register('has_timer')} />Включить таймер</label>
              <Input error={errors.capacity?.message} id="capacity" label="Вместимость" min={1} type="number" {...register('capacity', { valueAsNumber: true })} />
              {hasTimer ? <><Input error={errors.hourly_rate?.message} id="hourly_rate" label="Почасовой тариф" min={0} step="0.01" type="number" {...register('hourly_rate', { valueAsNumber: true })} /><Input error={errors.minimum_minutes?.message} id="minimum_minutes" label="Минимум минут" min={1} type="number" {...register('minimum_minutes', { valueAsNumber: true })} /><Input error={errors.billing_step_minutes?.message} id="billing_step_minutes" label="Шаг расчета" min={1} type="number" {...register('billing_step_minutes', { valueAsNumber: true })} /></> : null}
              <Input error={errors.sort_order?.message} id="place_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Статус</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('status')}><option value="active">Активно</option><option value="inactive">Выключено</option><option value="archived">Архив</option></select></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Фото</span><input accept="image/*" type="file" {...register('image')} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Описание</span><textarea className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('description')} /></label>
            </div>
            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button><Button disabled={isSubmitting || placeMutations.upsert.isPending} type="submit">{isSubmitting || placeMutations.upsert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button></div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
