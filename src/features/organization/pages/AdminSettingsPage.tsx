import { AlertTriangle, Building2, Clock3, Landmark, Settings, Warehouse } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { languageLabels, supportedLanguages, type SystemLanguage } from '../../../lib/i18n/translations'

const mobileManagementLinks = [
  {
    label: 'Финансы',
    description: 'Доходы, расходы, периоды и доля платформы.',
    path: '/admin/finance',
    icon: Landmark,
  },
  {
    label: 'Смены',
    description: 'История смен и закрытия кассы.',
    path: '/admin/shifts',
    icon: Clock3,
  },
  {
    label: 'Исправления',
    description: 'Запросы на удаление и корректировки.',
    path: '/admin/adjustment-requests',
    icon: AlertTriangle,
  },
  {
    label: 'Склад',
    description: 'Остатки, документы и движение товаров.',
    path: '/admin/inventory',
    icon: Warehouse,
  },
]

export function AdminSettingsPage() {
  const { currentOrganization } = useAuth()
  const { language, setLanguage, t } = useI18n()
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as SystemLanguage)
  }

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
        <div className="grid gap-1">
          <h3 className="text-lg font-semibold text-slate-950">{t('Язык системы')}</h3>
          <p className="text-sm leading-6 text-slate-600">
            {t(
              'Язык интерфейса хранится локально на этом устройстве и применяется для администратора и рабочего места сотрудника в этом браузере.',
            )}
          </p>
        </div>

        <label className="grid max-w-sm gap-1 text-sm font-medium text-slate-700">
          <span>{t('Язык')}</span>
          <select
            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
            onChange={handleLanguageChange}
            value={language}
          >
            {supportedLanguages.map((item) => (
              <option key={item} value={item}>
                {languageLabels[item]}
              </option>
            ))}
          </select>
        </label>
      </article>

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

      <section className="grid gap-3 md:hidden">
        <h3 className="text-lg font-semibold text-slate-950">Быстрые разделы</h3>
        <div className="grid gap-2">
          {mobileManagementLinks.map((item) => (
            <Link
              className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"
              key={item.path}
              to={buildAdminPath(item.path)}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-50 text-cyan-700">
                <item.icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-950">{item.label}</span>
                <span className="mt-0.5 block text-sm leading-5 text-slate-600">
                  {item.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </section>
  )
}
