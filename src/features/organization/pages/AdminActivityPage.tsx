import { Activity, Loader2 } from 'lucide-react'
import { EmptyState } from '../../../components/common/EmptyState'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
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

export function AdminActivityPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const activityQuery = useAdminActivityEvents(organizationId)
  const events = activityQuery.data ?? []

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

      <div className="grid gap-3">
        {events.map((event) => (
          <article
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]"
            key={event.id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  {t(sourceLabel[event.source])}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {t(event.entityType)}
                </span>
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-950">{t(event.title)}</h3>
              {event.details.length ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {event.details.map((detail) => t(detail)).join(' · ')}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                {t('Код действия:')} {event.action}
                {event.entityId ? ` · ID: ${event.entityId}` : ''}
              </p>
            </div>
            <time className="text-sm font-medium text-slate-500" dateTime={event.createdAt}>
              {formatDateTime(event.createdAt)}
            </time>
          </article>
        ))}
      </div>
    </section>
  )
}
