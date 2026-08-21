import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { AdminShiftReportRow, ShiftStatus } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { ROLE_LABEL } from '../../../types/roles'
import { shiftStatusLabel, useAdminShifts } from '../../shifts/shiftsApi'

type StatusFilter = ShiftStatus | 'all'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const metrics = [
  { key: 'cash_sales_total', label: 'Наличные продажи' },
  { key: 'card_transfer_sales_total', label: 'Переводы на карту' },
  { key: 'expected_cash_amount', label: 'Ожидаемая касса' },
  { key: 'actual_cash_amount', label: 'Фактическая касса' },
  { key: 'cash_variance', label: 'Расхождение' },
] as const satisfies ReadonlyArray<{ key: keyof AdminShiftReportRow; label: string }>

export function AdminShiftsPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')
  const shiftsQuery = useAdminShifts(organizationId, status)
  const shifts = shiftsQuery.data ?? []
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const getRoleLabel = (shift: AdminShiftReportRow) =>
    shift.employee_role ? ROLE_LABEL[shift.employee_role] : ROLE_LABEL.employee

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t('Смены')}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t('Кассовая ответственность, закрытия, расхождения и передачи.')}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {(['all', 'open', 'closed', 'force_closed'] as const).map((item) => (
          <button
            className={cn(
              'min-h-10 rounded-md border px-3 text-sm font-medium',
              status === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600',
            )}
            key={item}
            onClick={() => setStatus(item)}
            type="button"
          >
            {item === 'all' ? t('Все') : t(shiftStatusLabel[item])}
          </button>
        ))}
      </div>

      {shiftsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('Загрузка смен')}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Ответственный')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Дата')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Смена')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Статус')}</th>
                {metrics.map((metric) => (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500" key={metric.key}>
                    {t(metric.label)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Детали')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {shifts.map((shift) => (
                <tr className="hover:bg-slate-50/80" key={shift.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">
                      {shift.employee_full_name ?? shift.employee_email ?? shift.employee_user_id}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{t(getRoleLabel(shift))}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{shift.business_date}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{shift.shift_template_name ?? t('Без шаблона')}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {t(shiftStatusLabel[shift.status])}
                    </span>
                  </td>
                  {metrics.map((metric) => (
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-950" key={metric.key}>
                      {formatMoney(Number(shift[metric.key] ?? 0))}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      to={buildAdminPath(`/admin/shifts/${shift.id}`)}
                    >
                      <Eye className="size-4" /> {t('Детали')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {shifts.map((shift) => (
          <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={shift.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-950">{shift.employee_full_name ?? shift.employee_email ?? shift.employee_user_id}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{t(getRoleLabel(shift))}</p>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {t(shiftStatusLabel[shift.status])}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {shift.business_date} · {shift.shift_template_name ?? t('Без шаблона')}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {metrics.map((metric) => (
                <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2" key={metric.key}>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">{t(metric.label)}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-slate-950">{formatMoney(Number(shift[metric.key] ?? 0))}</dd>
                </div>
              ))}
            </dl>
            <Link
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              to={buildAdminPath(`/admin/shifts/${shift.id}`)}
            >
              <Eye className="size-4" /> {t('Детали')}
            </Link>
          </article>
        ))}
      </div>

      {!shiftsQuery.isLoading && shifts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {t('Смены не найдены.')}
        </div>
      ) : null}
    </section>
  )
}
