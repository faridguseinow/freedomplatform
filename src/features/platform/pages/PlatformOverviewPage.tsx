import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CreditCard,
  Landmark,
  Loader2,
  Percent,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import type {
  FinanceDashboardSummaryRow,
  OrganizationRow,
  PlatformSharePaymentRow,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getPlatformRoutePath } from '../../../lib/routing/appHost'

const organizationSelect = 'id,name,slug,status,created_at'
const DEMO_ORGANIZATION_SLUG = 'demo'

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value ?? 0)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(getCurrentLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusLabel: Record<string, string> = {
  active: 'Активна',
  suspended: 'Пауза',
  archived: 'Архив',
}

type OverviewMetricProps = {
  label: string
  value: string | number
  hint?: string
  icon: typeof Building2
  tone?: 'default' | 'green' | 'orange' | 'red' | 'cyan'
}

type PlatformOverviewData = {
  organizations: Pick<OrganizationRow, 'id' | 'name' | 'slug' | 'status' | 'created_at'>[]
  financeSummary: FinanceDashboardSummaryRow[]
  payments: Pick<PlatformSharePaymentRow, 'organization_id' | 'amount' | 'status'>[]
}

const metricToneClassName: Record<NonNullable<OverviewMetricProps['tone']>, string> = {
  default: 'border-slate-200 bg-white text-slate-950',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-950',
  orange: 'border-orange-100 bg-orange-50 text-orange-950',
  red: 'border-red-100 bg-red-50 text-red-950',
  cyan: 'border-cyan-100 bg-cyan-50 text-cyan-950',
}

function OverviewMetric({ hint, icon: Icon, label, tone = 'default', value }: OverviewMetricProps) {
  return (
    <div className={cn('grid gap-2 rounded-lg border px-3 py-3', metricToneClassName[tone])}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </div>
      <div className="text-xl font-semibold leading-none">{value}</div>
      {hint ? <div className="text-xs leading-5 text-slate-500">{hint}</div> : null}
    </div>
  )
}

export function PlatformOverviewPage() {
  const { t } = useI18n()
  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: async (): Promise<PlatformOverviewData> => {
      const [organizationsResult, financeResult, paymentsResult] = await Promise.all([
        supabase
          .from('organizations')
          .select(organizationSelect)
          .order('created_at', { ascending: false }),
        supabase
          .from('finance_dashboard_summary')
          .select('*')
          .order('total_income', { ascending: false }),
        supabase
          .from('platform_share_payments')
          .select('organization_id,amount,status')
          .neq('status', 'rejected'),
      ])

      const results = [organizationsResult, financeResult, paymentsResult]
      const failed = results.find((result) => result.error)

      if (failed?.error) {
        throw new Error(failed.error.message)
      }

      const organizations = (organizationsResult.data as PlatformOverviewData['organizations'])
        .filter((organization) => organization.slug !== DEMO_ORGANIZATION_SLUG)
      const organizationIds = new Set(organizations.map((organization) => organization.id))

      return {
        organizations,
        financeSummary: (financeResult.data as FinanceDashboardSummaryRow[])
          .filter((row) => organizationIds.has(row.organization_id)),
        payments: (paymentsResult.data as PlatformOverviewData['payments'])
          .filter((row) => organizationIds.has(row.organization_id)),
      }
    },
  })

  const data = overviewQuery.data
  const organizations = data?.organizations ?? []
  const activeOrganizations = organizations.filter((organization) => organization.status === 'active')
  const financeSummary = data?.financeSummary ?? []
  const payments = data?.payments ?? []

  const totalIncome = financeSummary.reduce((sum, row) => sum + row.total_income, 0)
  const totalExpenses = financeSummary.reduce((sum, row) => sum + row.total_expenses, 0)
  const netProfit = totalIncome - totalExpenses
  const paidToPlatform = payments.reduce((sum, row) => sum + row.amount, 0)
  const confirmedPayments = payments
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, row) => sum + row.amount, 0)
  const paymentsByOrganizationId = payments.reduce((result, payment) => {
    result.set(payment.organization_id, (result.get(payment.organization_id) ?? 0) + payment.amount)
    return result
  }, new Map<string, number>())
  const periodsWaitingReview = financeSummary.reduce((sum, row) => sum + row.periods_waiting_review, 0)
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]))
  const financeRows = financeSummary
    .map((row) => {
      return {
        ...row,
        income: row.total_income,
        expenses: row.total_expenses,
        organization: organizationById.get(row.organization_id),
        platformPaid: paymentsByOrganizationId.get(row.organization_id) ?? 0,
        profit: row.total_income - row.total_expenses,
      }
    })
    .sort((left, right) => right.platformPaid - left.platformPaid)

  return (
    <section className="grid content-start gap-3 sm:gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">Обзор</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Фактические оплаты Freedom Platform из расходов организаций и финансовые показатели.
          </p>
        </div>
        {overviewQuery.isFetching ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
            Обновление
          </div>
        ) : null}
      </header>

      {overviewQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {overviewQuery.error.message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <OverviewMetric
          hint={t('overview.activeOrganizations', { count: activeOrganizations.length })}
          icon={Building2}
          label="Организации"
          tone="cyan"
          value={organizations.length}
        />
        <OverviewMetric
          hint={t('overview.confirmedPayments', { amount: money(confirmedPayments) })}
          icon={CreditCard}
          label={t('overview.paidToPlatform')}
          tone="green"
          value={money(paidToPlatform)}
        />
        <OverviewMetric
          hint={t('overview.periodsWaitingReview', { count: periodsWaitingReview })}
          icon={Landmark}
          label="Периоды"
          tone={periodsWaitingReview > 0 ? 'orange' : 'default'}
          value={periodsWaitingReview}
        />
        <OverviewMetric icon={Landmark} label="Доход организаций" tone="green" value={money(totalIncome)} />
        <OverviewMetric icon={CreditCard} label="Расходы организаций" value={money(totalExpenses)} />
        <OverviewMetric
          icon={Percent}
          label="Чистая прибыль организаций"
          tone={netProfit >= 0 ? 'green' : 'red'}
          value={money(netProfit)}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Организации и оплата платформы</h3>
            <p className="mt-1 text-sm text-slate-600">
              Оплата платформе показывается только по платежам, которые организации внесли в расходы.
            </p>
          </div>
          <Link className="shrink-0 text-sm font-medium text-emerald-700 hover:text-emerald-800" to={getPlatformRoutePath('/finance')}>
            Все финансы
          </Link>
        </div>
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Организация</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Доход</th>
                <th className="px-4 py-3 text-right">Расходы</th>
                <th className="px-4 py-3 text-right">Прибыль</th>
                <th className="px-4 py-3 text-right">Оплачено</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {financeRows.map((row) => (
                <tr className="border-b border-slate-100 last:border-0" key={row.organization_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-950">
                      {row.organization?.name ?? row.organization_id}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Создана {row.organization ? formatDateTime(row.organization.created_at) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-semibold',
                        row.organization?.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {statusLabel[row.organization?.status ?? ''] ?? row.organization?.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{money(row.income)}</td>
                  <td className="px-4 py-3 text-right">{money(row.expenses)}</td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right font-semibold',
                      row.profit >= 0 ? 'text-emerald-700' : 'text-red-700',
                    )}
                  >
                    {money(row.profit)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(row.platformPaid)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                      to={getPlatformRoutePath(`/finance/organizations/${row.organization_id}`)}
                    >
                      Финансы
                    </Link>
                  </td>
                </tr>
              ))}
              {!financeRows.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={7}>
                    Финансовые данные пока пустые.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 p-2 sm:grid-cols-2 sm:gap-3 sm:p-3 xl:hidden">
          {financeRows.map((row) => (
            <article className="grid gap-3 rounded-lg border border-slate-200 p-3" key={row.organization_id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold text-slate-950">
                    {row.organization?.name ?? row.organization_id}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Создана {row.organization ? formatDateTime(row.organization.created_at) : '—'}
                  </p>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-1 text-xs font-semibold',
                  row.organization?.status === 'active'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-600',
                )}>
                  {statusLabel[row.organization?.status ?? ''] ?? row.organization?.status ?? '—'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Доход</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{money(row.income)}</dd>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Расходы</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{money(row.expenses)}</dd>
                </div>
                <div className="rounded-md bg-emerald-50 p-2">
                  <dt className="text-xs text-emerald-700">Прибыль</dt>
                  <dd className={cn('mt-1 font-semibold', row.profit >= 0 ? 'text-emerald-800' : 'text-red-700')}>
                    {money(row.profit)}
                  </dd>
                </div>
                <div className="rounded-md bg-emerald-50 p-2">
                  <dt className="text-xs text-emerald-700">{t('overview.paidToPlatform')}</dt>
                  <dd className="mt-1 font-semibold text-emerald-800">{money(row.platformPaid)}</dd>
                </div>
              </dl>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 font-medium text-slate-800 hover:bg-slate-50"
                to={getPlatformRoutePath(`/finance/organizations/${row.organization_id}`)}
              >
                Финансы
              </Link>
            </article>
          ))}
          {!financeRows.length ? (
            <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Финансовые данные пока пустые.
            </div>
          ) : null}
        </div>
      </section>
    </section>
  )
}
