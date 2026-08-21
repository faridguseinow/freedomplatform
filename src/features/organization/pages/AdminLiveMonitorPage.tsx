import { Package, ReceiptText, Sofa, Timer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { EmployeeWorkspacePlaceRow, PlaceType } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  useEmployeeCategories,
  useEmployeeProducts,
} from '../../employee/catalog/employeeCatalogApi'
import { useEmployeeWorkspaceData } from '../../orders/employeeOrdersApi'
import { useCurrentEmployeeShift } from '../../shifts/shiftsApi'

const BILLING_GRACE_MINUTES = 10

const placeTypeLabel: Record<PlaceType, string> = {
  table: 'Стол',
  vip_room: 'VIP',
  playstation: 'PlayStation',
  billiard: 'Бильярд',
  racing: 'Руль',
  private_room: 'Кабинет',
  service_area: 'Зона',
  other: 'Другое',
}

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatAzn = (value: number | null | undefined) => `${formatMoney(value)} AZN`

const formatQuantity = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null
  return new Intl.NumberFormat('ru', { maximumFractionDigits: 3 }).format(value)
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

const formatElapsed = (startedAt: string | null, nowMs: number) => {
  if (!startedAt) return '00:00'
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')} мин`
}

const calculateCurrentSessionAmount = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  if (!place.active_session_started_at || !place.active_session_hourly_rate) return 0
  const actualMinutes = Math.max(
    1,
    Math.ceil((nowMs - new Date(place.active_session_started_at).getTime()) / 60_000),
  )
  const minimum = place.active_session_minimum_minutes ?? 60
  const step = place.active_session_billing_step_minutes ?? 30
  const billable =
    actualMinutes <= minimum + BILLING_GRACE_MINUTES
      ? minimum
      : minimum + Math.ceil((actualMinutes - minimum - BILLING_GRACE_MINUTES) / step) * step
  return (place.active_session_hourly_rate * billable) / 60
}

const getPlaceStatus = (place: EmployeeWorkspacePlaceRow) => {
  if (place.status !== 'active') return 'Недоступно'
  if (place.active_order_status === 'waiting_payment') return 'Ожидает оплату'
  if (place.active_order_id || place.active_session_id) return 'Занято'
  return 'Свободно'
}

const getStatusClassName = (status: string) =>
  cn(
    'inline-flex rounded-md px-2 py-1 text-[11px] font-semibold',
    status === 'Свободно' && 'bg-emerald-50 text-emerald-800',
    status === 'Занято' && 'bg-red-50 text-red-700',
    status === 'Ожидает оплату' && 'bg-amber-50 text-amber-800',
    status === 'Недоступно' && 'bg-slate-100 text-slate-600',
  )

export function AdminLiveMonitorPage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId)
  const productsQuery = useEmployeeProducts({ organizationId })
  const categoriesQuery = useEmployeeCategories({ organizationId })
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const places = workspaceQuery.data?.places ?? []
  const orders = workspaceQuery.data?.orders ?? []
  const products = productsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )
  const activePlaces = places.filter((place) => place.active_order_id || place.active_session_id).length
  const waitingPayment = orders.filter((order) => order.status === 'waiting_payment').length
  const shift = currentShiftQuery.data?.shift ?? null
  const shiftSummary = currentShiftQuery.data?.summary
  const isLoading =
    workspaceQuery.isLoading ||
    productsQuery.isLoading ||
    categoriesQuery.isLoading ||
    currentShiftQuery.isLoading
  const firstError = workspaceQuery.error ?? productsQuery.error ?? categoriesQuery.error ?? currentShiftQuery.error

  const sortedPlaces = [...places].sort((first, second) => (first.sort_order || 0) - (second.sort_order || 0) || first.name.localeCompare(second.name))
  const sortedProducts = [...products].sort((first, second) => first.name.localeCompare(second.name, 'az-Latn'))

  return (
    <section className="grid gap-3 sm:gap-5">
      <header className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">{t('Мобильный мониторинг')}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t('Места онлайн')}</h1>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {t('Просмотр смены, мест, заказов и товаров без рабочих действий.')}
            </p>
          </div>
          <Sofa aria-hidden="true" className="size-6 shrink-0 text-emerald-700" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase text-slate-500">{t('Смена')}</p>
            <p className="mt-1 font-semibold text-slate-950">{shift ? t('Открыта') : t('Закрыта')}</p>
            <p className="mt-1 text-xs text-slate-600">{shift ? formatDateTime(shift.opened_at) : t('Смена не открыта')}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase text-slate-500">{t('Выручка смены')}</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatAzn((shiftSummary?.cash_sales_total ?? 0) + (shiftSummary?.card_transfer_sales_total ?? 0))}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t('Заказы')}: {orders.length} · {t('Занято')}: {activePlaces}
            </p>
          </div>
        </div>
      </header>

      {firstError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {firstError.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
          {t('Загрузка данных...')}
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{t('Места')}</h2>
          <span className="text-sm font-medium text-slate-500">
            {activePlaces}/{places.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sortedPlaces.map((place) => {
            const status = getPlaceStatus(place)
            const sessionAmount = calculateCurrentSessionAmount(place, nowMs)
            const occupancyStartedAt = place.active_session_started_at ?? place.active_order_opened_at
            const total = (place.active_order_total ?? 0) + sessionAmount

            return (
              <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={place.id}>
                <div className="flex items-start gap-3">
                  <CatalogImage alt={place.name} className="size-11 rounded-full" imagePath={place.image_path} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate text-base font-semibold text-slate-950">{place.name}</h3>
                      <span className={getStatusClassName(status)}>{t(status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {place.custom_type_name || t(placeTypeLabel[place.type])}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-[11px] font-medium uppercase text-slate-500">{t('Сессия')}</p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {place.active_session_id ? formatElapsed(place.active_session_started_at, nowMs) : t('Нет')}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-[11px] font-medium uppercase text-slate-500">{t('Сумма')}</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatAzn(total)}</p>
                  </div>
                </div>

                <div className="grid gap-1 text-xs text-slate-600">
                  <span>
                    {t('Заказ')}: {place.active_order_number ? `#${place.active_order_number}` : t('Нет')}
                  </span>
                  {occupancyStartedAt ? (
                    <span className="inline-flex items-center gap-1">
                      <Timer aria-hidden="true" className="size-3.5" />
                      {t('С момента')}: {formatDateTime(occupancyStartedAt)}
                    </span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <ReceiptText aria-hidden="true" className="size-5 text-emerald-700" />
            {t('Открытые заказы')}
          </h2>
          {waitingPayment ? (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              {t('Ожидает оплату')}: {waitingPayment}
            </span>
          ) : null}
        </div>

        {orders.length ? (
          <div className="grid gap-2">
            {orders.map((order) => (
              <article className="rounded-md border border-slate-200 p-3" key={order.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-950">#{order.order_number}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {order.customer_label || t('Без имени')}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-950">{formatAzn(order.total_amount)}</p>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-slate-600">
                  <span>{order.current_place_name_snapshot ?? t('Без места')}</span>
                  <span>{t('Открыт')}: {formatDateTime(order.opened_at)}</span>
                  {order.comment ? <span>{t('Комментарий')}: {order.comment}</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {t('Открытых заказов нет')}
          </div>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
          <Package aria-hidden="true" className="size-5 text-emerald-700" />
          {t('Товары')}
        </h2>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sortedProducts.map((product) => {
            const productWithStock = product as typeof product & {
              minimum_stock_quantity?: number | null
              stock_quantity?: number | null
              track_stock?: boolean | null
            }
            const stock = formatQuantity(productWithStock.stock_quantity)
            const low =
              productWithStock.track_stock &&
              (productWithStock.stock_quantity ?? 0) <= (productWithStock.minimum_stock_quantity ?? 0)
            return (
              <article className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-md border border-slate-200 p-2.5" key={product.id}>
                <CatalogImage alt={product.name} className="size-14 object-contain" imagePath={product.image_path} />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950">{product.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{formatAzn(product.sale_price)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {categoryById.get(product.category_id ?? '') ?? t('Без категории')}
                  </p>
                  <p className={low ? 'mt-1 text-xs font-semibold text-amber-700' : 'mt-1 text-xs text-slate-600'}>
                    {productWithStock.track_stock
                      ? `${t('Осталось')}: ${stock ?? '-'} ${product.unit_name}`
                      : t('Без учёта склада')}
                  </p>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}

export default AdminLiveMonitorPage
