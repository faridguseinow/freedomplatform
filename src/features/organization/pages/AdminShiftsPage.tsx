import { getCurrentLocale } from '../../../lib/i18n/translator'
import { Archive, CalendarDays, Eye, Loader2, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { AdminShiftReportRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { getCurrentFinancialCycle } from '../../finance/financialCycle'
import { todayDate } from '../../finance/financeApi'
import { useFinancialPeriods } from '../../finance/financialPeriodsApi'
import { shiftStatusLabel, useAdminShiftMutations, useAdminShifts } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const metrics = [
  { key: 'opening_cash_amount', label: 'shifts.openingCash' },
  { key: 'cash_sales_total', label: 'shifts.cashEarned' },
  { key: 'card_transfer_sales_total', label: 'Переводы на карту' },
  { key: 'expected_cash_amount', label: 'Ожидаемая касса' },
  { key: 'actual_cash_amount', label: 'Фактическая касса' },
  { key: 'cash_variance', label: 'Расхождение' },
] as const

type ShiftMetricKey = (typeof metrics)[number]['key']

const getMetricValue = (shift: AdminShiftReportRow, key: ShiftMetricKey) => Number(shift[key] ?? 0)

export function AdminShiftsPage() {
  const { currentOrganization, organizationId, role } = useAuth()
  const { t } = useI18n()
  const shiftsQuery = useAdminShifts(organizationId, 'all')
  const periodsQuery = useFinancialPeriods(organizationId)
  const mutations = useAdminShiftMutations(organizationId)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const shifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data])
  const dayGroups = useMemo(() => {
    const groups = new Map<string, AdminShiftReportRow[]>()
    shifts.forEach((shift) => {
      const group = groups.get(shift.business_date) ?? []
      group.push(shift)
      groups.set(shift.business_date, group)
    })

    return [...groups.entries()].map(([date, dayShifts]) => ({
      date,
      shifts: [...dayShifts].sort((first, second) =>
        new Date(first.opened_at).getTime() - new Date(second.opened_at).getTime()),
    }))
  }, [shifts])
  const finalizedPeriods = useMemo(
    () => (periodsQuery.data ?? []).filter((period) => period.status === 'approved' || period.status === 'locked'),
    [periodsQuery.data],
  )
  const periodGroups = useMemo(
    () => finalizedPeriods.map((period) => {
      const groups = dayGroups.filter((group) =>
        group.date >= period.period_start && group.date <= period.period_end)
      return {
        groups,
        period,
        shiftsCount: groups.reduce((sum, group) => sum + group.shifts.length, 0),
        totalRevenue: groups.reduce((sum, group) => sum + group.shifts.reduce(
          (daySum, shift) => daySum + Number(shift.cash_sales_total ?? 0) + Number(shift.card_transfer_sales_total ?? 0),
          0,
        ), 0),
      }
    }),
    [dayGroups, finalizedPeriods],
  )
  const currentDayGroups = useMemo(
    () => dayGroups.filter((group) => !finalizedPeriods.some((period) =>
      group.date >= period.period_start && group.date <= period.period_end)),
    [dayGroups, finalizedPeriods],
  )
  const currentCycle = useMemo(
    () => getCurrentFinancialCycle(periodsQuery.data ?? [], todayDate()),
    [periodsQuery.data],
  )
  const selectedPeriod = periodGroups.find(({ period }) => period.id === selectedPeriodId) ?? null
  const isPlatformOwner = role === 'platform_owner'
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)
  const getShiftTemplateName = (shift: AdminShiftReportRow) => {
    const name = shift.shift_template_name?.trim()
    if (!name) return t("ui.bez_shablona_2e1a5ce")
    const translatedName = t(name.toLocaleLowerCase())
    return translatedName === name.toLocaleLowerCase() ? name : translatedName
  }
  const deleteShift = (shift: AdminShiftReportRow) => {
    const confirmation = window.confirm(
      t("ui.udalit_smenu_navsegda_vse_zakazy_oplaty_dohody_i_skl_3b17f71"),
    )
    if (!confirmation) return

    const comment = window.prompt(t("ui.kommentariy_udaleniya_smeny_0215ab5"), t("ui.udaleno_vladeltsem_platformy_46b956e"))
    mutations.deleteShift.mutate({ shiftId: shift.id, comment })
  }

  type ShiftDayGroup = (typeof dayGroups)[number]

  const renderDesktopGroups = (groups: ShiftDayGroup[], allowDelete: boolean) => (
    <div className="hidden min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
      <div className="h-full overflow-auto overscroll-contain">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_0_rgb(226_232_240)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t("ui.smena_d5ff8af")}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t("ui.status_f7f293b")}</th>
              {metrics.map((metric) => (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500" key={metric.key}>
                  {t(metric.label)}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t("ui.deystviya_9978ac3")}</th>
            </tr>
          </thead>
          {groups.map((group, groupIndex) => (
            <tbody className="divide-y divide-slate-100 bg-white" key={group.date}>
              {groupIndex > 0 ? (
                <tr aria-hidden="true">
                  <td className="h-5 border-0 bg-slate-50 p-0" colSpan={metrics.length + 3} />
                </tr>
              ) : null}
              <tr className="shift-day-header bg-emerald-700/75">
                <th className="rounded-t-lg border-y border-emerald-800 px-4 py-2 text-left text-sm font-semibold text-white" colSpan={metrics.length + 3}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="size-4" />
                      {group.date}
                    </span>
                    <span className="rounded-md border border-emerald-500 bg-emerald-800 px-2 py-1 text-xs font-semibold text-white">
                      {t('shifts.shiftsForDay', { count: group.shifts.length })}
                    </span>
                  </div>
                </th>
              </tr>
              {group.shifts.map((shift, shiftIndex) => (
                <tr className="hover:bg-slate-50/80" key={shift.id}>
                  <td className={cn(
                    'whitespace-nowrap border-t border-slate-200 px-4 py-3 text-slate-700',
                    shiftIndex === group.shifts.length - 1 && 'border-b border-emerald-300 first:rounded-bl-lg',
                  )}>{getShiftTemplateName(shift)}</td>
                  <td className={cn(
                    'whitespace-nowrap border-t border-slate-200 px-4 py-3',
                    shiftIndex === group.shifts.length - 1 && 'border-b border-emerald-300',
                  )}>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {t(shiftStatusLabel[shift.status])}
                    </span>
                  </td>
                  {metrics.map((metric) => (
                    <td className={cn(
                      'whitespace-nowrap border-t border-slate-200 px-4 py-3 text-right font-medium text-slate-950',
                      shiftIndex === group.shifts.length - 1 && 'border-b border-emerald-300',
                      shiftIndex === group.shifts.length - 1
                        && metric.key === 'actual_cash_amount'
                        && shift.actual_cash_amount !== null
                        && 'bg-emerald-50/60',
                    )} key={metric.key}>
                      {formatMoney(getMetricValue(shift, metric.key))}
                    </td>
                  ))}
                  <td className={cn(
                    'border-t border-slate-200 px-4 py-3',
                    shiftIndex === group.shifts.length - 1 && 'rounded-br-lg border-b border-emerald-300',
                  )}>
                    <div className="flex justify-end gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        to={buildAdminPath(`/admin/shifts/${shift.id}`)}
                      >
                        <Eye className="size-4" /> {t("ui.detali_85a76a7")}
                      </Link>
                      {allowDelete && isPlatformOwner ? (
                        <button
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={mutations.deleteShift.isPending}
                          onClick={() => deleteShift(shift)}
                          type="button"
                        >
                          <Trash2 className="size-4" /> {t("ui.udalit_86ea33a")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )

  const renderMobileGroups = (groups: ShiftDayGroup[], allowDelete: boolean) => (
    <div className="grid gap-3 md:hidden">
      {groups.map((group) => (
        <section className="overflow-hidden rounded-lg border border-emerald-300 bg-white shadow-sm ring-1 ring-emerald-100" key={group.date}>
          <header className="shift-day-header flex items-center justify-between gap-3 border-b border-emerald-800 bg-emerald-700/75 px-3 py-2">
            <h3 className="inline-flex items-center gap-2 font-semibold text-white">
              <CalendarDays className="size-4" /> {group.date}
            </h3>
            <span className="rounded-md border border-emerald-500 bg-emerald-800 px-2 py-1 text-xs font-medium text-white">
              {t('shifts.shiftsForDay', { count: group.shifts.length })}
            </span>
          </header>
          <div className="grid divide-y divide-slate-100">
            {group.shifts.map((shift, shiftIndex) => (
              <article className="p-3" key={shift.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate font-semibold text-slate-950">{getShiftTemplateName(shift)}</h3>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {t(shiftStatusLabel[shift.status])}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {metrics.map((metric) => (
                    <div className={cn(
                      'rounded-md border border-slate-100 bg-slate-50 px-3 py-2',
                      shiftIndex === group.shifts.length - 1
                        && metric.key === 'actual_cash_amount'
                        && shift.actual_cash_amount !== null
                        && 'bg-emerald-50/60',
                    )} key={metric.key}>
                      <dt className="text-[11px] font-semibold uppercase text-slate-500">{t(metric.label)}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-950">{formatMoney(getMetricValue(shift, metric.key))}</dd>
                    </div>
                  ))}
                </dl>
                <div className={cn('mt-3 grid gap-2', allowDelete && isPlatformOwner && 'sm:grid-cols-2')}>
                  <Link
                    className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    to={buildAdminPath(`/admin/shifts/${shift.id}`)}
                  >
                    <Eye className="size-4" /> {t("ui.detali_85a76a7")}
                  </Link>
                  {allowDelete && isPlatformOwner ? (
                    <button
                      className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-red-100 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={mutations.deleteShift.isPending}
                      onClick={() => deleteShift(shift)}
                      type="button"
                    >
                      <Trash2 className="size-4" /> {t("ui.udalit_86ea33a")}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )

  return (
    <section className="grid gap-4 md:h-[calc(100svh-2.75rem)] md:grid-rows-[auto_minmax(0,1fr)_auto] md:overflow-hidden">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t("ui.smeny_415748c")}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t("ui.kassovaya_otvetstvennost_zakrytiya_rashozhdeniya_i_p_3578077")}
        </p>
      </header>

      {shiftsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t("ui.zagruzka_smen_af6891c")}
        </div>
      ) : null}

      <section className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">{t('shifts.currentPeriod')}</h3>
            <p className="text-sm text-slate-600">{currentCycle.start} — {currentCycle.end}</p>
          </div>
          <p className="text-sm font-medium text-slate-600">
            {t('shifts.shiftsInPeriod', { count: currentDayGroups.reduce((sum, group) => sum + group.shifts.length, 0) })}
          </p>
        </div>
        {currentDayGroups.length ? renderDesktopGroups(currentDayGroups, true) : null}
        {currentDayGroups.length ? renderMobileGroups(currentDayGroups, true) : null}

        {!shiftsQuery.isLoading && currentDayGroups.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {t("ui.smeny_ne_naydeny_6a589a1")}
          </div>
        ) : null}
      </section>

      <details className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-900">
          <span className="inline-flex items-center gap-2">
            <Archive className="size-4 text-slate-500" />
            {t('shifts.archive')}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{periodGroups.length}</span>
        </summary>
        <div className="grid max-h-48 gap-2 overflow-y-auto border-t border-slate-100 p-3 overscroll-contain">
          {periodGroups.length ? periodGroups.map(({ period, shiftsCount, totalRevenue }) => (
            <button
              className="flex w-full items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-emerald-200 hover:bg-emerald-50"
              key={period.id}
              onClick={() => setSelectedPeriodId(period.id)}
              type="button"
            >
              <span>
                <span className="block font-semibold text-slate-950">{period.period_start} — {period.period_end}</span>
                <span className="mt-1 block text-xs text-slate-500">{t('shifts.shiftsInPeriod', { count: shiftsCount })}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-emerald-800">{formatMoney(totalRevenue)}</span>
                <span className="mt-1 block text-xs text-slate-500">{t('shifts.closedPeriod')}</span>
              </span>
            </button>
          )) : (
            <p className="px-1 py-2 text-sm text-slate-500">{t('shifts.noArchivedPeriods')}</p>
          )}
        </div>
      </details>

      {selectedPeriod ? (
        <Modal onClose={() => setSelectedPeriodId(null)}>
          <div className="flex h-[min(90svh,56rem)] w-full max-w-6xl flex-col gap-4 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{t('shifts.closedPeriod')}</h3>
                <p className="mt-1 text-sm text-slate-600">{selectedPeriod.period.period_start} — {selectedPeriod.period.period_end}</p>
              </div>
              <button
                aria-label={t('Закрыть')}
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => setSelectedPeriodId(null)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            {selectedPeriod.groups.length ? renderDesktopGroups(selectedPeriod.groups, false) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:hidden">
              {selectedPeriod.groups.length ? renderMobileGroups(selectedPeriod.groups, false) : (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  {t("ui.smeny_ne_naydeny_6a589a1")}
                </div>
              )}
            </div>
            {!selectedPeriod.groups.length ? (
              <div className="hidden rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 md:block">
                {t("ui.smeny_ne_naydeny_6a589a1")}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {!shiftsQuery.isLoading && shifts.length === 0 && !periodGroups.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 md:hidden">
          {t("ui.smeny_ne_naydeny_6a589a1")}
        </div>
      ) : null}
    </section>
  )
}
