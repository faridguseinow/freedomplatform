import { Box, Building2, Loader2, LockKeyhole, Settings, ShieldCheck, Warehouse } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { ThemeToggle } from '../../../components/common/ThemeToggle'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { languageLabels, supportedLanguages, type SystemLanguage } from '../../../lib/i18n/translations'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useFinancePinState, useSetFinancePin } from '../../finance/financeAccessApi'

const mobileManagementLinks = [
  {
    label: 'Каталог',
    description: 'Категории, товары, услуги и комбо.',
    path: '/admin/catalog',
    icon: Box,
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
  const [financePassword, setFinancePassword] = useState('')
  const [financePin, setFinancePin] = useState('')
  const [financePinConfirmation, setFinancePinConfirmation] = useState('')
  const [financePinMessage, setFinancePinMessage] = useState<string | null>(null)
  const financePinStateQuery = useFinancePinState(currentOrganization?.id ?? null)
  const setFinancePinMutation = useSetFinancePin(currentOrganization?.id ?? null)
  const buildAdminPath = (path: string) =>
    getTenantRoutePath(path, currentOrganization?.slug)
  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as SystemLanguage)
  }

  const saveFinancePin = async () => {
    setFinancePinMessage(null)
    if (!/^\d{4}$/.test(financePin)) {
      setFinancePinMessage(t('financeAccess.enterFourDigits'))
      return
    }
    if (financePin !== financePinConfirmation) {
      setFinancePinMessage(t('financeAccess.pinMismatch'))
      return
    }
    if (!financePassword) {
      setFinancePinMessage(t('financeAccess.passwordRequired'))
      return
    }

    try {
      await setFinancePinMutation.mutateAsync({ password: financePassword, pin: financePin })
      setFinancePin('')
      setFinancePinConfirmation('')
      setFinancePinMessage(t('financeAccess.saved'))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setFinancePinMessage(
        message.includes('account password is incorrect')
          ? t('financeAccess.passwordInvalid')
          : message || t('financeAccess.saveFailed'),
      )
    } finally {
      setFinancePassword('')
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

        <div className="grid max-w-sm gap-1 text-sm font-medium text-slate-700">
          <span>{t('theme.appearance')}</span>
          <ThemeToggle />
        </div>
      </article>

      <article className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-800">
            <LockKeyhole aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-950">{t('financeAccess.settingsTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('financeAccess.settingsDescription')}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {financePinStateQuery.isLoading
                ? t('financeAccess.checking')
                : financePinStateQuery.isError
                  ? t('financeAccess.stateUnavailable')
                : financePinStateQuery.data?.has_pin
                  ? t('financeAccess.configured')
                  : t('financeAccess.notConfigured')}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
            <span>{t('financeAccess.accountPassword')}</span>
            <input
              autoComplete="current-password"
              className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) => setFinancePassword(event.target.value)}
              type="password"
              value={financePassword}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
            <span>{t('financeAccess.newPin')}</span>
            <input
              autoComplete="new-password"
              className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-center text-lg font-semibold tracking-[0.35em] text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setFinancePin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              pattern="[0-9]*"
              placeholder="0000"
              type="password"
              value={financePin}
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
            <span>{t('financeAccess.confirmPin')}</span>
            <input
              autoComplete="new-password"
              className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-center text-lg font-semibold tracking-[0.35em] text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setFinancePinConfirmation(event.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveFinancePin()
                }
              }}
              pattern="[0-9]*"
              placeholder="0000"
              type="password"
              value={financePinConfirmation}
            />
          </label>
        </div>

        {financePinMessage ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {financePinMessage}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={setFinancePinMutation.isPending || financePinStateQuery.isLoading}
            onClick={() => void saveFinancePin()}
            type="button"
          >
            {setFinancePinMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {financePinStateQuery.data?.has_pin ? t('financeAccess.changePin') : t('financeAccess.setPin')}
          </Button>
        </div>
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
