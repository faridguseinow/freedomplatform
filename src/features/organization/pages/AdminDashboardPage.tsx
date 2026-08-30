import {
  AlertTriangle,
  Clock3,
  Eye,
  HelpCircle,
  LayoutDashboard,
  ReceiptText,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  AdjustmentRequestStatus,
  AdjustmentRequestType,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { todayDate, useFinanceDashboardSummary } from '../../finance/financeApi'
import { useAdminAdjustmentRequests } from '../../orders/adjustmentRequestsApi'
import {
  usePaymentMethodSummaryByShiftIds,
  useRevenueBreakdownByShiftIds,
  useUsageHoursBreakdownByShiftIds,
} from '../../orders/paymentsApi'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { useAdminOrders } from '../../orders/ordersApi'
import { useAdminShifts } from '../../shifts/shiftsApi'
import { useCombos } from '../catalog/comboApi'
import { useInventoryBalances } from '../catalog/inventoryApi'
import { usePlaces, useProducts, useServices } from '../catalog/catalogApi'
import { useAdminActivityEvents } from '../activity/activityApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

const adjustmentStatusLabel: Record<AdjustmentRequestStatus, string> = {
  pending: 'Ожидало подтверждения',
  approved: 'Выполнено',
  rejected: 'Отклонено',
  expired: 'Истекло',
  cancelled: 'Отменено',
}

const adjustmentTypeLabel: Record<AdjustmentRequestType, string> = {
  remove_order_item: 'Удаление позиции',
  change_quantity: 'Изменение количества',
  cancel_order: 'Отмена заказа',
  change_payment_method: 'Изменение метода оплаты',
  correct_session_time: 'Коррекция времени сессии',
  other: 'Другое',
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
              aria-label={t(`Как считается: ${label}`)}
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
  const ordersQuery = useAdminOrders(organizationId, 'all')
  const adjustmentsQuery = useAdminAdjustmentRequests(organizationId, 'all')
  const activityQuery = useAdminActivityEvents(organizationId)
  const shiftsQuery = useAdminShifts(organizationId, 'all')
  const placesQuery = usePlaces({ organizationId })
  const productsQuery = useProducts({ organizationId })
  const servicesQuery = useServices({ organizationId })
  const combosQuery = useCombos(organizationId)
  const inventoryQuery = useInventoryBalances(organizationId)
  const financeQuery = useFinanceDashboardSummary(organizationId)

  const orders = ordersQuery.data ?? []
  const adjustments = adjustmentsQuery.data ?? []
  const activityEvents = activityQuery.data ?? []
  const shifts = shiftsQuery.data ?? []
  const places = placesQuery.data ?? []
  const products = productsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const combos = combosQuery.data ?? []
  const inventory = inventoryQuery.data ?? []
  const finance = financeQuery.data

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
  const openOrders = orders.filter((order) => order.status === 'open').length
  const refusedOrders = orders.filter((order) => order.status === 'payment_refused').length
  const openShifts = shifts.filter((shift) => shift.status === 'open' || shift.status === 'closing').length
  const timedPlaces = places.filter((place) => place.has_timer).length
  const lowStock = inventory.filter((item) => item.stock_quantity <= item.minimum_stock_quantity).length
  const operationalDayLabel = currentDayShifts.length ? reportBusinessDate : t('Смена не открыта')

  const isLoading =
    ordersQuery.isLoading ||
    adjustmentsQuery.isLoading ||
    activityQuery.isLoading ||
    shiftsQuery.isLoading ||
    placesQuery.isLoading ||
    productsQuery.isLoading ||
    servicesQuery.isLoading ||
    combosQuery.isLoading ||
    inventoryQuery.isLoading ||
    financeQuery.isLoading ||
    paymentSummaryQuery.isLoading ||
    revenueBreakdownQuery.isLoading ||
    usageHoursQuery.isLoading

  const firstError =
    ordersQuery.error ??
    adjustmentsQuery.error ??
    activityQuery.error ??
    shiftsQuery.error ??
    placesQuery.error ??
    productsQuery.error ??
    servicesQuery.error ??
    combosQuery.error ??
    inventoryQuery.error ??
    financeQuery.error ??
    paymentSummaryQuery.error ??
    revenueBreakdownQuery.error ??
    usageHoursQuery.error
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const recentOrders = orders.slice(0, 5)
  const recentAdjustments = adjustments.slice(0, 5)
  const recentActivityEvents = activityEvents.slice(0, 5)

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
            <p className="text-xs font-medium uppercase text-slate-500">{t('Обзор организации')}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-slate-950 sm:text-3xl">
              {currentOrganization?.name ?? t('Организация')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {currentOrganization?.description ||
                t('Операционная сводка по заказам, сменам, рабочим местам, складу и финансам.')}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {t('Операционный день')}: {operationalDayLabel}
            </p>
          </div>
        </div>
        <Button className="w-full shrink-0 justify-center sm:w-auto" type="button">
          <Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/live')}>
            <Eye aria-hidden="true" className="size-4" />
            {t('Смотреть места')}
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
          {t('Загрузка показателей...')}
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
          <h3 className="text-lg font-semibold text-slate-950">{t('Выручка по направлениям (сегодня)')}</h3>
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
            description="Чистая прибыль по товарным позициям: сумма продаж товаров минус snapshot-себестоимость этих товаров в заказах."
            label="Прибыль товаров"
            tone="default"
            value={formatMoney(revenueBreakdown?.goods ?? 0)}
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t('Время по направлениям (сегодня)')}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard
            description="Сумма фактического времени всех сессий PlayStation и VIP-кабинетов за выбранный операционный день."
            label="PlayStation"
            value={`${formatMoney(usageHours?.playstation ?? 0)} ${t('ч')}`}
          />
          <StatCard
            description="Сумма фактического времени всех бильярдных сессий за выбранный операционный день."
            label="Бильярд"
            value={`${formatMoney(usageHours?.billiard ?? 0)} ${t('ч')}`}
          />
          <StatCard
            description="Сумма времени занятости обычных столов: от открытия заказа до закрытия или до текущего момента."
            label="Столы"
            value={`${formatMoney(usageHours?.tables ?? 0)} ${t('ч')}`}
          />
          <StatCard
            description="Общее занятое время по PlayStation, бильярду и столам за выбранный операционный день."
            label="Всего часов"
            value={`${formatMoney(usageHours?.total ?? 0)} ${t('ч')}`}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t('Рабочее состояние')}</h3>
            <LayoutDashboard className="size-5 text-emerald-700" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatCard label="Места" value={`${places.length} / ${t('таймер')} ${timedPlaces}`} />
            <StatCard label="Товары" value={products.length} />
            <StatCard label="Услуги" value={services.length} />
            <StatCard label="Комбо" value={combos.length} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/live')}><Eye className="size-4" />{t('Мониторинг')}</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/orders')}><ReceiptText className="size-4" />{t('Заказы')}</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/shifts')}><Clock3 className="size-4" />{t('Смены')}</Link></Button>
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t('Контроль')}</h3>
            <AlertTriangle className="size-5 text-amber-600" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
            <StatCard label="Низкий остаток" tone={lowStock ? 'danger' : 'default'} value={lowStock} />
            <StatCard label="Отказы от оплаты" tone={refusedOrders ? 'danger' : 'default'} value={refusedOrders} />
            <StatCard label="Периоды на проверке" tone={finance?.periods_waiting_review ? 'warning' : 'default'} value={finance?.periods_waiting_review ?? 0} />
          </div>
        </section>
      </div>

      <section className="grid gap-3 xl:grid-cols-3">
        <section className="grid content-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t('Последние заказы')}</h3>
            <Link className="text-sm font-medium text-emerald-700 hover:text-emerald-800" to={buildAdminPath('/admin/orders')}>
              {t('Смотреть все')}
            </Link>
          </div>
          <div className="grid gap-2">
            {recentOrders.length ? (
              recentOrders.map((order) => (
                <Link
                  className="grid gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  key={order.id}
                  to={buildAdminPath(`/admin/orders/${order.id}`)}
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate font-medium text-slate-950">
                      #{order.order_number} · {order.current_place_name_snapshot ?? t('Без места')}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-950">{formatMoney(order.total_amount)}</span>
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {t(orderStatusLabel[order.status] ?? order.status)} · {formatDateTime(order.opened_at)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                {t('Заказов нет')}
              </div>
            )}
          </div>
        </section>

        <section className="grid content-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t('Последние исправления')}</h3>
            <Link
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
              to={buildAdminPath('/admin/adjustment-requests')}
            >
              {t('Смотреть все')}
            </Link>
          </div>
          <div className="grid gap-2">
            {recentAdjustments.length ? (
              recentAdjustments.map((request) => (
                <Link
                  className="grid gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  key={request.id}
                  to={buildAdminPath('/admin/adjustment-requests')}
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate font-medium text-slate-950">{t(adjustmentTypeLabel[request.request_type])}</span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">{t(adjustmentStatusLabel[request.status])}</span>
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {request.order ? `#${request.order.order_number}` : request.order_id.slice(0, 8)} · {formatDateTime(request.requested_at)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                {t('Исправлений нет')}
              </div>
            )}
          </div>
        </section>

        <section className="grid content-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{t('Последний журнал')}</h3>
            <Link className="text-sm font-medium text-emerald-700 hover:text-emerald-800" to={buildAdminPath('/admin/activity')}>
              {t('Смотреть все')}
            </Link>
          </div>
          <div className="grid gap-2">
            {recentActivityEvents.length ? (
              recentActivityEvents.map((event) => (
                <Link
                  className="grid gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  key={`${event.source}-${event.id}`}
                  to={buildAdminPath('/admin/activity')}
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate font-medium text-slate-950">{event.actorName}</span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">{formatDateTime(event.createdAt)}</span>
                  </span>
                  <span className="truncate text-xs text-slate-600">
                    {t(event.actionLabel)} · {t(event.entityType)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                {t('Событий пока нет.')}
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  )
}
