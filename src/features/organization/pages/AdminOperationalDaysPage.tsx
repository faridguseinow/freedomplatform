import { Loader2 } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useOperationalDays } from '../../shifts/operationalDaysApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminOperationalDaysPage() {
  const { organizationId } = useAuth()
  const daysQuery = useOperationalDays(organizationId)
  const days = daysQuery.data ?? []

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Операционные дни</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">Итоги дня по всем сменам без расчёта чистой прибыли.</p>
      </header>
      {daysQuery.isLoading ? <div className="text-sm text-slate-600"><Loader2 className="mr-2 inline size-4 animate-spin" /> Загрузка</div> : null}
      <div className="grid gap-3">
        {days.map((day) => (
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={day.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{day.business_date}</h3>
                <p className="text-sm text-slate-600">{day.status} · смены: {Array.isArray(day.shifts) ? day.shifts.length : '-'}</p>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{formatMoney(day.total_revenue)}</div>
                <div className="text-slate-600">cash {formatMoney(day.cash_revenue)} · card {formatMoney(day.card_transfer_revenue)}</div>
              </div>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-xs uppercase text-slate-500">Заказы</dt><dd>{day.total_orders}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Оплачено</dt><dd>{day.paid_orders}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Долг</dt><dd>{formatMoney(day.unpaid_total)}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Отказы</dt><dd>{formatMoney(day.payment_refused_total)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
