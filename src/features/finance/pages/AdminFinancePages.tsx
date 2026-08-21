import {
  Banknote,
  Calculator,
  CalendarCheck,
  Edit3,
  Eye,
  HelpCircle,
  ListChecks,
  Loader2,
  ReceiptText,
  Repeat,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  FinancePaymentMethod,
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
  useFinanceDashboardSummary,
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
} from '../../orders/paymentsApi'
import {
  useRecurringExpenseMutations,
  useRecurringExpenses,
  type RecurringExpenseInput,
} from '../recurringExpensesApi'
import { usePlatformShareAccruals, usePlatformShareMutations } from '../platformShareApi'

const DEFAULT_START = monthStartDate()
const DEFAULT_END = todayDate()
const ALL_TIME_START = '1970-01-01'

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    value ?? 0,
  )
const percent = (value: number | null | undefined) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value ?? 0)}%`

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

const statusLabel: Record<string, string> = {
  planned: 'План',
  pending: 'Ожидает',
  paid: 'Оплачено',
  partial: 'Частично',
  cancelled: 'Отменено',
  submitted: 'На проверке',
  clarification_requested: 'Нужны уточнения',
  locked: 'Закрыт',
  rejected: 'Отклонён',
  approved: 'Одобрен',
  pending_approval: 'На проверке',
  partially_paid: 'Частично оплачено',
  overdue: 'Просрочено',
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
  { href: '/admin/finance/settings', label: 'Настройки', Icon: Settings },
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
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
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
    <div className="relative rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase text-slate-500">{t(label)}</p>
        {description ? (
          <div className="group relative">
            <button
              aria-label={t(`Как считается: ${label}`)}
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
      <p className="mt-2 text-xl font-semibold text-slate-950">{money(Number(value ?? 0))}</p>
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
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{t(label)}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      {description ? <p className="mt-2 text-sm leading-5 text-slate-600">{t(description)}</p> : null}
    </div>
  )
}

function StatGrid({
  cardPayment,
  showCardPayment = false,
  summary,
}: {
  cardPayment?: number | null
  showCardPayment?: boolean
  summary: FinancialPeriodSummary | null | undefined
}) {
  const items = [
    {
      label: 'Доход',
      value: summary?.revenue,
      description:
        'Все оплаченные и частично оплаченные доходы за текущий период по дате начисления: доходы из заказов и ручные доходы.',
    },
    {
      label: 'COGS',
      value: summary?.cogs,
      description:
        'Себестоимость проданного за текущий период: сумма snapshot-себестоимости товаров и компонентов комбо в оплаченных заказах.',
    },
    {
      label: 'Валовая прибыль',
      value: summary?.gross_profit,
      description:
        'Доход минус COGS. Показывает прибыль после себестоимости проданного, до операционных расходов.',
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
      description:
        'Валовая прибыль минус операционные расходы. Это прибыль до расчёта доли платформы.',
    },
    {
      label: 'Итого владельцу',
      value: summary?.organization_owner_amount,
      description:
        'Итоговая сумма для владельца после расчётов периода. Если чистая прибыль отрицательная, сумма тоже может быть отрицательной.',
    },
    showCardPayment
      ? {
          label: 'Оплата картой',
          value: cardPayment,
          description:
            'Сумма завершённых платежей по карте за текущий период. Считается напрямую из платежей, чтобы видеть безналичный оборот.',
        }
      : {
          label: 'Cash in',
          value: summary?.cash_inflow,
          description:
            'Фактически полученные деньги за текущий период по дате оплаты: оплаченные и частично оплаченные доходы.',
        },
    {
      label: 'Cash out',
      value: summary?.cash_outflow,
      description:
        'Фактически потраченные деньги за текущий период по дате оплаты: оплаченные расходы, закупки и платежи платформе.',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

function PaymentTrafficAnalytics({ organizationId }: { organizationId: string | null }) {
  const { t } = useI18n()
  const analytics = usePaymentTrafficAnalytics(organizationId)
  const points = analytics.data?.points ?? []
  const peakHour = analytics.data?.peakHour
  const peakMinute = analytics.data?.peakMinute
  const maxAmount = Math.max(...points.map((point) => point.amount), 0)

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{t('Финансовая аналитика')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t('Все завершённые платежи до сегодняшнего дня: распределение по 24 часам и шкала трафика от 1 до 10.')}
          </p>
        </div>
        <div className="grid gap-1 text-sm text-slate-700 sm:text-right">
          <span>
            {t('Час пик')}: {peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}
          </span>
          <span>
            {t('Самая частая минута')}: {peakMinute === null || peakMinute === undefined ? '—' : `:${String(peakMinute).padStart(2, '0')}`}
          </span>
        </div>
      </div>

      {analytics.isLoading ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {t('Загрузка аналитики...')}
        </div>
      ) : null}

      <div className="grid gap-2">
        {points.map((point) => {
          const amountWidth = maxAmount > 0 ? Math.max((point.amount / maxAmount) * 100, point.amount > 0 ? 4 : 0) : 0
          return (
            <div className="grid grid-cols-[3.5rem_1fr_7rem] items-center gap-3 text-sm" key={point.hour}>
              <span className="font-medium text-slate-700">{String(point.hour).padStart(2, '0')}:00</span>
              <div className="h-4 overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full rounded-sm bg-emerald-600"
                  style={{ width: `${amountWidth}%` }}
                />
              </div>
              <span className="text-right text-xs text-slate-600">
                {money(point.amount)} · {point.count} {t('оплат')} · {point.trafficScore}/10
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TransactionTable({
  onCancel,
  onEdit,
  onOpen,
  rows,
  type,
}: {
  onCancel?: (row: FinanceTransactionRow) => void
  onEdit?: (row: FinanceTransactionRow) => void
  onOpen?: (row: FinanceTransactionRow) => void
  rows: FinanceTransactionRow[] | undefined
  type: FinanceTransactionType | undefined
}) {
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
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Операция</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Метод</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              {type === 'expense' ? <th className="px-4 py-3 text-right">Действия</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.accrual_date}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{row.title}</p>
                  <p className="text-xs text-slate-500">{row.source_type}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {statusLabel[row.status] ?? row.status}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {row.payment_method ?? '—'}
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
  type,
  organizationId,
  userId,
}: {
  type: 'income' | 'expense'
  organizationId: string | null
  userId: string | undefined
}) {
  const categories = useFinanceCategories(organizationId, type)
  const incomeMutations = useIncomeMutations(organizationId)
  const expenseMutations = useExpenseMutations(organizationId)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const expenseIdempotencyKey = useRef(crypto.randomUUID())

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
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
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
                  {category.name}
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

function AdminFinanceShell({
  title,
  description,
  type,
}: {
  title: string
  description: string
  type?: FinanceTransactionType
}) {
  const { organizationId, user } = useAuth()
  const transactions = useFinanceTransactions(organizationId, type)
  const expenseMutations = useExpenseMutations(organizationId)
  const [selectedTransaction, setSelectedTransaction] = useState<FinanceTransactionRow | null>(null)
  const [transactionModalMode, setTransactionModalMode] = useState<ExpenseModalMode>('view')

  const openTransaction = (row: FinanceTransactionRow) => {
    setSelectedTransaction(row)
    setTransactionModalMode('view')
  }

  const editTransaction = (row: FinanceTransactionRow) => {
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
      <PageHeader title={title} description={description} />
      {type === 'income' || type === 'expense' ? (
        <MoneyForm organizationId={organizationId} type={type} userId={user?.id} />
      ) : null}
      <TransactionTable
        onCancel={cancelTransaction}
        onEdit={editTransaction}
        onOpen={openTransaction}
        rows={transactions.data}
        type={type}
      />
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

export function AdminFinancePage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const summary = useFinanceDashboardSummary(organizationId)
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const periodSummary = useFinancePeriodSummary(organizationId, currentCycle.start, DEFAULT_END)
  const paymentMethodSummary = usePaymentMethodSummary(organizationId, currentCycle.start, DEFAULT_END)
  const revenueBreakdown = useRevenueBreakdown(organizationId, ALL_TIME_START, DEFAULT_END)
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  return (
    <section className="grid gap-5">
      <PageHeader
        title="Финансы"
        description="Финансовый центр организации: доходы, расходы, P&L, движение денег и аналитика оплат."
      />
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
        {t('Текущий расчётный период')}: {currentCycle.start} - {DEFAULT_END}.{' '}
        {t('Карточки дохода, COGS, прибыли, оплаты картой и cash out считаются внутри этого периода.')}
      </div>
      <StatGrid
        cardPayment={paymentMethodSummary.data?.card ?? null}
        showCardPayment
        summary={periodSummary.data}
      />
      {revenueBreakdown.data ? (
        <section className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Выручка по направлениям (итого)</h3>
          <RevenueBreakdownGrid
            billiard={revenueBreakdown.data.billiard}
            goods={revenueBreakdown.data.goods}
            other={revenueBreakdown.data.other}
            playstation={revenueBreakdown.data.playstation}
            tables={revenueBreakdown.data.tables}
          />
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {financeLinks.map(({ href, label, Icon }) => (
          <Link
            className="flex min-h-16 items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
            key={href}
            to={buildAdminPath(href)}
          >
            <Icon aria-hidden="true" className="size-5 text-emerald-700" />
            {label}
          </Link>
        ))}
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          Ожидают подтверждения расходов: {summary.data?.pending_expense_approvals ?? 0}. Периоды на проверке: {summary.data?.periods_waiting_review ?? 0}.
        </p>
      </div>
      <PaymentTrafficAnalytics organizationId={organizationId} />
    </section>
  )
}

export function AdminFinanceIncomePage() {
  return (
    <AdminFinanceShell
      description="Автоматические доходы из оплаченных заказов и ручной доход организации."
      title="Доходы"
      type="income"
    />
  )
}

export function AdminFinanceExpensesPage() {
  return (
    <AdminFinanceShell
      description="Операционные расходы с учётом крупных расходов и approval workflow."
      title="Расходы"
      type="expense"
    />
  )
}

export function AdminFinancePurchasesPage() {
  return (
    <AdminFinanceShell
      description="Закупки из складских документов. Они влияют на cash flow, но не попадают в P&L как COGS."
      title="Закупки"
      type="purchase"
    />
  )
}

export function AdminFinanceCashFlowPage() {
  const { organizationId } = useAuth()
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const summary = useFinancePeriodSummary(organizationId, currentCycle.start, DEFAULT_END)
  return (
    <section className="grid gap-5">
      <PageHeader description="Движение денег по датам оплаты за текущий финансовый период." title="Cash flow" />
      <StatGrid summary={summary.data} />
    </section>
  )
}

export function AdminFinanceProfitLossPage() {
  const { organizationId } = useAuth()
  const settings = useFinanceSettings(organizationId)
  const currentCycle = getFinancialCycle(settings.data?.financial_month_close_day)
  const summary = useFinancePeriodSummary(organizationId, currentCycle.start, DEFAULT_END)
  return (
    <section className="grid gap-5">
      <PageHeader description="P&L по начислению: выручка, COGS по snapshots, расходы и чистая прибыль." title="P&L" />
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
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const periods = rows.data ?? []
  const visiblePeriods = periods.filter((period) => {
    if (periodFilter === 'active') return period.status !== 'cancelled'
    if (periodFilter === 'cancelled') return period.status === 'cancelled'
    return true
  })
  const totals = visiblePeriods.reduce(
    (result, period) => ({
      cogs: result.cogs + period.cogs,
      owner: result.owner + period.organization_owner_amount,
      platform: result.platform + period.platform_share_amount,
      profit: result.profit + period.net_profit_before_platform_share,
      revenue: result.revenue + period.revenue,
    }),
    { cogs: 0, owner: 0, platform: 0, profit: 0, revenue: 0 },
  )
  const mutationError =
    mutations.submit.error ?? mutations.update.error ?? mutations.cancel.error

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
        {t('Открыть')}
      </Link>
      <Button
        disabled={!canChangePeriod(period) || mutations.update.isPending}
        onClick={() => setEditingPeriod(period)}
        type="button"
        variant="secondary"
      >
        <Edit3 aria-hidden="true" className="size-4" />
        {t('Изменить')}
      </Button>
      <Button
        disabled={!canChangePeriod(period) || mutations.cancel.isPending}
        onClick={() => setCancellingPeriod(period)}
        type="button"
        variant="danger"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {t('Удалить')}
      </Button>
    </div>
  )

  return (
    <section className="grid gap-5">
      <PageHeader description={t('Закрытие финансовых периодов и отправка на проверку платформе.')} title={t('Финансовые периоды')} />

      {mutationError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {mutationError.message}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-slate-950">{t('Создать период')}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {t('Выберите даты, система пересчитает доходы, COGS, расходы, прибыль и отправит период на проверку.')}
          </p>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
          <Input defaultValue={DEFAULT_START} label={t('Начало')} name="period_start" required type="date" />
          <Input defaultValue={DEFAULT_END} label={t('Конец')} name="period_end" required type="date" />
          <Button disabled={mutations.submit.isPending} type="submit">
            <ListChecks aria-hidden="true" className="size-4" />
            {t('Отправить')}
          </Button>
        </form>
      </section>

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">{t('Список периодов')}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {t('Редактирование пересчитывает период. Удаление помечает период как удалённый, закрытые периоды остаются архивом.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={filterClassName('active')} onClick={() => setPeriodFilter('active')} type="button">{t('Активные')}</button>
            <button className={filterClassName('all')} onClick={() => setPeriodFilter('all')} type="button">{t('Все')}</button>
            <button className={filterClassName('cancelled')} onClick={() => setPeriodFilter('cancelled')} type="button">{t('Удалённые')}</button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          <MetricCard label="Доход" value={totals.revenue} />
          <MetricCard label="COGS" value={totals.cogs} />
          <MetricCard label="Чистая прибыль" value={totals.profit} />
          <MetricCard label="Доля платформы" value={totals.platform} />
          <MetricCard label="Итого владельцу" value={totals.owner} />
        </div>

        {rows.isLoading ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">{t('Периоды загружаются...')}</div>
        ) : null}

        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">{t('Период')}</th>
                <th className="px-3 py-3 font-medium">{t('Статус')}</th>
                <th className="px-3 py-3 font-medium">{t('Доход')}</th>
                <th className="px-3 py-3 font-medium">COGS</th>
                <th className="px-3 py-3 font-medium">{t('Прибыль')}</th>
                <th className="px-3 py-3 font-medium">{t('Доля')}</th>
                <th className="px-3 py-3 font-medium">{t('Владельцу')}</th>
                <th className="px-3 py-3 text-right font-medium">{t('Действия')}</th>
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
                  <td className="px-3 py-3">{money(period.platform_share_amount)}</td>
                  <td className="px-3 py-3">{money(period.organization_owner_amount)}</td>
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
                <div><dt className="text-xs uppercase text-slate-500">{t('Доход')}</dt><dd>{money(period.revenue)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">COGS</dt><dd>{money(period.cogs)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">{t('Доля')}</dt><dd>{money(period.platform_share_amount)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">{t('Владельцу')}</dt><dd>{money(period.organization_owner_amount)}</dd></div>
              </dl>
              {periodActions(period)}
            </article>
          ))}
        </div>

        {!rows.isLoading && !visiblePeriods.length ? (
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-sm text-slate-500">
            {t('Периодов в этом фильтре нет.')}
          </div>
        ) : null}
      </section>

      {editingPeriod ? (
        <Modal onClose={() => setEditingPeriod(null)}>
          <form className="grid w-full max-w-lg gap-4 rounded-lg bg-white p-5 shadow-xl" onSubmit={handleEditSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t('Изменить период')}</h3>
                <p className="mt-1 text-sm text-slate-600">{t('После сохранения суммы будут пересчитаны по новым датам.')}</p>
              </div>
              <Button className="px-2" onClick={() => setEditingPeriod(null)} type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input defaultValue={editingPeriod.period_start} label={t('Начало')} name="period_start" required type="date" />
              <Input defaultValue={editingPeriod.period_end} label={t('Конец')} name="period_end" required type="date" />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditingPeriod(null)} type="button" variant="secondary">{t('Отмена')}</Button>
              <Button disabled={mutations.update.isPending} type="submit">
                <Save aria-hidden="true" className="size-4" />
                {t('Сохранить')}
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
                <h3 className="text-lg font-semibold text-slate-950">{t('Удалить период')}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t('Период будет помечен как удалённый. Физически финансовые записи не удаляются.')}
                </p>
              </div>
              <Button className="px-2" onClick={() => setCancellingPeriod(null)} type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <Input label={t('Комментарий')} name="comment" placeholder={t('Например: неверные даты периода')} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCancellingPeriod(null)} type="button" variant="secondary">{t('Отмена')}</Button>
              <Button disabled={mutations.cancel.isPending} type="submit" variant="danger">
                <Trash2 aria-hidden="true" className="size-4" />
                {t('Удалить')}
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
      <PageHeader description="Детальный финансовый период и расчёт доли Freedom Platform." title="Финансовый период" />
      {period.data ? <StatGrid summary={period.data} /> : null}
    </section>
  )
}

export function AdminFinancePlatformSharePage() {
  const { organizationId } = useAuth()
  const rows = usePlatformShareAccruals(organizationId)
  const mutations = usePlatformShareMutations(organizationId)

  const handleSubmit = (event: FormEvent<HTMLFormElement>, accrualId: string) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutations.reportPayment.mutate({
      accrualId,
      amount: Number(form.get('amount') ?? 0),
      paymentMethod: String(form.get('payment_method') || 'bank_transfer') as FinancePaymentMethod,
      paymentDate: String(form.get('payment_date') || DEFAULT_END),
      reference: String(form.get('reference') || '') || null,
    })
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Начисления и платежи доли Freedom Platform." title="Доля платформы" />
      {rows.data?.map((row) => (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4" key={row.id}>
          <p className="font-medium text-slate-950">{money(row.accrued_amount)} · оплачено {money(row.paid_amount)} · {statusLabel[row.status] ?? row.status}</p>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => handleSubmit(event, row.id)}>
            <Input label="Сумма" max={row.outstanding_amount} min="0.01" name="amount" step="0.01" type="number" />
            <Input defaultValue={DEFAULT_END} label="Дата" name="payment_date" type="date" />
            <Input label="Reference" name="reference" />
            <input name="payment_method" type="hidden" value="bank_transfer" />
            <Button disabled={row.outstanding_amount <= 0 || mutations.reportPayment.isPending} type="submit">Сообщить об оплате</Button>
          </form>
        </div>
      ))}
    </section>
  )
}

export function AdminFinanceSettingsPage() {
  const { organizationId, role } = useAuth()
  const { t } = useI18n()
  const settings = useFinanceSettings(organizationId)
  const mutation = useFinanceSettingsMutation(organizationId)
  const isPlatformOwner = role === 'platform_owner'
  const closeDay = settings.data?.financial_month_close_day ?? 15
  const reportingCurrency = settings.data?.reporting_currency_code || 'AZN'
  const platformSharePercentage = settings.data?.default_platform_share_percentage ?? 0
  const ownerSharePercentage = Math.max(0, 100 - platformSharePercentage)
  const platformPaymentDueDays = settings.data?.platform_share_payment_due_days ?? 10
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

    mutation.mutate(
      isPlatformOwner
        ? {
            ...input,
            default_platform_share_percentage: Number(form.get('default_platform_share_percentage') ?? 0) || 0,
            platform_share_payment_due_days: Number(form.get('platform_share_payment_due_days') ?? 0) || 10,
          }
        : input,
    )
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        description={t('Финансовые настройки организации. Долю платформы меняет только владелец платформы.')}
        title={t('Настройки финансов')}
      />

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-slate-950">{t('Текущие правила расчёта')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t('Эти показатели показывают, как сейчас делится чистая прибыль и какой финансовый цикл используется для периодов.')}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            description="Процент, который будет начислен Freedom Platform после утверждения финансового периода."
            label="Доля платформы"
            value={percent(platformSharePercentage)}
          />
          <InfoCard
            description="Оставшаяся часть чистой прибыли после доли платформы."
            label="Доля владельца"
            value={percent(ownerSharePercentage)}
          />
          <InfoCard
            description="Если день 15, текущий период идёт с 15-го числа до 14-го числа следующего месяца."
            label="Текущий финансовый период"
            value={`${cycle.start} - ${cycle.end}`}
          />
          <InfoCard
            description="После закрытия периода долю платформы нужно оплатить в течение этого количества дней."
            label="Срок оплаты доли платформы"
            value={`${platformPaymentDueDays} ${t('дней')}`}
          />
        </div>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          {t('Следующее закрытие финансового месяца')}: {cycle.nextClose}.{' '}
          {t('Проверьте, что все смены закрыты, расходы внесены, а спорные оплаты исправлены до отправки периода.')}
        </p>
      </section>

      <form className="grid gap-4 rounded-md border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
        <div>
          <h3 className="font-semibold text-slate-950">{t('Рабочие настройки организации')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t('Эти параметры влияют на отчёты, создание периодов и проверку крупных расходов.')}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            defaultValue={settings.data?.large_expense_threshold ?? ''}
            label={t('Порог крупного расхода')}
            min="0"
            name="large_expense_threshold"
            placeholder="Например: 100"
            step="0.01"
            type="number"
          />
          <Input
            defaultValue={reportingCurrency}
            label={t('Валюта отчёта')}
            maxLength={3}
            name="reporting_currency_code"
            placeholder="AZN"
          />
          <Input
            defaultValue={closeDay}
            label={t('День закрытия месяца')}
            max="28"
            min="1"
            name="financial_month_close_day"
            type="number"
          />
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
            <input defaultChecked={settings.data?.require_large_expense_approval ?? false} name="require_large_expense_approval" type="checkbox" />
            {t('Требовать подтверждение крупных расходов')}
          </label>
        </div>

        <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">{t('Настройки владельца платформы')}</h4>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {isPlatformOwner
                ? t('Вы можете изменить долю платформы для этой организации.')
                : t('Эти значения назначает только владелец платформы.')}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              defaultValue={platformSharePercentage}
              disabled={!isPlatformOwner}
              label={t('Доля платформы, %')}
              max="100"
              min="0"
              name="default_platform_share_percentage"
              step="0.01"
              type="number"
            />
            <Input
              defaultValue={platformPaymentDueDays}
              disabled={!isPlatformOwner}
              label={t('Срок оплаты доли платформы, дней')}
              min="0"
              name="platform_share_payment_due_days"
              type="number"
            />
          </div>
        </div>

        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <p>
            <span className="font-medium text-slate-800">{t('День закрытия месяца')}:</span>{' '}
            {t('для The Liga сейчас логично держать 15, потому что организация начала работу 15 августа.')}
          </p>
          <p>
            <span className="font-medium text-slate-800">{t('Порог крупного расхода')}:</span>{' '}
            {t('если включено подтверждение, расходы от этой суммы будут попадать на проверку перед закрытием периода.')}
          </p>
          <p>
            <span className="font-medium text-slate-800">{t('Валюта отчёта')}:</span>{' '}
            {t('используется только как валюта отображения финансовых отчётов.')}
          </p>
        </div>

        <Button className="justify-self-start" disabled={mutation.isPending} type="submit">
          <Settings aria-hidden="true" className="size-4" />
          {t('Сохранить')}
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
