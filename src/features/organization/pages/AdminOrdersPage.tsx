import { Eye, Loader2, ReceiptText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { OrderStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import type { AdminOrderRow } from '../../orders/ordersApi'
import { useAdminOrders } from '../../orders/ordersApi'

type StatusFilter = OrderStatus | 'all'

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

const statusClass: Record<OrderStatus, string> = {
  open: 'bg-cyan-50 text-cyan-800',
  waiting_payment: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  unpaid: 'bg-red-50 text-red-700',
  payment_refused: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

export function AdminOrdersPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const ordersQuery = useAdminOrders(organizationId, status)
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data])
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((order) =>
      [
        String(order.order_number),
        order.current_place_name_snapshot,
        order.customer_label,
        order.payment_refusal_comment,
        order.comment,
        order.items_preview.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [orders, search])
  const statusBadge = (orderStatus: OrderStatus) => (
    <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-semibold', statusClass[orderStatus])}>
      {t(orderStatusLabel[orderStatus] ?? orderStatus)}
    </span>
  )
  const orderPlace = (order: AdminOrderRow) => order.current_place_name_snapshot ?? t('Без места')
  const orderNote = (order: AdminOrderRow) => order.payment_refusal_comment ?? order.comment
  const itemsPreview = (order: AdminOrderRow) =>
    order.items_preview.length ? order.items_preview.join(', ') : t('Позиции не указаны')

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t('Заказы')}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t('История продаж, неоплаченные заказы, отказы от оплаты и платежи.')}
        </p>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>{t('Поиск')}</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Номер, место, клиент')}
              type="search"
              value={search}
            />
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {(['all', 'open', 'waiting_payment', 'paid', 'payment_refused', 'cancelled'] as const).map((item) => (
            <button
              className={cn(
                'min-h-10 rounded-md border px-3 text-sm font-medium',
                status === item
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
              key={item}
              onClick={() => setStatus(item)}
              type="button"
            >
              {item === 'all' ? t('Все') : t(orderStatusLabel[item] ?? item)}
            </button>
          ))}
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('Загрузка заказов')}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Заказ')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Статус')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Место / клиент')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Состав')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Итого')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Оплачено')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Долг')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Открыт в')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Закрыт в')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Детали')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOrders.map((order) => (
                <tr className="align-top hover:bg-slate-50/80" key={order.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">#{order.order_number}</td>
                  <td className="whitespace-nowrap px-4 py-3">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{orderPlace(order)}</div>
                    {order.customer_label ? <div className="mt-1 text-xs text-slate-500">{order.customer_label}</div> : null}
                    {orderNote(order) ? <div className="mt-1 max-w-44 text-xs text-slate-500">{orderNote(order)}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-56 text-slate-700">{itemsPreview(order)}</div>
                    <div className="mt-1 text-xs text-slate-500">{t('Позиций')}: {order.items_count}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">{formatMoney(order.total_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-800">{formatMoney(order.paid_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">{formatMoney(order.unpaid_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(order.opened_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(order.closed_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      to={buildAdminPath(`/admin/orders/${order.id}`)}
                    >
                      <Eye className="size-4" /> {t('Открыть')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {visibleOrders.map((order) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            key={order.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-950">{t('Заказ')} #{order.order_number}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{orderPlace(order)} · {formatDateTime(order.opened_at)}</p>
              </div>
              {statusBadge(order.status)}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"><dt className="text-[11px] font-semibold uppercase text-slate-500">{t('Итого')}</dt><dd className="mt-0.5 font-semibold text-slate-950">{formatMoney(order.total_amount)}</dd></div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"><dt className="text-[11px] font-semibold uppercase text-slate-500">{t('Оплачено')}</dt><dd className="mt-0.5 font-semibold text-emerald-800">{formatMoney(order.paid_amount)}</dd></div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"><dt className="text-[11px] font-semibold uppercase text-slate-500">{t('Долг')}</dt><dd className="mt-0.5 font-semibold text-slate-950">{formatMoney(order.unpaid_amount)}</dd></div>
            </dl>
            <p className="mt-3 text-sm text-slate-700">{itemsPreview(order)}</p>
            <p className="mt-1 text-xs text-slate-500">{t('Позиций')}: {order.items_count} · {t('Закрыт в')}: {formatDateTime(order.closed_at)}</p>
            <Link
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              to={buildAdminPath(`/admin/orders/${order.id}`)}
            >
              <Eye className="size-4" /> {t('Открыть')}
            </Link>
          </article>
        ))}
      </div>

      {!ordersQuery.isLoading && !visibleOrders.length ? (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600">
          <ReceiptText className="mb-2 size-6 text-slate-400" />
          {t('Заказов по фильтру нет')}
        </div>
      ) : null}
    </section>
  )
}
