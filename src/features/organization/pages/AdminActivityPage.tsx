import { useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { EmptyState } from '../../../components/common/EmptyState'
import { useAuth } from '../../../hooks/useAuth'
import { formatNumericDateTime } from '../../../lib/i18n/dateTime'
import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { cn } from '../../../lib/utils/cn'
import type { ActivityArea, ActivityCategory, ActivityEvent } from '../activity/activityApi'
import { useAdminActivityEvents } from '../activity/activityApi'

const categoryOrder: Array<ActivityCategory | 'all'> = [
  'all',
  'places',
  'orders',
  'sessions',
  'payments',
  'shifts',
  'finance',
  'admin',
  'other',
]

const categoryLabels: Record<ActivityCategory | 'all', string> = {
  all: 'activity.category.all',
  places: 'activity.category.places',
  orders: 'activity.category.orders',
  sessions: 'activity.category.sessions',
  payments: 'activity.category.payments',
  shifts: 'activity.category.shifts',
  finance: 'activity.category.finance',
  admin: 'activity.category.admin',
  other: 'activity.category.other',
}

const categoryTone: Record<ActivityCategory, string> = {
  places: 'bg-violet-50 text-violet-800 ring-violet-200',
  orders: 'bg-blue-50 text-blue-800 ring-blue-200',
  sessions: 'bg-amber-50 text-amber-800 ring-amber-200',
  payments: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  shifts: 'bg-orange-50 text-orange-800 ring-orange-200',
  finance: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  admin: 'bg-slate-100 text-slate-700 ring-slate-200',
  other: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export function AdminActivityPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const activityQuery = useAdminActivityEvents(organizationId)
  const events = activityQuery.data ?? []
  const [category, setCategory] = useState<ActivityCategory | 'all'>('all')
  const [area, setArea] = useState<ActivityArea | 'all'>('all')
  const [actor, setActor] = useState('all')

  const categoryCounts = new Map<ActivityCategory, number>()
  for (const event of events) categoryCounts.set(event.category, (categoryCounts.get(event.category) ?? 0) + 1)

  const availableCategories = categoryOrder.filter((item) => item === 'all' || categoryCounts.has(item))
  const actors = [...new Map(events.map((event) => [event.actorUserId ?? `system:${event.actorName}`, event.actorName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], getCurrentLocale()))
  const filteredEvents = events.filter((event) =>
    (category === 'all' || event.category === category) &&
    (area === 'all' || event.area === area) &&
    (actor === 'all' || (event.actorUserId ?? `system:${event.actorName}`) === actor),
  )
  const detailsLabel = (event: ActivityEvent) =>
    event.details.map((detail) => t(detail.key, {
      from: detail.from,
      to: detail.to,
      value: detail.translateValue && detail.value !== undefined ? t(String(detail.value)) : detail.value,
    })).join(' · ')

  if (!currentOrganization) {
    return (
      <EmptyState
        description={t('ui.aktivnaya_organizatsiya_ne_vybrana_ili_dostup_byl_pr_4d9ff46')}
        icon={Activity}
        title={t('ui.zhurnal_deystviy_nedostupen_4357bdb')}
      />
    )
  }

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {t('activity.title')}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t('activity.description')}
        </p>
      </header>

      {events.length ? (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            {t('activity.operationFilter')}
            <select
              className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-600"
              onChange={(event) => setCategory(event.target.value as ActivityCategory | 'all')}
              value={category}
            >
              {availableCategories.map((item) => (
                <option key={item} value={item}>
                  {t(categoryLabels[item])} ({item === 'all' ? events.length : categoryCounts.get(item as ActivityCategory)})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            {t('activity.areaLabel')}
            <select
              className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-600"
              onChange={(event) => setArea(event.target.value as ActivityArea | 'all')}
              value={area}
            >
              {(['all', 'admin', 'workspace'] as const).map((item) => (
                <option key={item} value={item}>{t(`activity.area.${item}`)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              {t('activity.authorFilter')}
              <select
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-600"
                onChange={(event) => setActor(event.target.value)}
                value={actor}
              >
                <option value="all">{t('activity.authorAll')}</option>
                {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-3">
            {t('activity.resultCount', { count: filteredEvents.length })}
          </p>
        </div>
      ) : null}

      {activityQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> {t('ui.zagruzka_zhurnala_2e726fc')}
        </div>
      ) : null}

      {!activityQuery.isLoading && !events.length ? (
        <EmptyState
          description={t('activity.emptyDescription')}
          icon={Activity}
          title={t('ui.deystviy_poka_net_0ce75fe')}
        />
      ) : null}

      {!activityQuery.isLoading && events.length && !filteredEvents.length ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {t('activity.filterEmpty')}
        </p>
      ) : null}

      {filteredEvents.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[860px] w-full table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-40 px-4 py-3">{t('activity.column.time')}</th>
                <th className="w-44 px-4 py-3">{t('activity.column.author')}</th>
                <th className="w-44 px-4 py-3">{t('activity.column.area')}</th>
                <th className="w-56 px-4 py-3">{t('activity.column.action')}</th>
                <th className="px-4 py-3">{t('activity.column.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.map((event) => {
                const details = detailsLabel(event)
                return (
                  <tr className="align-top hover:bg-slate-50/80" key={event.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-600">
                      <time dateTime={event.createdAt}>{formatNumericDateTime(event.createdAt)}</time>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">{event.actorName}</td>
                    <td className="px-4 py-3 text-slate-700">{t(`activity.area.${event.area}`)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-950">{t(event.actionLabel)}</div>
                      <span className={cn('mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', categoryTone[event.category])}>
                        {t(categoryLabels[event.category])}
                      </span>
                    </td>
                    <td className="px-4 py-3 leading-5 text-slate-600">{details || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
