import {
  AlertTriangle,
  Banknote,
  Clock3,
  CreditCard,
  Info,
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
import { useI18n } from '../../../lib/i18n/I18nContext'
import { cn } from '../../../lib/utils/cn'
import { useShiftTemplates } from '../../shifts/shiftTemplatesApi'
import {
  useCurrentEmployeeShift,
  useEmployeeShiftMutations,
} from '../../shifts/shiftsApi'
import type { ShiftTemplateRow } from '../../../lib/supabase/database.types'

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

const isOpeningTemplateName = (name: string | null | undefined) => {
  const normalized = name?.trim().toLowerCase()
  return normalized === 'день открытия' || normalized === 'opening ceremony' || normalized === 'opening day'
}

const matchesShiftNumber = (template: ShiftTemplateRow, number: 1 | 2) => {
  const normalized = template.name.trim().toLowerCase()
  if (number === 1) {
    return /\b1\b/.test(normalized) || normalized.includes('birinci') || normalized.includes('первая') || normalized.includes('first')
  }
  return /\b2\b/.test(normalized) || normalized.includes('ikinci') || normalized.includes('вторая') || normalized.includes('second')
}

type ShiftMetricProps = {
  description?: string
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

const shiftRules = [
  'Система считает кассу по введённым данным. Работайте внимательно: проверяйте заказы, суммы, оплаты и остатки товара.',
  'Перед тем как принять оплату, обязательно проверьте итоговую сумму заказа и способ оплаты.',
  'Чаевые нельзя брать себе. Если клиент оставил чаевые, они обязательно записываются в системе и идут в кассу.',
  'Вся ответственность за кассу во время смены лежит на сотруднике, который открыл смену.',
  'Если в конце смены в кассе плюс, это тоже ошибка. Плюс не означает, что всё хорошо: значит где-то неверно записаны деньги, заказ или оплата.',
  'Если в кассе минус или плюс, обязательно сверяйте действия и пишите честный комментарий при закрытии смены.',
  'Нельзя давать в долг. Если клиент говорит, что оплатит в следующий раз, такой заказ нельзя закрывать как оплаченный.',
  'Открывая смену, вы подтверждаете, что прочитали правила, понимаете ответственность и будете работать строго по системе.',
]

function ShiftMetric({ description, icon: Icon, label, tone = 'default', value }: ShiftMetricProps) {
  const { t } = useI18n()
  return (
    <div className={`grid gap-1.5 rounded-lg px-3 py-2 ring-1 ${metricToneClassName[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <Icon className="size-3.5" />
        <span>{t(label)}</span>
        {description ? (
          <div className="group relative">
            <button
              aria-label={`${t('Как считается:')} ${t(label)}`}
              className="flex size-5 items-center justify-center rounded-full text-slate-400 outline-none hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              title={t(description)}
              type="button"
            >
              <Info aria-hidden="true" className="size-3.5" />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-xs font-normal normal-case leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block">
              {t(description)}
            </div>
          </div>
        ) : null}
      </div>
      <div className="text-lg font-semibold leading-none">{value}</div>
    </div>
  )
}

export function EmployeeShiftPage() {
  const { currentOrganization, organizationId, profile } = useAuth()
  const { t } = useI18n()
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
  const shiftChoices = useMemo(() => {
    const regularTemplates = templates.filter((template) => template.is_active && !isOpeningTemplateName(template.name))
    const first = regularTemplates.find((template) => matchesShiftNumber(template, 1)) ?? regularTemplates[0] ?? null
    const second =
      regularTemplates.find((template) => template.id !== first?.id && matchesShiftNumber(template, 2)) ??
      regularTemplates.find((template) => template.id !== first?.id) ??
      null

    return [
      { number: 1 as const, label: 'Первая смена', template: first },
      { number: 2 as const, label: 'Вторая смена', template: second },
    ]
  }, [templates])
  const defaultTemplateId = useMemo(() => shiftChoices[0]?.template?.id ?? '', [shiftChoices])
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
      <section className="grid content-start gap-3">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

        <form
          className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm lg:grid-cols-[minmax(220px,1fr)_minmax(280px,360px)_minmax(180px,240px)_auto] lg:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            if (!selectedTemplateId) {
              setError('Выберите первую или вторую смену.')
              return
            }
            void runAction(() =>
              mutations.open.mutateAsync({
                shiftTemplateId: selectedTemplateId,
                openingCashAmount: openingCash,
              }),
            )
          }}
        >
          <header className="min-w-0 self-center lg:pb-1">
            <h2 className="text-xl font-semibold text-slate-950">Открыть смену</h2>
            <p className="mt-1 truncate text-sm leading-5 text-slate-600">
              {currentOrganization?.name ?? 'Организация'} · {new Date().toLocaleString('ru')}
            </p>
          </header>
          <div className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Смена</span>
            <div className="grid grid-cols-2 gap-2">
              {shiftChoices.map((choice) => {
                const isSelected = selectedTemplateId === choice.template?.id
                return (
                  <button
                    className={cn(
                      'grid min-h-14 content-center rounded-md border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                      isSelected
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-200 hover:bg-emerald-50/40',
                    )}
                    disabled={!choice.template}
                    key={choice.number}
                    onClick={() => setTemplateId(choice.template?.id ?? '')}
                    type="button"
                  >
                    <span className="text-base font-semibold">{choice.number}</span>
                    <span className="text-xs font-medium">{t(choice.label)}</span>
                  </button>
                )
              })}
            </div>
            {!shiftChoices.some((choice) => choice.template) && !templatesQuery.isLoading ? (
              <span className="text-xs font-normal text-red-700">Активные шаблоны смен не найдены.</span>
            ) : null}
          </div>
          <Input
            id="opening_cash"
            label="Начальная наличность"
            min={0}
            onChange={(event) => setOpeningCash(Number(event.target.value))}
            step="0.01"
            type="number"
            value={openingCash}
          />
          <Button className="whitespace-nowrap lg:min-h-11" disabled={mutations.open.isPending || !selectedTemplateId} type="submit">
            {mutations.open.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Открыть смену
          </Button>
        </form>
        <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-950">{t('Правила кассы')}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-700">
                  {t('Перед открытием смены сотрудник обязан прочитать и принять эти условия.')}
                </p>
              </div>
            </div>
          </div>
          <ol className="grid gap-0 px-4 py-2">
            {shiftRules.map((rule, index) => (
              <li className="grid grid-cols-[2rem_1fr] gap-2 border-b border-slate-100 py-3 last:border-b-0" key={rule}>
                <span className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-700">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-slate-800">{t(rule)}</p>
              </li>
            ))}
          </ol>
        </section>
      </section>
    )
  }

  return (
    <section className="grid content-start gap-3 self-start">
      <header className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
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

      <section className="grid items-start gap-3 xl:grid-cols-[1fr_400px]">
        <div className="grid content-start gap-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ShiftMetric
              description="Сумма завершённых оплат наличными в этой смене. Считаются только платежи со статусом «завершён». Эта сумма добавляется к ожидаемой кассе."
              icon={Banknote}
              label="Наличные"
              tone="green"
              value={formatMoney(summary?.cash_sales_total)}
            />
            <ShiftMetric
              description="Сумма завершённых оплат картой или переводом в этой смене. В физическую кассу эта сумма не входит."
              icon={CreditCard}
              label="Картой"
              value={formatMoney(summary?.card_transfer_sales_total)}
            />
            <ShiftMetric
              description="Сумма наличных, которую указали при открытии этой смены. Она используется как база для расчёта ожидаемой кассы."
              icon={Wallet}
              label="Начальная наличность"
              value={formatMoney(shift.opening_cash_amount)}
            />
            <ShiftMetric
              description="Количество заказов организации, которые ещё открыты или ожидают оплату. При закрытии смены они переходят в передачу следующей смене."
              icon={ReceiptText}
              label="Открытые заказы"
              value={summary?.open_orders_count ?? 0}
            />
            <ShiftMetric
              description="Количество таймерных сессий, которые сейчас продолжаются. При закрытии смены они переходят в передачу следующей смене."
              icon={Timer}
              label="Активные сессии"
              tone={(summary?.active_sessions_count ?? 0) > 0 ? 'orange' : 'default'}
              value={summary?.active_sessions_count ?? 0}
            />
            <ShiftMetric
              description="Количество заказов, закрытых в этой смене как отказ от оплаты. Если число больше нуля, администратору нужно проверить причину."
              icon={AlertTriangle}
              label="Отказы"
              tone={(summary?.payment_refused_count ?? 0) > 0 ? 'red' : 'default'}
              value={summary?.payment_refused_count ?? 0}
            />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
            <h3 className="font-semibold text-slate-950">{t('Инструкция закрытия смены')}</h3>
            <ol className="mt-2 grid list-decimal gap-1 pl-5">
              <li>{t('Пересчитайте реальные наличные в кассе.')}</li>
              <li>{t('Введите эту сумму в поле «Фактическая наличность».')}</li>
              <li>{t('Сравните фактическую сумму с ожидаемой кассой.')}</li>
              <li>{t('Если суммы совпадают, смену можно закрыть без комментария.')}</li>
              <li>{t('Если есть расхождение, обязательно напишите короткий комментарий с причиной.')}</li>
              <li>{t('Нажмите «Завершить смену». Открытые заказы и активные сессии будут переданы следующей смене.')}</li>
            </ol>
          </section>

          {shift.status !== 'open' ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <LogOut className="mb-2 size-5 text-slate-400" />
              Смена завершена. Рабочее место заблокировано до открытия новой смены.
            </div>
          ) : null}
        </div>

        <form
          className="grid content-start gap-3 self-start rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
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
