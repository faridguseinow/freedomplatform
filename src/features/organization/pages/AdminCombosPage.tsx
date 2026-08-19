import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Edit3, Gift, Loader2, Plus, RotateCcw, Save, X } from 'lucide-react'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import type { ComboRow, ComboStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { useCatalogCategories, useProducts, useServices } from '../catalog/catalogApi'
import {
  comboStatusLabel,
  type ComboComponentInput,
  type ComboInput,
  useComboAvailability,
  useComboComponents,
  useComboMutations,
  useCombos,
} from '../catalog/comboApi'
import { uploadCatalogImage } from '../catalog/imageUpload'

const comboSchema = z.object({
  category_id: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Введите название.'),
  description: z.string().trim().optional(),
  sale_price: z.number().min(0, 'Цена не может быть отрицательной.'),
  sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
  status: z.enum(['active', 'inactive', 'archived']),
  image: z.instanceof(FileList).optional(),
  components: z
    .array(
      z.object({
        component_type: z.enum(['product', 'service']),
        product_id: z.string().uuid().optional().or(z.literal('')),
        service_id: z.string().uuid().optional().or(z.literal('')),
        quantity: z.number().min(0.001, 'Количество должно быть больше 0.'),
        included_minutes: z.number().int().min(1).optional(),
        is_required: z.boolean(),
        sort_order: z.number().int().min(0),
      }),
    )
    .min(1, 'Добавьте компонент.'),
})

type ComboFormValues = z.infer<typeof comboSchema>
type StatusFilter = ComboStatus | 'all'

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminCombosPage() {
  const { organizationId, user } = useAuth()
  const combosQuery = useCombos(organizationId)
  const componentsQuery = useComboComponents(organizationId)
  const availabilityQuery = useComboAvailability(organizationId)
  const productsQuery = useProducts({ organizationId })
  const servicesQuery = useServices({ organizationId })
  const categoriesQuery = useCatalogCategories({ organizationId })
  const comboMutations = useComboMutations(organizationId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCombo, setEditingCombo] = useState<ComboRow | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { control, formState: { errors, isSubmitting }, handleSubmit, register, reset } = useForm<ComboFormValues>({
    resolver: zodResolver(comboSchema),
    defaultValues: {
      category_id: '',
      name: '',
      description: '',
      sale_price: 0,
      sort_order: 0,
      status: 'active',
      components: [{ component_type: 'product', product_id: '', service_id: '', quantity: 1, is_required: true, sort_order: 0 }],
    },
  })

  const { append, fields, remove } = useFieldArray({ control, name: 'components' })
  const watchedComponents = useWatch({ control, name: 'components' })

  const combos = useMemo(() => combosQuery.data ?? [], [combosQuery.data])
  const products = useMemo(() => (productsQuery.data ?? []).filter((item) => item.status === 'active'), [productsQuery.data])
  const services = useMemo(() => (servicesQuery.data ?? []).filter((item) => item.status === 'active'), [servicesQuery.data])
  const comboCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'product' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const components = useMemo(() => componentsQuery.data ?? [], [componentsQuery.data])
  const availabilityByCombo = useMemo(
    () => new Map((availabilityQuery.data ?? []).map((item) => [item.combo_id, item])),
    [availabilityQuery.data],
  )
  const visibleCombos = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return combos.filter((combo) => {
      if (statusFilter !== 'all' && combo.status !== statusFilter) return false
      if (!needle) return true
      return [combo.name, combo.description].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [combos, search, statusFilter])

  const componentSummary = (comboId: string) =>
    components
      .filter((component) => component.combo_id === comboId)
      .map((component) => {
        const product = products.find((item) => item.id === component.product_id)
        const service = services.find((item) => item.id === component.service_id)
        return `${product?.name ?? service?.name ?? 'Компонент'} × ${component.quantity}`
      })
      .join(', ')

  const regularPrice = (comboId: string) =>
    components
      .filter((component) => component.combo_id === comboId)
      .reduce((sum, component) => {
        const product = products.find((item) => item.id === component.product_id)
        const service = services.find((item) => item.id === component.service_id)
        const price = product?.sale_price ?? service?.fixed_price ?? service?.hourly_rate ?? 0
        return sum + price * component.quantity
      }, 0)

  const openCreate = () => {
    setEditingCombo(null)
    setFormError(null)
    reset({
      category_id: '',
      name: '',
      description: '',
      sale_price: 0,
      sort_order: 0,
      status: 'active',
      components: [{ component_type: 'product', product_id: '', service_id: '', quantity: 1, is_required: true, sort_order: 0 }],
    })
    setIsModalOpen(true)
  }

  const openEdit = (combo: ComboRow) => {
    setEditingCombo(combo)
    setFormError(null)
    // populate form with existing combo values and its components
    reset({
      category_id: combo.category_id ?? '',
      name: combo.name,
      description: combo.description ?? '',
      sale_price: combo.sale_price,
      sort_order: combo.sort_order,
      status: combo.status,
      components: components
        .filter((c) => c.combo_id === combo.id)
        .map((c) => ({
          component_type: c.component_type,
          product_id: c.product_id ?? '',
          service_id: c.service_id ?? '',
          quantity: c.quantity,
          included_minutes: c.included_minutes ?? undefined,
          is_required: c.is_required,
          sort_order: c.sort_order,
        })),
    })
    setIsModalOpen(true)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }

    setFormError(null)

    try {
      const input: ComboInput = {
        organization_id: organizationId,
        category_id: values.category_id || null,
        name: values.name,
        description: values.description || null,
        image_path: editingCombo?.image_path ?? null,
        sale_price: values.sale_price,
        selection_mode: 'fixed',
        sort_order: values.sort_order,
        status: values.status,
        created_by: editingCombo?.created_by ?? user.id,
      }
      const saved = await comboMutations.upsertCombo.mutateAsync({ id: editingCombo?.id, input })
      const file = values.image?.item(0)
      if (file) {
        const imagePath = await uploadCatalogImage({ file, itemId: saved.id, kind: 'combos', organizationId })
        await comboMutations.upsertCombo.mutateAsync({ id: saved.id, input: { ...input, image_path: imagePath } })
      }

      if (!editingCombo) {
        const nextComponents: ComboComponentInput[] = values.components.map((component) => ({
          organization_id: organizationId,
          combo_id: saved.id,
          component_type: component.component_type,
          product_id: component.component_type === 'product' ? component.product_id || null : null,
          service_id: component.component_type === 'service' ? component.service_id || null : null,
          quantity: component.quantity,
          included_minutes: component.component_type === 'service' ? component.included_minutes ?? null : null,
          is_required: component.is_required,
          sort_order: component.sort_order,
        }))
        await comboMutations.addComponents.mutateAsync(nextComponents)
      }

      setIsModalOpen(false)
      setEditingCombo(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить комбо.')
    }
  })

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Комбо</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Наборы из товаров и услуг с автоматической проверкой складской доступности.
          </p>
        </div>
        <Button onClick={openCreate} type="button"><Plus className="size-4" />Создать комбо</Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
        <Input id="combo_search" label="Поиск" onChange={(event) => setSearch(event.target.value)} value={search} />
        <div className="flex flex-wrap items-end gap-2">
          {(['all', 'active', 'inactive', 'archived'] as const).map((item) => (
            <button className={cn('min-h-10 rounded-md border px-3 text-sm font-medium', statusFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setStatusFilter(item)} type="button">
              {item === 'all' ? 'Все' : comboStatusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {combosQuery.isLoading ? <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600"><Loader2 className="size-4 animate-spin text-emerald-700" />Загрузка комбо</div> : null}
      {!combosQuery.isLoading && !visibleCombos.length ? <EmptyState description="Создайте первое fixed-комбо из товаров и услуг." icon={Gift} title="Комбо пока нет" /> : null}

      <div className="grid gap-3">
        {visibleCombos.map((combo) => {
          const availability = availabilityByCombo.get(combo.id)
          const basePrice = regularPrice(combo.id)
          const discount = Math.max(0, basePrice - combo.sale_price)
          return (
            <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]" key={combo.id}>
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <CatalogImage alt={combo.name} imagePath={combo.image_path} className="size-10 rounded-full" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-950">{combo.name}</h3>
                      <span className={cn('rounded-md px-2 py-1 text-xs font-medium', combo.status === 'active' ? 'bg-emerald-50 text-emerald-800' : combo.status === 'inactive' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')}>{comboStatusLabel[combo.status]}</span>
                      <span className={availability?.is_available ? 'rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800' : 'rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700'}>
                        {availability?.is_available ? `Доступно ${availability.available_quantity ?? '∞'}` : 'Нет в наличии'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{componentSummary(combo.id) || 'Состав не заполнен.'}</p>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs uppercase text-slate-500">Обычная</dt><dd>{formatNumber(basePrice)}</dd></div>
                      <div><dt className="text-xs uppercase text-slate-500">Комбо</dt><dd>{formatNumber(combo.sale_price)}</dd></div>
                      <div><dt className="text-xs uppercase text-slate-500">Выгода</dt><dd>{formatNumber(discount)}</dd></div>
                      <div><dt className="text-xs uppercase text-slate-500">Скидка</dt><dd>{basePrice > 0 ? `${Math.round((discount / basePrice) * 100)}%` : '-'}</dd></div>
                    </dl>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button onClick={() => openEdit(combo)} type="button" variant="secondary">
                  <Edit3 className="size-4" />Редактировать
                </Button>
                <Button onClick={() => comboMutations.setStatus.mutate({ id: combo.id, status: combo.status === 'archived' ? 'active' : 'archived' })} type="button" variant={combo.status === 'archived' ? 'secondary' : 'danger'}>
                  {combo.status === 'archived' ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                  {combo.status === 'archived' ? 'Восстановить' : 'Архивировать'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      {isModalOpen ? (
        <Modal onClose={() => setIsModalOpen(false)}>
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold text-slate-950">Создать комбо</h3><p className="mt-1 text-sm text-slate-600">Режим выбора: fixed. Choice будет добавлен позже.</p></div>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input error={errors.name?.message} id="combo_name" label="Название" {...register('name')} />
              <Input error={errors.sale_price?.message} id="combo_price" label="Цена комбо" min={0} step="0.01" type="number" {...register('sale_price', { valueAsNumber: true })} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Категория</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register('category_id')}><option value="">Без категории</option>{comboCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <Input error={errors.sort_order?.message} id="combo_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Статус</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register('status')}><option value="active">Активно</option><option value="inactive">Выключено</option><option value="archived">Архив</option></select></label>
              <ImageFileInput error={errors.image?.message} id="combo_image" label="Фото" {...register('image')} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Описание</span><textarea className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm" {...register('description')} /></label>
            </div>
            <div className="grid gap-3">
              <h4 className="text-sm font-semibold text-slate-950">Компоненты</h4>
              {fields.map((field, index) => {
                const type = watchedComponents[index]?.component_type
                return (
                  <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[120px_1fr_100px_auto]" key={field.id}>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`components.${index}.component_type`)}><option value="product">Товар</option><option value="service">Услуга</option></select></label>
                    {type === 'service' ? <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Услуга</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`components.${index}.service_id`)}><option value="">Выберите</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label> : <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Товар</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`components.${index}.product_id`)}><option value="">Выберите</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
                    <Input id={`combo_qty_${field.id}`} label="Кол-во" min={0.001} step="0.001" type="number" {...register(`components.${index}.quantity`, { valueAsNumber: true })} />
                    <div className="flex items-end"><Button onClick={() => remove(index)} type="button" variant="danger">Убрать</Button></div>
                  </div>
                )
              })}
              <Button onClick={() => append({ component_type: 'product', product_id: '', service_id: '', quantity: 1, is_required: true, sort_order: fields.length })} type="button" variant="secondary"><Plus className="size-4" />Добавить компонент</Button>
            </div>
            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button><Button disabled={isSubmitting || comboMutations.upsertCombo.isPending} type="submit">{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button></div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
