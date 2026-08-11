import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Edit3, History, Loader2, Plus, RotateCcw, Save, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { EmptyState } from '../../../components/common/EmptyState'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
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

const formatMoney = (value: number | null) =>
  value === null ? '-' : new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value)

export function AdminProductsPage() {
  const { organizationId, user } = useAuth()
  const productsQuery = useProducts({ organizationId })
  const categoriesQuery = useCatalogCategories({ organizationId })
  const productMutations = useProductMutations(organizationId)
  const inventoryMutations = useInventoryMutations(organizationId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
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
      unit_name: 'шт.',
      track_stock: true,
      sort_order: 0,
      status: 'active',
    },
  })

  const trackStock = useWatch({ control, name: 'track_stock' })
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const productCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'product' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter
      if (!matchesStatus) return false
      if (!needle) return true
      return [product.name, product.sku, product.characteristics, product.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [products, search, statusFilter])

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
      unit_name: 'шт.',
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
      unit_name: product.unit_name,
      track_stock: product.track_stock,
      sort_order: product.sort_order,
      status: product.status,
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

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
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
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка товаров
        </div>
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
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-1">
          {visibleProducts.map((product) => (
            <article
              className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:gap-3 sm:p-4 lg:grid-cols-[88px_1fr_auto]"
              key={product.id}
            >
              <CatalogImage alt={product.name} className="size-20 self-start sm:size-22" imagePath={product.image_path} />
              <div className="min-w-0">
                <div className="grid gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{product.name}</h3>
                  <span className={cn('w-fit rounded-md px-2 py-0.5 text-[11px] font-medium sm:py-1 sm:text-xs', statusClass[product.status])}>
                    {statusLabel[product.status]}
                  </span>
                </div>
                <p className="mt-1 hidden text-sm text-slate-600 sm:block">{product.characteristics || 'Характеристики не заполнены.'}</p>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs sm:mt-3 sm:grid-cols-5 sm:gap-2 sm:text-sm">
                  <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">SKU</dt><dd>{product.sku || '-'}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Продажа</dt><dd>{formatMoney(product.sale_price)}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Закупка</dt><dd>{formatMoney(product.purchase_price)}</dd></div>
                  <div><dt className="text-xs uppercase text-slate-500">Остаток</dt><dd>{product.track_stock ? `${product.stock_quantity} ${product.unit_name}` : 'Не ведется'}</dd></div>
                  <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">Минимум</dt><dd>{product.minimum_stock_quantity}</dd></div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button className="min-h-9 w-full px-2 text-xs sm:min-h-10 sm:w-auto sm:px-4 sm:text-sm" onClick={() => openEdit(product)} type="button" variant="secondary">
                  <Edit3 className="size-4" /> Редактировать
                </Button>
                <Link
                  className="hidden min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 sm:inline-flex"
                  to={`/admin/inventory/products/${product.id}`}
                >
                  <History className="size-4" /> История
                </Link>
                <Button
                  className="hidden sm:inline-flex"
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
                  {product.status === 'archived' ? 'Восстановить' : 'Архивировать'}
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
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button">
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
              <Input error={errors.sale_price?.message} id="sale_price" label="Продажная цена" min={0} step="0.01" type="number" {...register('sale_price', { valueAsNumber: true })} />
              <Input error={errors.purchase_price?.message} id="purchase_price" label="Закупочная цена" min={0} step="0.01" type="number" {...register('purchase_price', { valueAsNumber: true })} />
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
                <input type="checkbox" {...register('track_stock')} />
                Вести складской учет
              </label>
              <Input error={errors.sort_order?.message} id="product_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} />
              {trackStock ? (
                <>
                  {editingProduct ? (
                    <div className="grid gap-1.5 text-sm font-medium text-slate-700">
                      <span>Текущий остаток</span>
                      <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                        <span>{editingProduct.stock_quantity} {editingProduct.unit_name}</span>
                        <Link className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900" to={`/admin/inventory/products/${editingProduct.id}`}>
                          <History className="size-4" /> История
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <Input error={errors.stock_quantity?.message} id="stock" label="Начальный остаток" min={0} step="0.001" type="number" {...register('stock_quantity', { valueAsNumber: true })} />
                  )}
                  <Input error={errors.minimum_stock_quantity?.message} id="minimum_stock" label="Минимальный остаток" min={0} step="0.001" type="number" {...register('minimum_stock_quantity', { valueAsNumber: true })} />
                </>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Статус</span>
                <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('status')}>
                  <option value="active">Активен</option>
                  <option value="inactive">Выключен</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <ImageFileInput
                error={errors.image?.message}
                id="product_image"
                label="Фото"
                {...register('image')}
              />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Характеристики</span>
                <textarea className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('characteristics')} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Описание</span>
                <textarea className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('description')} />
              </label>
            </div>

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
