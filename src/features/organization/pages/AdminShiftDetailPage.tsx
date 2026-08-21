import { ArrowLeft, Banknote, Clock3, CreditCard, Loader2, ReceiptText, Timer } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { PaymentMethod, PaymentStatus, TimedSessionStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { shiftStatusLabel, useAdminShiftDetail, useAdminShiftMutations } from '../../shifts/shiftsApi'

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

const formatDuration = (startedAt: string | null | undefined, endedAt: string | null | undefined) => {
  if (!startedAt) return '-'
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`
}

const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: 'Наличными',
  card_transfer: 'Перевод на карту',
}

const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: 'Ожидает оплату',
  completed: 'Завершено',
  cancelled: 'Отменено',
  refunded: 'Возврат',
}

const sessionStatusLabel: Record<TimedSessionStatus, string> = {
  active: 'Активна',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

type StatCardProps = {
  icon?: ComponentType<{ className?: string }>
  label: string
  tone?: 'default' | 'danger' | 'success' | 'warning'
  value: string | number
}

function StatCard({ icon: Icon, label, tone = 'default', value }: StatCardProps) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 shadow-sm',
        tone === 'default' && 'border-slate-200',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/40',
        tone === 'warning' && 'border-amber-200 bg-amber-50/40',
        tone === 'danger' && 'border-red-200 bg-red-50/40',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-slate-500">{t(label)}</p>
        {Icon ? <Icon aria-hidden="true" className="size-4 text-slate-400" /> : null}
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

const statusTone = (status: string) =>
  cn(
    'inline-flex rounded-md px-2 py-1 text-xs font-semibold',
    (status === 'paid' || status === 'completed' || status === 'closed') && 'bg-emerald-50 text-emerald-800',
    (status === 'open' || status === 'active') && 'bg-cyan-50 text-cyan-800',
    (status === 'waiting_payment' || status === 'pending' || status === 'closing') && 'bg-amber-50 text-amber-800',
    (status === 'cancelled' || status === 'payment_refused' || status === 'force_closed') && 'bg-red-50 text-red-700',
  )

export function AdminShiftDetailPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const { shiftId } = useParams()
  const detailQuery = useAdminShiftDetail(shiftId ?? null)
  const mutations = useAdminShiftMutations(organizationId)
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  if (detailQuery.isLoading) {
    return (
      <div className="text-sm text-slate-600">
        <Loader2 className="mr-2 inline size-4 animate-spin" /> {t('Загрузка смены')}
      </div>
    )
  }

  if (!detailQuery.data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t('Смена не найдена.')}</div>
  }

  const { handovers, orders, payments, sessions, shift } = detailQuery.data
  const employeeName = shift.employee_full_name ?? shift.employee_email ?? t('Без имени')
  const paidOrders = orders.filter((order) => order.status === 'paid')
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled')
  const openOrders = orders.filter((order) => order.status === 'open' || order.status === 'waiting_payment')
  const completedPayments = payments.filter((payment) => payment.status === 'completed')
  const completedPaymentsTotal = completedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const variance = shift.cash_variance ?? 0

  const forceClose = () => {
    const reason = window.prompt(t('Причина force close'))
    if (!reason) return
    const actualCashText = window.prompt(t('Фактическая наличность'), String(shift.expected_cash_amount ?? 0))
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
          <Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/shifts')}>
            <ArrowLeft className="size-4" /> {t('Назад')}
          </Link>
        </Button>
      </div>

      <header className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">{t('Детали смены')}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">{employeeName}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {currentOrganization?.name ?? t('Организация')} · {shift.business_date} · {shift.shift_template_name ?? t('Без шаблона')}
            </p>
          </div>
          <span className={statusTone(shift.status)}>{t(shiftStatusLabel[shift.status])}</span>
        </div>

        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="font-medium text-slate-950">{t('Открыта')}:</span> {formatDateTime(shift.opened_at)}</div>
          <div><span className="font-medium text-slate-950">{t('Закрыта')}:</span> {formatDateTime(shift.closed_at)}</div>
          <div><span className="font-medium text-slate-950">{t('Длительность')}:</span> {formatDuration(shift.opened_at, shift.closed_at)}</div>
          <div><span className="font-medium text-slate-950">{t('Операционный день')}:</span> {shift.business_date}</div>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Наличные продажи" tone="success" value={formatMoney(shift.cash_sales_total)} />
        <StatCard icon={CreditCard} label="Переводы на карту" value={formatMoney(shift.card_transfer_sales_total)} />
        <StatCard icon={Banknote} label="Ожидаемая касса" value={formatMoney(shift.expected_cash_amount)} />
        <StatCard
          icon={Banknote}
          label="Расхождение"
          tone={Math.abs(variance) > 0.009 ? 'danger' : 'success'}
          value={formatMoney(variance)}
        />
        <StatCard label="Фактическая касса" value={shift.actual_cash_amount == null ? '-' : formatMoney(shift.actual_cash_amount)} />
        <StatCard label="Начальная касса" value={formatMoney(shift.opening_cash_amount)} />
        <StatCard label="Оплачено заказов" value={`${paidOrders.length} / ${formatMoney(shift.paid_orders_total)}`} />
        <StatCard label="Отказы от оплаты" tone={shift.payment_refused_count ? 'warning' : 'default'} value={shift.payment_refused_count} />
      </div>

      {shift.status === 'open' ? (
        <div>
          <Button onClick={forceClose} type="button" variant="danger">{t('Закрыть админом')}</Button>
        </div>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <ReceiptText aria-hidden="true" className="size-5 text-emerald-700" />
            {t('Заказы')}
          </h3>
          <span className="text-sm font-medium text-slate-500">
            {orders.length} · {t('Открытые')}: {openOrders.length} · {t('Отменено')}: {cancelledOrders.length}
          </span>
        </div>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t('Номер заказа')}</th>
                  <th className="py-2 pr-3">{t('Место')}</th>
                  <th className="py-2 pr-3">{t('Статус')}</th>
                  <th className="py-2 pr-3">{t('Открыт')}</th>
                  <th className="py-2 text-right">{t('Сумма')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-2 pr-3 font-semibold text-slate-950">#{order.order_number}</td>
                    <td className="py-2 pr-3 text-slate-600">{order.current_place_name_snapshot ?? t('Без места')}</td>
                    <td className="py-2 pr-3"><span className={statusTone(order.status)}>{t(orderStatusLabel[order.status] ?? order.status)}</span></td>
                    <td className="py-2 pr-3 text-slate-600">{formatDateTime(order.opened_at)}</td>
                    <td className="py-2 text-right font-semibold text-slate-950">{formatMoney(order.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t('Заказов нет')}</div>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <CreditCard aria-hidden="true" className="size-5 text-emerald-700" />
              {t('Платежи')}
            </h3>
            <span className="text-sm font-medium text-slate-500">{completedPayments.length} · {formatMoney(completedPaymentsTotal)}</span>
          </div>
          <div className="grid gap-2">
            {payments.map((payment) => (
              <article className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm" key={payment.id}>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{t(paymentMethodLabel[payment.method])}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {payment.completed_at ? formatDateTime(payment.completed_at) : formatDateTime(payment.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-950">{formatMoney(payment.amount)}</p>
                  <span className={statusTone(payment.status)}>{t(paymentStatusLabel[payment.status])}</span>
                </div>
              </article>
            ))}
            {!payments.length ? <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t('Платежей нет')}</div> : null}
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Timer aria-hidden="true" className="size-5 text-emerald-700" />
              {t('Сессии')}
            </h3>
            <span className="text-sm font-medium text-slate-500">{sessions.length}</span>
          </div>
          <div className="grid gap-2">
            {sessions.map((session) => (
              <article className="rounded-md border border-slate-200 p-3 text-sm" key={session.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{session.place_name_snapshot}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(session.started_at)} - {formatDateTime(session.ended_at)}
                    </p>
                  </div>
                  <span className={statusTone(session.status)}>{t(sessionStatusLabel[session.status])}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-500">{t('Факт')}</span><p className="font-semibold text-slate-950">{session.actual_minutes ?? '-'} {t('мин')}</p></div>
                  <div><span className="text-slate-500">{t('К оплате')}</span><p className="font-semibold text-slate-950">{session.billable_minutes ?? '-'} {t('мин')}</p></div>
                  <div><span className="text-slate-500">{t('Сумма')}</span><p className="font-semibold text-slate-950">{formatMoney(session.calculated_amount)}</p></div>
                </div>
              </article>
            ))}
            {!sessions.length ? <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t('Сессий нет')}</div> : null}
          </div>
        </section>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Clock3 aria-hidden="true" className="size-5 text-emerald-700" />
            {t('Передачи')}
          </h3>
          <span className="text-sm font-medium text-slate-500">{handovers.length}</span>
        </div>
        {handovers.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {handovers.map((handover) => (
              <article className="rounded-md border border-slate-200 p-3 text-sm" key={handover.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{t('Передача смены')}</p>
                  <span className={statusTone(handover.status)}>{handover.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>{t('Заказы')}: <span className="font-semibold text-slate-950">{handover.opening_orders_count}</span></div>
                  <div>{t('Сессии')}: <span className="font-semibold text-slate-950">{handover.active_sessions_count}</span></div>
                  <div>{t('Ожидаемая касса')}: <span className="font-semibold text-slate-950">{formatMoney(handover.expected_cash_handover)}</span></div>
                  <div>{t('Фактическая касса')}: <span className="font-semibold text-slate-950">{formatMoney(handover.actual_cash_handover)}</span></div>
                </div>
                {handover.comment ? <p className="mt-2 text-xs text-slate-500">{handover.comment}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t('Передач нет')}</div>
        )}
      </section>
    </section>
  )
}
