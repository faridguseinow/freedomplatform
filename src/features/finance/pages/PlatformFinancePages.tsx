import {
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  Landmark,
  ReceiptText,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { usePaymentMethodSummary, useRevenueBreakdown } from '../../orders/paymentsApi'
import { usePlatformOrganizations } from '../../platform/platformApi'
import { todayDate, useFinanceSettings, useFinanceSettingsMutation } from '../financeApi'
import {
  useFinancialPeriod,
  useFinancialPeriodMutations,
} from '../financialPeriodsApi'
import { usePlatformOrganizationFinance, usePlatformFinanceSummary } from '../platformFinanceApi'
import {
  usePlatformShareMutations,
  usePlatformSharePayments,
} from '../platformShareApi'

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    value ?? 0,
  )

const statusLabel: Record<string, string> = {
  submitted: 'На проверке',
  clarification_requested: 'Нужны уточнения',
  locked: 'Закрыт',
  rejected: 'Отклонён',
  cancelled: 'Удалён',
  reported_sent: 'Ожидает подтверждения',
  confirmed: 'Подтверждён',
  paid: 'Оплачено',
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="grid gap-2">
      <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
        {title}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </header>
  )
}

export function PlatformFinancePage() {
  const summary = usePlatformFinanceSummary()
  const organizations = usePlatformOrganizations()

  const nameById = new Map(organizations.data?.map((org) => [org.id, org.name]) ?? [])

  return (
    <section className="grid gap-5">
      <PageHeader
        description="Глобальный контроль финансов организаций, периодов и ежемесячной оплаты платформы."
        title="Финансы платформы"
      />
      <div className="grid gap-3">
        {summary.data?.map((row) => (
          <Link
            className="grid gap-2 rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50"
            key={row.organization_id}
            to={`/platform/finance/organizations/${row.organization_id}`}
          >
            <p className="font-medium text-slate-950">
              {nameById.get(row.organization_id) ?? row.organization_id}
            </p>
            <p className="text-sm text-slate-600">
              доход {money(row.total_income)} · расходы {money(row.total_expenses)} · к оплате платформе {money(row.platform_share_outstanding)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function PlatformFinanceOrganizationPage() {
  const { organizationId } = useParams()
  const finance = usePlatformOrganizationFinance(organizationId ?? null)
  const settings = useFinanceSettings(organizationId ?? null)
  const settingsMutation = useFinanceSettingsMutation(organizationId ?? null)
  const periodMutations = useFinancialPeriodMutations(organizationId ?? null)
  const [editingPeriod, setEditingPeriod] = useState<{
    id: string
    periodEnd: string
    periodStart: string
  } | null>(null)
  const today = todayDate()
  const revenueBreakdown = useRevenueBreakdown(organizationId ?? null, '1970-01-01', today)
  const paymentMethods = usePaymentMethodSummary(organizationId ?? null, '1970-01-01', today)

  const organizations = usePlatformOrganizations()
  const organizationName =
    organizations.data?.find((organization) => organization.id === organizationId)?.name ?? 'Организация'

  const handleFeeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('monthly_platform_fee') ?? 0)
    settingsMutation.mutate({
      default_platform_share_percentage: 0,
      monthly_platform_fee: amount,
      platform_share_payment_due_days: Number(form.get('platform_share_payment_due_days') ?? 0) || 10,
    })
  }

  const handlePeriodUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPeriod) return
    const form = new FormData(event.currentTarget)
    periodMutations.update.mutate(
      {
        periodEnd: String(form.get('period_end') || editingPeriod.periodEnd),
        periodId: editingPeriod.id,
        periodStart: String(form.get('period_start') || editingPeriod.periodStart),
      },
      { onSuccess: () => setEditingPeriod(null) },
    )
  }

  const handlePeriodDelete = (periodId: string) => {
    if (!window.confirm('Удалить финансовый период навсегда? Это действие нельзя отменить.')) return
    periodMutations.delete.mutate({
      comment: 'Удалено навсегда владельцем платформы',
      periodId,
    })
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        description="Финансы выбранной организации: P&L, оплаты, направления, периоды и ежемесячная оплата Freedom Platform."
        title={organizationName}
      />
      <form className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end" onSubmit={handleFeeSubmit}>
        <Input
          defaultValue={settings.data?.monthly_platform_fee ?? 200}
          label="Ежемесячная оплата платформы"
          min="0"
          name="monthly_platform_fee"
          required
          step="0.01"
          type="number"
        />
        <Input
          defaultValue={settings.data?.platform_share_payment_due_days ?? 10}
          label="Срок оплаты, дней"
          min="0"
          name="platform_share_payment_due_days"
          type="number"
        />
        <Button disabled={settingsMutation.isPending} type="submit">
          Сохранить оплату
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Доход</p>
          <p className="mt-2 text-xl font-semibold">{money(finance.data?.summary?.total_income)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Расходы</p>
          <p className="mt-2 text-xl font-semibold">{money(finance.data?.summary?.total_expenses)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">К оплате платформе</p>
          <p className="mt-2 text-xl font-semibold">{money(finance.data?.summary?.platform_share_outstanding)}</p>
        </div>
      </div>

      <section className="grid gap-3">
        <h3 className="text-base font-semibold text-slate-950">Финансы по направлениям</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Наличными', value: paymentMethods.data?.cash },
            { label: 'Картой', value: paymentMethods.data?.card },
            { label: 'PlayStation', value: revenueBreakdown.data?.playstation },
            { label: 'Бильярд', value: revenueBreakdown.data?.billiard },
            { label: 'Столы', value: revenueBreakdown.data?.tables },
            { label: 'Прибыль товаров', value: revenueBreakdown.data?.goods },
            { label: 'Другое', value: revenueBreakdown.data?.other },
            { label: 'Всего оплат', value: paymentMethods.data?.total },
          ].map((item) => (
            <div className="rounded-md border border-slate-200 bg-white p-4" key={item.label}>
              <p className="text-xs font-medium uppercase text-slate-500">{item.label}</p>
              <p className="mt-2 text-xl font-semibold">{money(item.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Периоды</h3>
            <p className="mt-1 text-sm text-slate-600">
              Таблица показывает закрытые периоды и фиксированную месячную оплату платформы по каждому периоду.
            </p>
          </div>
        </div>

        {editingPeriod ? (
          <form
            className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            onSubmit={handlePeriodUpdate}
          >
            <Input defaultValue={editingPeriod.periodStart} label="Начало" name="period_start" type="date" />
            <Input defaultValue={editingPeriod.periodEnd} label="Конец" name="period_end" type="date" />
            <Button disabled={periodMutations.update.isPending} type="submit">Сохранить</Button>
            <Button onClick={() => setEditingPeriod(null)} type="button" variant="secondary">Отмена</Button>
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="py-3 pr-3">Период</th>
                <th className="py-3 pr-3">Статус</th>
                <th className="py-3 pr-3 text-right">Доход</th>
                <th className="py-3 pr-3 text-right">COGS</th>
                <th className="py-3 pr-3 text-right">Прибыль</th>
                <th className="py-3 pr-3 text-right">Оплата платформы</th>
                <th className="py-3 pr-3 text-right">Владельцу</th>
                <th className="py-3 pr-3">Отправлен</th>
                <th className="py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {finance.data?.periods.map((period) => (
                <tr className="border-b border-slate-100 last:border-0" key={period.id}>
                  <td className="py-3 pr-3 font-medium text-slate-950">{period.period_start} - {period.period_end}</td>
                  <td className="py-3 pr-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {statusLabel[period.status] ?? period.status}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">{money(period.revenue)}</td>
                  <td className="py-3 pr-3 text-right">{money(period.cogs)}</td>
                  <td className="py-3 pr-3 text-right">{money(period.net_profit_before_platform_share)}</td>
                  <td className="py-3 pr-3 text-right">{money(period.platform_share_amount)}</td>
                  <td className="py-3 pr-3 text-right">{money(period.organization_owner_amount)}</td>
                  <td className="py-3 pr-3 text-slate-600">{formatDateTime(period.submitted_at)}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                        to={`/platform/finance/periods/${period.id}`}
                      >
                        <Eye aria-hidden="true" className="size-4" />
                        Открыть
                      </Link>
                      <Button
                        className="min-h-9 px-3 py-1.5"
                        disabled={period.status === 'locked'}
                        onClick={() =>
                          setEditingPeriod({
                            id: period.id,
                            periodEnd: period.period_end,
                            periodStart: period.period_start,
                          })
                        }
                        type="button"
                        variant="secondary"
                      >
                        <Edit3 aria-hidden="true" className="size-4" />
                        Изменить
                      </Button>
                      <Button
                        className="min-h-9 px-3 py-1.5"
                        disabled={periodMutations.delete.isPending}
                        onClick={() => handlePeriodDelete(period.id)}
                        type="button"
                        variant="danger"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Удалить навсегда
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function PlatformFinancePeriodPage() {
  const { periodId } = useParams()
  const period = useFinancialPeriod(periodId ?? null)
  const mutations = useFinancialPeriodMutations(period.data?.organization_id ?? null)

  const review = (decision: 'approved' | 'clarification_requested' | 'rejected') => {
    if (!periodId) return
    mutations.review.mutate({ periodId, decision })
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Проверка периода и утверждение ежемесячной оплаты платформы." title="Период организации" />
      {period.data ? (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
          <p className="font-medium text-slate-950">{period.data.period_start} - {period.data.period_end}</p>
          <p className="text-sm text-slate-600">прибыль {money(period.data.net_profit_before_platform_share)} · оплата платформы {money(period.data.platform_share_amount)} · {statusLabel[period.data.status] ?? period.data.status}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={mutations.review.isPending} onClick={() => review('approved')} type="button">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Одобрить
            </Button>
            <Button disabled={mutations.review.isPending} onClick={() => review('clarification_requested')} type="button" variant="secondary">
              Запросить уточнение
            </Button>
            <Button disabled={mutations.review.isPending} onClick={() => review('rejected')} type="button" variant="danger">
              <XCircle aria-hidden="true" className="size-4" />
              Отклонить
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function PlatformFinancePaymentsPage() {
  const payments = usePlatformSharePayments()
  const mutations = usePlatformShareMutations(null)

  if (!payments.data?.length) {
    return (
      <section className="grid gap-5">
        <PageHeader description="Подтверждение платежей организаций по ежемесячной оплате платформы." title="Платежи платформе" />
        <EmptyState description="Организации пока не отправляли платежи на подтверждение." icon={ReceiptText} title="Платежей нет" />
      </section>
    )
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Подтверждение платежей организаций по ежемесячной оплате платформы." title="Платежи платформе" />
      <div className="grid gap-2">
        {payments.data.map((payment) => (
          <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4" key={payment.id}>
            <p className="font-medium text-slate-950">{money(payment.amount)} · {statusLabel[payment.status] ?? payment.status}</p>
            <p className="text-sm text-slate-600">{payment.payment_date} · {payment.reference ?? 'без reference'}</p>
            {payment.status === 'reported_sent' ? (
              <div className="flex gap-2">
                <Button disabled={mutations.confirmPayment.isPending} onClick={() => mutations.confirmPayment.mutate({ paymentId: payment.id, decision: 'confirmed' })} type="button">
                  <Landmark aria-hidden="true" className="size-4" />
                  Подтвердить
                </Button>
                <Button disabled={mutations.confirmPayment.isPending} onClick={() => mutations.confirmPayment.mutate({ paymentId: payment.id, decision: 'rejected' })} type="button" variant="danger">
                  Отклонить
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export function PlatformFinancePlaceholderPage() {
  return (
    <section className="grid gap-5">
      <PageHeader description="Финансовый раздел платформы." title="Финансы" />
      <EmptyState description="Выберите организацию или платежи в разделе финансов." icon={Building2} title="Нет выбранного объекта" />
    </section>
  )
}
