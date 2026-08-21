import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  AdjustmentRequestStatus,
  AdjustmentRequestType,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import type { AdminAdjustmentRequestRow } from '../../orders/adjustmentRequestsApi'
import { useAdminAdjustmentRequests } from '../../orders/adjustmentRequestsApi'

type StatusFilter = AdjustmentRequestStatus | 'all'

const statusLabel: Record<AdjustmentRequestStatus, string> = {
  pending: 'Ожидало подтверждения',
  approved: 'Выполнено',
  rejected: 'Отклонено',
  expired: 'Истекло',
  cancelled: 'Отменено',
}

const requestTypeLabel: Record<AdjustmentRequestType, string> = {
  remove_order_item: 'Удаление позиции',
  change_quantity: 'Изменение количества',
  cancel_order: 'Отмена заказа',
  change_payment_method: 'Изменение метода оплаты',
  correct_session_time: 'Коррекция времени сессии',
  other: 'Другое',
}

const statusTone = (status: AdjustmentRequestStatus) =>
  cn(
    'inline-flex rounded-md px-2 py-1 text-xs font-semibold',
    status === 'approved' && 'bg-emerald-50 text-emerald-800',
    status === 'pending' && 'bg-amber-50 text-amber-800',
    status === 'rejected' && 'bg-red-50 text-red-700',
    status === 'cancelled' && 'bg-slate-100 text-slate-700',
    status === 'expired' && 'bg-slate-100 text-slate-500',
  )

const shortId = (value: string) => value.slice(0, 8)

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatQuantity = (value: number | null | undefined) =>
  value == null ? '-' : new Intl.NumberFormat('ru', { maximumFractionDigits: 3 }).format(value)

const systemCommentLabel = (value: string | null | undefined) => {
  if (!value) return null
  if (value === 'Applied automatically by employee action') {
    return 'Автоматически применено действием сотрудника'
  }
  return value
}

export function AdminAdjustmentRequestsPage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')
  const requestsQuery = useAdminAdjustmentRequests(organizationId, status)
  const requests = requestsQuery.data ?? []
  const userLabel = (request: AdminAdjustmentRequestRow, kind: 'requested' | 'reviewed') => {
    const profile = kind === 'requested' ? request.requested_by_profile : request.reviewed_by_profile
    const userId = kind === 'requested' ? request.requested_by : request.reviewed_by
    return profile?.full_name ?? profile?.email ?? (userId ? shortId(userId) : t('Системно'))
  }
  const orderLabel = (request: AdminAdjustmentRequestRow) =>
    request.order ? `#${request.order.order_number}` : shortId(request.order_id)
  const orderContext = (request: AdminAdjustmentRequestRow) =>
    [request.order?.current_place_name_snapshot, request.order?.customer_label].filter(Boolean).join(' · ')

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t('Журнал изменений заказа')}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t('Сотрудник меняет заказ сразу, а здесь администратор видит, что именно было изменено.')}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {(['all', 'pending', 'approved', 'rejected', 'expired', 'cancelled'] as const).map((item) => (
          <button
            className={cn(
              'min-h-10 rounded-md border px-3 text-sm font-medium',
              status === item
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600',
            )}
            key={item}
            onClick={() => setStatus(item)}
            type="button"
          >
            {item === 'all' ? t('Все') : t(statusLabel[item])}
          </button>
        ))}
      </div>

      {requestsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('Загрузка запросов')}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Время')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Тип')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Заказ')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Позиция')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">{t('Кол-во')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Сотрудник')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Причина')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Проверка')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr className="align-top hover:bg-slate-50/80" key={request.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(request.requested_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">{t(requestTypeLabel[request.request_type])}</div>
                    <span className={cn('mt-1', statusTone(request.status))}>{t(statusLabel[request.status])}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">{orderLabel(request)}</div>
                    {orderContext(request) ? <div className="mt-1 max-w-44 text-xs text-slate-500">{orderContext(request)}</div> : null}
                    {request.order ? <div className="mt-1 text-xs text-slate-500">{formatMoney(request.order.total_amount)} AZN</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-48 font-medium text-slate-900">{request.order_item?.name_snapshot ?? t('Позиция не указана')}</div>
                    {request.order_item ? <div className="mt-1 text-xs text-slate-500">{t('Текущее')}: {formatQuantity(request.order_item.quantity)}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">
                    {formatQuantity(request.requested_quantity)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-40 font-medium text-slate-900">{userLabel(request, 'requested')}</div>
                    <div className="mt-1 text-xs text-slate-500">{shortId(request.requested_by)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-64 text-slate-700">{request.reason}</div>
                  </td>
                  <td className="px-4 py-3">
                    {request.reviewed_at ? (
                      <>
                        <div className="max-w-40 font-medium text-slate-900">{userLabel(request, 'reviewed')}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(request.reviewed_at)}</div>
                        {request.review_comment ? <div className="mt-1 max-w-44 text-xs text-slate-500">{t(systemCommentLabel(request.review_comment) ?? '')}</div> : null}
                      </>
                    ) : (
                      <span className="text-slate-500">{t('Не проверено')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {requests.map((request) => (
          <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={request.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-950">{t(requestTypeLabel[request.request_type])}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(request.requested_at)}</p>
              </div>
              <span className={statusTone(request.status)}>{t(statusLabel[request.status])}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase text-slate-500">{t('Заказ')}</div>
                <div className="mt-0.5 font-semibold text-slate-950">{orderLabel(request)}</div>
                {orderContext(request) ? <div className="mt-0.5 text-xs text-slate-500">{orderContext(request)}</div> : null}
              </div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase text-slate-500">{t('Кол-во')}</div>
                <div className="mt-0.5 font-semibold text-slate-950">{formatQuantity(request.requested_quantity)}</div>
              </div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase text-slate-500">{t('Позиция')}</div>
                <div className="mt-0.5 font-semibold text-slate-950">{request.order_item?.name_snapshot ?? t('Позиция не указана')}</div>
              </div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase text-slate-500">{t('Сотрудник')}</div>
                <div className="mt-0.5 font-semibold text-slate-950">{userLabel(request, 'requested')}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-700">{request.reason}</p>
            <p className="mt-2 text-xs text-slate-500">
              {request.reviewed_at
                ? `${t('Проверил')}: ${userLabel(request, 'reviewed')} · ${formatDateTime(request.reviewed_at)}${systemCommentLabel(request.review_comment) ? ` · ${t(systemCommentLabel(request.review_comment) ?? '')}` : ''}`
                : t('Не проверено')}
            </p>
          </article>
        ))}
      </div>

      {!requestsQuery.isLoading && !requests.length ? (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600">
          {t('Изменений по фильтру нет')}
        </div>
      ) : null}
    </section>
  )
}
