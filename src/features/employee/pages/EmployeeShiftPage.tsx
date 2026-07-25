import { Clock3, Loader2, LogOut, Play, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import { useShiftTemplates } from '../../shifts/shiftTemplatesApi'
import { useCurrentEmployeeShift, useEmployeeShiftMutations } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatDuration = (openedAt: string | undefined, nowMs: number) => {
  if (!openedAt || !nowMs) return '00:00'
  const minutes = Math.max(0, Math.floor((nowMs - new Date(openedAt).getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  return `${hours} ч ${minutes % 60} мин`
}

export function EmployeeShiftPage() {
  const { currentOrganization, organizationId, profile } = useAuth()
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const templatesQuery = useShiftTemplates(organizationId, true)
  const mutations = useEmployeeShiftMutations(organizationId)
  const [nowMs, setNowMs] = useState(0)
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
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Моя смена</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {profile?.full_name ?? profile?.email} · открыта {new Date(shift.opened_at).toLocaleString('ru')}
        </p>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Длительность</div><div className="mt-1 text-xl font-semibold">{formatDuration(shift.opened_at, nowMs)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Наличные продажи</div><div className="mt-1 text-xl font-semibold">{formatMoney(summary?.cash_sales_total)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Переводы</div><div className="mt-1 text-xl font-semibold">{formatMoney(summary?.card_transfer_sales_total)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Ожидаемая касса</div><div className="mt-1 text-xl font-semibold">{formatMoney(expectedCash)}</div></div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Открытые заказы</div><div className="mt-1 text-xl font-semibold">{summary?.open_orders_count ?? 0}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Активные сессии</div><div className="mt-1 text-xl font-semibold">{summary?.active_sessions_count ?? 0}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="text-xs uppercase text-slate-500">Отказы от оплаты</div><div className="mt-1 text-xl font-semibold">{summary?.payment_refused_count ?? 0}</div></div>
      </div>

      <form
        className="grid max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault()
          void runAction(() =>
            mutations.close.mutateAsync({
              actualCashAmount: actualCash,
              comment: comment || null,
              handoverCashAmount: actualCash,
            }),
          )
        }}
      >
        <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
          <Clock3 className="size-5 text-emerald-700" /> Завершить смену
        </div>
        <Input
          id="actual_cash"
          label="Фактическая наличность"
          min={0}
          onChange={(event) => setActualCash(Number(event.target.value))}
          step="0.01"
          type="number"
          value={actualCash}
        />
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          Расхождение: <strong>{formatMoney(variance)}</strong>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Комментарий {variance !== 0 ? '(обязательно при расхождении)' : ''}</span>
          <textarea
            className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            onChange={(event) => setComment(event.target.value)}
            value={comment}
          />
        </label>
        <Button disabled={mutations.close.isPending} type="submit">
          {mutations.close.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Завершить смену
        </Button>
        <div className="text-xs leading-5 text-slate-500">
          Открытые заказы и активные сессии будут включены в передачу следующей смене.
        </div>
      </form>

      {shift.status !== 'open' ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <LogOut className="mb-2 size-5 text-slate-400" />
          Смена завершена. Рабочее место заблокировано до открытия новой смены.
        </div>
      ) : null}
    </section>
  )
}
