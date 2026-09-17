import { getCurrentLocale } from '../../../lib/i18n/translator'
import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, FilePlus2, Loader2, Plus, Save, Search, ShoppingBasket, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { formatUnitName } from '../../../lib/i18n/formatUnitName'
import type { StockMovementType } from '../../../lib/supabase/database.types'
import { useProductMutations, useProducts } from '../catalog/catalogApi'
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
        product_mode: z.enum(['existing', 'new']),
        product_id: z.string().optional(),
        new_product_name: z.string().trim().optional(),
        quantity: z.number().min(0.001, 'Количество должно быть больше 0.'),
        unit_cost: z.number().min(0, 'Цена не может быть отрицательной.').optional(),
        comment: z.string().trim().optional(),
      }),
    )
    .min(1, 'Добавьте хотя бы одну позицию.'),
}).superRefine((value, context) => {
  value.items.forEach((item, index) => {
    if (item.product_mode === 'existing' && !z.string().uuid().safeParse(item.product_id).success) {
      context.addIssue({
        code: 'custom',
        message: 'Выберите товар.',
        path: ['items', index, 'product_id'],
      })
    }
    if (item.product_mode === 'new' && (item.new_product_name?.trim().length ?? 0) < 2) {
      context.addIssue({
        code: 'custom',
        message: 'Введите название нового товара.',
        path: ['items', index, 'new_product_name'],
      })
    }
  })

  const productIds = value.items
    .filter((item) => item.product_mode === 'existing')
    .map((item) => item.product_id)
  if (new Set(productIds).size !== productIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Один товар нельзя добавлять в закупку несколько раз.',
      path: ['items'],
    })
  }

  const newProductNames = value.items
    .filter((item) => item.product_mode === 'new')
    .map((item) => item.new_product_name?.trim().toLocaleLowerCase() ?? '')
  if (new Set(newProductNames).size !== newProductNames.length) {
    context.addIssue({
      code: 'custom',
      message: 'Один новый товар нельзя добавлять в закупку несколько раз.',
      path: ['items'],
    })
  }

  if (value.type === 'purchase' && value.items.some((item) => !item.unit_cost || item.unit_cost <= 0)) {
    context.addIssue({
      code: 'custom',
      message: 'Для каждого товара укажите закупочную цену больше 0.',
      path: ['items'],
    })
  }
})

type DocumentFormValues = z.infer<typeof documentSchema>
type DocumentMode = 'purchase' | 'other'

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 3 }).format(value ?? 0)

export function AdminInventoryPage() {
  const { organizationId, user } = useAuth()
  const { language, t } = useI18n()
  const defaultUnitName = t('inventory.unitItem')
  const balancesQuery = useInventoryBalances(organizationId)
  const documentsQuery = useStockDocuments(organizationId)
  const productsQuery = useProducts({ organizationId })
  const inventoryMutations = useInventoryMutations(organizationId)
  const productMutations = useProductMutations(organizationId)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [outOnly, setOutOnly] = useState(false)
  const [documentMode, setDocumentMode] = useState<DocumentMode | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    control,
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      type: 'purchase',
      supplier_name: '',
      reference: '',
      comment: '',
      post_now: true,
      items: [{ product_mode: 'existing', product_id: '', new_product_name: '', quantity: 1, unit_cost: 0, comment: '' }],
    },
  })

  const { append, fields, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })

  const products = useMemo(
    () => (productsQuery.data ?? []).filter((product) => product.status !== 'archived'),
    [productsQuery.data],
  )
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

  const openDocument = (mode: DocumentMode) => {
    reset({
      type: mode === 'purchase' ? 'purchase' : 'write_off',
      supplier_name: '',
      reference: '',
      comment: '',
      post_now: mode === 'purchase',
      items: [{ product_mode: 'existing', product_id: '', new_product_name: '', quantity: 1, unit_cost: 0, comment: '' }],
    })
    setFormError(null)
    setSuccessMessage(null)
    setDocumentMode(mode)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }

    setFormError(null)

    try {
      const existingNames = new Set(products.map((product) => product.name.trim().toLocaleLowerCase()))
      const duplicateNewProduct = values.items.find(
        (item) => item.product_mode === 'new' && existingNames.has(item.new_product_name?.trim().toLocaleLowerCase() ?? ''),
      )
      if (duplicateNewProduct) {
        setFormError(t('Товар с таким названием уже существует. Выберите его из списка.'))
        return
      }

      const resolvedItems: Array<{ productId: string; quantity: number; unitCost: number | null; comment: string | null }> = []
      for (const item of values.items) {
        let productId = item.product_id ?? ''
        if (item.product_mode === 'new') {
          const product = await productMutations.upsert.mutateAsync({
            id: undefined,
            input: {
              organization_id: organizationId,
              category_id: null,
              sku: null,
              name: item.new_product_name!.trim(),
              description: null,
              characteristics: null,
              image_path: null,
              sale_price: 0,
              purchase_price: item.unit_cost ?? null,
              stock_quantity: 0,
              minimum_stock_quantity: 0,
              average_purchase_cost: 0,
              unit_name: defaultUnitName,
              track_stock: true,
              sort_order: 0,
              status: 'inactive',
              created_by: user.id,
            },
          })
          productId = product.id
        }
        resolvedItems.push({
          productId,
          quantity: item.quantity,
          unitCost: item.unit_cost ?? null,
          comment: item.comment || null,
        })
      }

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
        resolvedItems.map((item) => ({
          organization_id: organizationId,
          document_id: document.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          line_total: item.quantity * (item.unitCost ?? 0),
          comment: item.comment,
        })),
      )

      if (documentMode === 'purchase' || values.post_now) {
        await inventoryMutations.postDocument.mutateAsync(document.id)
      }

      reset()
      setDocumentMode(null)
      setSuccessMessage(
        values.type === 'purchase'
          ? t('Базарлык сохранён. Остатки и расходы обновлены.')
          : t('Складской документ сохранён.'),
      )
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить документ.')
    }
  })

  const getProductDeleteError = (error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Product has already been used')) {
      return t("ui.tovar_uzhe_ispolzovalsya_v_zakazah_sklade_ili_kombo__f22fa56")
    }
    if (message.includes('Product stock must be zero')) {
      return t("ui.pered_udaleniem_ostatok_tovara_dolzhen_byt_0_b908662")
    }
    return message || t("ui.ne_udalos_udalit_tovar_f3762ba")
  }

  const deleteProduct = async (product: { id: string; name: string }) => {
    const confirmed = window.confirm(
      `${t("ui.udalit_tovar_navsegda_9797c20")}\n\n${t(
        "ui.udalit_mozhno_tolko_tovar_bez_zakazov_skladskih_doku_bcfe87a",
      )}`,
    )

    if (!confirmed) return

    const reason = window.prompt(t("ui.prichina_udaleniya_tovara_6c2e861"))
    if (reason === null) return

    try {
      await productMutations.deleteUnused.mutateAsync({
        id: product.id,
        reason: reason.trim() || null,
      })
    } catch (error) {
      window.alert(getProductDeleteError(error))
    }
  }

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Склад</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Остатки товаров, складские документы и история движений.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => openDocument('other')} type="button" variant="secondary">
            <FilePlus2 className="size-4" />
            {t('Другой документ')}
          </Button>
          <Button onClick={() => openDocument('purchase')} type="button">
            <ShoppingBasket className="size-4" />
            {t('Базарлык')}
          </Button>
        </div>
      </header>

      {successMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {successMessage}
        </div>
      ) : null}

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
                    <div><dt className="text-xs uppercase text-slate-500">Остаток</dt><dd>{formatNumber(product.stock_quantity)} {formatUnitName(product.unit_name, language)}</dd></div>
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
                  <Button
                    disabled={productMutations.deleteUnused.isPending}
                    onClick={() => deleteProduct(product)}
                    type="button"
                    variant="danger"
                  >
                    <Trash2 className="size-4" />
                    Удалить
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
              <p className="text-slate-500">{document.status} · {new Date(document.document_date).toLocaleDateString(getCurrentLocale())}</p>
            </div>
            <p className="font-medium text-slate-900">{formatNumber(document.total_amount)} AZN</p>
          </article>
        ))}
      </section>

      {documentMode ? (
        <Modal onClose={() => setDocumentMode(null)}>
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {documentMode === 'purchase' ? t('Базарлык — закупка товаров') : 'Складской документ'}
                </h3>
                {documentMode === 'purchase' ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {t('Все позиции добавятся на склад, а итоговая сумма один раз попадёт в расходы.')}
                  </p>
                ) : null}
              </div>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setDocumentMode(null)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {documentMode === 'purchase' ? (
                <>
                  <input type="hidden" value="purchase" {...register('type')} />
                  <Input className="sm:col-span-2" id="supplier_name" label={t('Магазин')} {...register('supplier_name')} />
                  <input type="hidden" {...register('reference')} />
                  <input type="hidden" {...register('comment')} />
                </>
              ) : (
                <>
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register('type')}>{(['write_off', 'adjustment_in', 'adjustment_out'] satisfies StockMovementType[]).map((type) => <option key={type} value={type}>{stockDocumentTypeLabel[type]}</option>)}</select></label>
                  <Input id="supplier_name" label="Поставщик" {...register('supplier_name')} />
                  <Input id="reference" label="Reference" {...register('reference')} />
                  <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700"><input type="checkbox" {...register('post_now')} />Провести сразу</label>
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Комментарий</span><textarea className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm" {...register('comment')} /></label>
                </>
              )}
              {documentMode === 'purchase' ? (
                <input className="hidden" type="checkbox" {...register('post_now')} />
              ) : null}
            </div>
            <div className="grid gap-3">
              {fields.map((field, index) => (
                <div className="grid grid-cols-1 items-end gap-2 rounded-md border border-slate-200 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_40px] lg:grid-cols-[minmax(310px,1fr)_80px_110px_80px_40px]" key={field.id}>
                  <div className="grid min-w-0 gap-2 sm:col-span-4 sm:grid-cols-[140px_minmax(0,1fr)] lg:col-span-1">
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
                      <span>{t('Способ')}</span>
                      <select className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`items.${index}.product_mode`, { onChange: () => {
                        clearErrors(`items.${index}`)
                        setValue(`items.${index}.product_id`, '')
                        setValue(`items.${index}.new_product_name`, '')
                        setValue(`items.${index}.unit_cost`, 0)
                      } })}>
                        <option value="existing">{t('Выбрать из списка')}</option>
                        <option value="new">{t('Новый товар')}</option>
                      </select>
                    </label>
                    {watchedItems[index]?.product_mode === 'new' ? (
                      <Input id={`new_product_${field.id}`} label={t('Название нового товара')} title={t('Новый товар сохранится в каталоге выключенным. Продажную цену можно указать позже.')} {...register(`items.${index}.new_product_name`)} />
                    ) : (
                      <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
                        <span>{t('Выберите товар')}</span>
                        <select className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm" {...register(`items.${index}.product_id`, { onChange: (event) => {
                          const product = products.find((item) => item.id === event.target.value)
                          setValue(`items.${index}.unit_cost`, product?.purchase_price ?? product?.average_purchase_cost ?? 0, { shouldValidate: true })
                        } })}><option value="">Выберите</option>{products.filter((item) => item.track_stock).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
                      </label>
                    )}
                    {errors.items?.[index]?.product_id?.message || errors.items?.[index]?.new_product_name?.message ? (
                      <p className="text-xs text-red-700 sm:col-span-2">{t(errors.items[index]?.product_id?.message ?? errors.items[index]?.new_product_name?.message ?? '')}</p>
                    ) : null}
                  </div>
                  <Input id={`qty_${field.id}`} label="Кол-во" min={1} step="1" type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
                  <Input id={`cost_${field.id}`} label={t('Себестоимость')} min={0} step="1" type="number" {...register(`items.${index}.unit_cost`, { valueAsNumber: true })} />
                  <div className="grid content-end gap-1.5 text-sm font-medium text-slate-700">
                    <span>{t('Итого по позиции')}</span>
                    <div className="flex min-h-11 items-center rounded-md bg-slate-50 px-2 text-slate-900">
                      {formatNumber((watchedItems[index]?.quantity ?? 0) * (watchedItems[index]?.unit_cost ?? 0))}
                    </div>
                  </div>
                  <div className="flex items-end justify-end sm:justify-start"><button aria-label={t('Убрать позицию')} className="inline-flex size-11 items-center justify-center rounded-md text-red-600 hover:bg-red-50" onClick={() => remove(index)} type="button"><Trash2 className="size-4" /></button></div>
                </div>
              ))}
              <Button onClick={() => append({ product_mode: 'existing', product_id: '', new_product_name: '', quantity: 1, unit_cost: 0, comment: '' })} type="button" variant="secondary"><Plus className="size-4" />Добавить позицию</Button>
            </div>
            {errors.items?.message ? <p className="text-sm text-red-700">{t(errors.items.message)}</p> : null}
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">Итого: {formatNumber(documentTotal)} AZN</div>
            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setDocumentMode(null)} type="button" variant="secondary">Отмена</Button>
              <Button disabled={isSubmitting || inventoryMutations.createDocument.isPending} type="submit">{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{documentMode === 'purchase' ? t('Сохранить закупку') : 'Сохранить'}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
