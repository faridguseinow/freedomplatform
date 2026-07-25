import { Building2, Settings } from 'lucide-react'
import { EmptyState } from '../../../components/common/EmptyState'
import { useAuth } from '../../../hooks/useAuth'

export function AdminSettingsPage() {
  const { currentOrganization } = useAuth()

  if (!currentOrganization) {
    return (
      <EmptyState
        description="Активная организация не выбрана или доступ был приостановлен."
        icon={Settings}
        title="Настройки организации недоступны"
      />
    )
  }

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          Настройки организации
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Базовые параметры текущей организации. Редактирование будет расширено следующим этапом.
        </p>
      </header>

      <article className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
            <Building2 aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-950">
              {currentOrganization.name}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {currentOrganization.description || 'Описание не заполнено.'}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Статус</dt>
            <dd className="mt-1 text-slate-900">{currentOrganization.status}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Язык</dt>
            <dd className="mt-1 text-slate-900">{currentOrganization.default_locale}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Часовой пояс</dt>
            <dd className="mt-1 text-slate-900">{currentOrganization.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-500">Валюта</dt>
            <dd className="mt-1 text-slate-900">{currentOrganization.currency_code}</dd>
          </div>
        </dl>
      </article>
    </section>
  )
}
