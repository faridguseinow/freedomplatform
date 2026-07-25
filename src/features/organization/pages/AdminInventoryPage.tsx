import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Loader2, Plus, Save, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import type { StockMovementType } from '../../../lib/supabase/database.types'
import { useProducts } from '../catalog/catalogApi'
import {
  stockDocumentTypeLabel,
  useInventoryBalances,
  useInventoryMutations,
  useStockDocuments,
} from '../catalog/inventoryApi'

const documentSchema = z.object({
  type: z.enum(['purchase', 'write_off', 'adjustment_in', 'adjustment_out']),
  supplier_name: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  comment: z.string().trim().optional(),
  post_now: z.boolean(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid('Выберите товар.'),
        quantity: z.number().min(0.001, 'Количество должно быть больше 0.'),
        unit_cost: z.number().min(0, 'Цена не может быть отрицательной.').optional(),
        comment: z.string().trim().optional(),
      }),
    )
    .min(1, 'Добавьте хотя бы одну позицию.'),
})

type DocumentFormValues = z.infer<typeof documentSchema>

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 3 }).format(value ?? 0)

export function AdminInventoryPage() {
  const { organizationId, user } = useAuth()
  const balancesQuery = useInventoryBalances(organizationId)
  const documentsQuery = useStockDocuments(organizationId)
  const productsQuery = useProducts({ organizationId })
  const inventoryMutations = useInventoryMutations(organizationId)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [outOnly, setOutOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      type: 'purchase',
      supplier_name: '',
      reference: '',
      comment: '',
      post_now: true,
      items: [{ product_id: '', quantity: 1, unit_cost: 0, comment: '' }],
    },
  })

  const { append, fields, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const stockProducts = useMemo(() => balancesQuery.data ?? [], [balancesQuery.data])
  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return stockProducts.filter((product) => {
      if (lowOnly && product.stock_quantity > product.minimum_stock_quantity) return false
      if (outOnly && product.stock_quantity > 0) return false
      if (!needle) return true
      return [product.name, product.sku].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [lowOnly, outOnly, search, stockProducts])

  const documentTotal = watchedItems.reduce(
    (sum, item) => sum + item.quantity * (item.unit_cost ?? 0),
    0,
  )

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }

    setFormError(null)

    try {
      const document = await inventoryMutations.createDocument.mutateAsync({
        organization_id: organizationId,
        type: values.type,
        supplier_name: values.supplier_name || null,
        reference: values.reference || null,
        comment: values.comment || null,
        total_amount: documentTotal,
        created_by: user.id,
      })

      await inventoryMutations.addItems.mutateAsync(
        values.items.map((item) => ({
          organization_id: organizationId,
          document_id: document.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost ?? null,
          line_total: item.quantity * (item.unit_cost ?? 0),
          comment: item.comment || null,
        })),
      )

      if (values.post_now) {
        await inventoryMutations.postDocument.mutateAsync(document.id)
      }

      reset()
      setIsModalOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить документ.')
    }
  })

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Склад</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Остатки товаров, складские документы и история движений.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} type="button">
          <Plus className="size-4" />
          Создать документ
        </Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название или SKU"
              type="search"
              value={search}
            />
          </span>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} type="checkbox" />
          Низкий остаток
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input checked={outOnly} onChange={(event) => setOutOnly(event.target.checked)} type="checkbox" />
          Нет в наличии
        </label>
      </div>

      {balancesQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" />
          Загрузка склада
        </div>
      ) : null}

      {!balancesQuery.isLoading && !visibleProducts.length ? (
        <EmptyState description="Товаров со складским учетом пока нет." icon={Archive} title="Склад пуст" />
      ) : null}

      {visibleProducts.length ? (
        <div className="grid gap-3">
          {visibleProducts.map((product) => {
            const low = product.stock_quantity <= product.minimum_stock_quantity
            const out = product.stock_quantity <= 0

            return (
              <article
                className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]"
                key={product.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">{product.name}</h3>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {product.sku || 'без SKU'}
                    </span>
                    <span className={out ? 'rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700' : low ? 'rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800' : 'rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800'}>
                      {out ? 'Нет в наличии' : low ? 'Низкий остаток' : 'В наличии'}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
                    <div><dt className="text-xs uppercase text-slate-500">Остаток</dt><dd>{formatNumber(product.stock_quantity)} {product.unit_name}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Минимум</dt><dd>{formatNumber(product.minimum_stock_quantity)}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Средняя</dt><dd>{formatNumber(product.average_purchase_cost)}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Закупка</dt><dd>{formatNumber(product.purchase_price)}</dd></div>
                    <div><dt className="text-xs uppercase text-slate-500">Стоимость</dt><dd>{formatNumber(product.stock_quantity * product.average_purchase_cost)}</dd></div>
                  </dl>
                </div>
                <div className="flex items-start gap-2 lg:justify-end">
                  <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50" to={`/admin/inventory/products/${product.id}`}>
                    История
                  </Link>
                  <Button onClick={() => inventoryMutations.reconcileProduct.mutate(product.id)} type="button" variant="secondary">
                    Сверить
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Последние документы</h3>
          <Link className="text-sm font-medium text-emerald-800 hover:text-emerald-900" to="/admin/inventory/documents">
            Все документы
          </Link>
        </div>
        {(documentsQuery.data ?? []).slice(0, 5).map((document) => (
          <article className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between" key={document.id}>
            <div>
              <p className="font-medium text-slate-950">#{document.document_number} · {stockDocumentTypeLabel[document.type]}</p>
              <p className="text-slate-500">{document.status} · {new Date(document.document_date).toLocaleDateString('ru')}</p>
            </div>
            <p className="font-medium text-slate-900">{formatNumber(document.total_amount)} AZN</p>
          </article>
        ))}
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6">
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">Складской документ</h3>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register('type')}>{(['purchase', 'write_off', 'adjustment_in', 'adjustment_out'] satisfies StockMovementType[]).map((type) => <option key={type} value={type}>{stockDocumentTypeLabel[type]}</option>)}</select></label>
              <Input id="supplier_name" label="Поставщик" {...register('supplier_name')} />
              <Input id="reference" label="Reference" {...register('reference')} />
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700"><input type="checkbox" {...register('post_now')} />Провести сразу</label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Комментарий</span><textarea className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm" {...register('comment')} /></label>
            </div>
            <div className="grid gap-3">
              {fields.map((field, index) => (
                <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_120px_120px_auto]" key={field.id}>
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Товар</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`items.${index}.product_id`)}><option value="">Выберите</option>{products.filter((item) => item.track_stock).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                  <Input id={`qty_${field.id}`} label="Кол-во" min={0.001} step="0.001" type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
                  <Input id={`cost_${field.id}`} label="Цена" min={0} step="0.0001" type="number" {...register(`items.${index}.unit_cost`, { valueAsNumber: true })} />
                  <div className="flex items-end"><Button onClick={() => remove(index)} type="button" variant="danger">Убрать</Button></div>
                </div>
              ))}
              <Button onClick={() => append({ product_id: '', quantity: 1, unit_cost: 0, comment: '' })} type="button" variant="secondary"><Plus className="size-4" />Добавить позицию</Button>
            </div>
            {errors.items?.message ? <p className="text-sm text-red-700">{errors.items.message}</p> : null}
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">Итого: {formatNumber(documentTotal)} AZN</div>
            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button>
              <Button disabled={isSubmitting || inventoryMutations.createDocument.isPending} type="submit">{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
