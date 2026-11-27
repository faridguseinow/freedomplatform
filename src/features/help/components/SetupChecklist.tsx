import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { supabase } from '../../../lib/supabase/client'
import type { OrganizationReadiness } from '../../../lib/supabase/database.types'
import { useFinancePinState } from '../../finance/financeAccessApi'
import { helpPath } from '../helpContent'

const hiddenStorageKey = (organizationId: string) => `freedom.setupChecklistHidden.${organizationId}`

const readHidden = (organizationId: string | null) => {
  if (!organizationId) return false
  try {
    return window.localStorage.getItem(hiddenStorageKey(organizationId)) === '1'
  } catch {
    return false
  }
}

type ChecklistItem = {
  id: string
  done: boolean
  path: string
  optional?: boolean
}

/**
 * First-launch checklist on the admin dashboard. It disappears once every required step is done,
 * or when the administrator hides it on this device.
 */
export function SetupChecklist() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const [isHidden, setIsHidden] = useState(() => readHidden(organizationId))

  const readiness = useQuery({
    enabled: Boolean(organizationId) && !isHidden,
    queryKey: ['organization', organizationId, 'readiness'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_organization_readiness', {
        target_organization_id: organizationId!,
      })
      if (error) throw new Error(error.message)
      return data as OrganizationReadiness
    },
    staleTime: 5 * 60_000,
  })
  const financePin = useFinancePinState(isHidden ? null : organizationId)

  if (isHidden || !readiness.data || financePin.isLoading) return null

  const items: ChecklistItem[] = [
    { id: 'places', done: readiness.data.has_places, path: '/admin/places' },
    { id: 'catalog', done: readiness.data.has_products || readiness.data.has_services, path: '/admin/catalog' },
    { id: 'employees', done: readiness.data.has_employee, path: '/admin/employees' },
    { id: 'shifts', done: readiness.data.has_shift_templates, path: '/admin/shift-templates' },
    { id: 'financePin', done: Boolean(financePin.data?.has_pin), path: '/admin/settings' },
    { id: 'telegram', done: readiness.data.telegram_configured, path: '/admin/notification-settings', optional: true },
  ]
  const required = items.filter((item) => !item.optional)
  const doneCount = required.filter((item) => item.done).length
  if (doneCount === required.length) return null

  const buildPath = (path: string) => getTenantRoutePath(path, currentOrganization?.slug)
  const hide = () => {
    if (organizationId) {
      try {
        window.localStorage.setItem(hiddenStorageKey(organizationId), '1')
      } catch {
        // Hiding still works for this visit when storage is unavailable.
      }
    }
    setIsHidden(true)
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700">
            <Rocket aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-950">{t('help.setup.title')}</h3>
            <p className="mt-0.5 text-sm text-slate-600">{t('help.setup.description')}</p>
          </div>
        </div>
        <button
          aria-label={t('help.setup.hide')}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
          onClick={hide}
          title={t('help.setup.hide')}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${Math.round((doneCount / required.length) * 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-emerald-900">
          {t('help.setup.progress', { done: doneCount, total: required.length })}
        </span>
      </div>

      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              className="flex h-full items-start gap-3 rounded-md border border-white bg-white p-3 transition hover:border-emerald-300"
              to={buildPath(item.path)}
            >
              {item.done ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-300" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${item.done ? 'text-slate-500 line-through' : 'text-slate-950'}`}>
                  {t(`help.setup.${item.id}.title`)}
                  {item.optional ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 no-underline">
                      {t('help.setup.optional')}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-600">{t(`help.setup.${item.id}.text`)}</span>
              </span>
              {!item.done ? <ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" /> : null}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
        to={buildPath(helpPath('admin', 'start'))}
      >
        {t('help.setup.guide')}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  )
}
