import {
  AlertTriangle,
  Banknote,
  Clock3,
  CreditCard,
  Loader2,
  LogOut,
  Play,
  ReceiptText,
  Save,
  Timer,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import { useShiftTemplates } from '../../shifts/shiftTemplatesApi'
import { useCurrentEmployeeShift, useEmployeeShiftMutations } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const formatDuration = (openedAt: string | undefined, nowMs: number) => {
  if (!openedAt || !nowMs) return '00:00'
  const minutes = Math.max(0, Math.floor((nowMs - new Date(openedAt).getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  return `${hours} ч ${minutes % 60} мин`
}

type ShiftMetricProps = {
  label: string
  value: string | number
  icon: typeof Clock3
  tone?: 'default' | 'green' | 'orange' | 'red'
}

const metricToneClassName: Record<NonNullable<ShiftMetricProps['tone']>, string> = {
  default: 'bg-white text-slate-950 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-950 ring-emerald-100',
  orange: 'bg-orange-50 text-orange-950 ring-orange-100',
  red: 'bg-red-50 text-red-950 ring-red-100',
}

function ShiftMetric({ icon: Icon, label, tone = 'default', value }: ShiftMetricProps) {
  return (
    <div className={`grid gap-2 rounded-lg px-3 py-3 ring-1 ${metricToneClassName[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-lg font-semibold leading-none">{value}</div>
    </div>
  )
}

export function EmployeeShiftPage() {
  const { currentOrganization, organizationId, profile } = useAuth()
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const templatesQuery = useShiftTemplates(organizationId, true)
  const mutations = useEmployeeShiftMutations(organizationId)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [templateId, setTemplateId] = useState('')
  const [openingCash, setOpeningCash] = useState(0)
  const [actualCash, setActualCash] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const payload = currentShiftQuery.data
  const shift = payload?.shift ?? null
  const summary = payload?.summary ?? null
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])
  const expectedCash = summary?.expected_cash_amount ?? shift?.expected_cash_amount ?? 0
  const variance = actualCash - expectedCash
  const hasVariance = Math.abs(variance) > 0.009
  const closeCommentRequired = hasVariance && !comment.trim()
  const closeDisabled = mutations.close.isPending || closeCommentRequired
  const defaultTemplateId = useMemo(() => templates.find((template) => template.is_active)?.id ?? '', [templates])
  const selectedTemplateId = templateId || defaultTemplateId

  const runAction = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Операция не выполнена.')
    }
  }

  if (currentShiftQuery.isLoading) {
    return (
      <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
        <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка смены
      </div>
    )
  }

  if (!shift) {
    return (
      <section className="grid gap-5">
        <header className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Открыть смену</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {currentOrganization?.name ?? 'Организация'} · {new Date().toLocaleString('ru')}
          </p>
        </header>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

        <form
          className="grid max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            void runAction(() =>
              mutations.open.mutateAsync({
                shiftTemplateId: selectedTemplateId || null,
                openingCashAmount: openingCash,
              }),
            )
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Шаблон смены</span>
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setTemplateId(event.target.value)}
              value={selectedTemplateId}
            >
              <option value="">Без шаблона</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.start_time.slice(0, 5)}-{template.end_time.slice(0, 5)}
                </option>
              ))}
            </select>
          </label>
          <Input
            id="opening_cash"
            label="Начальная наличность"
            min={0}
            onChange={(event) => setOpeningCash(Number(event.target.value))}
            step="0.01"
            type="number"
            value={openingCash}
          />
          <Button disabled={mutations.open.isPending} type="submit">
            {mutations.open.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Открыть смену
          </Button>
        </form>
      </section>
    )
  }

  return (
    <section className="grid content-start gap-4 self-start">
      <header className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">Моя смена</h2>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold uppercase text-emerald-800">
              Открыта
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-600">
            {profile?.full_name ?? profile?.email} · {formatDateTime(shift.opened_at)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="rounded-md bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium uppercase text-slate-500">Длительность</div>
            <div className="mt-0.5 text-base font-semibold text-slate-950">
              {formatDuration(shift.opened_at, nowMs)}
            </div>
          </div>
          <div className="rounded-md bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-medium uppercase text-emerald-700">Ожидаемая касса</div>
            <div className="mt-0.5 text-base font-semibold text-emerald-950">
              {formatMoney(expectedCash)}
            </div>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <section className="grid items-start gap-4 xl:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ShiftMetric
              icon={Banknote}
              label="Наличные"
              tone="green"
              value={formatMoney(summary?.cash_sales_total)}
            />
            <ShiftMetric
              icon={CreditCard}
              label="Переводы"
              value={formatMoney(summary?.card_transfer_sales_total)}
            />
            <ShiftMetric
              icon={Wallet}
              label="Касса"
              tone={hasVariance ? 'orange' : 'green'}
              value={formatMoney(expectedCash)}
            />
            <ShiftMetric
              icon={ReceiptText}
              label="Открытые заказы"
              value={summary?.open_orders_count ?? 0}
            />
            <ShiftMetric
              icon={Timer}
              label="Активные сессии"
              tone={(summary?.active_sessions_count ?? 0) > 0 ? 'orange' : 'default'}
              value={summary?.active_sessions_count ?? 0}
            />
            <ShiftMetric
              icon={AlertTriangle}
              label="Отказы"
              tone={(summary?.payment_refused_count ?? 0) > 0 ? 'red' : 'default'}
              value={summary?.payment_refused_count ?? 0}
            />
          </div>

          {shift.status !== 'open' ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <LogOut className="mb-2 size-5 text-slate-400" />
              Смена завершена. Рабочее место заблокировано до открытия новой смены.
            </div>
          ) : null}
        </div>

        <form
          className="grid content-start gap-3 self-start rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault()
            if (closeDisabled) {
              setError('При расхождении укажите комментарий.')
              return
            }
            void runAction(() =>
              mutations.close.mutateAsync({
                actualCashAmount: actualCash,
                comment: comment || null,
                handoverCashAmount: actualCash,
              }),
            )
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Clock3 className="size-5 text-emerald-700" /> Завершить смену
            </div>
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                hasVariance ? 'bg-orange-50 text-orange-800' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              {hasVariance ? `Расх. ${formatMoney(variance)}` : 'Баланс'}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Input
              id="actual_cash"
              label="Фактическая наличность"
              min={0}
              onChange={(event) => setActualCash(Number(event.target.value))}
              step="0.01"
              type="number"
              value={actualCash}
            />
            <div className="grid content-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="text-xs font-medium uppercase text-slate-500">Ожидается</span>
              <strong className="mt-1 text-base text-slate-950">{formatMoney(expectedCash)}</strong>
            </div>
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Комментарий {hasVariance ? '(обязательно)' : ''}</span>
            <textarea
              className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setComment(event.target.value)}
              value={comment}
            />
          </label>

          {closeCommentRequired ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
              Есть расхождение по наличности. Добавьте короткий комментарий перед закрытием.
            </div>
          ) : null}

          <Button disabled={closeDisabled} type="submit">
            {mutations.close.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Завершить смену
          </Button>
          <div className="text-xs leading-5 text-slate-500">
            Открытые заказы и активные сессии уйдут в передачу следующей смене.
          </div>
        </form>
      </section>
    </section>
  )
}
