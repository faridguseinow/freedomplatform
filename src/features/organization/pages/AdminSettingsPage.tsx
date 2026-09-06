import { AlertTriangle, Building2, Clock3, Landmark, Settings, Trash2, Warehouse } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { languageLabels, supportedLanguages, type SystemLanguage } from '../../../lib/i18n/translations'
import { USER_ROLES } from '../../../types/roles'
import {
  type OrganizationTestOrderResetSummary,
  useOrganizationMaintenanceMutations,
} from '../maintenance/maintenanceApi'

const mobileManagementLinks = [
  {
    label: 'Финансы',
    description: 'Доходы, расходы, периоды и оплата платформы.',
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
  const { currentOrganization, role } = useAuth()
  const { language, setLanguage, t } = useI18n()
  const maintenanceMutations = useOrganizationMaintenanceMutations()
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSummary, setResetSummary] = useState<OrganizationTestOrderResetSummary | null>(null)
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path
  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as SystemLanguage)
  }
  const isPlatformOwner = role === USER_ROLES.platformOwner

  const resetTestOrders = async () => {
    if (!currentOrganization) return

    const confirmed = window.confirm(
      `${t("ui.ochistit_testovye_zakazy_organizatsii_aebd268")}\n\n${t(
        "ui.budut_udaleny_zakazy_platezhi_smeny_operatsionnye_dn_e175c29",
      )}`,
    )

    if (!confirmed) return

    const confirmation = window.prompt(t("ui.vvedite_reset_test_orders_dlya_okonchatelnoy_ochistk_e1b6df2"))
    if (confirmation === null) return
    if (confirmation.trim() !== 'RESET_TEST_ORDERS') {
      setResetSummary(null)
      setResetError(t("ui.kod_podtverzhdeniya_nevernyy_ochistka_ne_vypolnena_b861da4"))
      return
    }

    setResetError(null)
    setResetSummary(null)

    try {
      const summary = await maintenanceMutations.resetTestOrders.mutateAsync({
        confirmation: confirmation.trim(),
        organizationId: currentOrganization.id,
      })
      setResetSummary(summary)
    } catch (error) {
      setResetError(error instanceof Error ? error.message : t("ui.ne_udalos_ochistit_testovye_zakazy_0c0dee7"))
    }
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
          <h3 className="text-lg font-semibold text-slate-950">{t("ui.yazyk_sistemy_8763972")}</h3>
          <p className="text-sm leading-6 text-slate-600">
            {t(
              "ui.yazyk_interfeysa_hranitsya_lokalno_na_etom_ustroystv_5e54628",
            )}
          </p>
        </div>

        <label className="grid max-w-sm gap-1 text-sm font-medium text-slate-700">
          <span>{t("ui.yazyk_ed3f0e5")}</span>
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

      {isPlatformOwner ? (
        <article className="grid gap-4 rounded-lg border border-red-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
              <Trash2 aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-red-950">
                {t("ui.ochistka_testovyh_zakazov_a79b66d")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-red-800">
                {t(
                  "ui.udalyaet_tolko_testovuyu_operatsionnuyu_istoriyu_zak_d45fa6a",
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-slate-600">
              {t("ui.dostupno_tolko_vladeltsu_platformy_deystvie_neobrati_0ea767f")}
            </p>
            <Button
              disabled={maintenanceMutations.resetTestOrders.isPending}
              onClick={resetTestOrders}
              type="button"
              variant="danger"
            >
              <Trash2 className="size-4" />
              {maintenanceMutations.resetTestOrders.isPending
                ? t("ui.ochistka_c62df82")
                : t("ui.ochistit_testovye_zakazy_8660a48")}
            </Button>
          </div>

          {resetError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {resetError}
            </div>
          ) : null}

          {resetSummary ? (
            <div className="grid gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:grid-cols-2 lg:grid-cols-4">
              <span>{t("ui.udaleno_zakazov_63b1673")}: {resetSummary.orders_deleted}</span>
              <span>{t("ui.udaleno_platezhey_31b2488")}: {resetSummary.payments_deleted}</span>
              <span>{t("ui.udaleno_smen_2a3f588")}: {resetSummary.shifts_deleted}</span>
              <span>{t("ui.pereschitano_tovarov_f3b6db9")}: {resetSummary.affected_products}</span>
            </div>
          ) : null}
        </article>
      ) : null}

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
