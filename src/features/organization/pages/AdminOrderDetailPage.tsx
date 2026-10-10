import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  ReceiptText,
  Timer,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getCurrentLocale } from '../../../lib/i18n/translator'
import type {
  OrderItemStatus,
  OrderItemType,
  PaymentMethod,
  PaymentStatus,
  StockReservationStatus,
  TimedSessionStatus,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { formatOrderDisplayNumber } from '../../orders/orderDisplay'
import { useAdminOrderDetail } from '../../orders/ordersApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(value))
}

const itemTypeLabel: Record<OrderItemType, string> = {
  product: 'adminOrderDetail.itemType.product',
  service: 'adminOrderDetail.itemType.service',
  combo: 'adminOrderDetail.itemType.combo',
  timed_session: 'adminOrderDetail.itemType.timedSession',
  manual_item: 'adminOrderDetail.itemType.manual',
}
const itemStatusLabel: Record<OrderItemStatus, string> = {
  active: 'adminOrderDetail.status.active',
  removal_requested: 'adminOrderDetail.status.removalRequested',
  removed: 'adminOrderDetail.status.removed',
  cancelled: 'adminOrderDetail.status.cancelled',
}
const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'adminOrderDetail.payment.cash',
  card_transfer: 'adminOrderDetail.payment.card',
}
const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: 'adminOrderDetail.status.pending',
  completed: 'adminOrderDetail.status.completed',
  cancelled: 'adminOrderDetail.status.cancelled',
  refunded: 'adminOrderDetail.status.refunded',
}
const reservationStatusLabel: Record<StockReservationStatus, string> = {
  active: 'adminOrderDetail.status.reserved',
  released: 'adminOrderDetail.status.released',
  consumed: 'adminOrderDetail.status.consumed',
  cancelled: 'adminOrderDetail.status.cancelled',
}
const sessionStatusLabel: Record<TimedSessionStatus, string> = {
  active: 'adminOrderDetail.status.active',
  completed: 'adminOrderDetail.status.completed',
  cancelled: 'adminOrderDetail.status.cancelled',
}

const statusTone = (status: string) => cn(
  'inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold',
  ['active', 'completed', 'consumed', 'paid'].includes(status) && 'bg-emerald-50 text-emerald-700',
  ['pending', 'removal_requested', 'waiting_payment'].includes(status) && 'bg-amber-50 text-amber-700',
  ['removed', 'cancelled', 'refunded'].includes(status) && 'bg-red-50 text-red-700',
  status === 'released' && 'bg-slate-100 text-slate-600',
)

export function AdminOrderDetailPage() {
  const { orderId } = useParams()
  const { t } = useI18n()
  const detailQuery = useAdminOrderDetail(orderId ?? null)

  if (detailQuery.isLoading) return (
    <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
      <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('adminOrderDetail.loading')}
    </div>
  )

  if (!detailQuery.data) return (
    <section className="grid gap-4">
      <Button type="button" variant="secondary">
        <Link className="inline-flex items-center gap-2" to="/admin/orders"><ArrowLeft className="size-4" /> {t('adminOrderDetail.back')}</Link>
      </Button>
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{t('adminOrderDetail.notFound')}</div>
    </section>
  )

  const { order, items, payments, reservations, sessions, placeImageById } = detailQuery.data
  const grossProfit = items.reduce((sum, item) => sum + item.total_price - (item.total_cost_snapshot ?? 0), 0)
  const primaryPayment = payments.find((payment) => payment.status === 'completed') ?? payments[0] ?? null
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const itemById = new Map(items.map((item) => [item.id, item]))

  return (
    <section className="grid gap-5">
      <div><Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to="/admin/orders"><ArrowLeft className="size-4" /> {t('adminOrderDetail.back')}</Link></Button></div>

      <header className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="grid gap-1">
            <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
              {formatOrderDisplayNumber(order.order_number, order.customer_label)}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{order.current_place_name_snapshot ?? t('adminOrderDetail.noPlace')}</span>
              <span className={statusTone(order.status)}>{t(orderStatusLabel[order.status] ?? order.status)}</span>
            </div>
          </div>
          <div className="grid gap-1 text-sm text-slate-600 sm:text-right">
            <span className="inline-flex items-center gap-1.5 sm:justify-end"><CalendarDays className="size-4" />{t('adminOrderDetail.openedAt')}: {formatDateTime(order.opened_at)}</span>
            <span>{t('adminOrderDetail.closedAt')}: {formatDateTime(order.closed_at)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            [t('adminOrderDetail.total'), formatMoney(order.total_amount)],
            [t('adminOrderDetail.paid'), formatMoney(order.paid_amount)],
            [t('adminOrderDetail.debt'), formatMoney(order.unpaid_amount)],
            [t('adminOrderDetail.grossProfit'), formatMoney(grossProfit)],
            [t('adminOrderDetail.paymentMethod'), primaryPayment ? t(paymentMethodLabel[primaryPayment.method]) : '—'],
          ].map(([label, value]) => <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={label}><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold text-slate-950">{value}</div></div>)}
        </div>
      </header>

      {order.comment ? <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"><h3 className="text-sm font-semibold text-slate-950">{t('adminOrderDetail.comment')}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{order.comment}</p></section> : null}

      <section className="grid gap-3">
        <div className="flex items-center gap-2"><ReceiptText className="size-5 text-emerald-700" /><h3 className="text-lg font-semibold text-slate-950">{t('adminOrderDetail.items')}</h3></div>
        <div className="grid gap-2">
          {items.map((item) => {
            const session = item.timed_session_id ? sessionById.get(item.timed_session_id) : null
            const imagePath = item.image_path_snapshot ?? (session ? placeImageById[session.place_id] : null)
            return (
              <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" key={item.id}>
                <div className="grid gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center">
                  <CatalogImage alt={item.name_snapshot} className="size-18 object-contain" imagePath={imagePath} />
                  <div className="grid min-w-0 gap-2">
                    <div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-slate-950">{item.name_snapshot}</div><span className={statusTone(item.status)}>{t(itemStatusLabel[item.status])}</span></div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>{t('adminOrderDetail.type')}: {t(itemTypeLabel[item.item_type])}</span>
                      <span>{t('adminOrderDetail.quantity')}: {formatMoney(item.quantity)}</span>
                      <span>{t('adminOrderDetail.unitPrice')}: {formatMoney(item.unit_price)}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="size-3.5" /> {formatDateTime(item.added_at)}</div>
                  </div>
                  <div className="grid gap-1 sm:min-w-32 sm:text-right"><div className="text-xs font-medium uppercase text-slate-500">{t('adminOrderDetail.amount')}</div><div className="text-lg font-semibold text-slate-950">{formatMoney(item.total_price)}</div><div className="text-xs text-slate-500">{t('adminOrderDetail.cost')}: {formatMoney(item.total_cost_snapshot)}</div></div>
                </div>
              </article>
            )
          })}
          {!items.length ? <div className="text-sm text-slate-600">{t('adminOrderDetail.noItems')}</div> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2"><CreditCard className="size-5 text-emerald-700" /><h3 className="text-lg font-semibold text-slate-950">{t('adminOrderDetail.payments')}</h3></div>
        <div className="grid gap-2 md:grid-cols-2">
          {payments.map((payment) => <article className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={payment.id}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">{payment.method === 'cash' ? <Banknote className="size-5" /> : <CreditCard className="size-5" />}</span><div><div className="font-semibold text-slate-950">{t(paymentMethodLabel[payment.method])}</div><div className="mt-1 text-xs text-slate-500">{formatDateTime(payment.completed_at ?? payment.created_at)}</div></div></div><div className="text-right"><div className="text-lg font-semibold text-slate-950">{formatMoney(payment.amount)}</div><span className={statusTone(payment.status)}>{t(paymentStatusLabel[payment.status])}</span></div></div></article>)}
          {!payments.length ? <div className="text-sm text-slate-600">{t('adminOrderDetail.noPayments')}</div> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2"><Clock3 className="size-5 text-emerald-700" /><h3 className="text-lg font-semibold text-slate-950">{t('adminOrderDetail.sessionsAndReservations')}</h3></div>
        <div className="grid items-start gap-3 md:grid-cols-2">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-950"><PackageCheck className="size-5 text-emerald-700" /> {t('adminOrderDetail.reservations')}</div>
            {reservations.map((reservation) => <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm" key={reservation.id}><div className="grid gap-1"><span className="font-medium text-slate-900">{itemById.get(reservation.order_item_id)?.name_snapshot ?? t('adminOrderDetail.product')}</span><span className={statusTone(reservation.status)}>{t(reservationStatusLabel[reservation.status])}</span></div><span className="font-semibold text-slate-950">{formatMoney(reservation.quantity)} {t('adminOrderDetail.units')}</span></div>)}
            {!reservations.length ? <div className="text-sm text-slate-600">{t('adminOrderDetail.noReservations')}</div> : null}
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-950"><Timer className="size-5 text-emerald-700" /> {t('adminOrderDetail.timedSessions')}</div>
            {sessions.map((session) => <div className="grid gap-2 border-t border-slate-100 pt-3 text-sm" key={session.id}><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-slate-950">{session.place_name_snapshot}</div><div className="mt-1 text-xs text-slate-500">{formatDateTime(session.started_at)} — {formatDateTime(session.ended_at)}</div></div><span className={statusTone(session.status)}>{t(sessionStatusLabel[session.status])}</span></div><div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600"><span>{t('adminOrderDetail.duration')}: {session.billable_minutes ?? '—'} {t('adminOrderDetail.minutes')}</span><span>{t('adminOrderDetail.sessionAmount')}: {formatMoney(session.calculated_amount)}</span></div></div>)}
            {!sessions.length ? <div className="text-sm text-slate-600">{t('adminOrderDetail.noSessions')}</div> : null}
          </div>
        </div>
      </section>
    </section>
  )
}
