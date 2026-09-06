import { getCurrentLocale } from '../../../lib/i18n/translator'
import { ArrowLeft, Banknote, Calculator, ChevronDown, Clock3, CreditCard, GripHorizontal, Loader2, ReceiptText, Timer, Trash2, X } from 'lucide-react'
import type { ComponentType, CSSProperties, PointerEvent } from 'react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { OrderRow, PaymentMethod, PaymentStatus, TimedSessionStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { shiftStatusLabel, useAdminShiftDetail, useAdminShiftMutations } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const formatFormulaNumber = (value: number | null | undefined) => {
  const normalizedValue = Number(value ?? 0)
  if (!Number.isFinite(normalizedValue)) return '0'
  return String(Number(normalizedValue.toFixed(2)))
}

const evaluateExpression = (expression: string) => {
  const normalizedExpression = expression.replaceAll(',', '.').replaceAll('×', '*').replaceAll('÷', '/').trim()
  if (!normalizedExpression) return null
  if (!/^[\d+\-*/().\s]+$/.test(normalizedExpression)) return null

  const tokens = normalizedExpression.match(/\d*\.?\d+|[+\-*/()]/g)
  if (!tokens?.length) return null

  const values: number[] = []
  const operators: string[] = []
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const applyOperator = () => {
    const operator = operators.pop()
    const right = values.pop()
    const left = values.pop()
    if (!operator || left == null || right == null) return false

    if (operator === '+') values.push(left + right)
    if (operator === '-') values.push(left - right)
    if (operator === '*') values.push(left * right)
    if (operator === '/') values.push(left / right)
    return true
  }

  let previousToken: string | null = null
  for (const token of tokens) {
    if (/^\d/.test(token) || token.startsWith('.')) {
      values.push(Number(token))
    } else if (token === '(') {
      operators.push(token)
    } else if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') {
        if (!applyOperator()) return null
      }
      if (operators.pop() !== '(') return null
    } else {
      if (token === '-' && (!previousToken || ['+', '-', '*', '/', '('].includes(previousToken))) {
        values.push(0)
      }
      const tokenPrecedence = precedence[token] ?? 0
      let topOperator = operators.at(-1)
      while (topOperator && topOperator !== '(' && (precedence[topOperator] ?? 0) >= tokenPrecedence) {
        if (!applyOperator()) return null
        topOperator = operators.at(-1)
      }
      operators.push(token)
    }
    previousToken = token
  }

  while (operators.length) {
    if (operators.at(-1) === '(') return null
    if (!applyOperator()) return null
  }

  const result = values.length === 1 ? values[0] : null
  return result != null && Number.isFinite(result) ? result : null
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

const formatDuration = (startedAt: string | null | undefined, endedAt: string | null | undefined, t: (key: string, options?: Record<string, unknown>) => string) => {
  if (!startedAt) return '-'
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours
    ? t('common.durationHoursMinutes', { hours, minutes })
    : t('common.durationMinutes', { minutes })
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

type OrderSortKey = 'order_number' | 'opened_at' | 'closed_at'

const orderSortOptions: Array<{ key: OrderSortKey; label: string }> = [
  { key: 'order_number', label: 'Номер' },
  { key: 'opened_at', label: 'Открытие' },
  { key: 'closed_at', label: 'Закрытие' },
]

type StatCardProps = {
  icon?: ComponentType<{ className?: string }>
  label: string
  tone?: 'default' | 'danger' | 'success' | 'warning'
  value: string | number
}

type CalculatorValue = {
  label: string
  value: number
}

type FormulaPreset = {
  expression: string
  label: string
}

type ShiftCalculatorProps = {
  onClose: () => void
  presets: FormulaPreset[]
  values: CalculatorValue[]
}

function ShiftCalculator({ onClose, presets, values }: ShiftCalculatorProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [expression, setExpression] = useState('')
  const [position, setPosition] = useState({ x: 96, y: 96 })
  const [isValuesOpen, setIsValuesOpen] = useState(false)
  const [isPresetsOpen, setIsPresetsOpen] = useState(false)
  const result = evaluateExpression(expression)

  const appendValue = (value: number) => {
    const nextValue = formatFormulaNumber(value)
    setExpression((current) => (current.trim() ? `${current} + ${nextValue}` : nextValue))
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    const panelWidth = panelRef.current?.offsetWidth ?? 360
    const panelHeight = panelRef.current?.offsetHeight ?? 420
    const maxX = Math.max(12, window.innerWidth - panelWidth - 12)
    const maxY = Math.max(12, window.innerHeight - panelHeight - 12)
    setPosition({
      x: Math.min(maxX, Math.max(12, event.clientX - dragOffsetRef.current.x)),
      y: Math.min(maxY, Math.max(12, event.clientY - dragOffsetRef.current.y)),
    })
  }

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className={cn(
        'fixed z-50 grid border border-slate-200 bg-white shadow-2xl',
        'inset-0 h-[100svh] w-screen grid-rows-[auto_minmax(0,1fr)] rounded-none',
        'md:inset-auto md:left-[var(--calculator-left)] md:top-[var(--calculator-top)] md:h-[min(76svh,620px)] md:w-[min(calc(100vw-1.5rem),390px)] md:resize-y md:overflow-auto md:rounded-lg',
      )}
      ref={panelRef}
      style={
        {
          '--calculator-left': `${position.x}px`,
          '--calculator-top': `${position.y}px`,
        } as CSSProperties
      }
    >
      <div
        className="flex cursor-grab touch-none items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 active:cursor-grabbing md:rounded-t-lg"
        onPointerCancel={stopDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripHorizontal className="size-4 shrink-0 text-slate-400" />
          <Calculator className="size-4 shrink-0 text-emerald-700" />
          <p className="truncate text-sm font-semibold text-slate-950">{t("ui.kalkulyator_smeny_04fe4ae")}</p>
        </div>
        <button
          aria-label={t("ui.zakryt_4ae50d3")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid content-start gap-3 overflow-y-auto p-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium uppercase text-slate-500" htmlFor="shift_calculator_expression">
            {t("ui.vyrazhenie_956b6fe")}
          </label>
          <input
            className="min-h-11 rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            id="shift_calculator_expression"
            onChange={(event) => setExpression(event.target.value)}
            placeholder="52 + 125,9 - 177,9"
            value={expression}
          />
        </div>

        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-medium uppercase text-emerald-800">{t("ui.rezultat_9fa227c")}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{result == null ? '-' : formatMoney(result)}</p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {['+', '-', '×', '÷', '(', ')'].map((operator) => (
            <button
              className="min-h-9 rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              key={operator}
              onClick={() => setExpression((current) => `${current}${current ? ' ' : ''}${operator} `)}
              type="button"
            >
              {operator}
            </button>
          ))}
          <button
            className="min-h-9 rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setExpression((current) => current.slice(0, -1))}
            type="button"
          >
            ←
          </button>
          <button
            className="min-h-9 rounded-md border border-red-100 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"
            onClick={() => setExpression('')}
            type="button"
          >
            {t("ui.ochistit_98b2073")}
          </button>
        </div>

        <div className="grid gap-2 rounded-md border border-slate-200 bg-white">
          <button
            className="flex min-h-11 items-center justify-between gap-3 px-3 text-left text-xs font-medium uppercase text-slate-500 hover:bg-slate-50"
            onClick={() => setIsValuesOpen((current) => !current)}
            type="button"
          >
            <span>{t("ui.bystrye_summy_smeny_9067002")}</span>
            <ChevronDown className={cn('size-4 transition-transform', isValuesOpen && 'rotate-180')} />
          </button>
          {isValuesOpen ? (
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2">
              {values.map((item) => (
                <button
                  className="rounded-md border border-slate-200 bg-white p-2 text-left text-xs hover:border-emerald-200 hover:bg-emerald-50"
                  key={item.label}
                  onClick={() => appendValue(item.value)}
                  type="button"
                >
                  <span className="block font-medium text-slate-600">{t(item.label)}</span>
                  <span className="mt-1 block text-sm font-semibold text-slate-950">{formatMoney(item.value)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 rounded-md border border-slate-200 bg-white">
          <button
            className="flex min-h-11 items-center justify-between gap-3 px-3 text-left text-xs font-medium uppercase text-slate-500 hover:bg-slate-50"
            onClick={() => setIsPresetsOpen((current) => !current)}
            type="button"
          >
            <span>{t("ui.gotovye_formuly_670ef73")}</span>
            <ChevronDown className={cn('size-4 transition-transform', isPresetsOpen && 'rotate-180')} />
          </button>
          {isPresetsOpen ? (
            <div className="grid gap-2 border-t border-slate-100 p-2">
              {presets.map((preset) => (
                <button
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:border-emerald-200 hover:bg-emerald-50"
                  key={preset.label}
                  onClick={() => setExpression(preset.expression)}
                  type="button"
                >
                  <span className="block font-semibold text-slate-800">{t(preset.label)}</span>
                  <span className="mt-1 block font-mono text-[11px] text-slate-500">{preset.expression}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
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

const dateSortValue = (value: string | null | undefined) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY)

function sortOrders(orders: OrderRow[], sortKey: OrderSortKey) {
  return [...orders].sort((left, right) => {
    if (sortKey === 'order_number') {
      return left.order_number - right.order_number
    }

    const leftTime = dateSortValue(sortKey === 'closed_at' ? left.closed_at ?? left.opened_at : left.opened_at)
    const rightTime = dateSortValue(sortKey === 'closed_at' ? right.closed_at ?? right.opened_at : right.opened_at)

    if (leftTime !== rightTime) return leftTime - rightTime
    return left.order_number - right.order_number
  })
}

export function AdminShiftDetailPage() {
  const { currentOrganization, organizationId, role } = useAuth()
  const { t } = useI18n()
  const { shiftId } = useParams()
  const navigate = useNavigate()
  const detailQuery = useAdminShiftDetail(shiftId ?? null)
  const mutations = useAdminShiftMutations(organizationId)
  const [orderSort, setOrderSort] = useState<OrderSortKey>('closed_at')
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const isPlatformOwner = role === 'platform_owner'
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  if (detailQuery.isLoading) {
    return (
      <div className="text-sm text-slate-600">
        <Loader2 className="mr-2 inline size-4 animate-spin" /> {t("ui.zagruzka_smeny_f8b9449")}
      </div>
    )
  }

  if (!detailQuery.data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t("ui.smena_ne_naydena_40da5b6")}</div>
  }

  const { handovers, orders, payments, sessions, shift } = detailQuery.data
  const employeeName = shift.employee_full_name ?? shift.employee_email ?? t("ui.bez_imeni_cdf641f")
  const paidOrders = orders.filter((order) => order.status === 'paid')
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled')
  const openOrders = orders.filter((order) => order.status === 'open' || order.status === 'waiting_payment')
  const sortedOrders = sortOrders(orders as OrderRow[], orderSort)
  const completedPayments = payments.filter((payment) => payment.status === 'completed')
  const completedPaymentsTotal = completedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const completedCashPaymentsTotal = completedPayments
    .filter((payment) => payment.method === 'cash')
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const completedCardPaymentsTotal = completedPayments
    .filter((payment) => payment.method === 'card_transfer')
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const paidOrdersTotal = paidOrders.reduce((sum, order) => sum + (order.total_amount ?? 0), 0)
  const variance = shift.cash_variance ?? 0
  const closingComment = shift.closing_comment ?? shift.cash_variance_comment
  const hasClosingNotes = Boolean(closingComment || shift.force_close_reason)
  const calculatorValues: CalculatorValue[] = [
    { label: 'Начальная касса', value: shift.opening_cash_amount ?? 0 },
    { label: 'Наличные продажи', value: shift.cash_sales_total ?? 0 },
    { label: 'Переводы на карту', value: shift.card_transfer_sales_total ?? 0 },
    { label: 'Ожидаемая касса', value: shift.expected_cash_amount ?? 0 },
    { label: 'Фактическая касса', value: shift.actual_cash_amount ?? 0 },
    { label: 'Оплаченные заказы', value: shift.paid_orders_total ?? paidOrdersTotal },
    { label: 'Оплаты наличными', value: completedCashPaymentsTotal },
    { label: 'Оплаты картой', value: completedCardPaymentsTotal },
  ]
  const calculatorPresets: FormulaPreset[] = [
    {
      label: 'Начальная касса + наличные продажи',
      expression: `${formatFormulaNumber(shift.opening_cash_amount)} + ${formatFormulaNumber(shift.cash_sales_total)}`,
    },
    {
      label: 'Фактическая касса - ожидаемая касса',
      expression: `${formatFormulaNumber(shift.actual_cash_amount)} - ${formatFormulaNumber(shift.expected_cash_amount)}`,
    },
    {
      label: 'Наличные продажи + переводы на карту',
      expression: `${formatFormulaNumber(shift.cash_sales_total)} + ${formatFormulaNumber(shift.card_transfer_sales_total)}`,
    },
    {
      label: 'Сумма заказов - сумма оплат',
      expression: `${formatFormulaNumber(shift.paid_orders_total ?? paidOrdersTotal)} - ${formatFormulaNumber(completedPaymentsTotal)}`,
    },
  ]

  const forceClose = () => {
    const reason = window.prompt(t("ui.prichina_force_close_9767237"))
    if (!reason) return
    const actualCashText = window.prompt(t("ui.fakticheskaya_nalichnost_96d0708"), String(shift.expected_cash_amount ?? 0))
    mutations.forceClose.mutate({
      shiftId: shift.id,
      actualCashAmount: actualCashText ? Number(actualCashText) : null,
      reason,
    })
  }

  const deleteShift = () => {
    const confirmation = window.confirm(
      t("ui.udalit_smenu_navsegda_vse_zakazy_oplaty_dohody_i_skl_3b17f71"),
    )
    if (!confirmation) return

    const comment = window.prompt(t("ui.kommentariy_udaleniya_smeny_0215ab5"), t("ui.udaleno_vladeltsem_platformy_46b956e"))
    mutations.deleteShift.mutate(
      { shiftId: shift.id, comment },
      { onSuccess: () => navigate(buildAdminPath('/admin/shifts')) },
    )
  }

  return (
    <section className="grid gap-5">
      <div>
        <Button type="button" variant="secondary">
          <Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/shifts')}>
            <ArrowLeft className="size-4" /> {t("ui.nazad_f6dab07")}
          </Link>
        </Button>
      </div>

      <header className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">{t("ui.detali_smeny_82faaf9")}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">{employeeName}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {currentOrganization?.name ?? t("ui.organizatsiya_48b493a")} · {shift.business_date} · {shift.shift_template_name ?? t("ui.bez_shablona_2e1a5ce")}
            </p>
          </div>
          <span className={statusTone(shift.status)}>{t(shiftStatusLabel[shift.status])}</span>
        </div>

        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="font-medium text-slate-950">{t("ui.otkryta_87c42ed")}:</span> {formatDateTime(shift.opened_at)}</div>
          <div><span className="font-medium text-slate-950">{t("ui.zakryta_6d2717e")}:</span> {formatDateTime(shift.closed_at)}</div>
          <div><span className="font-medium text-slate-950">{t("ui.dlitelnost_d4168ac")}:</span> {formatDuration(shift.opened_at, shift.closed_at, t)}</div>
          <div><span className="font-medium text-slate-950">{t("ui.operatsionnyy_den_70810bd")}:</span> {shift.business_date}</div>
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={forceClose} type="button" variant="danger">{t("ui.zakryt_adminom_7af46ab")}</Button>
          {isPlatformOwner ? (
            <Button disabled={mutations.deleteShift.isPending} onClick={deleteShift} type="button" variant="danger">
              <Trash2 className="size-4" /> {t("ui.udalit_smenu_845b7fc")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isPlatformOwner && shift.status !== 'open' ? (
        <div>
          <Button disabled={mutations.deleteShift.isPending} onClick={deleteShift} type="button" variant="danger">
            <Trash2 className="size-4" /> {t("ui.udalit_smenu_845b7fc")}
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.raschet_kassy_cb6a614")}</h3>
          <Button
            className="min-h-9 px-3"
            onClick={() => setIsCalculatorOpen((current) => !current)}
            type="button"
            variant="secondary"
          >
            <Calculator className="size-4" /> {t("ui.kalkulyator_a808a0a")}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase text-slate-500">{t("ui.ozhidaemaya_kassa_0adb6d8")}</p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {formatMoney(shift.opening_cash_amount)} + {formatMoney(shift.cash_sales_total)} ={' '}
              <span className="font-semibold text-slate-950">{formatMoney(shift.expected_cash_amount)}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("ui.nachalnaya_kassa_plyus_zavershennye_nalichnye_oplaty_b932ba5")}
            </p>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase text-slate-500">{t("ui.rashozhdenie_114114d")}</p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {formatMoney(shift.actual_cash_amount)} - {formatMoney(shift.expected_cash_amount)} ={' '}
              <span className={cn('font-semibold', Math.abs(variance) > 0.009 ? 'text-red-700' : 'text-emerald-700')}>
                {formatMoney(variance)}
              </span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("ui.fakticheskaya_kassa_eto_realnye_nalichnye_v_kasse_pr_f7a526a")}
            </p>
          </div>
        </div>
      </section>

      {isCalculatorOpen ? (
        <ShiftCalculator
          onClose={() => setIsCalculatorOpen(false)}
          presets={calculatorPresets}
          values={calculatorValues}
        />
      ) : null}

      {hasClosingNotes ? (
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.kommentarii_zakrytiya_d940899")}</h3>
          <div className="grid gap-2">
            {closingComment ? (
              <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
                <p className="text-xs font-medium uppercase text-slate-500">{t("ui.kommentariy_zakrytiya_aa1a703")}</p>
                <p className="mt-1 text-slate-700">{closingComment}</p>
              </div>
            ) : null}
            {shift.force_close_reason ? (
              <div className="rounded-md border border-red-100 bg-red-50/60 p-3 text-sm">
                <p className="text-xs font-medium uppercase text-red-700">{t("ui.prichina_zakrytiya_adminom_d102a69")}</p>
                <p className="mt-1 text-slate-700">{shift.force_close_reason}</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <ReceiptText aria-hidden="true" className="size-5 text-emerald-700" />
              {t("ui.zakazy_22ac845")}
            </h3>
            <span className="text-sm font-medium text-slate-500">
              {orders.length} · {t("ui.otkrytye_75bcc80")}: {openOrders.length} · {t("ui.otmeneno_5ebee19")}: {cancelledOrders.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase text-slate-500">{t("ui.sortirovka_ed03011")}</span>
            {orderSortOptions.map((option) => (
              <button
                className={cn(
                  'min-h-9 rounded-md border px-3 text-sm font-medium transition-colors',
                  orderSort === option.key
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
                key={option.key}
                onClick={() => setOrderSort(option.key)}
                type="button"
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">{t("ui.nomer_zakaza_a054d51")}</th>
                  <th className="py-2 pr-3">{t("ui.mesto_8e2fe02")}</th>
                  <th className="py-2 pr-3">{t("ui.status_f7f293b")}</th>
                  <th className="py-2 pr-3">{t("ui.otkryt_3568fc6")}</th>
                  <th className="py-2 pr-3">{t("ui.zakryt_oplachen_38607fc")}</th>
                  <th className="py-2 text-right">{t("ui.summa_99d7408")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-2 pr-3 font-semibold text-slate-950">#{order.order_number}</td>
                    <td className="py-2 pr-3 text-slate-600">{order.current_place_name_snapshot ?? t("ui.bez_mesta_da3a88d")}</td>
                    <td className="py-2 pr-3"><span className={statusTone(order.status)}>{t(orderStatusLabel[order.status] ?? order.status)}</span></td>
                    <td className="py-2 pr-3 text-slate-600">{formatDateTime(order.opened_at)}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatDateTime(order.closed_at)}</td>
                    <td className="py-2 text-right font-semibold text-slate-950">{formatMoney(order.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t("ui.zakazov_net_5ddb25e")}</div>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <CreditCard aria-hidden="true" className="size-5 text-emerald-700" />
              {t("ui.platezhi_c0964ef")}
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
            {!payments.length ? <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t("ui.platezhey_net_4215b31")}</div> : null}
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Timer aria-hidden="true" className="size-5 text-emerald-700" />
              {t("ui.sessii_477192f")}
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
                  <div><span className="text-slate-500">{t("ui.fakt_2b974e8")}</span><p className="font-semibold text-slate-950">{session.actual_minutes ?? '-'} {t("ui.min_d6035dc")}</p></div>
                  <div><span className="text-slate-500">{t("ui.k_oplate_1f9971f")}</span><p className="font-semibold text-slate-950">{session.billable_minutes ?? '-'} {t("ui.min_d6035dc")}</p></div>
                  <div><span className="text-slate-500">{t("ui.summa_99d7408")}</span><p className="font-semibold text-slate-950">{formatMoney(session.calculated_amount)}</p></div>
                </div>
              </article>
            ))}
            {!sessions.length ? <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t("ui.sessiy_net_381f79b")}</div> : null}
          </div>
        </section>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Clock3 aria-hidden="true" className="size-5 text-emerald-700" />
            {t("ui.peredachi_98aeaac")}
          </h3>
          <span className="text-sm font-medium text-slate-500">{handovers.length}</span>
        </div>
        {handovers.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {handovers.map((handover) => (
              <article className="rounded-md border border-slate-200 p-3 text-sm" key={handover.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{t("ui.peredacha_smeny_597f062")}</p>
                  <span className={statusTone(handover.status)}>{handover.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>{t("ui.zakazy_22ac845")}: <span className="font-semibold text-slate-950">{handover.opening_orders_count}</span></div>
                  <div>{t("ui.sessii_477192f")}: <span className="font-semibold text-slate-950">{handover.active_sessions_count}</span></div>
                  <div>{t("ui.ozhidaemaya_kassa_0adb6d8")}: <span className="font-semibold text-slate-950">{formatMoney(handover.expected_cash_handover)}</span></div>
                  <div>{t("ui.fakticheskaya_kassa_0eb693e")}: <span className="font-semibold text-slate-950">{formatMoney(handover.actual_cash_handover)}</span></div>
                </div>
                {handover.comment ? <p className="mt-2 text-xs text-slate-500">{handover.comment}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{t("ui.peredach_net_90026bd")}</div>
        )}
      </section>
    </section>
  )
}
