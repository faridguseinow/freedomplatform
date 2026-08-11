import { Building2, CheckCircle2, Landmark, ReceiptText, XCircle } from 'lucide-react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { usePlatformOrganizations } from '../../platform/platformApi'
import { todayDate } from '../financeApi'
import {
  useFinancialPeriod,
  useFinancialPeriodMutations,
} from '../financialPeriodsApi'
import { usePlatformOrganizationFinance, usePlatformFinanceSummary } from '../platformFinanceApi'
import {
  usePlatformShareMutations,
  usePlatformSharePayments,
  usePlatformShareRates,
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
  reported_sent: 'Ожидает подтверждения',
  confirmed: 'Подтверждён',
  paid: 'Оплачено',
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
        description="Глобальный контроль финансов организаций, периодов и задолженности по доле платформы."
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
              доход {money(row.total_income)} · расходы {money(row.total_expenses)} · долг платформе {money(row.platform_share_outstanding)}
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
  const rates = usePlatformShareRates(organizationId ?? null)
  const mutations = usePlatformShareMutations(organizationId ?? null)

  const handleRateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutations.setRate.mutate({
      percentage: Number(form.get('percentage') ?? 0),
      effectiveFrom: String(form.get('effective_from') || todayDate()),
      comment: String(form.get('comment') || '') || null,
    })
  }

  return (
    <section className="grid gap-5">
      <PageHeader
        description="Финансы выбранной организации и настройка процента доли Freedom Platform."
        title="Финансы организации"
      />
      <form className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-end" onSubmit={handleRateSubmit}>
        <Input label="Процент" max="100" min="0" name="percentage" required step="0.0001" type="number" />
        <Input defaultValue={todayDate()} label="Действует с" name="effective_from" type="date" />
        <Input label="Комментарий" name="comment" />
        <Button disabled={mutations.setRate.isPending} type="submit">Установить ставку</Button>
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
          <p className="text-xs font-medium uppercase text-slate-500">Долг платформе</p>
          <p className="mt-2 text-xl font-semibold">{money(finance.data?.summary?.platform_share_outstanding)}</p>
        </div>
      </div>
      <div className="grid gap-2">
        <h3 className="text-base font-semibold text-slate-950">Периоды</h3>
        {finance.data?.periods.map((period) => (
          <Link className="rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50" key={period.id} to={`/platform/finance/periods/${period.id}`}>
            <p className="font-medium text-slate-950">{period.period_start} - {period.period_end}</p>
            <p className="text-sm text-slate-600">{statusLabel[period.status] ?? period.status} · доля {money(period.platform_share_amount)}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-2">
        <h3 className="text-base font-semibold text-slate-950">Ставки</h3>
        {rates.data?.map((rate) => (
          <div className="rounded-md border border-slate-200 bg-white p-4" key={rate.id}>
            <p className="font-medium text-slate-950">{rate.percentage}%</p>
            <p className="text-sm text-slate-600">с {rate.effective_from} до {rate.effective_to ?? 'сейчас'}</p>
          </div>
        ))}
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
      <PageHeader description="Проверка периода и утверждение начисления доли платформы." title="Период организации" />
      {period.data ? (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
          <p className="font-medium text-slate-950">{period.data.period_start} - {period.data.period_end}</p>
          <p className="text-sm text-slate-600">прибыль {money(period.data.net_profit_before_platform_share)} · доля {money(period.data.platform_share_amount)} · {statusLabel[period.data.status] ?? period.data.status}</p>
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
        <PageHeader description="Подтверждение платежей организаций по доле платформы." title="Платежи платформе" />
        <EmptyState description="Организации пока не отправляли платежи на подтверждение." icon={ReceiptText} title="Платежей нет" />
      </section>
    )
  }

  return (
    <section className="grid gap-5">
      <PageHeader description="Подтверждение платежей организаций по доле платформы." title="Платежи платформе" />
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
