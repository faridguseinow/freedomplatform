import { getCurrentLocale } from '../../../lib/i18n/translator'
import { Eye, Loader2, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { AdminShiftReportRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { ROLE_LABEL } from '../../../types/roles'
import { shiftStatusLabel, useAdminShiftMutations, useAdminShifts } from '../../shifts/shiftsApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const metrics = [
  { key: 'cash_sales_total', label: 'Наличные продажи' },
  { key: 'card_transfer_sales_total', label: 'Переводы на карту' },
  { key: 'total_revenue', label: 'shifts.totalRevenue' },
  { key: 'expected_cash_amount', label: 'Ожидаемая касса' },
  { key: 'actual_cash_amount', label: 'Фактическая касса' },
  { key: 'cash_variance', label: 'Расхождение' },
] as const

type ShiftMetricKey = (typeof metrics)[number]['key']

const getMetricValue = (shift: AdminShiftReportRow, key: ShiftMetricKey) =>
  key === 'total_revenue'
    ? Number(shift.cash_sales_total ?? 0) + Number(shift.card_transfer_sales_total ?? 0)
    : Number(shift[key] ?? 0)

export function AdminShiftsPage() {
  const { currentOrganization, organizationId, role } = useAuth()
  const { t } = useI18n()
  const shiftsQuery = useAdminShifts(organizationId, 'all')
  const mutations = useAdminShiftMutations(organizationId)
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
      totals: Object.fromEntries(
        metrics.map((metric) => [
          metric.key,
          dayShifts.reduce((sum, shift) => sum + getMetricValue(shift, metric.key), 0),
        ]),
      ) as Record<ShiftMetricKey, number>,
    }))
  }, [shifts])
  const isPlatformOwner = role === 'platform_owner'
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)
  const getRoleLabel = (shift: AdminShiftReportRow) =>
    shift.employee_role ? ROLE_LABEL[shift.employee_role] : ROLE_LABEL.employee
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

  return (
    <section className="grid gap-5">
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

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t("ui.otvetstvennyy_46c1c6b")}</th>
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
            {dayGroups.map((group) => (
              <tbody className="divide-y divide-slate-100 bg-white" key={group.date}>
                <tr className="border-t-2 border-emerald-100 bg-emerald-50/60">
                  <th className="px-4 py-2 text-left text-sm font-semibold text-emerald-900" colSpan={metrics.length + 4}>
                    {group.date} · {t('shifts.shiftsForDay', { count: group.shifts.length })}
                  </th>
                </tr>
                {group.shifts.map((shift) => (
                  <tr className="hover:bg-slate-50/80" key={shift.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">
                      {shift.employee_full_name ?? shift.employee_email ?? shift.employee_user_id}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{t(getRoleLabel(shift))}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{getShiftTemplateName(shift)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {t(shiftStatusLabel[shift.status])}
                    </span>
                  </td>
                  {metrics.map((metric) => (
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-950" key={metric.key}>
                      {formatMoney(getMetricValue(shift, metric.key))}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        to={buildAdminPath(`/admin/shifts/${shift.id}`)}
                      >
                        <Eye className="size-4" /> {t("ui.detali_85a76a7")}
                      </Link>
                      {isPlatformOwner ? (
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
                <tr className="border-b-2 border-emerald-100 bg-slate-50 font-semibold">
                  <td className="px-4 py-3 text-right text-slate-900" colSpan={3}>{t('shifts.dayTotal')}</td>
                  {metrics.map((metric) => (
                    <td className={cn(
                      'whitespace-nowrap px-4 py-3 text-right',
                      metric.key === 'total_revenue'
                        ? 'border-2 border-emerald-400 bg-emerald-50 font-bold text-emerald-900'
                        : 'text-slate-950',
                    )} key={metric.key}>
                      {formatMoney(group.totals[metric.key])}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            ))}
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {dayGroups.map((group) => (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={group.date}>
            <header className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-3 py-2">
              <h3 className="font-semibold text-emerald-950">{group.date}</h3>
              <span className="text-xs font-medium text-emerald-800">{t('shifts.shiftsForDay', { count: group.shifts.length })}</span>
            </header>
            <div className="grid divide-y divide-slate-100">
              {group.shifts.map((shift) => (
                <article className="p-3" key={shift.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-950">{shift.employee_full_name ?? shift.employee_email ?? shift.employee_user_id}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{t(getRoleLabel(shift))}</p>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {t(shiftStatusLabel[shift.status])}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{getShiftTemplateName(shift)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {metrics.map((metric) => (
                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2" key={metric.key}>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">{t(metric.label)}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-950">{formatMoney(getMetricValue(shift, metric.key))}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Link
                className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                to={buildAdminPath(`/admin/shifts/${shift.id}`)}
              >
                <Eye className="size-4" /> {t("ui.detali_85a76a7")}
              </Link>
              {isPlatformOwner ? (
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
            <footer className="border-t border-emerald-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">{t('shifts.dayTotal')}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {metrics.map((metric) => (
                  <div className={cn(
                    'rounded-md border px-3 py-2',
                    metric.key === 'total_revenue'
                      ? 'border-2 border-emerald-400 bg-emerald-100'
                      : 'border-slate-200 bg-white',
                  )} key={metric.key}>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">{t(metric.label)}</dt>
                    <dd className={cn(
                      'mt-0.5 text-sm font-semibold',
                      metric.key === 'total_revenue' ? 'text-emerald-900' : 'text-slate-950',
                    )}>
                      {formatMoney(group.totals[metric.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </footer>
          </section>
        ))}
      </div>

      {!shiftsQuery.isLoading && shifts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {t("ui.smeny_ne_naydeny_6a589a1")}
        </div>
      ) : null}
    </section>
  )
}
