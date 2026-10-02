import { getCurrentLocale } from '../../../lib/i18n/translator'
import {
  Clock3,
  Eye,
  HelpCircle,
  LayoutDashboard,
  ReceiptText,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { cn } from '../../../lib/utils/cn'
import { todayDate } from '../../finance/financeApi'
import {
  usePaymentMethodSummaryByShiftIds,
  useProductProfitReport,
  useRevenueBreakdownByShiftIds,
  useUsageHoursBreakdownByShiftIds,
} from '../../orders/paymentsApi'
import { useAdminOpenOrdersCount } from '../../orders/ordersApi'
import { useAdminShifts } from '../../shifts/shiftsApi'
import { useCombos } from '../catalog/comboApi'
import { useInventoryBalances } from '../catalog/inventoryApi'
import { usePlaces, useProducts, useServices } from '../catalog/catalogApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const formatUsageDuration = (hours: number | null | undefined, t: (value: string) => string) => {
  const totalMinutes = Math.round(Math.max(0, hours ?? 0) * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours && minutes) return `${wholeHours} ${t("ui.ch_285cc40")} ${minutes} ${t("ui.min_d6035dc")}`
  if (wholeHours) return `${wholeHours} ${t("ui.ch_285cc40")}`
  return `${minutes} ${t("ui.min_d6035dc")}`
}

type StatCardProps = {
  description?: string
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

function StatCard({ description, label, tone = 'default', value }: StatCardProps) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 shadow-sm sm:p-4',
        tone === 'default' && 'border-slate-200',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/40',
        tone === 'warning' && 'border-amber-200 bg-amber-50/50',
        tone === 'danger' && 'border-red-200 bg-red-50/50',
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase leading-4 text-slate-500 sm:text-xs">{t(label)}</p>
        {description ? (
          <div className="group relative">
            <button
              aria-label={`${t('ui.kak_schitaetsya_5d5b2b3')} ${t(label)}`}
              className="flex size-5 items-center justify-center rounded-full text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              title={t(description)}
              type="button"
            >
              <HelpCircle aria-hidden="true" className="size-4" />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block">
              {t(description)}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-xl font-semibold text-slate-950 sm:mt-2 sm:text-2xl">{value}</p>
    </div>
  )
}

export function AdminDashboardPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const openOrdersCountQuery = useAdminOpenOrdersCount(organizationId)
  const shiftsQuery = useAdminShifts(organizationId, 'all')
  const placesQuery = usePlaces({ organizationId })
  const productsQuery = useProducts({ organizationId })
  const servicesQuery = useServices({ organizationId })
  const combosQuery = useCombos(organizationId)
  const inventoryQuery = useInventoryBalances(organizationId)
  const [productReportRange, setProductReportRange] = useState<'today' | 'all' | 'period'>('today')
  const [productReportStart, setProductReportStart] = useState(todayDate())
  const [productReportEnd, setProductReportEnd] = useState(todayDate())
  const [selectedProductId, setSelectedProductId] = useState('all')

  const shifts = shiftsQuery.data ?? []
  const places = placesQuery.data ?? []
  const products = productsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const combos = combosQuery.data ?? []
  const inventory = inventoryQuery.data ?? []

  const activeShift = shifts
    .filter((shift) => shift.status === 'open' || shift.status === 'closing')
    .sort((first, second) => second.opened_at.localeCompare(first.opened_at))[0]
  const todayBusinessDate = todayDate()
  const reportBusinessDate =
    activeShift?.business_date ??
    shifts.find((shift) => shift.business_date === todayBusinessDate)?.business_date ??
    todayBusinessDate
  const currentDayShifts = shifts.filter((shift) => shift.business_date === reportBusinessDate)
  const currentShiftIds = currentDayShifts.map((shift) => shift.id)
  const paymentSummaryQuery = usePaymentMethodSummaryByShiftIds(organizationId, currentShiftIds)
  const paymentSummary = paymentSummaryQuery.data
  const revenueBreakdownQuery = useRevenueBreakdownByShiftIds(organizationId, currentShiftIds)
  const revenueBreakdown = revenueBreakdownQuery.data
  const usageHoursQuery = useUsageHoursBreakdownByShiftIds(organizationId, currentShiftIds)
  const usageHours = usageHoursQuery.data
  const productProfitQuery = useProductProfitReport(
    organizationId,
    productReportRange === 'all' ? null : productReportRange === 'today' ? reportBusinessDate : productReportStart,
    productReportRange === 'all' ? null : productReportRange === 'today' ? reportBusinessDate : productReportEnd,
  )
  const productProfitRows = (productProfitQuery.data ?? []).filter(
    (row) => selectedProductId === 'all' || row.productId === selectedProductId,
  )
  const openOrders = openOrdersCountQuery.data ?? 0
  const openShifts = shifts.filter((shift) => shift.status === 'open' || shift.status === 'closing').length
  const timedPlaces = places.filter((place) => place.has_timer).length
  const lowStock = inventory.filter((item) => item.stock_quantity <= item.minimum_stock_quantity).length
  const operationalDayLabel = currentDayShifts.length ? reportBusinessDate : t("ui.smena_ne_otkryta_a04a370")

  const isLoading =
    openOrdersCountQuery.isLoading ||
    shiftsQuery.isLoading ||
    placesQuery.isLoading ||
    productsQuery.isLoading ||
    servicesQuery.isLoading ||
    combosQuery.isLoading ||
    inventoryQuery.isLoading ||
    paymentSummaryQuery.isLoading ||
    revenueBreakdownQuery.isLoading ||
    usageHoursQuery.isLoading ||
    productProfitQuery.isLoading

  const firstError =
    openOrdersCountQuery.error ??
    shiftsQuery.error ??
    placesQuery.error ??
    productsQuery.error ??
    servicesQuery.error ??
    combosQuery.error ??
    inventoryQuery.error ??
    paymentSummaryQuery.error ??
    revenueBreakdownQuery.error ??
    usageHoursQuery.error ??
    productProfitQuery.error
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CatalogImage
            alt={currentOrganization?.name ?? 'Организация'}
            className="size-14"
            imagePath={currentOrganization?.logo_path}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">{t("ui.obzor_organizatsii_fbbfa22")}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-slate-950 sm:text-3xl">
              {currentOrganization?.name ?? t("ui.organizatsiya_48b493a")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {currentOrganization?.description ||
                t("ui.operatsionnaya_svodka_po_zakazam_smenam_rabochim_mes_16b8238")}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {t("ui.operatsionnyy_den_70810bd")}: {operationalDayLabel}
            </p>
          </div>
        </div>
        <Button className="w-full shrink-0 justify-center sm:w-auto" type="button">
          <Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/live')}>
            <Eye aria-hidden="true" className="size-4" />
            {t("ui.smotret_mesta_e5cfd88")}
          </Link>
        </Button>
      </header>

      {firstError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {firstError.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
          {t("ui.zagruzka_pokazateley_d2ecfc9")}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        <StatCard label="Выручка сегодня (всего)" tone="success" value={formatMoney(paymentSummary?.total ?? 0)} />
        <StatCard label="Наличными" tone="success" value={formatMoney(paymentSummary?.cash ?? 0)} />
        <StatCard label="По карте" tone="default" value={formatMoney(paymentSummary?.card ?? 0)} />
        <StatCard label="Открытые заказы" tone={openOrders ? 'warning' : 'default'} value={openOrders} />
        <StatCard label="Открытые смены" tone={openShifts ? 'success' : 'default'} value={openShifts} />
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.vyruchka_po_napravleniyam_segodnya_99f8f48")}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard
            description="Выручка по заказам PlayStation без товарных позиций. Товары из этих заказов считаются отдельно в карточке Товары."
            label="PlayStation"
            tone="default"
            value={formatMoney(revenueBreakdown?.playstation ?? 0)}
          />
          <StatCard
            description="Выручка по заказам бильярда без товарных позиций. Товары из этих заказов считаются отдельно в карточке Товары."
            label="Бильярд"
            tone="default"
            value={formatMoney(revenueBreakdown?.billiard ?? 0)}
          />
          <StatCard
            description="Вся оплаченная выручка заказов со столов и VIP-комнат: услуги, товары, комбо и ручные позиции внутри этих заказов."
            label="Столы"
            tone="default"
            value={formatMoney(revenueBreakdown?.tables ?? 0)}
          />
          <StatCard
            description="dashboard.catalogProfitDescription"
            label="dashboard.catalogProfit"
            tone="default"
            value={formatMoney(revenueBreakdown?.goods ?? 0)}
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.vremya_po_napravleniyam_segodnya_58b54d7")}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard
            description="Сумма фактического времени всех сессий PlayStation и VIP-кабинетов за выбранный операционный день."
            label="PlayStation"
            value={formatUsageDuration(usageHours?.playstation, t)}
          />
          <StatCard
            description="Сумма фактического времени всех бильярдных сессий за выбранный операционный день."
            label="Бильярд"
            value={formatUsageDuration(usageHours?.billiard, t)}
          />
          <StatCard
            description="Сумма времени занятости обычных столов: от открытия заказа до закрытия или до текущего момента."
            label="Столы"
            value={formatUsageDuration(usageHours?.tables, t)}
          />
          <StatCard
            description="Общее занятое время по PlayStation, бильярду и столам за выбранный операционный день."
            label="Всего часов"
            value={formatUsageDuration(usageHours?.total, t)}
          />
        </div>
      </section>

      <section className="grid content-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t("ui.rabochee_sostoyanie_135cf32")}</h3>
            <LayoutDashboard className="size-5 text-emerald-700" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
            <StatCard label="Места" value={`${places.length} / ${t("ui.taymer_831d20c")} ${timedPlaces}`} />
            <StatCard label="Товары" value={products.length} />
            <StatCard label="Услуги" value={services.length} />
            <StatCard label="Комбо" value={combos.length} />
            <StatCard label="Низкий остаток" tone={lowStock ? 'danger' : 'default'} value={lowStock} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/live')}><Eye className="size-4" />{t("ui.monitoring_6e44fdc")}</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/orders')}><ReceiptText className="size-4" />{t("ui.zakazy_22ac845")}</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/shifts')}><Clock3 className="size-4" />{t("ui.smeny_415748c")}</Link></Button>
          </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid items-end gap-4 xl:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-950">{t('dashboard.productProfitReport')}</h3>
            <p className="mt-1 text-sm text-slate-600">{t('dashboard.productProfitDescription')}</p>
          </div>
          <div className={cn('grid min-w-0 gap-x-3 gap-y-2', productReportRange === 'period' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2')}>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              {t('dashboard.reportRange')}
              <select
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                onChange={(event) => setProductReportRange(event.target.value as 'today' | 'all' | 'period')}
                value={productReportRange}
              >
                <option value="today">{t('dashboard.today')}</option>
                <option value="all">{t('dashboard.allTime')}</option>
                <option value="period">{t('dashboard.customPeriod')}</option>
              </select>
            </label>
            {productReportRange === 'period' ? (
              <>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  {t('dashboard.periodStart')}
                  <input className="min-h-10 rounded-md border border-slate-200 px-3 text-sm" max={productReportEnd} onChange={(event) => setProductReportStart(event.target.value)} type="date" value={productReportStart} />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  {t('dashboard.periodEnd')}
                  <input className="min-h-10 rounded-md border border-slate-200 px-3 text-sm" min={productReportStart} onChange={(event) => setProductReportEnd(event.target.value)} type="date" value={productReportEnd} />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              {t('dashboard.catalogPosition')}
              <select className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900" onChange={(event) => setSelectedProductId(event.target.value)} value={selectedProductId}>
                <option value="all">{t('dashboard.allProductsAndServices')}</option>
                {(productProfitQuery.data ?? []).map((row) => (
                  <option key={row.productId} value={row.productId}>
                    {row.name} · {t(row.itemType === 'service' ? 'dashboard.service' : 'dashboard.product')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="grid gap-2">
          {productProfitRows.length ? productProfitRows.map((row) => (
            <article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-slate-200 p-3" key={row.productId}>
              <CatalogImage alt={row.name} className="size-11" imagePath={row.imagePath} />
              <div className="min-w-0">
                <h4 className="truncate font-medium text-slate-950">{row.name}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {t(row.itemType === 'service' ? 'dashboard.service' : 'dashboard.product')} ·{' '}
                  {t('dashboard.soldQuantity')}: {formatMoney(row.quantity)} · {t('dashboard.revenue')}: {formatMoney(row.revenue)} · {t('dashboard.cost')}: {formatMoney(row.cost)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">{t('dashboard.netProfit')}</p>
                <p className={cn('mt-1 text-lg font-semibold', row.profit >= 0 ? 'text-emerald-700' : 'text-red-700')}>{formatMoney(row.profit)}</p>
              </div>
            </article>
          )) : (
            <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
              {productProfitQuery.isLoading ? t('dashboard.reportLoading') : t('dashboard.noProductSales')}
            </div>
          )}
        </div>
      </section>

    </section>
  )
}
