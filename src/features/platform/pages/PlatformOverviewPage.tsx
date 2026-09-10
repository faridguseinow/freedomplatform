import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
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
  FinancialPeriodSummary,
  OrganizationRow,
  OrganizationFinanceSettingsRow,
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
  periodSummaries: FinancialPeriodSummary[]
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getCurrentFinancialCycle = (closeDay: number | null | undefined) => {
  const day = Math.min(28, Math.max(1, closeDay ?? 15))
  const now = new Date()
  const start = now.getDate() >= day
    ? new Date(now.getFullYear(), now.getMonth(), day)
    : new Date(now.getFullYear(), now.getMonth() - 1, day)

  return { end: formatDateInput(now), start: formatDateInput(start) }
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
      const [organizationsResult, financeResult, financeSettingsResult] = await Promise.all([
        supabase
          .from('organizations')
          .select(organizationSelect)
          .order('created_at', { ascending: false }),
        supabase
          .from('finance_dashboard_summary')
          .select('*')
          .order('platform_share_outstanding', { ascending: false }),
        supabase
          .from('organization_finance_settings')
          .select('organization_id,financial_month_close_day'),
      ])

      const results = [organizationsResult, financeResult, financeSettingsResult]
      const failed = results.find((result) => result.error)

      if (failed?.error) {
        throw new Error(failed.error.message)
      }

      const organizations = (organizationsResult.data as PlatformOverviewData['organizations'])
        .filter((organization) => organization.slug !== DEMO_ORGANIZATION_SLUG)
      const settingsByOrganizationId = new Map(
        (financeSettingsResult.data as Pick<OrganizationFinanceSettingsRow, 'organization_id' | 'financial_month_close_day'>[])
          .map((settings) => [settings.organization_id, settings]),
      )
      const periodSummaries = await Promise.all(organizations.map(async (organization) => {
        const cycle = getCurrentFinancialCycle(
          settingsByOrganizationId.get(organization.id)?.financial_month_close_day,
        )
        const { data, error } = await supabase.rpc('calculate_financial_period', {
          target_organization_id: organization.id,
          target_period_start: cycle.start,
          target_period_end: cycle.end,
        })

        if (error) throw new Error(error.message)
        return data as FinancialPeriodSummary
      }))
      const organizationIds = new Set(organizations.map((organization) => organization.id))

      return {
        organizations,
        financeSummary: (financeResult.data as FinanceDashboardSummaryRow[])
          .filter((row) => organizationIds.has(row.organization_id)),
        periodSummaries,
      }
    },
  })

  const data = overviewQuery.data
  const organizations = data?.organizations ?? []
  const activeOrganizations = organizations.filter((organization) => organization.status === 'active')
  const financeSummary = data?.financeSummary ?? []
  const periodSummaries = data?.periodSummaries ?? []

  const totalIncome = periodSummaries.reduce((sum, row) => sum + row.revenue, 0)
  const totalExpenses = periodSummaries.reduce(
    (sum, row) => sum + row.cogs + row.operating_expenses,
    0,
  )
  const netProfit = periodSummaries.reduce((sum, row) => sum + row.net_profit_before_platform_share, 0)
  const outstandingShare = financeSummary.reduce((sum, row) => sum + row.platform_share_outstanding, 0)
  const periodsWaitingReview = financeSummary.reduce((sum, row) => sum + row.periods_waiting_review, 0)
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]))
  const periodSummaryById = new Map(periodSummaries.map((summary) => [summary.organization_id, summary]))
  const financeRows = financeSummary
    .map((row) => {
      const periodSummary = periodSummaryById.get(row.organization_id)
      return {
        ...row,
        income: periodSummary?.revenue ?? 0,
        expenses: (periodSummary?.cogs ?? 0) + (periodSummary?.operating_expenses ?? 0),
        organization: organizationById.get(row.organization_id),
        platformShareTotal: row.platform_share_outstanding,
        profit: periodSummary?.net_profit_before_platform_share ?? 0,
      }
    })
    .sort((left, right) => right.platformShareTotal - left.platformShareTotal)
  const organizationsWithDebt = financeRows.filter((row) => row.platformShareTotal > 0).length

  return (
    <section className="grid content-start gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">Обзор</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Контроль платформы: организации, ежемесячная оплата Freedom Platform, задолженность и периоды на проверке.
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <OverviewMetric
          hint={t('overview.activeOrganizations', { count: activeOrganizations.length })}
          icon={Building2}
          label="Организации"
          tone="cyan"
          value={organizations.length}
        />
        <OverviewMetric
          hint={t('overview.organizationsWithDebt', { count: organizationsWithDebt })}
          icon={AlertTriangle}
          label="Оплата платформе"
          tone={outstandingShare > 0 ? 'orange' : 'green'}
          value={money(outstandingShare)}
        />
        <OverviewMetric
          hint={t('overview.periodsWaitingReview', { count: periodsWaitingReview })}
          icon={Landmark}
          label="Периоды"
          tone={periodsWaitingReview > 0 ? 'orange' : 'default'}
          value={periodsWaitingReview}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Организации и оплата платформы</h3>
            <p className="mt-1 text-sm text-slate-600">
              Главное для владельца платформы: кто сколько заработал, какая прибыль и сколько должны по ежемесячной оплате.
            </p>
          </div>
          <Link className="shrink-0 text-sm font-medium text-emerald-700 hover:text-emerald-800" to={getPlatformRoutePath('/finance')}>
            Все финансы
          </Link>
        </div>
        <div className="hidden md:block">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">Организация</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Доход</th>
                <th className="px-4 py-3 text-right">Расходы</th>
                <th className="px-4 py-3 text-right">Прибыль</th>
                <th className="px-4 py-3 text-right">Оплата платформе</th>
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
                  <td className="px-4 py-3 text-right font-semibold">{money(row.platformShareTotal)}</td>
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
        <div className="grid gap-3 p-3 md:hidden">
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
                <div className="rounded-md bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Оплата платформе</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{money(row.platformShareTotal)}</dd>
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
