import {
  Banknote,
  Calculator,
  CalendarCheck,
  Edit3,
  Eye,
  Landmark,
  ListChecks,
  Loader2,
  ReceiptText,
  Repeat,
  Save,
  Settings,
  Trash2,
  WalletCards,
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
import type {
  FinancePaymentMethod,
  FinanceTransactionRow,
  FinanceTransactionType,
  FinancialPeriodSummary,
} from '../../../lib/supabase/database.types'
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
  useRecurringExpenseMutations,
  useRecurringExpenses,
  type RecurringExpenseInput,
} from '../recurringExpensesApi'
import { usePlatformShareAccruals, usePlatformShareMutations } from '../platformShareApi'

const DEFAULT_START = monthStartDate()
const DEFAULT_END = todayDate()

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
    value ?? 0,
  )

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

const methodOptions: { value: FinancePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'card_transfer', label: 'Перевод на карту' },
  { value: 'bank_transfer', label: 'Банк' },
  { value: 'other', label: 'Другое' },
]

const financeLinks: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/admin/finance/income', label: 'Доходы', Icon: Banknote },
  { href: '/admin/finance/expenses', label: 'Расходы', Icon: ReceiptText },
  { href: '/admin/finance/purchases', label: 'Закупки', Icon: WalletCards },
  { href: '/admin/finance/periods', label: 'Периоды', Icon: CalendarCheck },
  { href: '/admin/finance/platform-share', label: 'Доля платформы', Icon: Landmark },
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

function StatGrid({ summary }: { summary: FinancialPeriodSummary | null | undefined }) {
  const items = [
    ['Доход', summary?.revenue],
    ['COGS', summary?.cogs],
    ['Валовая прибыль', summary?.gross_profit],
    ['Опер. расходы', summary?.operating_expenses],
    ['Чистая прибыль', summary?.net_profit_before_platform_share],
    ['Доля платформы', summary?.platform_share_amount],
    ['Cash in', summary?.cash_inflow],
    ['Cash out', summary?.cash_outflow],
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div className="rounded-md border border-slate-200 bg-white p-4" key={label}>
          <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{money(Number(value ?? 0))}</p>
        </div>
      ))}
    </div>
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
  const summary = useFinanceDashboardSummary(organizationId)
  const periodSummary = useFinancePeriodSummary(organizationId, DEFAULT_START, DEFAULT_END)
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  return (
    <section className="grid gap-5">
      <PageHeader
        title="Финансы"
        description="Финансовый центр организации: доходы, расходы, закупки, cash flow, P&L и доля Freedom Platform."
      />
      <StatGrid summary={periodSummary.data} />
      {summary.data ? (
        <section className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Выручка по площадкам (итого)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Playstation</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{money(summary.data.playstation_revenue)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Billiard</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{money(summary.data.billiard_revenue)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Tables</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{money(summary.data.table_revenue)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Goods</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{money(summary.data.goods_revenue)}</p>
            </div>
          </div>
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
  const summary = useFinancePeriodSummary(organizationId, DEFAULT_START, DEFAULT_END)
  return (
    <section className="grid gap-5">
      <PageHeader description="Движение денег по датам оплаты за текущий месяц." title="Cash flow" />
      <StatGrid summary={summary.data} />
    </section>
  )
}

export function AdminFinanceProfitLossPage() {
  const { organizationId } = useAuth()
  const summary = useFinancePeriodSummary(organizationId, DEFAULT_START, DEFAULT_END)
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
  const rows = useFinancialPeriods(organizationId)
  const mutations = useFinancialPeriodMutations(organizationId)
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutations.submit.mutate({
      periodStart: String(form.get('period_start') || DEFAULT_START),
      periodEnd: String(form.get('period_end') || DEFAULT_END),
    })
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Закрытие финансовых периодов и отправка на проверку платформе." title="Финансовые периоды" />
      <form className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <Input defaultValue={DEFAULT_START} label="Начало" name="period_start" type="date" />
        <Input defaultValue={DEFAULT_END} label="Конец" name="period_end" type="date" />
        <Button disabled={mutations.submit.isPending} type="submit">
          <ListChecks aria-hidden="true" className="size-4" />
          Отправить
        </Button>
      </form>
      <div className="grid gap-2">
        {rows.data?.map((row) => (
          <Link className="rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50" key={row.id} to={buildAdminPath(`/admin/finance/periods/${row.id}`)}>
            <p className="font-medium text-slate-950">{row.period_start} - {row.period_end}</p>
            <p className="text-sm text-slate-600">{statusLabel[row.status] ?? row.status} · прибыль {money(row.net_profit_before_platform_share)} · доля {money(row.platform_share_amount)}</p>
          </Link>
        ))}
      </div>
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
  const { organizationId } = useAuth()
  const settings = useFinanceSettings(organizationId)
  const mutation = useFinanceSettingsMutation(organizationId)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate({
      large_expense_threshold: Number(form.get('large_expense_threshold') ?? 0) || null,
      require_large_expense_approval: form.get('require_large_expense_approval') === 'on',
      reporting_currency_code: String(form.get('reporting_currency_code') || '') || null,
      financial_month_close_day: Number(form.get('financial_month_close_day') ?? 0) || null,
    })
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Финансовые настройки организации. Долю платформы меняет только владелец платформы." title="Настройки финансов" />
      <form className="grid gap-3 rounded-md border border-slate-200 bg-white p-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 md:grid-cols-2">
          <Input defaultValue={settings.data?.large_expense_threshold ?? ''} label="Порог крупного расхода" name="large_expense_threshold" step="0.01" type="number" />
          <Input defaultValue={settings.data?.reporting_currency_code ?? ''} label="Валюта отчёта" name="reporting_currency_code" />
          <Input defaultValue={settings.data?.financial_month_close_day ?? ''} label="День закрытия месяца" max="28" min="1" name="financial_month_close_day" type="number" />
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
            <input defaultChecked={settings.data?.require_large_expense_approval ?? false} name="require_large_expense_approval" type="checkbox" />
            Требовать approval крупных расходов
          </label>
        </div>
        <Button className="justify-self-start" disabled={mutation.isPending} type="submit">
          <Settings aria-hidden="true" className="size-4" />
          Сохранить
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
