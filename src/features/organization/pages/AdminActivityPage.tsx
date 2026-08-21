import { Activity, Loader2 } from 'lucide-react'
import { EmptyState } from '../../../components/common/EmptyState'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { cn } from '../../../lib/utils/cn'
import type { ActivityEvent } from '../activity/activityApi'
import { useAdminActivityEvents } from '../activity/activityApi'

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))

const sourceLabel = {
  operations: 'Операции',
  finance: 'Финансы',
} as const

const sourceTone = {
  operations: 'bg-emerald-50 text-emerald-800',
  finance: 'bg-cyan-50 text-cyan-800',
} as const

const shortId = (value: string) => value.slice(0, 8)

export function AdminActivityPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const activityQuery = useAdminActivityEvents(organizationId)
  const events = activityQuery.data ?? []
  const detailsLabel = (event: ActivityEvent) =>
    event.details.length ? event.details.map((detail) => t(detail)).join(' · ') : '-'
  const objectIdLabel = (event: ActivityEvent) => event.entityId ? shortId(event.entityId) : '-'

  if (!currentOrganization) {
    return (
      <EmptyState
        description={t('Активная организация не выбрана или доступ был приостановлен.')}
        icon={Activity}
        title={t('Журнал действий недоступен')}
      />
    )
  }

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {t('Журнал действий')}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          {t(
            'Понятная лента важных действий: кто заходил в ключевые разделы, создавал заказы, запускал сессии, принимал оплаты, закрывал смены и менял финансовые данные.',
          )}
        </p>
      </header>

      <article className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        {t(
          'Здесь не записывается каждый клик. Логируются значимые переходы по админ-разделам и операции, которые меняют данные или деньги.',
        )}
      </article>

      {activityQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('Загрузка журнала')}
        </div>
      ) : null}

      {!activityQuery.isLoading && !events.length ? (
        <EmptyState
          description={t(
            'Когда администратор начнёт открывать разделы или выполнять операции, события появятся здесь.',
          )}
          icon={Activity}
          title={t('Действий пока нет')}
        />
      ) : null}

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Время')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Источник')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Кто')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Действие')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Объект')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{t('Детали')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr className="align-top hover:bg-slate-50/80" key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-semibold', sourceTone[event.source])}>
                      {t(sourceLabel[event.source])}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-40 font-semibold text-slate-950">{event.actorName}</div>
                    {event.actorUserId ? <div className="mt-1 text-xs text-slate-500">{shortId(event.actorUserId)}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-52 font-semibold text-slate-950">{t(event.actionLabel)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-44 font-medium text-slate-900">{t(event.entityType)}</div>
                    {event.entityId ? <div className="mt-1 text-xs text-slate-500">ID: {shortId(event.entityId)}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-80 text-slate-700">{detailsLabel(event)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-500">{objectIdLabel(event)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {events.map((event) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            key={event.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-950">{t(event.actionLabel)}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{event.actorName} · {formatDateTime(event.createdAt)}</p>
              </div>
              <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-semibold', sourceTone[event.source])}>
                {t(sourceLabel[event.source])}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase text-slate-500">{t('Объект')}</dt>
                <dd className="mt-0.5 font-semibold text-slate-950">{t(event.entityType)}</dd>
              </div>
              <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase text-slate-500">ID</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-slate-700">{objectIdLabel(event)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm leading-6 text-slate-700">{detailsLabel(event)}</p>
            {event.entityId ? <p className="mt-1 text-xs text-slate-500">ID: {shortId(event.entityId)}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
