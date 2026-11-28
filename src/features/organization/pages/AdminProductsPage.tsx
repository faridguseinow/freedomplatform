import { getCurrentLocale } from '../../../lib/i18n/translator'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Archive, Banknote, Boxes, Edit3, History, Loader2, Plus, RotateCcw, Save, Search, ShoppingCart, Tag, Trash2, TrendingUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal, ModalCloseButton } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { formatUnitName } from '../../../lib/i18n/formatUnitName'
import type { CatalogItemStatus, ProductRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  type ProductInput,
  useCatalogCategories,
  useProductMutations,
  useProducts,
} from '../catalog/catalogApi'
import { uploadCatalogImage } from '../catalog/imageUpload'
import { useInventoryMutations } from '../catalog/inventoryApi'
import { SkeletonCardGrid } from '../../../components/ui/Skeleton'
import { getRawErrorMessage } from '../../../lib/errors/serverErrors'

const productSchema = z.object({
  category_id: z.string().uuid().optional().or(z.literal('')),
  sku: z.string().trim().optional(),
  name: z.string().trim().min(2, 'Введите название.'),
  description: z.string().trim().optional(),
  characteristics: z.string().trim().optional(),
  sale_price: z.number().min(0, 'Цена не может быть отрицательной.'),
  purchase_price: z.number().min(0, 'Цена не может быть отрицательной.').optional(),
  stock_quantity: z.number().min(0, 'Остаток не может быть отрицательным.'),
  minimum_stock_quantity: z.number().min(0, 'Минимум не может быть отрицательным.'),
  unit_name: z.string().trim().min(1, 'Укажите единицу.'),
  track_stock: z.boolean(),
  sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
  status: z.enum(['active', 'inactive', 'archived']),
  image: z.instanceof(FileList).optional(),
})

type ProductFormValues = z.infer<typeof productSchema>
type StatusFilter = CatalogItemStatus | 'all'
type CategoryFilter = 'all' | 'uncategorized' | string

const statusLabel: Record<CatalogItemStatus, string> = {
  active: 'Активен',
  inactive: 'Выключен',
  archived: 'Архив',
}

const statusClass: Record<CatalogItemStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800',
  inactive: 'bg-amber-50 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
}

const formatStockValue = (value: number) => new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 3 }).format(value)

const formatPrice = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${new Intl.NumberFormat(getCurrentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ₼`

const getMarginPercent = (sale: number | null | undefined, purchase: number | null | undefined) =>
  sale && purchase && purchase > 0 && Number.isFinite(sale) && Number.isFinite(purchase)
    ? Math.round(((sale - purchase) / purchase) * 100)
    : null

const formSectionClass = 'grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2'
const formLegendClass = 'flex items-center gap-2 px-1 text-sm font-semibold text-slate-800'

const productNameCollator = new Intl.Collator(getCurrentLocale(), {
  numeric: true,
  sensitivity: 'base',
})

export function AdminProductsPage() {
  const { organizationId, user } = useAuth()
  const { language, t } = useI18n()
  const defaultUnitName = t('inventory.unitItem')
  const productsQuery = useProducts({ organizationId })
  const categoriesQuery = useCatalogCategories({ organizationId })
  const productMutations = useProductMutations(organizationId)
  const inventoryMutations = useInventoryMutations(organizationId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    control,
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category_id: '',
      sku: '',
      name: '',
      description: '',
      characteristics: '',
      sale_price: 0,
      purchase_price: undefined,
      stock_quantity: 0,
      minimum_stock_quantity: 0,
      unit_name: defaultUnitName,
      track_stock: true,
      sort_order: 0,
      status: 'active',
    },
  })

  const trackStock = useWatch({ control, name: 'track_stock' })
  const watchedSalePrice = useWatch({ control, name: 'sale_price' })
  const watchedPurchasePrice = useWatch({ control, name: 'purchase_price' })
  const formMarginPercent = getMarginPercent(watchedSalePrice, watchedPurchasePrice)
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const productCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'product' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all'
        ? product.status !== 'archived'
        : product.status === statusFilter
      if (!matchesStatus) return false
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'uncategorized' && !product.category_id) ||
        product.category_id === categoryFilter
      if (!matchesCategory) return false
      if (!needle) return true
      return [product.name, product.sku, product.characteristics, product.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    }).sort((first, second) => {
      const nameCompare = productNameCollator.compare(first.name, second.name)
      if (nameCompare !== 0) return nameCompare
      return productNameCollator.compare(first.sku ?? '', second.sku ?? '')
    })
  }, [categoryFilter, products, search, statusFilter])

  const openCreate = () => {
    setEditingProduct(null)
    setFormError(null)
    reset({
      category_id: '',
      sku: '',
      name: '',
      description: '',
      characteristics: '',
      sale_price: 0,
      purchase_price: undefined,
      stock_quantity: 0,
      minimum_stock_quantity: 0,
      unit_name: defaultUnitName,
      track_stock: true,
      sort_order: 0,
      status: 'active',
    })
    setIsModalOpen(true)
  }

  const openEdit = (product: ProductRow) => {
    setEditingProduct(product)
    setFormError(null)
    reset({
      category_id: product.category_id ?? '',
      sku: product.sku ?? '',
      name: product.name,
      description: product.description ?? '',
      characteristics: product.characteristics ?? '',
      sale_price: product.sale_price,
      purchase_price: product.purchase_price ?? undefined,
      stock_quantity: product.stock_quantity,
      minimum_stock_quantity: product.minimum_stock_quantity,
      unit_name: formatUnitName(product.unit_name, language),
      track_stock: product.track_stock,
      sort_order: product.sort_order,
      status: product.status,
    })
    setIsModalOpen(true)
  }

  const getProductDeleteError = (error: unknown) => {
    const message = getRawErrorMessage(error)
    if (message.includes('Product has already been used')) {
      return t("ui.tovar_uzhe_ispolzovalsya_v_zakazah_sklade_ili_kombo__f22fa56")
    }
    if (message.includes('Product stock must be zero')) {
      return t("ui.pered_udaleniem_ostatok_tovara_dolzhen_byt_0_b908662")
    }
    return (error instanceof Error ? error.message : '') || t("ui.ne_udalos_udalit_tovar_f3762ba")
  }

  const deleteProduct = async (product: ProductRow) => {
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
      if (editingProduct?.id === product.id) {
        setIsModalOpen(false)
        setEditingProduct(null)
      }
    } catch (error) {
      window.alert(getProductDeleteError(error))
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }

    setFormError(null)

    try {
      const file = values.image?.item(0)

      if (!file && !editingProduct?.image_path) {
        setFormError('Загрузите фото товара.')
        return
      }

      const productId = editingProduct?.id ?? crypto.randomUUID()
      let imagePath = editingProduct?.image_path ?? null

      if (file) {
        imagePath = await uploadCatalogImage({
          file,
          itemId: productId,
          kind: 'products',
          organizationId,
        })
      }

      const input: ProductInput = {
        ...(editingProduct ? {} : { id: productId }),
        organization_id: organizationId,
        category_id: values.category_id || null,
        sku: values.sku || null,
        name: values.name,
        description: values.description || null,
        characteristics: values.characteristics || null,
        image_path: imagePath,
        sale_price: values.sale_price,
        purchase_price: values.purchase_price ?? null,
        minimum_stock_quantity: values.track_stock ? values.minimum_stock_quantity : 0,
        unit_name: values.unit_name,
        track_stock: values.track_stock,
        sort_order: values.sort_order,
        status: values.status,
        created_by: editingProduct?.created_by ?? user.id,
      }

      if (!editingProduct) {
        input.stock_quantity = 0
      }

      const saved = await productMutations.upsert.mutateAsync({
        id: editingProduct?.id,
        input,
      })

      if (!editingProduct && values.track_stock && values.stock_quantity > 0) {
        await inventoryMutations.createOpeningStock.mutateAsync({
          productId: saved.id,
          quantity: values.stock_quantity,
          unitCost: values.purchase_price ?? null,
          comment: 'Начальный остаток при создании товара',
        })
      }

      setIsModalOpen(false)
      setEditingProduct(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить товар.')
    }
  })

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Товары</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Каталог продаж с ценами и изображениями. Остатки меняются через складские документы.
          </p>
        </div>
        <Button onClick={openCreate} type="button">
          <Plus aria-hidden="true" className="size-4" />
          Создать товар
        </Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(220px,1fr)_minmax(170px,240px)_auto] lg:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название, SKU, характеристика"
              type="search"
              value={search}
            />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>{t("ui.kategoriya_19c8583")}</span>
          <select
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            onChange={(event) => setCategoryFilter(event.target.value)}
            value={categoryFilter}
          >
            <option value="all">{t("ui.vse_kategorii_b3bf7ed")}</option>
            <option value="uncategorized">{t("ui.bez_kategorii_5aaa8a1")}</option>
            {productCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {(['all', 'active', 'inactive', 'archived'] as const).map((item) => (
            <button
              className={cn(
                'min-h-10 rounded-md border px-3 text-sm font-medium',
                statusFilter === item
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
              key={item}
              onClick={() => setStatusFilter(item)}
              type="button"
            >
              {item === 'all' ? 'Все' : statusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {productsQuery.isLoading ? (
        <SkeletonCardGrid />
      ) : null}

      {!productsQuery.isLoading && !visibleProducts.length ? (
        <EmptyState
          description="Создайте первый товар или измените фильтры."
          icon={Plus}
          title="Товаров пока нет"
        />
      ) : null}

      {productsQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {productsQuery.error.message}
        </div>
      ) : null}

      {visibleProducts.length ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((product) => (
            <article
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              key={product.id}
            >
              <CatalogImage alt={product.name} className="h-28 w-full self-start rounded-md object-contain sm:h-32" imagePath={product.image_path} />
              <div className="grid min-w-0 gap-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <h3 className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-slate-950 sm:text-base">{product.name}</h3>
                  <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium', statusClass[product.status])}>
                    {statusLabel[product.status]}
                  </span>
                </div>
                {product.sku ? <span className="truncate text-xs text-slate-500">SKU: {product.sku}</span> : null}
              </div>

              <div className="flex items-end justify-between gap-2 rounded-md bg-emerald-50 px-2.5 py-2">
                <div className="grid gap-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-800"><Tag aria-hidden="true" className="size-3.5" />{t('productCard.salePrice')}</span>
                  <span className="text-lg font-bold leading-none text-emerald-900">{formatPrice(product.sale_price)}</span>
                </div>
                {getMarginPercent(product.sale_price, product.purchase_price) !== null ? (
                  <span className="flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800" title={t('productCard.margin')}>
                    <TrendingUp aria-hidden="true" className="size-3" />+{getMarginPercent(product.sale_price, product.purchase_price)}%
                  </span>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="grid gap-0.5 rounded-md border border-slate-200 px-2 py-1.5">
                  <dt className="flex items-center gap-1 text-slate-500"><ShoppingCart aria-hidden="true" className="size-3.5" />{t('productCard.purchasePrice')}</dt>
                  <dd className="font-semibold text-slate-900">{formatPrice(product.purchase_price)}</dd>
                </div>
                <div className={cn(
                  'grid gap-0.5 rounded-md border px-2 py-1.5',
                  product.track_stock && product.stock_quantity <= product.minimum_stock_quantity
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-slate-200',
                )}>
                  <dt className="flex items-center gap-1 text-slate-500">
                    {product.track_stock && product.stock_quantity <= product.minimum_stock_quantity
                      ? <AlertTriangle aria-hidden="true" className="size-3.5 text-amber-600" />
                      : <Boxes aria-hidden="true" className="size-3.5" />}
                    {t('productCard.stock')}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {product.track_stock ? `${formatStockValue(product.stock_quantity)} ${formatUnitName(product.unit_name, language)}` : t('productCard.notTracked')}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto grid grid-cols-4 gap-2">
                <Button aria-label={t("ui.redaktirovat_901beb5")} className="min-h-10 px-2" onClick={() => openEdit(product)} type="button" variant="secondary">
                  <Edit3 className="size-4" />
                </Button>
                <Link
                  aria-label={t("ui.istoriya_d5fec74")}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                  to={`/admin/inventory/products/${product.id}`}
                >
                  <History className="size-4" />
                </Link>
                <Button
                  aria-label={product.status === 'archived' ? t("ui.vosstanovit_29f3b29") : t("ui.arhivirovat_1147635")}
                  className="min-h-10 px-2"
                  onClick={() =>
                    productMutations.setStatus.mutate({
                      id: product.id,
                      status: product.status === 'archived' ? 'active' : 'archived',
                    })
                  }
                  type="button"
                  variant={product.status === 'archived' ? 'secondary' : 'danger'}
                >
                  {product.status === 'archived' ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
                </Button>
                <Button
                  aria-label={t("ui.udalit_86ea33a")}
                  className="min-h-10 px-2"
                  disabled={productMutations.deleteUnused.isPending}
                  onClick={() => deleteProduct(product)}
                  type="button"
                  variant="danger"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {isModalOpen ? (
        <Modal onClose={() => setIsModalOpen(false)}>
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{editingProduct ? 'Редактировать товар' : 'Создать товар'}</h3>
              <ModalCloseButton aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button">
                <X className="size-4" />
              </ModalCloseButton>
            </div>

            {editingProduct ? (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <CatalogImage alt={editingProduct.name} className="size-14 rounded-md object-contain" imagePath={editingProduct.image_path} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-950">{editingProduct.name}</div>
                  <div className="text-sm text-slate-600">{formatPrice(editingProduct.sale_price)}</div>
                </div>
              </div>
            ) : null}

            <fieldset className={formSectionClass}>
              <legend className={formLegendClass}><Tag aria-hidden="true" className="size-4 text-emerald-700" />{t('productForm.sectionMain')}</legend>
              <Input error={errors.name?.message} id="product_name" label="Название" {...register('name')} />
              <Input id="product_sku" label="SKU" {...register('sku')} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Категория</span>
                <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('category_id')}>
                  <option value="">Без категории</option>
                  {productCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <Input id="product_unit" label="Единица учета" {...register('unit_name')} />
            </fieldset>

            <fieldset className={formSectionClass}>
              <legend className={formLegendClass}><Banknote aria-hidden="true" className="size-4 text-emerald-700" />{t('productForm.sectionPrice')}</legend>
              <Input error={errors.sale_price?.message} id="sale_price" label="Продажная цена" min={0} step="0.01" suffix="AZN" type="number" {...register('sale_price', { valueAsNumber: true })} />
              <Input error={errors.purchase_price?.message} id="purchase_price" label="Закупочная цена" min={0} step="0.01" suffix="AZN" type="number" {...register('purchase_price', { setValueAs: (value) => value === '' || value === null ? undefined : Number(value) })} />
              {formMarginPercent !== null ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                  <TrendingUp aria-hidden="true" className="size-4 text-emerald-700" />
                  {t('productForm.marginLine', { amount: formatPrice((watchedSalePrice ?? 0) - (watchedPurchasePrice ?? 0)), percent: formMarginPercent })}
                </div>
              ) : null}
            </fieldset>

            <fieldset className={formSectionClass}>
              <legend className={formLegendClass}><Boxes aria-hidden="true" className="size-4 text-emerald-700" />{t('productForm.sectionStock')}</legend>
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 sm:col-span-2">
                <input className="size-4" type="checkbox" {...register('track_stock')} />
                Вести складской учет
              </label>
              {trackStock ? (
                <>
                  {editingProduct ? (
                    <div className="grid gap-1 rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span className="text-slate-600">{t("ui.tekuschiy_ostatok_7cbd952")}</span>
                      <strong className="text-base text-slate-950">
                        {formatStockValue(editingProduct.stock_quantity)} {formatUnitName(editingProduct.unit_name, language)}
                      </strong>
                    </div>
                  ) : (
                    <Input error={errors.stock_quantity?.message} id="stock" label="Начальный остаток" min={0} step="0.001" type="number" {...register('stock_quantity', { valueAsNumber: true })} />
                  )}
                  <Input error={errors.minimum_stock_quantity?.message} id="minimum_stock" label="Минимальный остаток" min={0} step="0.001" type="number" {...register('minimum_stock_quantity', { valueAsNumber: true })} />
                  {editingProduct ? (
                    <p className="text-xs text-slate-500 sm:col-span-2">
                      {t('productForm.stockHint')}{' '}
                      <Link className="font-medium text-emerald-700 hover:underline" to={`/admin/inventory/products/${editingProduct.id}`}>{t('productForm.openInventory')}</Link>
                    </p>
                  ) : null}
                </>
              ) : null}
            </fieldset>

            <fieldset className={formSectionClass}>
              <legend className={formLegendClass}><Edit3 aria-hidden="true" className="size-4 text-emerald-700" />{t('productForm.sectionDetails')}</legend>
              <ImageFileInput
                error={errors.image?.message}
                id="product_image"
                label="Фото"
                {...register('image')}
              />
              <div className="grid content-start gap-4">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  <span>Статус</span>
                  <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('status')}>
                    <option value="active">Активен</option>
                    <option value="inactive">Выключен</option>
                    <option value="archived">Архив</option>
                  </select>
                </label>
                <Input error={errors.sort_order?.message} id="product_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} />
              </div>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Характеристики</span>
                <textarea className="min-h-16 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('characteristics')} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Описание</span>
                <textarea className="min-h-16 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('description')} />
              </label>
            </fieldset>

            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button>
              <Button disabled={isSubmitting || productMutations.upsert.isPending || inventoryMutations.createOpeningStock.isPending} type="submit">
                {isSubmitting || productMutations.upsert.isPending || inventoryMutations.createOpeningStock.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Сохранить
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
