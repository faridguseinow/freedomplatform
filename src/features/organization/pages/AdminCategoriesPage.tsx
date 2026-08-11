import { zodResolver } from '@hookform/resolvers/zod'
import { Archive, Edit3, Loader2, Plus, RotateCcw, Save, Tags, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import type {
  CatalogCategoryRow,
  CatalogCategoryType,
  CatalogItemStatus,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  type CategoryInput,
  useCatalogCategories,
  useCategoryMutations,
} from '../catalog/catalogApi'
import { uploadCatalogImage } from '../catalog/imageUpload'

const categorySchema = z.object({
  type: z.enum(['product', 'service', 'place']),
  name: z.string().trim().min(2, 'Введите название.'),
  description: z.string().trim().optional(),
  sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
  status: z.enum(['active', 'inactive', 'archived']),
  image: z.instanceof(FileList).optional(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

const typeLabel: Record<CatalogCategoryType, string> = {
  product: 'Товары',
  service: 'Услуги',
  place: 'Места',
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

export function AdminCategoriesPage() {
  const { organizationId, user } = useAuth()
  const categoriesQuery = useCatalogCategories({ organizationId })
  const categoryMutations = useCategoryMutations(organizationId)
  const [typeFilter, setTypeFilter] = useState<CatalogCategoryType | 'all'>('all')
  const [editingCategory, setEditingCategory] = useState<CatalogCategoryRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      type: 'product',
      name: '',
      description: '',
      sort_order: 0,
      status: 'active',
    },
  })

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const visibleCategories = useMemo(
    () => categories.filter((item) => typeFilter === 'all' || item.type === typeFilter),
    [categories, typeFilter],
  )

  const openCreate = () => {
    setEditingCategory(null)
    setFormError(null)
    reset({
      type: 'product',
      name: '',
      description: '',
      sort_order: 0,
      status: 'active',
    })
    setIsModalOpen(true)
  }

  const openEdit = (category: CatalogCategoryRow) => {
    setEditingCategory(category)
    setFormError(null)
    reset({
      type: category.type,
      name: category.name,
      description: category.description ?? '',
      sort_order: category.sort_order,
      status: category.status,
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
      const categoryId = editingCategory?.id ?? crypto.randomUUID()
      let imagePath = editingCategory?.image_path ?? null

      if (file) {
        imagePath = await uploadCatalogImage({
          file,
          itemId: categoryId,
          kind: 'categories',
          organizationId,
        })
      }

      const input: CategoryInput = {
        ...(editingCategory ? {} : { id: categoryId }),
        organization_id: organizationId,
        type: values.type,
        name: values.name,
        description: values.description || null,
        image_path: imagePath,
        sort_order: values.sort_order,
        status: values.status,
        created_by: editingCategory?.created_by ?? user.id,
      }

      const saved = await categoryMutations.upsert.mutateAsync({
        id: editingCategory?.id,
        input,
      })
      void saved

      setIsModalOpen(false)
      setEditingCategory(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить категорию.')
    }
  })

  const setStatus = async (category: CatalogCategoryRow, status: CatalogItemStatus) => {
    await categoryMutations.setStatus.mutateAsync({ id: category.id, status })
  }

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Категории</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Группы для товаров, услуг и мест. Категория необязательна для элементов каталога.
          </p>
        </div>
        <Button onClick={openCreate} type="button">
          <Plus aria-hidden="true" className="size-4" />
          Создать категорию
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(['all', 'product', 'service', 'place'] as const).map((item) => (
          <button
            className={cn(
              'min-h-9 rounded-md border px-3 text-sm font-medium',
              typeFilter === item
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-950',
            )}
            key={item}
            onClick={() => setTypeFilter(item)}
            type="button"
          >
            {item === 'all' ? 'Все' : typeLabel[item]}
          </button>
        ))}
      </div>

      {categoriesQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
          Загрузка категорий
        </div>
      ) : null}

      {categoriesQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {categoriesQuery.error.message}
        </div>
      ) : null}

      {!categoriesQuery.isLoading && !visibleCategories.length ? (
        <EmptyState
          description="Создайте первую категорию для товаров, услуг или мест."
          icon={Tags}
          title="Категорий пока нет"
        />
      ) : null}

      {visibleCategories.length ? (
        <div className="grid gap-3">
          {visibleCategories.map((category) => (
            <article
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[76px_1fr_auto] sm:items-center"
              key={category.id}
            >
              <CatalogImage alt={category.name} className="size-20" imagePath={category.image_path} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-slate-950">
                    {category.name}
                  </h3>
                  <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800">
                    {typeLabel[category.type]}
                  </span>
                  <span className={cn('rounded-md px-2 py-1 text-xs font-medium', statusClass[category.status])}>
                    {statusLabel[category.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {category.description || 'Описание не заполнено.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button onClick={() => openEdit(category)} type="button" variant="secondary">
                  <Edit3 aria-hidden="true" className="size-4" />
                  Редактировать
                </Button>
                <Button
                  onClick={() =>
                    setStatus(category, category.status === 'archived' ? 'active' : 'archived')
                  }
                  type="button"
                  variant={category.status === 'archived' ? 'secondary' : 'danger'}
                >
                  {category.status === 'archived' ? (
                    <RotateCcw aria-hidden="true" className="size-4" />
                  ) : (
                    <Archive aria-hidden="true" className="size-4" />
                  )}
                  {category.status === 'archived' ? 'Восстановить' : 'Архивировать'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {isModalOpen ? (
        <Modal onClose={() => setIsModalOpen(false)}>
          <form
            className="grid max-h-[calc(100svh-3rem)] w-full max-w-xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            noValidate
            onSubmit={onSubmit}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">
                {editingCategory ? 'Редактировать категорию' : 'Создать категорию'}
              </h3>
              <button
                aria-label="Закрыть"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Тип</span>
                <select
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...register('type')}
                >
                  <option value="product">Товары</option>
                  <option value="service">Услуги</option>
                  <option value="place">Места</option>
                </select>
              </label>
              <Input error={errors.name?.message} id="category_name" label="Название" {...register('name')} />
              <Input
                error={errors.sort_order?.message}
                id="category_sort_order"
                label="Порядок"
                min={0}
                type="number"
                {...register('sort_order', { valueAsNumber: true })}
              />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                <span>Статус</span>
                <select
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...register('status')}
                >
                  <option value="active">Активна</option>
                  <option value="inactive">Выключена</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Описание</span>
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  {...register('description')}
                />
              </label>
              <ImageFileInput
                className="sm:col-span-2"
                error={errors.image?.message}
                id="category_image"
                label="Изображение"
                {...register('image')}
              />
            </div>

            {formError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {formError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">
                Отмена
              </Button>
              <Button disabled={isSubmitting || categoryMutations.upsert.isPending} type="submit">
                {isSubmitting || categoryMutations.upsert.isPending ? (
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
