// Removed duplicate import of React
import React from 'react'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { useAuth } from '../../../hooks/useAuth'
import {
  useEmployeeCombos,
  useEmployeeProducts,
  useEmployeeServices,
  useEmployeeCategories,
} from '../catalog/employeeCatalogApi'
import { formatAzn } from './helpers/format'
import { CatalogImage } from '../../../components/common/CatalogImage'

const formatQuantity = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null
  return new Intl.NumberFormat('ru', { maximumFractionDigits: 3 }).format(value)
}

export function EmployeeMenuPage() {
  const { t } = useI18n()
  const { currentOrganization } = useAuth()
  const organizationId = currentOrganization?.id ?? null

  const productsQuery = useEmployeeProducts({ organizationId })
  const servicesQuery = useEmployeeServices({ organizationId })
  const combosQuery = useEmployeeCombos({ organizationId })
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({})
  const toggleExpanded = (id: string) => setExpandedIds((s) => ({ ...s, [id]: !s[id] }))

  const loading = productsQuery.isLoading || servicesQuery.isLoading || combosQuery.isLoading
  const error = productsQuery.error || servicesQuery.error || combosQuery.error

  const products = productsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const combos = combosQuery.data ?? []
  const categoriesQuery = useEmployeeCategories({ organizationId })
  const categories = categoriesQuery.data ?? []

  if (loading) return <div className="p-4">{t('Загрузка меню…')}</div>
  if (error) return <div className="p-4 text-red-600">{t('Ошибка загрузки меню')}</div>

  // Build items with category association and image_path
  const items = [
    ...products.map((p: any) => ({
      id: `p-${p.id}`,
      name: p.name,
      price: p.sale_price,
      type: 'product',
      imagePath: p.image_path ?? null,
      categoryId: p.category_id ?? null,
      stockQuantity: p.stock_quantity ?? null,
      trackStock: p.track_stock ?? null,
      unitName: p.unit_name ?? null,
      sortOrder: p.sort_order ?? 0,
    })),
    ...services.map((s: any) => ({
      id: `s-${s.id}`,
      name: s.name,
      price: s.fixed_price ?? s.hourly_rate ?? null,
      type: 'service',
      imagePath: s.image_path ?? null,
      categoryId: s.category_id ?? null,
      sortOrder: s.sort_order ?? 0,
    })),
    ...combos.map((c: any) => {
      // try to parse component_preview to an array of component names with quantities
      let componentsNames: string[] = []
      try {
        const raw = Array.isArray(c.component_preview) ? c.component_preview : JSON.parse(c.component_preview ?? '[]')
        if (Array.isArray(raw)) {
          componentsNames = raw
            .map((x: any) => {
              const name = x.name || x.name_snapshot || x.product_name || x.service_name || x.component_name
              const qty = x.quantity ?? x.qty ?? x.count ?? x.amount ?? x.component_quantity ?? null
              if (!name) return null
              return qty ? `${name} ×${qty}` : String(name)
            })
            .filter(Boolean) as string[]
        }
      } catch (e) {
        componentsNames = []
      }

      return {
        id: `c-${c.id}`,
        name: c.name,
        price: c.sale_price,
        type: 'combo',
        imagePath: c.image_path ?? null,
        categoryId: c.category_id ?? null,
        availableQuantity: c.available_quantity ?? null,
        sortOrder: 0,
        componentPreview: c.component_preview ?? null,
        componentsNames,
      }
    }),
  ]

  // Group items by category id
  const categoriesMap: Record<string, any> = {}
  categories.forEach((cat: any) => {
    categoriesMap[cat.id] = cat
  })

  const itemsByCategory: Record<string, any[]> = {}
  items.forEach((it) => {
    const key = it.categoryId ?? 'uncategorized'
    if (!itemsByCategory[key]) itemsByCategory[key] = []
    itemsByCategory[key].push(it)
  })

  // Sort items inside each category by sortOrder then name
  Object.keys(itemsByCategory).forEach((k) => {
    itemsByCategory[k]!.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
  })

  // Ensure there's a combo category: if none of the fetched categories has type 'combo'
  const hasComboCategory = categories.some((c: any) => c.type === 'combo')
  const comboCategoryKey = hasComboCategory ? null : 'combos'

  // If combos are uncategorized and there's no combo category, group them under virtual 'combos' category
  if (comboCategoryKey && itemsByCategory['uncategorized']) {
    const combosUncat = itemsByCategory['uncategorized'].filter((it) => it.type === 'combo')
    if (combosUncat.length) {
      itemsByCategory[comboCategoryKey] = combosUncat
      // remove combos from uncategorized list
      itemsByCategory['uncategorized'] = itemsByCategory['uncategorized'].filter((it) => it.type !== 'combo')
    }
  }

  // Determine render order of categories: follow categories array, then virtual combos, then uncategorized last
  const orderedCategoryKeys = categories.map((c: any) => String(c.id))
  if (comboCategoryKey) orderedCategoryKeys.push(comboCategoryKey)
  if (itemsByCategory['uncategorized'] && itemsByCategory['uncategorized'].length) orderedCategoryKeys.push('uncategorized')

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4">{t('Меню')}</h1>

      <div className="space-y-6">
        {orderedCategoryKeys.map((catKey) => {
          const cat = catKey === 'uncategorized' ? null : categoriesMap[catKey]
          const list = itemsByCategory[catKey] ?? []
          if (!list.length) return null

          return (
            <section key={catKey}>
              <div className="flex items-center gap-3 mb-3">
                {cat ? (
                  <CatalogImage alt={cat.name} imagePath={cat.image_path} className="size-10 rounded-md" />
                ) : (
                  <div className="size-10 rounded-md bg-slate-50 border border-slate-200" />
                )}
                <h2 className="text-sm font-semibold">
                  {cat ? cat.name : catKey === 'combos' ? t('Комбо') : t('Без категории')}
                </h2>
              </div>

              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {list.map((it: any) => {
                  const isCombo = it.type === 'combo'
                  const isExpanded = Boolean(expandedIds[it.id])
                  const quantity = formatQuantity(it.type === 'combo' ? it.availableQuantity : it.stockQuantity)
                  const hasCountedStock = (it.type === 'product' && it.trackStock !== false && quantity != null) || (isCombo && quantity != null)
                  const isOutOfStock = hasCountedStock && Number(it.type === 'combo' ? it.availableQuantity : it.stockQuantity) <= 0
                  const stockLabel =
                    it.type === 'service'
                      ? t('Услуга')
                      : hasCountedStock
                        ? `${t('Осталось')}: ${quantity}${it.unitName ? ` ${it.unitName}` : ''}`
                        : null

                  return (
                    <li
                      key={it.id}
                      className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                    >
                      <div className="grid grid-cols-[3.25rem_1fr] gap-2">
                        <CatalogImage alt={it.name} imagePath={it.imagePath} className="size-[3.25rem] rounded-md object-contain" />

                        <div className="grid min-w-0 content-start gap-1">
                          <div className="truncate text-sm font-semibold text-slate-950" title={it.name}>
                            {it.name}
                          </div>
                          <div className="text-sm font-semibold text-slate-950">{formatAzn(it.price)}</div>
                          {stockLabel ? (
                            <div className={isOutOfStock ? 'text-xs font-medium text-red-600' : 'text-xs text-slate-500'}>
                              {isOutOfStock ? t('Нет в наличии') : stockLabel}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {isCombo && it.componentsNames && it.componentsNames.length ? (
                        <div className="w-full">
                          <button
                            type="button"
                            className="text-xs text-emerald-700 hover:underline"
                            onClick={() => toggleExpanded(it.id)}
                          >
                            {isExpanded ? t('Скрыть состав') : t('Показать состав')}
                          </button>

                          {isExpanded ? (
                            <ul className="mt-2 text-xs text-slate-600 space-y-1">
                              {it.componentsNames.map((n: string, idx: number) => (
                                <li key={idx}>{n}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default EmployeeMenuPage
