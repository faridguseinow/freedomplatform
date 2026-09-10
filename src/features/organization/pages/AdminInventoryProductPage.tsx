import { ArrowLeft, Clock3, Loader2, PackageMinus, PackagePlus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { formatUnitName, formatUnitsInText } from '../../../lib/i18n/formatUnitName'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { stockDocumentTypeLabel, useProductMovements } from '../catalog/inventoryApi'

const systemCommentKeys: Record<string, string> = {
  'Order sale': 'inventoryHistory.orderSale',
  'Migrated opening balance': 'inventoryHistory.migratedOpeningBalance',
}

export function AdminInventoryProductPage() {
  const { productId } = useParams<{ productId: string }>()
  const { language, locale, t } = useI18n()
  const movementsQuery = useProductMovements(productId ?? null)
  const movements = movementsQuery.data?.movements ?? []
  const product = movementsQuery.data?.product
  const unitName = formatUnitName(product?.unit_name, language)
  const formatNumber = (value: number | null) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value ?? 0)

  let balance = product?.stock_quantity ?? 0
  const balanceByMovement = new Map<string, { before: number; after: number }>()
  movements.forEach((movement) => {
    const after = balance
    const before = after - movement.quantity_delta
    balanceByMovement.set(movement.id, { before, after })
    balance = before
  })

  const getComment = (comment: string | null) => {
    if (!comment) return t('ui.bez_kommentariya_fcb0e07')
    const translationKey = systemCommentKeys[comment]
    return translationKey ? t(translationKey) : formatUnitsInText(comment, language)
  }

  return (
    <section className="grid gap-5">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          to="/admin/inventory"
        >
          <ArrowLeft className="size-4" />
          {t('ui.sklad_ae1170e')}
        </Link>
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
            {t('ui.istoriya_tovara_9901b41')}{product?.name ? `: ${product.name}` : ''}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            {t('ui.poslednie_dvizheniya_po_tovaru_pokazano_do_100_zapis_2d84f16')}
          </p>
        </div>
      </header>

      {movementsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" />
          {t('ui.zagruzka_istorii_cbf509b')}
        </div>
      ) : null}

      {!movementsQuery.isLoading && !movements.length ? (
        <EmptyState
          description={t('inventoryHistory.emptyDescription')}
          icon={ArrowLeft}
          title={t('inventoryHistory.emptyTitle')}
        />
      ) : null}

      <div className="grid gap-3">
        {movements.map((movement) => {
          const isIncoming = movement.quantity_delta > 0
          const movementBalance = balanceByMovement.get(movement.id)
          const MovementIcon = isIncoming ? PackagePlus : PackageMinus

          return (
            <article
              className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              key={movement.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={isIncoming
                    ? 'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700'
                    : 'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700'}
                >
                  <MovementIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">{t(stockDocumentTypeLabel[movement.movement_type])}</p>
                    <span className={isIncoming
                      ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800'
                      : 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800'}
                    >
                      {t(isIncoming ? 'inventoryHistory.added' : 'inventoryHistory.removed', {
                        quantity: formatNumber(Math.abs(movement.quantity_delta)),
                        unit: unitName,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{getComment(movement.comment)}</p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Clock3 aria-hidden="true" className="size-3.5" />
                    {new Date(movement.created_at).toLocaleString(locale)}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center lg:min-w-[21rem]">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('inventoryHistory.before')}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatNumber(movementBalance?.before ?? 0)} {unitName}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('inventoryHistory.after')}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatNumber(movementBalance?.after ?? 0)} {unitName}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('inventoryHistory.unitCost')}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{formatNumber(movement.unit_cost)} AZN</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </section>
  )
}
