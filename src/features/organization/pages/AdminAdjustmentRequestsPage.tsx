import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  AdjustmentRequestStatus,
  AdjustmentRequestType,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
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

export function AdminAdjustmentRequestsPage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const [status, setStatus] = useState<StatusFilter>('all')
  const requestsQuery = useAdminAdjustmentRequests(organizationId, status)
  const requests = requestsQuery.data ?? []

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

      <div className="grid gap-3">
        {requests.map((request) => (
          <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={request.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-950">{t(requestTypeLabel[request.request_type])}</h3>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{t(statusLabel[request.status])}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{request.reason}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t('Заказ:')} {request.order_id} · {t('Количество:')} {request.requested_quantity ?? '-'}
              </p>
            </div>
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
