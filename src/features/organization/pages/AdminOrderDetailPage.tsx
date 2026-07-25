import { ArrowLeft, Loader2, PackageCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { useAdminOrderDetail } from '../../orders/ordersApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminOrderDetailPage() {
  const { orderId } = useParams()
  const detailQuery = useAdminOrderDetail(orderId ?? null)

  if (detailQuery.isLoading) {
    return (
      <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
        <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка заказа
      </div>
    )
  }

  if (!detailQuery.data) {
    return (
      <section className="grid gap-4">
        <Button type="button" variant="secondary">
          <Link className="inline-flex items-center gap-2" to="/admin/orders">
            <ArrowLeft className="size-4" /> Назад
          </Link>
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Заказ не найден.
        </div>
      </section>
    )
  }

  const { order, items, payments, reservations, sessions } = detailQuery.data
  const grossProfit = items.reduce(
    (sum, item) => sum + item.total_price - (item.total_cost_snapshot ?? 0),
    0,
  )

  return (
    <section className="grid gap-5">
      <div>
        <Button type="button" variant="secondary">
          <Link className="inline-flex items-center gap-2" to="/admin/orders">
            <ArrowLeft className="size-4" /> Назад
          </Link>
        </Button>
      </div>

      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Заказ #{order.order_number}</h2>
        <p className="text-sm text-slate-600">
          {order.current_place_name_snapshot ?? 'Без места'} · {orderStatusLabel[order.status]}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Итого</div><div className="mt-1 text-xl font-semibold">{formatMoney(order.total_amount)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Оплачено</div><div className="mt-1 text-xl font-semibold">{formatMoney(order.paid_amount)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Долг</div><div className="mt-1 text-xl font-semibold">{formatMoney(order.unpaid_amount)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Валовая прибыль</div><div className="mt-1 text-xl font-semibold">{formatMoney(grossProfit)}</div></div>
      </div>

      <section className="grid gap-3">
        <h3 className="text-lg font-semibold text-slate-950">Позиции</h3>
        <div className="grid gap-2">
          {items.map((item) => (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">{item.name_snapshot}</div>
                  <div className="text-sm text-slate-600">{item.item_type} · {item.status}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatMoney(item.total_price)}</div>
                  <div className="text-xs text-slate-500">cost {formatMoney(item.total_cost_snapshot)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-lg font-semibold text-slate-950">Платежи</h3>
        <div className="grid gap-2">
          {payments.map((payment) => (
            <article className="rounded-lg border border-slate-200 bg-white p-4" key={payment.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{payment.method} · {payment.status}</span>
                <span className="font-semibold">{formatMoney(payment.amount)}</span>
              </div>
            </article>
          ))}
          {!payments.length ? <div className="text-sm text-slate-600">Платежей нет.</div> : null}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-lg font-semibold text-slate-950">Сессии и резервы</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold"><PackageCheck className="size-4" /> Резервы</div>
            {reservations.map((reservation) => (
              <div className="flex justify-between gap-3 text-sm" key={reservation.id}>
                <span>{reservation.status}</span>
                <span>{reservation.quantity}</span>
              </div>
            ))}
            {!reservations.length ? <div className="text-sm text-slate-600">Резервов нет.</div> : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 font-semibold">Timed sessions</div>
            {sessions.map((session) => (
              <div className="grid gap-1 text-sm" key={session.id}>
                <div>{session.place_name_snapshot} · {session.status}</div>
                <div className="text-slate-600">{session.billable_minutes ?? '-'} мин · {formatMoney(session.calculated_amount)}</div>
              </div>
            ))}
            {!sessions.length ? <div className="text-sm text-slate-600">Сессий нет.</div> : null}
          </div>
        </div>
      </section>
    </section>
  )
}
