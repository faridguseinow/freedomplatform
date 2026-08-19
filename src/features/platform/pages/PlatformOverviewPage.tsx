import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  ReceiptText,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import type {
  FinanceAuditLogRow,
  FinanceDashboardSummaryRow,
  OrganizationRow,
  PlatformSharePaymentRow,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'

const organizationSelect = 'id,name,slug,status,created_at'

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value ?? 0)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusLabel: Record<string, string> = {
  active: 'Активна',
  suspended: 'Пауза',
  archived: 'Архив',
  reported_sent: 'Ожидает',
  confirmed: 'Подтвержден',
  rejected: 'Отклонен',
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
  activeMemberships: number
  financeSummary: FinanceDashboardSummaryRow[]
  orders: Array<{
    id: string
    organization_id: string
    status: string
    total_amount: number
    created_at: string
  }>
  activeTimedSessions: number
  openShifts: number
  pendingAdjustments: number
  pendingPlatformPayments: PlatformSharePaymentRow[]
  recentFinanceLogs: Pick<FinanceAuditLogRow, 'id' | 'action' | 'entity_type' | 'created_at'>[]
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
  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: async (): Promise<PlatformOverviewData> => {
      const [
        organizationsResult,
        membershipsResult,
        financeResult,
        ordersResult,
        timedSessionsResult,
        shiftsResult,
        adjustmentsResult,
        platformPaymentsResult,
        financeLogsResult,
      ] = await Promise.all([
        supabase
          .from('organizations')
          .select(organizationSelect)
          .order('created_at', { ascending: false }),
        supabase
          .from('organization_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('finance_dashboard_summary')
          .select('*')
          .order('platform_share_outstanding', { ascending: false }),
        supabase
          .from('orders')
          .select('id,organization_id,status,total_amount,created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('timed_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase
          .from('employee_shifts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('order_adjustment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('platform_share_payments')
          .select('*')
          .eq('status', 'reported_sent')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('finance_audit_logs')
          .select('id,action,entity_type,created_at')
          .order('created_at', { ascending: false })
          .limit(6),
      ])

      const results = [
        organizationsResult,
        membershipsResult,
        financeResult,
        ordersResult,
        timedSessionsResult,
        shiftsResult,
        adjustmentsResult,
        platformPaymentsResult,
        financeLogsResult,
      ]
      const failed = results.find((result) => result.error)

      if (failed?.error) {
        throw new Error(failed.error.message)
      }

      return {
        organizations: organizationsResult.data as PlatformOverviewData['organizations'],
        activeMemberships: membershipsResult.count ?? 0,
        financeSummary: financeResult.data as FinanceDashboardSummaryRow[],
        orders: ordersResult.data as PlatformOverviewData['orders'],
        activeTimedSessions: timedSessionsResult.count ?? 0,
        openShifts: shiftsResult.count ?? 0,
        pendingAdjustments: adjustmentsResult.count ?? 0,
        pendingPlatformPayments: platformPaymentsResult.data as PlatformSharePaymentRow[],
        recentFinanceLogs: financeLogsResult.data as PlatformOverviewData['recentFinanceLogs'],
      }
    },
  })

  const data = overviewQuery.data
  const organizations = data?.organizations ?? []
  const activeOrganizations = organizations.filter((organization) => organization.status === 'active')
  const financeSummary = data?.financeSummary ?? []
  const orders = data?.orders ?? []
  const pendingPlatformPayments = data?.pendingPlatformPayments ?? []
  const recentFinanceLogs = data?.recentFinanceLogs ?? []

  const totalIncome = financeSummary.reduce((sum, row) => sum + row.total_income, 0)
  const totalExpenses = financeSummary.reduce((sum, row) => sum + row.total_expenses, 0)
  const outstandingShare = financeSummary.reduce((sum, row) => sum + row.platform_share_outstanding, 0)
  const pendingExpenseApprovals = financeSummary.reduce((sum, row) => sum + row.pending_expense_approvals, 0)
  const periodsWaitingReview = financeSummary.reduce((sum, row) => sum + row.periods_waiting_review, 0)
  const totalPlaystation = financeSummary.reduce((sum, row) => sum + (row.playstation_revenue ?? 0), 0)
  const totalBilliard = financeSummary.reduce((sum, row) => sum + (row.billiard_revenue ?? 0), 0)
  const totalTables = financeSummary.reduce((sum, row) => sum + (row.table_revenue ?? 0), 0)
  const totalGoods = financeSummary.reduce((sum, row) => sum + (row.goods_revenue ?? 0), 0)
  const paidOrders = orders.filter((order) => order.status === 'paid')
  const openOrders = orders.filter((order) => order.status === 'open' || order.status === 'waiting_payment')
  const refusedOrders = orders.filter((order) => order.status === 'payment_refused')
  const paidOrdersTotal = paidOrders.reduce((sum, order) => sum + order.total_amount, 0)
  const pendingPaymentsTotal = pendingPlatformPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]))
  const topFinanceRows = financeSummary.slice(0, 5)

  return (
    <section className="grid content-start gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">Обзор</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Живые показатели организаций, финансов и рабочих процессов платформы.
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          hint={`активных: ${activeOrganizations.length}`}
          icon={Building2}
          label="Организации"
          tone="cyan"
          value={organizations.length}
        />
        <OverviewMetric
          hint={`открытых заказов: ${openOrders.length}`}
          icon={ReceiptText}
          label="Заказы"
          tone={openOrders.length ? 'orange' : 'default'}
          value={orders.length}
        />
        <OverviewMetric
          hint={`активные смены: ${data?.openShifts ?? 0}`}
          icon={Clock3}
          label="Сессии"
          tone={(data?.activeTimedSessions ?? 0) ? 'orange' : 'default'}
          value={data?.activeTimedSessions ?? 0}
        />
        <OverviewMetric
          hint={`${data?.activeMemberships ?? 0} активных доступов`}
          icon={Users}
          label="Пользователи"
          value={data?.activeMemberships ?? 0}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric icon={Landmark} label="Доход" tone="green" value={money(totalIncome)} />
        <OverviewMetric icon={CreditCard} label="Расходы" value={money(totalExpenses)} />
        <OverviewMetric icon={Landmark} label="Playstation" value={money(totalPlaystation)} />
        <OverviewMetric icon={Landmark} label="Billiard" value={money(totalBilliard)} />
        <OverviewMetric icon={Landmark} label="Tables" value={money(totalTables)} />
        <OverviewMetric icon={Landmark} label="Goods" value={money(totalGoods)} />
        <OverviewMetric
          hint={`ожидает платежей: ${money(pendingPaymentsTotal)}`}
          icon={AlertTriangle}
          label="Доля платформы"
          tone={outstandingShare > 0 ? 'orange' : 'green'}
          value={money(outstandingShare)}
        />
        <OverviewMetric
          hint={`отказов: ${refusedOrders.length}`}
          icon={ReceiptText}
          label="Оплачено заказов"
          tone="green"
          value={money(paidOrdersTotal)}
        />
      </div>

      <section className="grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-950">Финансы организаций</h3>
              <Link className="text-sm font-medium text-emerald-700 hover:text-emerald-800" to="/platform/finance">
                Все финансы
              </Link>
            </div>
            <div className="grid divide-y divide-slate-100">
              {topFinanceRows.map((row) => {
                const organization = organizationById.get(row.organization_id)

                return (
                  <Link
                    className="grid gap-2 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center"
                    key={row.organization_id}
                    to={`/platform/finance/organizations/${row.organization_id}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-950">
                        {organization?.name ?? row.organization_id}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        доход {money(row.total_income)} · расходы {money(row.total_expenses)}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'rounded-md px-2 py-1 text-right text-sm font-semibold',
                        row.platform_share_outstanding > 0
                          ? 'bg-orange-50 text-orange-800'
                          : 'bg-emerald-50 text-emerald-800',
                      )}
                    >
                      {money(row.platform_share_outstanding)}
                    </div>
                  </Link>
                )
              })}
              {!topFinanceRows.length ? (
                <div className="px-4 py-6 text-sm text-slate-500">Финансовые данные пока пустые.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-950">Требует внимания</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Link
                className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-sm text-orange-950 hover:bg-orange-100"
                to="/platform/organizations"
              >
                Корректировки: <strong>{data?.pendingAdjustments ?? 0}</strong>
              </Link>
              <Link
                className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-sm text-orange-950 hover:bg-orange-100"
                to="/platform/finance/payments"
              >
                Платежи: <strong>{pendingPlatformPayments.length}</strong>
              </Link>
              <Link
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
                to="/platform/finance"
              >
                Периоды: <strong>{periodsWaitingReview}</strong>
              </Link>
              <Link
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
                to="/platform/finance"
              >
                Расходы на одобрение: <strong>{pendingExpenseApprovals}</strong>
              </Link>
              <Link
                className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900 hover:bg-red-100"
                to="/platform/organizations"
              >
                Неактивные организации: <strong>{organizations.length - activeOrganizations.length}</strong>
              </Link>
              <Link
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 hover:bg-slate-100"
                to="/platform/organizations"
              >
                Активные доступы: <strong>{data?.activeMemberships ?? 0}</strong>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-950">Организации</h3>
            </div>
            <div className="grid divide-y divide-slate-100">
              {organizations.slice(0, 6).map((organization) => (
                <Link
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  key={organization.id}
                  to={`/platform/organizations/${organization.id}/users`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-950">{organization.name}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      freedomplatform.vercel.app/{organization.slug}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-xs font-medium',
                      organization.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {statusLabel[organization.status]}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-950">Последние события</h3>
            </div>
            <div className="grid divide-y divide-slate-100">
              {recentFinanceLogs.map((log) => (
                <div className="grid gap-1 px-4 py-3" key={log.id}>
                  <div className="text-sm font-medium text-slate-950">{log.action}</div>
                  <div className="text-xs text-slate-500">
                    {log.entity_type} · {formatDateTime(log.created_at)}
                  </div>
                </div>
              ))}
              {!recentFinanceLogs.length ? (
                <div className="px-4 py-6 text-sm text-slate-500">Событий пока нет.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}
