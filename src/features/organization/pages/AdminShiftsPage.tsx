import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import type { ShiftStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { shiftStatusLabel, useAdminShifts } from '../../shifts/shiftsApi'

type StatusFilter = ShiftStatus | 'all'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminShiftsPage() {
  const { organizationId } = useAuth()
  const [status, setStatus] = useState<StatusFilter>('all')
  const shiftsQuery = useAdminShifts(organizationId, status)
  const shifts = shiftsQuery.data ?? []

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Смены</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Кассовая ответственность, закрытия, расхождения и передачи.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {(['all', 'open', 'closed', 'force_closed'] as const).map((item) => (
          <button
            className={cn(
              'min-h-10 rounded-md border px-3 text-sm font-medium',
              status === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600',
            )}
            key={item}
            onClick={() => setStatus(item)}
            type="button"
          >
            {item === 'all' ? 'Все' : shiftStatusLabel[item]}
          </button>
        ))}
      </div>

      {shiftsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка смен
        </div>
      ) : null}

      <div className="grid gap-3">
        {shifts.map((shift) => (
          <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]" key={shift.id}>
            <div>
              <h3 className="font-semibold text-slate-950">{shift.employee_full_name ?? shift.employee_email ?? shift.employee_user_id}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {shift.business_date} · {shift.shift_template_name ?? 'Без шаблона'} · {shiftStatusLabel[shift.status]}
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
                <div><dt className="text-xs uppercase text-slate-500">Cash</dt><dd>{formatMoney(shift.cash_sales_total)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Card</dt><dd>{formatMoney(shift.card_transfer_sales_total)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Expected</dt><dd>{formatMoney(shift.expected_cash_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Actual</dt><dd>{formatMoney(shift.actual_cash_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Variance</dt><dd>{formatMoney(shift.cash_variance)}</dd></div>
              </dl>
            </div>
            <Button type="button" variant="secondary">
              <Link className="inline-flex items-center gap-2" to={`/admin/shifts/${shift.id}`}>
                <Eye className="size-4" /> Детали
              </Link>
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}
