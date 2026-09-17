import { getCurrentLocale } from '../../../lib/i18n/translator'
import {
  Banknote,
  Calculator,
  CalendarCheck,
  Edit3,
  Eye,
  HelpCircle,
  ListChecks,
  Loader2,
  Plus,
  ReceiptText,
  Repeat,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  FinancePaymentMethod,
  FinanceCategoryRow,
  FinanceTransactionRow,
  FinanceTransactionType,
  FinancialPeriodRow,
  FinancialPeriodSummary,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  monthStartDate,
  todayDate,
  useFinanceCategories,
  useFinancePeriodSummary,
  useFinanceSettings,
  useFinanceSettingsMutation,
  useFinanceTransactions,
} from '../financeApi'
import { useExpenseMutations } from '../expensesApi'
import {
  useFinancialPeriod,
  useFinancialPeriodMutations,
  useFinancialPeriods,
} from '../financialPeriodsApi'
import { useIncomeMutations } from '../incomeApi'
import {
  usePaymentMethodSummary,
  usePaymentTrafficAnalytics,
  useRevenueBreakdown,
  useUsageHoursBreakdown,
} from '../../orders/paymentsApi'
import {
  useRecurringExpenseMutations,
  useRecurringExpenses,
  type RecurringExpenseInput,
} from '../recurringExpensesApi'

const DEFAULT_START = monthStartDate()
const DEFAULT_END = todayDate()

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    value ?? 0,
  )

const formatUsageDuration = (hours: number | null | undefined, t: (value: string) => string) => {
  const totalMinutes = Math.round(Math.max(0, hours ?? 0) * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (wholeHours && minutes) return `${wholeHours} ${t("ui.ch_285cc40")} ${minutes} ${t("ui.min_d6035dc")}`
  if (wholeHours) return `${wholeHours} ${t("ui.ch_285cc40")}`
  return `${minutes} ${t("ui.min_d6035dc")}`
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getFinancialCycle(closeDay: number | null | undefined) {
  const day = Math.min(28, Math.max(1, closeDay ?? 15))
  const now = new Date()
  const start =
    now.getDate() >= day
      ? new Date(now.getFullYear(), now.getMonth(), day)
      : new Date(now.getFullYear(), now.getMonth() - 1, day)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1)
  const nextClose = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)

  return {
    end: formatDateInput(end),
    nextClose: formatDateInput(nextClose),
    start: formatDateInput(start),
  }
}

function parseLocalDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysInclusive(start: string, end: string) {
  const startDate = parseLocalDate(start)
  const endDate = parseLocalDate(end)
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / dayMs) + 1)
}

function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(() => todayDate())

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentDate(todayDate()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  return currentDate
}

function financialPeriodMutationMessage(message: string, t: (value: string) => string) {
  if (message.includes('public.cancel_financial_period')) {
    return t("ui.udalenie_periodov_esche_ne_podklyucheno_v_baze_prime_382939e")
  }

  return message
}

const periodStatusLabel: Record<string, string> = {
  open: 'Открыт',
  submitted: 'На проверке',
  clarification_requested: 'Нужны уточнения',
  approved: 'Одобрен',
  locked: 'Закрыт',
  rejected: 'Отклонён',
  cancelled: 'Удалён',
}

const methodOptions: { value: FinancePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card_transfer', label: 'Перевод на карту' },
  { value: 'bank_transfer', label: 'Банк' },
  { value: 'other', label: 'Другое' },
]

const financeLinks: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/admin/finance/income', label: 'Доходы', Icon: Banknote },
  { href: '/admin/finance/expenses', label: 'Расходы', Icon: ReceiptText },
  { href: '/admin/finance/periods', label: 'Периоды', Icon: CalendarCheck },
]

function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  const { t } = useI18n()

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {t(title)}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">{t(description)}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

function MetricCard({
  description,
  label,
  value,
}: {
  description?: string
  label: string
  value: number | null | undefined
}) {
  const { t } = useI18n()
  return (
    <div className="relative min-w-0 rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <p className="min-w-0 text-[10px] font-medium uppercase leading-4 text-slate-500 sm:text-xs">
          {t(label)}
        </p>
        {description ? (
          <div className="group relative">
            <button
              aria-label={`${t('ui.kak_schitaetsya_5d5b2b3')} ${t(label)}`}
              className="flex size-5 items-center justify-center rounded-full text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              title={t(description)}
              type="button"
            >
              <HelpCircle aria-hidden="true" className="size-4" />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block">
              {t(description)}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-lg font-semibold text-slate-950 sm:mt-2 sm:text-xl">
        {money(Number(value ?? 0))}
      </p>
    </div>
  )
}

function InfoCard({
  description,
  label,
  value,
}: {
  description?: string
  label: string
  value: string
}) {
  const { t } = useI18n()
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-[10px] font-medium uppercase leading-4 text-slate-500 sm:text-xs">{t(label)}</p>
      <p className="mt-1.5 text-base font-semibold leading-5 text-slate-950 sm:mt-2 sm:text-xl">{value}</p>
      {description ? (
        <p className="mt-2 hidden text-sm leading-5 text-slate-600 sm:block">{t(description)}</p>
      ) : null}
    </div>
  )
}

function StatGrid({
  cardPayment,
  showCardPayment = false,
  showCashFlow = false,
  summary,
}: {
  cardPayment?: number | null
  showCardPayment?: boolean
  showCashFlow?: boolean
  summary: FinancialPeriodSummary | null | undefined
}) {
  const items: { description: string; label: string; value: number | null | undefined }[] = [
    {
      label: 'Доход',
      value: summary?.revenue,
      description:
        'Все оплаченные и частично оплаченные доходы за текущий период по дате начисления: доходы из заказов и ручные доходы.',
    },
    {
      label: 'Закупка товаров',
      value: summary?.cogs,
      description:
        'Общая сумма закупок, проведённых через кнопку «Базарлык» на складе за текущий период.',
    },
    {
      label: 'После закупок',
      value: summary?.gross_profit,
      description:
        'Доход минус все закупки товаров за период, до остальных операционных расходов.',
    },
    {
      label: 'Опер. расходы',
      value: summary?.operating_expenses,
      description:
        'Расходы, которые влияют на прибыль: не отменённые, не ожидающие подтверждения и не отклонённые, по дате начисления.',
    },
    {
      label: 'Чистая прибыль',
      value: summary?.net_profit_before_platform_share,
      description: 'Доход минус закупки товаров и операционные расходы.',
    },
  ]

  if (showCardPayment) {
    items.push({
      label: 'Оплата картой',
      value: cardPayment,
      description:
        'Сумма завершённых платежей по карте за текущий период. Считается напрямую из платежей, чтобы видеть безналичный оборот.',
    })
  }

  if (showCashFlow) {
    items.push(
      {
        label: 'Cash in',
        value: summary?.cash_inflow,
        description:
          'Фактически полученные деньги за текущий период по дате оплаты: оплаченные и частично оплаченные доходы.',
      },
      {
        label: 'Cash out',
        value: summary?.cash_outflow,
        description:
          'Фактически потраченные деньги за текущий период по дате оплаты: оплаченные расходы и закупки.',
      },
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      {items.map(({ description, label, value }) => (
        <MetricCard description={description} key={label} label={label} value={value} />
      ))}
    </div>
  )
}

function RevenueBreakdownGrid({
  billiard,
  goods,
  other,
  playstation,
  tables,
}: {
  billiard: number | undefined
  goods: number | undefined
  other?: number | undefined
  playstation: number | undefined
  tables: number | undefined
}) {
  const items = [
    {
      label: 'PlayStation',
      value: playstation,
      description:
        'Выручка по заказам PlayStation без товарных позиций. Товары из этих заказов считаются отдельно в карточке Товары.',
    },
    {
      label: 'Бильярд',
      value: billiard,
      description:
        'Выручка по заказам бильярда без товарных позиций. Товары из этих заказов считаются отдельно в карточке Товары.',
    },
    {
      label: 'Столы',
      value: tables,
      description:
        'Вся оплаченная выручка заказов со столов и VIP-комнат: услуги, товары, комбо и ручные позиции внутри этих заказов.',
    },
    {
      label: 'Прибыль товаров',
      value: goods,
      description:
        'Чистая прибыль по товарным позициям: сумма продаж товаров минус snapshot-себестоимость этих товаров в заказах.',
    },
  ]

  if ((other ?? 0) > 0) {
    items.push({
      label: 'Другое',
      value: other,
      description: 'Оплаченная выручка, которая не относится к PlayStation, бильярду, столам или товарам.',
    })
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <MetricCard
          description={item.description}
          key={item.label}
          label={item.label}
          value={item.value}
        />
      ))}
    </div>
  )
}

function UsageHoursGrid({
  billiard,
  playstation,
  tables,
  total,
}: {
  billiard: number | undefined
  playstation: number | undefined
  tables: number | undefined
  total: number | undefined
}) {
  const { t } = useI18n()
  const items = [
    {
      label: 'PlayStation',
      value: playstation,
      description:
        'Фактические часы сессий PlayStation и VIP-кабинетов за выбранный период.',
    },
    {
      label: 'Бильярд',
      value: billiard,
      description: 'Фактические часы бильярдных сессий за выбранный период.',
    },
    {
      label: 'Столы',
      value: tables,
      description:
        'Время занятости обычных столов: от открытия заказа до закрытия или до текущего момента.',
    },
    {
      label: 'Всего часов',
      value: total,
      description: 'Общее занятое время по PlayStation, бильярду и столам.',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <InfoCard
          description={item.description}
          key={item.label}
          label={item.label}
          value={formatUsageDuration(item.value, t)}
        />
      ))}
    </div>
  )
}

type PaymentChartPoint = {
  amount: number
  count: number
  hour: number
}

function PaymentBarChart({ compact = false, points }: { compact?: boolean; points: PaymentChartPoint[] }) {
  const { t } = useI18n()
  const maxAmount = Math.max(...points.map((point) => point.amount), 0)
  const chartMaximum = maxAmount || 1
  const yAxisTicks = [1, 0.75, 0.5, 0.25, 0]

  return (
    <div className={compact ? 'w-full' : 'min-w-[64rem]'}>
      <div className={cn('grid gap-2', compact ? 'grid-cols-[3.25rem_1fr]' : 'grid-cols-[4rem_1fr]')}>
        <div
          className={cn(
            'flex flex-col justify-between pr-1 text-right text-[10px] text-slate-500 sm:text-xs',
            compact ? 'h-52' : 'h-64',
          )}
        >
          {yAxisTicks.map((tick) => (
            <span key={tick}>{money(maxAmount * tick)}</span>
          ))}
        </div>
        <div className="min-w-0">
          <div
            aria-label={t("ui.vertikalnaya_diagramma_summy_oplat_po_chasam_c511fe8")}
            className={cn(
              'relative border-b border-l border-slate-300',
              compact ? 'h-52' : 'h-64',
            )}
            role="img"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {yAxisTicks.map((tick) => (
                <span className="border-t border-dashed border-slate-200" key={tick} />
              ))}
            </div>
            <div
              className={cn('absolute inset-x-1 bottom-0 top-0 grid items-end', compact ? 'gap-1' : 'gap-1.5')}
              style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
            >
              {points.map((point) => {
                const height = point.amount > 0 ? Math.max((point.amount / chartMaximum) * 100, 3) : 0
                const details = `${String(point.hour).padStart(2, '0')}:00 — ${money(point.amount)}, ${point.count} ${t("ui.oplat_feb6c81")}`

                return (
                  <div className="flex h-full items-end justify-center" key={point.hour}>
                    <div
                      aria-label={details}
                      className="w-full rounded-t-sm bg-emerald-600 transition-colors hover:bg-emerald-700"
                      style={{ height: `${height}%` }}
                      title={details}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div
            className={cn(
              'grid px-1 pt-2 text-center font-medium text-slate-500',
              compact ? 'gap-1 text-[9px]' : 'gap-1.5 text-[10px]',
            )}
            style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
          >
            {points.map((point) => (
              <span key={point.hour}>{String(point.hour).padStart(2, '0')}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        {t("ui.po_gorizontali_chas_po_vertikali_summa_oplat_0ead36f")}
      </p>
    </div>
  )
}

function PaymentTrafficAnalytics({ organizationId }: { organizationId: string | null }) {
  const { t } = useI18n()
  const analytics = usePaymentTrafficAnalytics(organizationId)
  const points = analytics.data?.points ?? []
  const peakHour = analytics.data?.peakHour
  const mobilePoints = Array.from({ length: 12 }, (_, interval) => {
    const intervalPoints = points.slice(interval * 2, interval * 2 + 2)

    return {
      amount: intervalPoints.reduce((total, point) => total + point.amount, 0),
      count: intervalPoints.reduce((total, point) => total + point.count, 0),
      hour: interval * 2,
    }
  })

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.finansovaya_analitika_8b45181")}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("ui.vse_zavershennye_platezhi_do_segodnyashnego_dnya_sum_0c8e581")}
          </p>
        </div>
        <div className="grid gap-1 text-sm text-slate-700 sm:text-right">
          <span>
            {t("ui.chas_pik_fbb92ba")}: {peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}
          </span>
        </div>
      </div>

      {analytics.isLoading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {t("ui.zagruzka_analitiki_0be70ab")}
        </div>
      ) : null}

      <div className="min-w-0 sm:hidden">
        <PaymentBarChart compact points={mobilePoints} />
      </div>
      <div className="hidden overflow-x-auto pb-2 sm:block">
        <PaymentBarChart points={points} />
      </div>
    </section>
  )
}

function MonthlyForecastAnalytics({
  cycleEnd,
  cycleStart,
  currentDate,
  summary,
}: {
  cycleEnd: string
  cycleStart: string
  currentDate: string
  summary: FinancialPeriodSummary | null | undefined
}) {
  const { t } = useI18n()
  const elapsedDays = daysInclusive(cycleStart, currentDate)
  const cycleDays = daysInclusive(cycleStart, cycleEnd)
  const remainingDays = Math.max(cycleDays - elapsedDays, 0)
  const grossRevenue = summary?.revenue ?? 0
  const netProfit = summary?.net_profit_before_platform_share ?? 0
  const averageGrossPerDay = grossRevenue / elapsedDays
  const averageNetPerDay = netProfit / elapsedDays
  const projectedGross = averageGrossPerDay * cycleDays
  const projectedNet = averageNetPerDay * cycleDays
  const progress = Math.min(100, Math.round((elapsedDays / cycleDays) * 100))

  const cards = [
    {
      description: 'Факт грязного дохода с начала текущего расчётного периода.',
      label: 'Факт дохода',
      value: grossRevenue,
    },
    {
      description: 'Средний грязный доход в день: факт дохода делится на прошедшие дни периода.',
      label: 'Средний доход в день',
      value: averageGrossPerDay,
    },
    {
      description: 'Примерный грязный доход за полный месяц: средний доход в день умножается на все дни периода.',
      label: 'Прогноз дохода за месяц',
      value: projectedGross,
    },
    {
      description: 'Примерная прибыль за месяц с учётом закупок товаров и операционных расходов.',
      label: 'Прогноз с расходами',
      value: projectedNet,
    },
  ]

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.prognoz_mesyatsa_0f85546")}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("ui.otsenka_ne_popadaet_v_finansovye_periody_ona_tolko_p_48f8d8f")}
          </p>
        </div>
        <div className="grid gap-1 text-sm text-slate-700 sm:text-right">
          <span>
            {t("ui.period_b2822e2")}: {cycleStart} - {cycleEnd}
          </span>
          <span>
            {t("ui.proshlo_dney_5bc0101")}: {elapsedDays}/{cycleDays} · {progress}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <MetricCard
            description={card.description}
            key={card.label}
            label={card.label}
            value={card.value}
          />
        ))}
      </div>

      <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 sm:grid-cols-3">
        <div>
          <span className="font-medium text-slate-950">{t("ui.ostalos_dney_498f6cb")}:</span> {remainingDays}
        </div>
        <div>
          <span className="font-medium text-slate-950">{t("ui.tekuschaya_chistaya_pribyl_3d2a62f")}:</span>{' '}
          {money(netProfit)}
        </div>
        <div>
          <span className="font-medium text-slate-950">{t("ui.metod_cc9a1c8")}:</span>{' '}
          {t("ui.srednee_za_den_dney_v_periode_772f8cc")}
        </div>
      </div>
    </section>
  )
}

function TransactionTable({
  categories,
  onCancel,
  onEdit,
  onOpen,
  rows,
  type,
}: {
  categories: FinanceCategoryRow[] | undefined
  onCancel?: (row: FinanceTransactionRow) => void
  onEdit?: (row: FinanceTransactionRow) => void
  onOpen?: (row: FinanceTransactionRow) => void
  rows: FinanceTransactionRow[] | undefined
  type: FinanceTransactionType | undefined
}) {
  const { t } = useI18n()
  const categoryById = new Map((categories ?? []).map((category) => [category.id, category.name]))
  const paymentMethodByValue = new Map(methodOptions.map((method) => [method.value, method.label]))

  if (!rows?.length) {
    return (
      <EmptyState
        description="После оплаты заказов или ручного ввода здесь появятся финансовые операции."
        icon={ReceiptText}
        title="Операций пока нет"
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Дата оплаты</th>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Метод оплаты</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              {type === 'expense' ? <th className="px-4 py-3 text-right">Действия</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.paid_date ?? row.accrual_date}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{row.title}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.category_id ? t(categoryById.get(row.category_id) ?? '—') : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {row.payment_method ? paymentMethodByValue.get(row.payment_method) ?? row.payment_method : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  {money(row.amount)}
                </td>
                {type === 'expense' ? (
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button className="min-h-9 px-2" onClick={() => onOpen?.(row)} type="button" variant="secondary">
                        <Eye className="size-4" />
                      </Button>
                      {row.source_type === 'manual' && row.status !== 'cancelled' ? (
                        <>
                          <Button className="min-h-9 px-2" onClick={() => onEdit?.(row)} type="button" variant="secondary">
                            <Edit3 className="size-4" />
                          </Button>
                          <Button className="min-h-9 px-2" onClick={() => onCancel?.(row)} type="button" variant="danger">
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MoneyForm({
  onCreated,
  type,
  organizationId,
  userId,
}: {
  onCreated?: () => void
  type: 'income' | 'expense'
  organizationId: string | null
  userId: string | undefined
}) {
  const { t } = useI18n()
  const categories = useFinanceCategories(organizationId, type)
  const incomeMutations = useIncomeMutations(organizationId)
  const expenseMutations = useExpenseMutations(organizationId)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const expenseIdempotencyKey = useRef(crypto.randomUUID())
  const visibleCategories = categories.data?.filter(
    (category) => type !== 'expense' || category.system_code !== 'purchase_goods',
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const categoryId = String(form.get('category_id') ?? '')
    const input = {
      title: String(form.get('title') ?? ''),
      amount: Number(form.get('amount') ?? 0),
      categoryId: categoryId || null,
      paymentMethod: String(form.get('payment_method') || 'cash') as FinancePaymentMethod,
      accrualDate: String(form.get('accrual_date') || DEFAULT_END),
      paidDate: String(form.get('paid_date') || DEFAULT_END),
      recipientOrSupplier: String(form.get('recipient_or_supplier') || '') || null,
      description: String(form.get('description') || '') || null,
    }

    try {
      if (type === 'income') {
        await incomeMutations.createManualIncome.mutateAsync(input)
      } else if (categoryId) {
        await expenseMutations.createExpense.mutateAsync({
          ...input,
          categoryId,
          idempotencyKey: expenseIdempotencyKey.current,
        })
        expenseIdempotencyKey.current = crypto.randomUUID()
      }
      formElement.reset()
      onCreated?.()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!userId) return null

  const isPending =
    type === 'income'
      ? incomeMutations.createManualIncome.isPending
      : expenseMutations.createExpense.isPending || isSubmitting

  return (
    <form className="grid gap-3 rounded-md border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Название" name="title" required />
        <Input label="Сумма" min="0.01" name="amount" required step="0.01" type="number" />
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Категория</span>
          <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" name="category_id" required={type === 'expense'}>
            <option value="">Без категории</option>
            {visibleCategories?.map((category) => (
              <option key={category.id} value={category.id}>
                {t(category.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Метод оплаты</span>
          <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" name="payment_method">
            {methodOptions.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </label>
        <Input defaultValue={DEFAULT_END} label="Дата начисления" name="accrual_date" type="date" />
        <Input defaultValue={type === 'income' ? DEFAULT_END : ''} label="Дата оплаты" name="paid_date" type="date" />
        {type === 'expense' ? <Input label="Получатель / поставщик" name="recipient_or_supplier" /> : null}
      </div>
      <Button className="justify-self-start" disabled={isPending} type="submit">
        {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ReceiptText aria-hidden="true" className="size-4" />}
        Добавить
      </Button>
    </form>
  )
}

type ExpenseModalMode = 'view' | 'edit'

function ExpenseTransactionModal({
  mode,
  onClose,
  organizationId,
  row,
}: {
  mode: ExpenseModalMode
  onClose: () => void
  organizationId: string | null
  row: FinanceTransactionRow
}) {
  const { t } = useI18n()
  const categories = useFinanceCategories(organizationId, 'expense')
  const expenseMutations = useExpenseMutations(organizationId)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const categoryId = String(form.get('category_id') ?? '')
    if (!categoryId) return

    await expenseMutations.updateExpense.mutateAsync({
      transactionId: row.id,
      input: {
        title: String(form.get('title') ?? ''),
        amount: Number(form.get('amount') ?? 0),
        categoryId,
        paymentMethod: String(form.get('payment_method') || 'cash') as FinancePaymentMethod,
        accrualDate: String(form.get('accrual_date') || DEFAULT_END),
        paidDate: String(form.get('paid_date') || '') || null,
        recipientOrSupplier: String(form.get('recipient_or_supplier') || '') || null,
        description: String(form.get('description') || '') || null,
      },
    })
    onClose()
  }

  const isEdit = mode === 'edit'

  return (
    <Modal onClose={onClose}>
      <form className="grid w-full max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{isEdit ? 'Редактировать расход' : 'Расход'}</h3>
          <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input defaultValue={row.title} disabled={!isEdit} label="Название" name="title" required />
          <Input defaultValue={row.amount} disabled={!isEdit} label="Сумма" min="0.01" name="amount" required step="0.01" type="number" />
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Категория</span>
            <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50" defaultValue={row.category_id ?? ''} disabled={!isEdit} name="category_id" required>
              <option value="">Без категории</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {t(category.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Метод оплаты</span>
            <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50" defaultValue={row.payment_method ?? 'cash'} disabled={!isEdit} name="payment_method">
              {methodOptions.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
          <Input defaultValue={row.accrual_date} disabled={!isEdit} label="Дата начисления" name="accrual_date" type="date" />
          <Input defaultValue={row.paid_date ?? ''} disabled={!isEdit} label="Дата оплаты" name="paid_date" type="date" />
          <Input defaultValue={row.recipient_or_supplier ?? ''} disabled={!isEdit} label="Получатель / поставщик" name="recipient_or_supplier" />
          <Input defaultValue={row.status} disabled label="Статус" name="status_display" />
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Описание</span>
          <textarea className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none disabled:bg-slate-50" defaultValue={row.description ?? ''} disabled={!isEdit} name="description" />
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="secondary">Закрыть</Button>
          {isEdit ? (
            <Button disabled={expenseMutations.updateExpense.isPending} type="submit">
              {expenseMutations.updateExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Сохранить
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}

export function AdminFinancePage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const currentDate = useCurrentDate()
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const periodSummary = useFinancePeriodSummary(organizationId, currentCycle.start, currentDate)
  const paymentMethodSummary = usePaymentMethodSummary(organizationId, currentCycle.start, currentDate)
  const revenueBreakdown = useRevenueBreakdown(organizationId, currentCycle.start, currentDate)
  const usageHours = useUsageHoursBreakdown(organizationId, currentCycle.start, currentDate)
  const revenueBreakdownData = revenueBreakdown.data ?? {
    billiard: 0,
    goods: 0,
    other: 0,
    playstation: 0,
    tables: 0,
    total: 0,
  }
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)

  return (
    <section className="grid gap-4 sm:gap-5">
      <PageHeader
        title="Финансы"
        description="Финансовый центр организации: доходы, расходы, P&L, движение денег и аналитика оплат."
      />
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
        {t("ui.tekuschiy_raschetnyy_period_f675682")}: {currentCycle.start} - {currentDate}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {financeLinks.map(({ href, label, Icon }) => (
          <Link
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 sm:min-h-16 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:text-sm"
            key={href}
            to={buildAdminPath(href)}
          >
            <Icon aria-hidden="true" className="size-5 text-emerald-700" />
            {label}
          </Link>
        ))}
      </div>
      <StatGrid
        cardPayment={paymentMethodSummary.data?.card ?? null}
        showCardPayment
        summary={periodSummary.data}
      />
      <section className="grid gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{t("ui.vyruchka_po_napravleniyam_itogo_42a6e73")}</h3>
        <RevenueBreakdownGrid
          billiard={revenueBreakdownData.billiard}
          goods={revenueBreakdownData.goods}
          other={revenueBreakdownData.other}
          playstation={revenueBreakdownData.playstation}
          tables={revenueBreakdownData.tables}
        />
        {revenueBreakdown.error ? (
          <p className="text-sm text-rose-700">
            {t("ui.ne_udalos_zagruzit_vyruchku_po_napravleniyam_fb0e0dd")}: {revenueBreakdown.error.message}
          </p>
        ) : null}
      </section>
      {usageHours.data ? (
        <section className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.vremya_po_napravleniyam_period_fc0f31c")}</h3>
          <UsageHoursGrid
            billiard={usageHours.data.billiard}
            playstation={usageHours.data.playstation}
            tables={usageHours.data.tables}
            total={usageHours.data.total}
          />
        </section>
      ) : null}
      <PaymentTrafficAnalytics organizationId={organizationId} />
      <MonthlyForecastAnalytics
        currentDate={currentDate}
        cycleEnd={currentCycle.end}
        cycleStart={currentCycle.start}
        summary={periodSummary.data}
      />
    </section>
  )
}

export function AdminFinanceIncomePage() {
  const { organizationId, user } = useAuth()
  const { t } = useI18n()
  const transactions = useFinanceTransactions(organizationId, 'income')
  const categories = useFinanceCategories(organizationId, 'income')
  const periods = useFinancialPeriods(organizationId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialPeriodRow | null>(null)

  const visibleTransactions = (transactions.data ?? []).filter((row) => row.status !== 'cancelled')
  const closedPeriods = (periods.data ?? []).filter((period) => period.status !== 'cancelled')
  const belongsToPeriod = (row: FinanceTransactionRow, period: FinancialPeriodRow) =>
    row.accrual_date >= period.period_start && row.accrual_date <= period.period_end
  const currentTransactions = visibleTransactions.filter(
    (row) => !closedPeriods.some((period) => belongsToPeriod(row, period)),
  )
  const selectedPeriodTransactions = selectedPeriod
    ? visibleTransactions.filter((row) => belongsToPeriod(row, selectedPeriod))
    : []

  return (
    <section className="grid gap-5">
      <PageHeader
        action={(
          <Button onClick={() => setIsCreateOpen(true)} type="button">
            <Plus className="size-4" />
            {t('Добавить доход')}
          </Button>
        )}
        description="Автоматические доходы из оплаченных заказов и ручной доход организации."
        title="Доходы"
      />

      <section className="grid gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{t('Текущий незакрытый период')}</h3>
            <p className="text-sm text-slate-600">{t('Доходы отображаются подробно, пока финансовый период не закрыт.')}</p>
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {t('Общий доход')}: {money(currentTransactions.reduce((sum, row) => sum + row.amount, 0))}
          </p>
        </div>
        <TransactionTable categories={categories.data} rows={currentTransactions} type="income" />
      </section>

      {closedPeriods.length ? (
        <section className="grid gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{t('Закрытые периоды')}</h3>
            <p className="text-sm text-slate-600">{t('Доходы закрытого периода собраны в одну итоговую карточку.')}</p>
          </div>
          <div className="grid gap-3">
            {closedPeriods.map((period) => {
              const periodTransactions = visibleTransactions.filter((row) => belongsToPeriod(row, period))
              const total = periodTransactions.reduce((sum, row) => sum + row.amount, 0)

              return (
                <article className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" key={period.id}>
                  <div>
                    <p className="text-sm text-slate-500">{period.period_start} — {period.period_end}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{t('Общий доход')}: {money(total)}</p>
                    <p className="mt-1 text-sm text-slate-600">{periodTransactions.length} {t('операций')}</p>
                  </div>
                  <Button onClick={() => setSelectedPeriod(period)} type="button" variant="secondary">
                    <Eye className="size-4" />
                    {t('Открыть доходы')}
                  </Button>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {isCreateOpen ? (
        <Modal onClose={() => setIsCreateOpen(false)}>
          <div className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{t('Добавить доход')}</h3>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsCreateOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <MoneyForm
              onCreated={() => setIsCreateOpen(false)}
              organizationId={organizationId}
              type="income"
              userId={user?.id}
            />
          </div>
        </Modal>
      ) : null}

      {selectedPeriod ? (
        <Modal onClose={() => setSelectedPeriod(null)}>
          <div className="flex max-h-[calc(100svh-3rem)] w-full max-w-6xl flex-col gap-4 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t('Доходы периода')}</h3>
                <p className="mt-1 text-sm text-slate-600">{selectedPeriod.period_start} — {selectedPeriod.period_end}</p>
              </div>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setSelectedPeriod(null)} type="button"><X className="size-4" /></button>
            </div>
            <div className="rounded-md bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              {t('Общий доход')}: {money(selectedPeriodTransactions.reduce((sum, row) => sum + row.amount, 0))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TransactionTable categories={categories.data} rows={selectedPeriodTransactions} type="income" />
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

export function AdminFinanceExpensesPage() {
  const { organizationId, user } = useAuth()
  const { t } = useI18n()
  const transactions = useFinanceTransactions(organizationId, ['expense', 'purchase'])
  const categories = useFinanceCategories(organizationId, 'expense')
  const periods = useFinancialPeriods(organizationId)
  const expenseMutations = useExpenseMutations(organizationId)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialPeriodRow | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransactionRow | null>(null)
  const [transactionModalMode, setTransactionModalMode] = useState<ExpenseModalMode>('view')

  const visibleTransactions = (transactions.data ?? []).filter((row) => row.status !== 'cancelled')
  const closedPeriods = (periods.data ?? []).filter((period) => period.status !== 'cancelled')
  const belongsToPeriod = (row: FinanceTransactionRow, period: FinancialPeriodRow) =>
    row.accrual_date >= period.period_start && row.accrual_date <= period.period_end
  const currentTransactions = visibleTransactions.filter(
    (row) => !closedPeriods.some((period) => belongsToPeriod(row, period)),
  )
  const selectedPeriodTransactions = selectedPeriod
    ? visibleTransactions.filter((row) => belongsToPeriod(row, selectedPeriod))
    : []

  const openTransaction = (row: FinanceTransactionRow) => {
    setSelectedPeriod(null)
    setSelectedTransaction(row)
    setTransactionModalMode('view')
  }
  const editTransaction = (row: FinanceTransactionRow) => {
    setSelectedPeriod(null)
    setSelectedTransaction(row)
    setTransactionModalMode('edit')
  }
  const cancelTransaction = (row: FinanceTransactionRow) => {
    const reason = window.prompt('Причина удаления')
    if (!reason?.trim()) return
    expenseMutations.cancelExpense.mutate({ transactionId: row.id, reason: reason.trim() })
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        action={(
          <Button onClick={() => setIsCreateOpen(true)} type="button">
            <Plus className="size-4" />
            {t('Добавить расход')}
          </Button>
        )}
        description="Закупки из амбара появляются здесь автоматически вместе с остальными расходами."
        title="Расходы"
      />

      <section className="grid gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{t('Текущий незакрытый период')}</h3>
            <p className="text-sm text-slate-600">{t('Расходы отображаются подробно, пока финансовый период не закрыт.')}</p>
          </div>
          <p className="text-sm font-semibold text-slate-900">
            {t('Общие траты')}: {money(currentTransactions.reduce((sum, row) => sum + row.amount, 0))}
          </p>
        </div>
        <TransactionTable
          categories={categories.data}
          onCancel={cancelTransaction}
          onEdit={editTransaction}
          onOpen={openTransaction}
          rows={currentTransactions}
          type="expense"
        />
      </section>

      {closedPeriods.length ? (
        <section className="grid gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{t('Закрытые периоды')}</h3>
            <p className="text-sm text-slate-600">{t('Расходы закрытого периода собраны в одну итоговую карточку.')}</p>
          </div>
          <div className="grid gap-3">
            {closedPeriods.map((period) => {
              const periodTransactions = visibleTransactions.filter((row) => belongsToPeriod(row, period))
              const total = periodTransactions.reduce((sum, row) => sum + row.amount, 0)

              return (
                <article className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" key={period.id}>
                  <div>
                    <p className="text-sm text-slate-500">{period.period_start} — {period.period_end}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{t('Общие траты')}: {money(total)}</p>
                    <p className="mt-1 text-sm text-slate-600">{periodTransactions.length} {t('операций')}</p>
                  </div>
                  <Button onClick={() => setSelectedPeriod(period)} type="button" variant="secondary">
                    <Eye className="size-4" />
                    {t('Открыть расходы')}
                  </Button>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {isCreateOpen ? (
        <Modal onClose={() => setIsCreateOpen(false)}>
          <div className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{t('Добавить расход')}</h3>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsCreateOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <MoneyForm
              onCreated={() => setIsCreateOpen(false)}
              organizationId={organizationId}
              type="expense"
              userId={user?.id}
            />
          </div>
        </Modal>
      ) : null}

      {selectedPeriod ? (
        <Modal onClose={() => setSelectedPeriod(null)}>
          <div className="flex max-h-[calc(100svh-3rem)] w-full max-w-6xl flex-col gap-4 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t('Расходы периода')}</h3>
                <p className="mt-1 text-sm text-slate-600">{selectedPeriod.period_start} — {selectedPeriod.period_end}</p>
              </div>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setSelectedPeriod(null)} type="button"><X className="size-4" /></button>
            </div>
            <div className="rounded-md bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              {t('Общие траты')}: {money(selectedPeriodTransactions.reduce((sum, row) => sum + row.amount, 0))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TransactionTable
                categories={categories.data}
                onCancel={cancelTransaction}
                onEdit={editTransaction}
                onOpen={openTransaction}
                rows={selectedPeriodTransactions}
                type="expense"
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {selectedTransaction ? (
        <ExpenseTransactionModal
          mode={transactionModalMode}
          onClose={() => setSelectedTransaction(null)}
          organizationId={organizationId}
          row={selectedTransaction}
        />
      ) : null}
    </section>
  )
}

// Keep the old URL working while purchases are now shown in the common expenses list.
export function AdminFinancePurchasesPage() {
  return <AdminFinanceExpensesPage />
}

export function AdminFinanceCashFlowPage() {
  const { organizationId } = useAuth()
  const currentDate = useCurrentDate()
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const summary = useFinancePeriodSummary(organizationId, currentCycle.start, currentDate)
  return (
    <section className="grid gap-5">
      <PageHeader description="Движение денег по датам оплаты за текущий финансовый период." title="Cash flow" />
      <StatGrid showCashFlow summary={summary.data} />
    </section>
  )
}

export function AdminFinanceProfitLossPage() {
  const { organizationId } = useAuth()
  const currentDate = useCurrentDate()
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const summary = useFinancePeriodSummary(organizationId, currentCycle.start, currentDate)
  return (
    <section className="grid gap-5">
      <PageHeader description="Доходы минус закупки товаров и остальные расходы организации." title="P&L" />
      <StatGrid summary={summary.data} />
    </section>
  )
}

export function AdminFinanceRecurringPage() {
  const { organizationId, user } = useAuth()
  const rows = useRecurringExpenses(organizationId)
  const categories = useFinanceCategories(organizationId, 'expense')
  const mutations = useRecurringExpenseMutations(organizationId)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!organizationId || !user?.id) return
    const form = new FormData(event.currentTarget)
    const input: RecurringExpenseInput = {
      organization_id: organizationId,
      category_id: String(form.get('category_id') ?? ''),
      title: String(form.get('title') ?? ''),
      amount: Number(form.get('amount') ?? 0),
      frequency: String(form.get('frequency') || 'monthly') as RecurringExpenseInput['frequency'],
      start_date: String(form.get('start_date') || DEFAULT_END),
      next_generation_date: String(form.get('next_generation_date') || DEFAULT_END),
      payment_method: String(form.get('payment_method') || 'cash') as FinancePaymentMethod,
      created_by: user.id,
    }
    mutations.upsert.mutate({ input })
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        action={<Button disabled={mutations.generateDue.isPending} onClick={() => mutations.generateDue.mutate(undefined)} type="button">Сгенерировать</Button>}
        description="Регулярные расходы создают финансовые операции по расписанию."
        title="Регулярные расходы"
      />
      <form className="grid gap-3 rounded-md border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Название" name="title" required />
          <Input label="Сумма" min="0.01" name="amount" required step="0.01" type="number" />
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Категория</span>
            <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" name="category_id" required>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Частота</span>
            <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm" name="frequency">
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
              <option value="quarterly">Ежеквартально</option>
              <option value="yearly">Ежегодно</option>
            </select>
          </label>
          <Input defaultValue={DEFAULT_END} label="Старт" name="start_date" type="date" />
          <Input defaultValue={DEFAULT_END} label="Следующее создание" name="next_generation_date" type="date" />
        </div>
        <Button className="justify-self-start" disabled={mutations.upsert.isPending} type="submit">
          <Repeat aria-hidden="true" className="size-4" />
          Добавить правило
        </Button>
      </form>
      <div className="grid gap-2">
        {rows.data?.map((row) => (
          <div className="rounded-md border border-slate-200 bg-white p-4" key={row.id}>
            <p className="font-medium text-slate-950">{row.title}</p>
            <p className="text-sm text-slate-600">{money(row.amount)} · {row.frequency} · следующее: {row.next_generation_date}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AdminFinancePeriodsPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const rows = useFinancialPeriods(organizationId)
  const mutations = useFinancialPeriodMutations(organizationId)
  const [periodFilter, setPeriodFilter] = useState<'active' | 'all' | 'cancelled'>('active')
  const [editingPeriod, setEditingPeriod] = useState<FinancialPeriodRow | null>(null)
  const [cancellingPeriod, setCancellingPeriod] = useState<FinancialPeriodRow | null>(null)
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)
  const periods = rows.data ?? []
  const visiblePeriods = periods.filter((period) => {
    if (periodFilter === 'active') return period.status !== 'cancelled'
    if (periodFilter === 'cancelled') return period.status === 'cancelled'
    return true
  })
  const totals = visiblePeriods.reduce(
    (result, period) => ({
      cogs: result.cogs + period.cogs,
      profit: result.profit + period.net_profit_before_platform_share,
      revenue: result.revenue + period.revenue,
    }),
    { cogs: 0, profit: 0, revenue: 0 },
  )
  const mutationError =
    mutations.submit.error ?? mutations.update.error ?? mutations.cancel.error
  const mutationErrorMessage = mutationError
    ? financialPeriodMutationMessage(mutationError.message, t)
    : null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutations.submit.mutate({
      periodStart: String(form.get('period_start') || DEFAULT_START),
      periodEnd: String(form.get('period_end') || DEFAULT_END),
    })
  }
  const handleEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPeriod) return
    const form = new FormData(event.currentTarget)
    mutations.update.mutate(
      {
        periodId: editingPeriod.id,
        periodStart: String(form.get('period_start') || editingPeriod.period_start),
        periodEnd: String(form.get('period_end') || editingPeriod.period_end),
      },
      { onSuccess: () => setEditingPeriod(null) },
    )
  }
  const handleCancelSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cancellingPeriod) return
    const form = new FormData(event.currentTarget)
    mutations.cancel.mutate(
      {
        periodId: cancellingPeriod.id,
        comment: String(form.get('comment') || '') || null,
      },
      { onSuccess: () => setCancellingPeriod(null) },
    )
  }
  const canChangePeriod = (period: FinancialPeriodRow) =>
    period.status !== 'locked' && period.status !== 'cancelled'
  const statusClassName = (period: FinancialPeriodRow) =>
    cn(
      'inline-flex rounded-md px-2 py-1 text-xs font-semibold',
      period.status === 'submitted' && 'bg-amber-50 text-amber-800',
      period.status === 'clarification_requested' && 'bg-orange-50 text-orange-800',
      period.status === 'locked' && 'bg-emerald-50 text-emerald-800',
      period.status === 'rejected' && 'bg-red-50 text-red-700',
      period.status === 'cancelled' && 'bg-slate-100 text-slate-500',
      period.status === 'open' && 'bg-slate-100 text-slate-700',
      period.status === 'approved' && 'bg-emerald-50 text-emerald-800',
    )
  const filterClassName = (filter: typeof periodFilter) =>
    cn(
      'min-h-10 rounded-md border px-3 text-sm font-medium transition-colors',
      periodFilter === filter
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    )
  const periodActions = (period: FinancialPeriodRow) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
        to={buildAdminPath(`/admin/finance/periods/${period.id}`)}
      >
        <Eye aria-hidden="true" className="size-4" />
        {t("ui.otkryt_1259571")}
      </Link>
      <Button
        disabled={!canChangePeriod(period) || mutations.update.isPending}
        onClick={() => setEditingPeriod(period)}
        type="button"
        variant="secondary"
      >
        <Edit3 aria-hidden="true" className="size-4" />
        {t("ui.izmenit_9d809f8")}
      </Button>
      <Button
        disabled={!canChangePeriod(period) || mutations.cancel.isPending}
        onClick={() => setCancellingPeriod(period)}
        type="button"
        variant="danger"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {t("ui.udalit_86ea33a")}
      </Button>
    </div>
  )

  return (
    <section className="grid gap-5">
      <PageHeader description={t("ui.zakrytie_finansovyh_periodov_i_otpravka_na_proverku__893d161")} title={t("ui.finansovye_periody_32fa387")} />

      {mutationErrorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {mutationErrorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-slate-950">{t("ui.sozdat_period_e3ec01e")}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('Выберите даты: система пересчитает доходы, закупки, расходы и прибыль и отправит период на проверку.')}
          </p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <Input defaultValue={DEFAULT_START} label={t("ui.nachalo_cb26bdc")} name="period_start" required type="date" />
          <Input defaultValue={DEFAULT_END} label={t("ui.konets_4e895fd")} name="period_end" required type="date" />
          <Button disabled={mutations.submit.isPending} type="submit">
            <ListChecks aria-hidden="true" className="size-4" />
            {t("ui.otpravit_76dcf73")}
          </Button>
        </form>
      </section>

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">{t("ui.spisok_periodov_806ed64")}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {t("ui.redaktirovanie_pereschityvaet_period_udalenie_pomech_0c49cda")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={filterClassName('active')} onClick={() => setPeriodFilter('active')} type="button">{t("ui.aktivnye_6009f6c")}</button>
            <button className={filterClassName('all')} onClick={() => setPeriodFilter('all')} type="button">{t("ui.vse_fd08da7")}</button>
            <button className={filterClassName('cancelled')} onClick={() => setPeriodFilter('cancelled')} type="button">{t("ui.udalennye_655b54d")}</button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <MetricCard label="Доход" value={totals.revenue} />
          <MetricCard label="Закупка товаров" value={totals.cogs} />
          <MetricCard label="Чистая прибыль" value={totals.profit} />
        </div>

        {rows.isLoading ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">{t("ui.periody_zagruzhayutsya_56da31c")}</div>
        ) : null}

        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">{t("ui.period_b2822e2")}</th>
                <th className="px-3 py-3 font-medium">{t("ui.status_f7f293b")}</th>
                <th className="px-3 py-3 font-medium">{t("ui.dohod_40b65a7")}</th>
                <th className="px-3 py-3 font-medium">{t('Закупка товаров')}</th>
                <th className="px-3 py-3 font-medium">{t("ui.pribyl_539b700")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("ui.deystviya_9978ac3")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {visiblePeriods.map((period) => (
                <tr className={period.status === 'cancelled' ? 'bg-slate-50 text-slate-500' : undefined} key={period.id}>
                  <td className="px-3 py-3 font-medium text-slate-950">{period.period_start} - {period.period_end}</td>
                  <td className="px-3 py-3"><span className={statusClassName(period)}>{t(periodStatusLabel[period.status] ?? period.status)}</span></td>
                  <td className="px-3 py-3">{money(period.revenue)}</td>
                  <td className="px-3 py-3">{money(period.cogs)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-950">{money(period.net_profit_before_platform_share)}</td>
                  <td className="px-3 py-3">{periodActions(period)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 lg:hidden">
          {visiblePeriods.map((period) => (
            <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4" key={period.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-950">{period.period_start} - {period.period_end}</h4>
                  <span className={statusClassName(period)}>{t(periodStatusLabel[period.status] ?? period.status)}</span>
                </div>
                <div className="text-right text-sm font-semibold text-slate-950">{money(period.net_profit_before_platform_share)}</div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs uppercase text-slate-500">{t("ui.dohod_40b65a7")}</dt><dd>{money(period.revenue)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">{t('Закупка товаров')}</dt><dd>{money(period.cogs)}</dd></div>
              </dl>
              {periodActions(period)}
            </article>
          ))}
        </div>

        {!rows.isLoading && !visiblePeriods.length ? (
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            {t("ui.periodov_v_etom_filtre_net_87c056b")}
          </div>
        ) : null}
      </section>

      {editingPeriod ? (
        <Modal onClose={() => setEditingPeriod(null)}>
          <form className="grid w-full max-w-lg gap-4 rounded-lg bg-white p-5 shadow-xl" onSubmit={handleEditSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t("ui.izmenit_period_06af0f5")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("ui.posle_sohraneniya_summy_budut_pereschitany_po_novym__2376a1b")}</p>
              </div>
              <Button className="px-2" onClick={() => setEditingPeriod(null)} type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input defaultValue={editingPeriod.period_start} label={t("ui.nachalo_cb26bdc")} name="period_start" required type="date" />
              <Input defaultValue={editingPeriod.period_end} label={t("ui.konets_4e895fd")} name="period_end" required type="date" />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditingPeriod(null)} type="button" variant="secondary">{t("ui.otmena_0ec753b")}</Button>
              <Button disabled={mutations.update.isPending} type="submit">
                <Save aria-hidden="true" className="size-4" />
                {t("ui.sohranit_4864057")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {cancellingPeriod ? (
        <Modal onClose={() => setCancellingPeriod(null)}>
          <form className="grid w-full max-w-lg gap-4 rounded-lg bg-white p-5 shadow-xl" onSubmit={handleCancelSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t("ui.udalit_period_631f3f9")}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t("ui.period_budet_pomechen_kak_udalennyy_fizicheski_finan_b7cb449")}
                </p>
              </div>
              <Button className="px-2" onClick={() => setCancellingPeriod(null)} type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <Input label={t("ui.kommentariy_829038c")} name="comment" placeholder={t("ui.naprimer_nevernye_daty_perioda_851114e")} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCancellingPeriod(null)} type="button" variant="secondary">{t("ui.otmena_0ec753b")}</Button>
              <Button disabled={mutations.cancel.isPending} type="submit" variant="danger">
                <Trash2 aria-hidden="true" className="size-4" />
                {t("ui.udalit_86ea33a")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}

export function AdminFinancePeriodDetailPage() {
  const { periodId } = useParams()
  const period = useFinancialPeriod(periodId ?? null)

  return (
    <section className="grid gap-5">
      <PageHeader description="Детальный финансовый период организации." title="Финансовый период" />
      {period.data ? <StatGrid summary={period.data} /> : null}
    </section>
  )
}

export function AdminFinanceSettingsPage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const settings = useFinanceSettings(organizationId)
  const mutation = useFinanceSettingsMutation(organizationId)
  const closeDay = settings.data?.financial_month_close_day ?? 15
  const reportingCurrency = settings.data?.reporting_currency_code || 'AZN'
  const cycle = getFinancialCycle(closeDay)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = {
      large_expense_threshold: Number(form.get('large_expense_threshold') ?? 0) || null,
      require_large_expense_approval: form.get('require_large_expense_approval') === 'on',
      reporting_currency_code: String(form.get('reporting_currency_code') || '') || null,
      financial_month_close_day: Number(form.get('financial_month_close_day') ?? 0) || 15,
    }

    mutation.mutate(input)
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        description={t("ui.rabochie_finansovye_nastroyki_organizatsii_b15930d")}
        title={t("ui.nastroyki_finansov_079ad77")}
      />

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-slate-950">{t("ui.tekuschie_pravila_rascheta_1f6afb3")}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("ui.zdes_pokazan_tekuschiy_finansovyy_tsikl_periodov_2c431fa")}
          </p>
        </div>
        <div className="grid gap-3">
          <InfoCard
            description="Если день 15, текущий период идёт с 15-го числа до 14-го числа следующего месяца."
            label="Текущий финансовый период"
            value={`${cycle.start} - ${cycle.end}`}
          />
        </div>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          {t("ui.sleduyuschee_zakrytie_finansovogo_mesyatsa_9ec43f2")}: {cycle.nextClose}.{' '}
          {t("ui.proverte_chto_vse_smeny_zakryty_rashody_vneseny_a_sp_3d41fb3")}
        </p>
      </section>

      <form className="grid gap-4 rounded-md border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
        <div>
          <h3 className="font-semibold text-slate-950">{t("ui.rabochie_nastroyki_organizatsii_2af206e")}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("ui.eti_parametry_vliyayut_na_otchety_sozdanie_periodov__b9cc599")}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            defaultValue={settings.data?.large_expense_threshold ?? ''}
            label={t("ui.porog_krupnogo_rashoda_140afa5")}
            min="0"
            name="large_expense_threshold"
            placeholder="Например: 100"
            step="0.01"
            type="number"
          />
          <Input
            defaultValue={reportingCurrency}
            label={t("ui.valyuta_otcheta_59de5ee")}
            maxLength={3}
            name="reporting_currency_code"
            placeholder="AZN"
          />
          <Input
            defaultValue={closeDay}
            label={t("ui.den_zakrytiya_mesyatsa_e84ae96")}
            max="28"
            min="1"
            name="financial_month_close_day"
            type="number"
          />
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
            <input defaultChecked={settings.data?.require_large_expense_approval ?? false} name="require_large_expense_approval" type="checkbox" />
            {t("ui.trebovat_podtverzhdenie_krupnyh_rashodov_780ba89")}
          </label>
        </div>

        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <p>
            <span className="font-medium text-slate-800">{t("ui.den_zakrytiya_mesyatsa_e84ae96")}:</span>{' '}
            {t("ui.dlya_the_liga_seychas_logichno_derzhat_15_potomu_cht_6850744")}
          </p>
          <p>
            <span className="font-medium text-slate-800">{t("ui.porog_krupnogo_rashoda_140afa5")}:</span>{' '}
            {t("ui.esli_vklyucheno_podtverzhdenie_rashody_ot_etoy_summy_1017151")}
          </p>
          <p>
            <span className="font-medium text-slate-800">{t("ui.valyuta_otcheta_59de5ee")}:</span>{' '}
            {t("ui.ispolzuetsya_tolko_kak_valyuta_otobrazheniya_finanso_dd1a8f2")}
          </p>
        </div>

        <Button className="justify-self-start" disabled={mutation.isPending} type="submit">
          <Settings aria-hidden="true" className="size-4" />
          {t("ui.sohranit_4864057")}
        </Button>
      </form>
    </section>
  )
}

export function AdminFinanceComingSoonPage() {
  return (
    <section className="grid gap-5">
      <PageHeader description="Страница зарезервирована под следующий финансовый отчёт." title="Финансы" />
      <EmptyState description="Данные доступны в соседних разделах финансового блока." icon={Calculator} title="Раздел в подготовке" />
    </section>
  )
}
