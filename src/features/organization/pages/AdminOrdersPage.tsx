import { Eye, Loader2, ReceiptText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import type { OrderStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { useAdminOrders } from '../../orders/ordersApi'

type StatusFilter = OrderStatus | 'all'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const statusClass: Record<OrderStatus, string> = {
  open: 'bg-cyan-50 text-cyan-800',
  waiting_payment: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  unpaid: 'bg-red-50 text-red-700',
  payment_refused: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

export function AdminOrdersPage() {
  const { organizationId } = useAuth()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const ordersQuery = useAdminOrders(organizationId, status)
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data])
  const visibleOrders = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((order) =>
      [
        String(order.order_number),
        order.current_place_name_snapshot,
        order.customer_label,
        order.payment_refusal_comment,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [orders, search])

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Заказы</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          История продаж, неоплаченные заказы, отказы от оплаты и платежи.
        </p>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Номер, место, клиент"
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
              {item === 'all' ? 'Все' : orderStatusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {ordersQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка заказов
        </div>
      ) : null}

      <div className="grid gap-3">
        {visibleOrders.map((order) => (
          <article
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]"
            key={order.id}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">Заказ #{order.order_number}</h3>
                <span className={cn('rounded-md px-2 py-1 text-xs font-medium', statusClass[order.status])}>
                  {orderStatusLabel[order.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {order.current_place_name_snapshot ?? 'Без места'} · открыт {new Date(order.opened_at).toLocaleString('ru')}
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div><dt className="text-xs uppercase text-slate-500">Итого</dt><dd>{formatMoney(order.total_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Оплачено</dt><dd>{formatMoney(order.paid_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Долг</dt><dd>{formatMoney(order.unpaid_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Закрыт</dt><dd>{order.closed_at ? new Date(order.closed_at).toLocaleString('ru') : '-'}</dd></div>
              </dl>
            </div>
            <Button type="button" variant="secondary">
              <Link className="inline-flex items-center gap-2" to={`/admin/orders/${order.id}`}>
                <Eye className="size-4" /> Открыть
              </Link>
            </Button>
          </article>
        ))}
      </div>

      {!ordersQuery.isLoading && !visibleOrders.length ? (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600">
          <ReceiptText className="mb-2 size-6 text-slate-400" />
          Заказов по фильтру нет
        </div>
      ) : null}
    </section>
  )
}
