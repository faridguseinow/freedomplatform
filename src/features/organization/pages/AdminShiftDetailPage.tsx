import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { shiftStatusLabel, useAdminShiftDetail, useAdminShiftMutations } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminShiftDetailPage() {
  const { organizationId } = useAuth()
  const { shiftId } = useParams()
  const detailQuery = useAdminShiftDetail(shiftId ?? null)
  const mutations = useAdminShiftMutations(organizationId)

  if (detailQuery.isLoading) {
    return <div className="text-sm text-slate-600"><Loader2 className="mr-2 inline size-4 animate-spin" /> Загрузка</div>
  }

  if (!detailQuery.data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Смена не найдена.</div>
  }

  const { handovers, orders, payments, sessions, shift } = detailQuery.data

  const forceClose = () => {
    const reason = window.prompt('Причина force close')
    if (!reason) return
    const actualCashText = window.prompt('Фактическая наличность', String(shift.expected_cash_amount ?? 0))
    mutations.forceClose.mutate({
      shiftId: shift.id,
      actualCashAmount: actualCashText ? Number(actualCashText) : null,
      reason,
    })
  }

  return (
    <section className="grid gap-5">
      <div>
        <Button type="button" variant="secondary">
          <Link className="inline-flex items-center gap-2" to="/admin/shifts">
            <ArrowLeft className="size-4" /> Назад
          </Link>
        </Button>
      </div>
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Смена</h2>
        <p className="text-sm text-slate-600">
          {shift.employee_full_name ?? shift.employee_email} · {shift.business_date} · {shiftStatusLabel[shift.status]}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Cash</div><div className="mt-1 text-xl font-semibold">{formatMoney(shift.cash_sales_total)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Card</div><div className="mt-1 text-xl font-semibold">{formatMoney(shift.card_transfer_sales_total)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Expected</div><div className="mt-1 text-xl font-semibold">{formatMoney(shift.expected_cash_amount)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Variance</div><div className="mt-1 text-xl font-semibold">{formatMoney(shift.cash_variance)}</div></div>
      </div>

      {shift.status === 'open' ? (
        <div>
          <Button onClick={forceClose} type="button" variant="danger">Force close</Button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-950">Заказы</h3>
          {orders.map((order) => <div className="text-sm" key={order.id}>#{order.order_number} · {order.status} · {formatMoney(order.total_amount)}</div>)}
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-950">Платежи</h3>
          {payments.map((payment) => <div className="text-sm" key={payment.id}>{payment.method} · {payment.status} · {formatMoney(payment.amount)}</div>)}
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-950">Сессии</h3>
          {sessions.map((session) => <div className="text-sm" key={session.id}>{session.place_name_snapshot} · {session.status}</div>)}
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-950">Передачи</h3>
          {handovers.map((handover) => <div className="text-sm" key={handover.id}>{handover.status} · orders {handover.opening_orders_count} · sessions {handover.active_sessions_count}</div>)}
        </section>
      </div>
    </section>
  )
}
