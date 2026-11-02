import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getPlatformRoutePath } from '../../../lib/routing/appHost'
import { usePaymentMethodSummary, useRevenueBreakdown } from '../../orders/paymentsApi'
import { usePlatformOrganizations } from '../../platform/platformApi'
import { todayDate } from '../financeApi'
import { usePlatformOrganizationFinance, usePlatformFinanceSummary } from '../platformFinanceApi'
import { usePlatformSharePayments } from '../platformShareApi'

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    value ?? 0,
  )

const statusLabel: Record<string, string> = {
  open: 'Открыт',
  submitted: 'Закрыт',
  clarification_requested: 'Закрыт',
  approved: 'Закрыт',
  locked: 'Закрыт',
  rejected: 'Закрыт',
  cancelled: 'Удалён',
  confirmed: 'Подтверждён',
  paid: 'Оплачено',
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat(getCurrentLocale(), {
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
  const payments = usePlatformSharePayments()

  const nameById = new Map(organizations.data?.map((org) => [org.id, org.name]) ?? [])
  const paidByOrganization = (payments.data ?? []).reduce((result, payment) => {
    if (payment.status === 'confirmed') {
      result.set(payment.organization_id, (result.get(payment.organization_id) ?? 0) + payment.amount)
    }
    return result
  }, new Map<string, number>())

  return (
    <section className="grid gap-5">
      <PageHeader
        description="Финансы организаций и фактически внесённые оплаты Freedom Platform."
        title="Финансы платформы"
      />
      <div className="grid gap-3">
        {summary.data?.map((row) => (
          <Link
            className="grid gap-2 rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50"
            key={row.organization_id}
            to={getPlatformRoutePath(`/finance/organizations/${row.organization_id}`)}
          >
            <p className="font-medium text-slate-950">
              {nameById.get(row.organization_id) ?? row.organization_id}
            </p>
            <p className="text-sm text-slate-600">
              доход {money(row.total_income)} · расходы {money(row.total_expenses)} · оплачено платформе {money(paidByOrganization.get(row.organization_id))}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function PlatformFinanceOrganizationPage() {
  const { t } = useI18n()
  const { organizationId } = useParams()
  const finance = usePlatformOrganizationFinance(organizationId ?? null)
  const platformPayments = usePlatformSharePayments(organizationId ?? null)
  const [periodState, setPeriodState] = useState<'all' | 'open' | 'closed'>('all')
  const [selectedPeriodId, setSelectedPeriodId] = useState('all')
  const today = todayDate()
  const revenueBreakdown = useRevenueBreakdown(organizationId ?? null, '1970-01-01', today)
  const paymentMethods = usePaymentMethodSummary(organizationId ?? null, '1970-01-01', today)

  const organizations = usePlatformOrganizations()
  const organizationName =
    organizations.data?.find((organization) => organization.id === organizationId)?.name ?? 'Организация'

  const paidToPlatform = (platformPayments.data ?? [])
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const periods = finance.data?.periods ?? []
  const visiblePeriods = periods.filter((period) => {
    if (periodState === 'closed') return period.status === 'locked'
    if (periodState === 'open') return period.status !== 'locked' && period.status !== 'cancelled'
    return true
  })
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
  const displayedIncome = selectedPeriod?.revenue ?? finance.data?.summary?.total_income
  const displayedExpenses = selectedPeriod
    ? selectedPeriod.cogs + selectedPeriod.operating_expenses
    : finance.data?.summary?.total_expenses
  const displayedProfit = selectedPeriod?.net_profit_before_platform_share
    ?? ((finance.data?.summary?.total_income ?? 0) - (finance.data?.summary?.total_expenses ?? 0))
  const displayedPlatformPaid = selectedPeriod
    ? (platformPayments.data ?? [])
        .filter((payment) => payment.status === 'confirmed')
        .filter((payment) =>
          payment.billing_period_start === selectedPeriod.period_start
          && payment.billing_period_end === selectedPeriod.period_end)
        .reduce((sum, payment) => sum + payment.amount, 0)
    : paidToPlatform

  return (
    <section className="grid gap-5">
      <PageHeader
        description="Финансы выбранной организации, периоды и фактически внесённые оплаты Freedom Platform."
        title={organizationName}
      />
      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          {t('platformFinance.periodState')}
          <select
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-slate-900"
            onChange={(event) => {
              setPeriodState(event.target.value as 'all' | 'open' | 'closed')
              setSelectedPeriodId('all')
            }}
            value={periodState}
          >
            <option value="all">{t('platformFinance.allPeriods')}</option>
            <option value="open">{t('platformFinance.openPeriods')}</option>
            <option value="closed">{t('platformFinance.closedPeriods')}</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          {t('platformFinance.specificPeriod')}
          <select
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-slate-900"
            onChange={(event) => setSelectedPeriodId(event.target.value)}
            value={selectedPeriodId}
          >
            <option value="all">{t('platformFinance.allTime')}</option>
            {visiblePeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.period_start} — {period.period_end} · {statusLabel[period.status] ?? period.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Доход</p>
          <p className="mt-2 text-xl font-semibold">{money(displayedIncome)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Расходы</p>
          <p className="mt-2 text-xl font-semibold">{money(displayedExpenses)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">{t('platformFinance.profit')}</p>
          <p className="mt-2 text-xl font-semibold text-emerald-700">{money(displayedProfit)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Оплачено платформе</p>
          <p className="mt-2 text-xl font-semibold text-emerald-700">{money(displayedPlatformPaid)}</p>
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
              Финансовые периоды организации без автоматического начисления оплаты платформе.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="py-3 pr-3">Период</th>
                <th className="py-3 pr-3">Статус</th>
                <th className="py-3 pr-3 text-right">Доход</th>
                <th className="py-3 pr-3 text-right">Закупка товаров</th>
                <th className="py-3 pr-3 text-right">Прибыль</th>
                <th className="py-3 pr-3">Закрыт</th>
              </tr>
            </thead>
            <tbody>
              {visiblePeriods
                .filter((period) => selectedPeriodId === 'all' || period.id === selectedPeriodId)
                .map((period) => (
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
                  <td className="py-3 pr-3 text-slate-600">{formatDateTime(period.locked_at ?? period.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
