import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import type {
  FinancialPeriodRow,
  OrganizationRow,
} from '../../../lib/supabase/database.types'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { formatNumericMonthDay, formatNumericMonthYear } from '../../../lib/i18n/dateTime'
import { getCurrentLocale } from '../../../lib/i18n/translator'
import { getPlatformRoutePath } from '../../../lib/routing/appHost'
import { getCurrentFinancialCycle } from '../../finance/financialCycle'

const organizationSelect = 'id,name,slug,status,created_at'
const DEMO_ORGANIZATION_SLUG = 'demo'
const BAKU_TIME_ZONE = 'Asia/Baku'

type Organization = Pick<OrganizationRow, 'id' | 'name' | 'slug' | 'status' | 'created_at'>
type Period = Pick<FinancialPeriodRow, 'organization_id' | 'period_start' | 'period_end' | 'status'>
type PlatformPaymentSummary = {
  organization_id: string
  total_paid: number
}

type BusinessDate = {
  organization_id: string
  business_date: string
}

type DailyRevenue = {
  organization_id: string
  revenue_date: string
  revenue: number
}

type PlatformOverviewData = {
  dailyRevenue: DailyRevenue[]
  businessDates: BusinessDate[]
  organizations: Organization[]
  paymentSummary: PlatformPaymentSummary[]
  periods: Period[]
}

type ChartPoint = {
  date: string
  revenue: number
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value ?? 0)

function formatBakuDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BAKU_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

function addDays(value: string, days: number) {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysInclusive(start: string, end: string) {
  return Math.max(1, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000) + 1)
}

function shortDate(value: string) {
  return formatNumericMonthDay(parseDate(value), 'UTC')
}

function monthName(value: string) {
  return formatNumericMonthYear(parseDate(value), 'UTC')
}

function createDateRange(start: string, count: number) {
  return Array.from({ length: count }, (_, index) => addDays(start, index))
}

function RevenueChart({ points }: { points: ChartPoint[] }) {
  const { t } = useI18n()
  const areaGradientId = useId()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const activePointer = useRef<number | null>(null)
  const width = 640
  const height = 260
  const left = 52
  const right = 12
  const top = 12
  const bottom = 24
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const highestRevenue = Math.max(...points.map((point) => point.revenue), 1)
  const scaleStep = 10 ** Math.floor(Math.log10(highestRevenue)) / 5
  const maximum = Math.max(Math.ceil(highestRevenue / scaleStep) * scaleStep, 1)
  const coordinates = points.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(points.length - 1, 1)) * plotWidth,
    y: top + plotHeight - (point.revenue / maximum) * plotHeight,
  }))
  const linePath = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const areaPath = `${linePath} L ${left + plotWidth} ${top + plotHeight} L ${left} ${top + plotHeight} Z`
  const selectedPoint = selectedIndex === null ? null : coordinates[selectedIndex]
  const ticks = Array.from({ length: 5 }, (_, index) => ({
    value: maximum - (maximum / 4) * index,
    y: top + (plotHeight / 4) * index,
  }))
  const lastSeven = points.slice(-7).reduce((sum, point) => sum + point.revenue, 0)
  const previousSeven = points.slice(-14, -7).reduce((sum, point) => sum + point.revenue, 0)
  const change = previousSeven > 0 ? ((lastSeven - previousSeven) / previousSeven) * 100 : null

  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
    const ratio = Math.min(1, Math.max(0, (pointerX - left) / plotWidth))
    setSelectedIndex(Math.round(ratio * Math.max(points.length - 1, 0)))
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    activePointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    selectFromPointer(event)
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current === event.pointerId) selectFromPointer(event)
  }

  const handlePointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return
    activePointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    setSelectedIndex((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + direction)))
  }

  return (
    <figure className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h4 className="font-medium text-slate-950">{t('platformOverview.days30')}</h4>
          <p className="mt-1 text-xs text-slate-500">{t('platformOverview.completedPayments')}</p>
        </div>
        {change !== null ? (
          <span className={change >= 0 ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-red-700'}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <svg
        aria-label={t('platformOverview.chartAria')}
        className="w-full select-none overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        role="img"
        style={{ touchAction: 'pan-y' }}
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line className="stroke-slate-200" x1={left} x2={left + plotWidth} y1={tick.y} y2={tick.y} />
            <text className="fill-slate-500 text-[11px]" textAnchor="end" x={left - 8} y={tick.y + 4}>
              {money(tick.value)}
            </text>
          </g>
        ))}
        <line className="stroke-slate-400" x1={left} x2={left} y1={top} y2={top + plotHeight} />
        <line className="stroke-slate-400" x1={left} x2={left + plotWidth} y1={top + plotHeight} y2={top + plotHeight} />
        <path d={areaPath} fill={`url(#${areaGradientId})`} />
        <path d={linePath} fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {selectedPoint ? (
          <g>
            <circle cx={selectedPoint.x} cy={selectedPoint.y} fill="#10b981" r="6" stroke="white" strokeWidth="3" />
            <g transform={`translate(${Math.min(Math.max(selectedPoint.x - 58, left), width - 126)} ${Math.max(selectedPoint.y - 58, 4)})`}>
              <rect className="fill-slate-950" height="44" rx="7" width="116" />
              <text fill="white" fontSize="11" textAnchor="middle" x="58" y="17">{shortDate(selectedPoint.date)}</text>
              <text fill="white" fontSize="13" fontWeight="600" textAnchor="middle" x="58" y="34">{money(selectedPoint.revenue)}</text>
            </g>
          </g>
        ) : null}
      </svg>
    </figure>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold text-slate-950">{value}</p>
      {note ? <p className="mt-1 truncate text-xs text-slate-500">{note}</p> : null}
    </div>
  )
}

function OrganizationAnalytics({
  businessDate,
  dailyRevenue,
  organization,
  paymentSummary,
  periods,
}: {
  businessDate: string
  dailyRevenue: DailyRevenue[]
  organization: Organization
  paymentSummary: PlatformPaymentSummary[]
  periods: Period[]
}) {
  const { t } = useI18n()
  const chartStart = addDays(businessDate, -30)
  const chartDates = createDateRange(chartStart, 30)
  const revenueByDate = new Map(
    dailyRevenue
      .filter((row) => row.organization_id === organization.id)
      .map((row) => [row.revenue_date, Number(row.revenue)]),
  )
  const chartPoints = chartDates.map((date) => ({ date, revenue: revenueByDate.get(date) ?? 0 }))
  const todayRevenue = revenueByDate.get(businessDate) ?? 0
  const organizationPeriods = periods.filter((period) => period.organization_id === organization.id)
  const cycle = getCurrentFinancialCycle(organizationPeriods, businessDate)
  const completedCycleEnd = addDays(businessDate, -1)
  const completedCycleDates = completedCycleEnd >= cycle.start
    ? createDateRange(cycle.start, daysInclusive(cycle.start, completedCycleEnd))
    : []
  const completedCycleRevenue = completedCycleDates.reduce((sum, date) => sum + (revenueByDate.get(date) ?? 0), 0)
  const periodRevenue = completedCycleRevenue + todayRevenue
  const cycleDays = daysInclusive(cycle.start, cycle.end)
  const forecast = completedCycleDates.length > 0
    ? (completedCycleRevenue / completedCycleDates.length) * cycleDays
    : null
  const platformPayment = paymentSummary.find((payment) => payment.organization_id === organization.id)

  return (
    <article className="grid gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h3 className="truncate text-lg font-semibold text-slate-950">{organization.name}</h3>
        <Link
          aria-label={t('platformOverview.openFinance', { name: organization.name })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          to={getPlatformRoutePath(`/finance/organizations/${organization.id}`)}
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          {t('platformOverview.todayInProgress')}
        </p>
        <p className="mt-2 text-3xl font-semibold text-emerald-950">{money(todayRevenue)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Metric label={t('platformOverview.currentPeriod')} value={money(periodRevenue)} />
        <Metric
          label={t('platformOverview.forecast')}
          note={monthName(cycle.start)}
          value={forecast === null ? '—' : money(forecast)}
        />
        <Metric
          label={t('overview.paidToPlatform')}
          value={money(platformPayment?.total_paid)}
        />
      </div>

      <RevenueChart points={chartPoints} />
    </article>
  )
}

export function PlatformOverviewPage() {
  const today = formatBakuDate()
  const startDate = addDays(today, -32)
  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview', today],
    queryFn: async (): Promise<PlatformOverviewData> => {
      const [organizationsResult, revenueResult, paymentSummaryResult, businessDatesResult, periodsResult] = await Promise.all([
        supabase.from('organizations').select(organizationSelect).eq('status', 'active').order('created_at'),
        supabase.rpc('get_platform_daily_revenue', {
          target_end_date: today,
          target_start_date: startDate,
        }),
        supabase.rpc('get_platform_payment_summary'),
        supabase.rpc('get_platform_business_dates'),
        supabase
          .from('financial_periods')
          .select('organization_id,period_start,period_end,status')
          .order('period_end', { ascending: false }),
      ])

      const failed = [organizationsResult, revenueResult, paymentSummaryResult, businessDatesResult, periodsResult]
        .find((result) => result.error)
      if (failed?.error) throw new Error(failed.error.message)

      return {
        businessDates: businessDatesResult.data as BusinessDate[],
        dailyRevenue: revenueResult.data as DailyRevenue[],
        organizations: (organizationsResult.data as Organization[])
          .filter((organization) => organization.slug !== DEMO_ORGANIZATION_SLUG),
        paymentSummary: paymentSummaryResult.data as PlatformPaymentSummary[],
        periods: periodsResult.data as Period[],
      }
    },
  })

  return (
    <section className="grid content-start gap-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Обзор</h2>
        {overviewQuery.isFetching ? <Loader2 aria-label="Обновление" className="size-4 animate-spin text-emerald-700" /> : null}
      </header>

      {overviewQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {overviewQuery.error.message}
        </div>
      ) : null}

      <div className="grid gap-4">
        {overviewQuery.data?.organizations.map((organization) => (
          <OrganizationAnalytics
            businessDate={overviewQuery.data.businessDates.find((row) => row.organization_id === organization.id)?.business_date ?? today}
            dailyRevenue={overviewQuery.data.dailyRevenue}
            key={organization.id}
            organization={organization}
            paymentSummary={overviewQuery.data.paymentSummary}
            periods={overviewQuery.data.periods}
          />
        ))}
      </div>
    </section>
  )
}
