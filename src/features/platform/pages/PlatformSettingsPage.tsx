import { Building2, CheckCircle2, Clock3, Coins, Languages, Palette } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '../../../components/common/ThemeToggle'
import { Input } from '../../../components/ui/Input'
import { useI18n } from '../../../lib/i18n/I18nContext'
import {
  demoLanguages,
  languageLabels,
  supportedLanguages,
  type SystemLanguage,
} from '../../../lib/i18n/translations'
import {
  loadPlatformPreferences,
  savePlatformPreferences,
  type PlatformPreferences,
} from '../platformPreferences'

type SettingsSectionProps = {
  children: React.ReactNode
  description: string
  icon: typeof Palette
  title: string
}

function SettingsSection({ children, description, icon: Icon, title }: SettingsSectionProps) {
  return (
    <section className="grid content-start gap-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

export function PlatformSettingsPage() {
  const { language, setLanguage, t } = useI18n()
  const [preferences, setPreferences] = useState<PlatformPreferences>(loadPlatformPreferences)

  const updatePreference = <Key extends keyof PlatformPreferences>(
    key: Key,
    value: PlatformPreferences[Key],
  ) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value }
      savePlatformPreferences(next)
      return next
    })
  }

  return (
    <section className="grid content-start gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            {t('platformSettings.title')}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {t('platformSettings.description')}
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {t('platformSettings.autoSave')}
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SettingsSection
          description={t('platformSettings.personalizationDescription')}
          icon={Palette}
          title={t('platformSettings.personalization')}
        >
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              <span className="inline-flex items-center gap-2">
                <Languages aria-hidden="true" className="size-4 text-slate-500" />
                {t('platformSettings.interfaceLanguage')}
              </span>
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                onChange={(event) => setLanguage(event.target.value as SystemLanguage)}
                value={language}
              >
                {supportedLanguages.map((option) => (
                  <option key={option} value={option}>
                    {languageLabels[option]}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal leading-5 text-slate-500">
                {t('platformSettings.interfaceLanguageHint')}
              </span>
            </label>

            <div className="grid gap-1.5 text-sm font-medium text-slate-700">
              <span>{t('platformSettings.appearance')}</span>
              <ThemeToggle className="w-full" />
              <span className="text-xs font-normal leading-5 text-slate-500">
                {t('platformSettings.appearanceHint')}
              </span>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description={t('platformSettings.organizationDefaultsDescription')}
          icon={Building2}
          title={t('platformSettings.organizationDefaults')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              <span>{t('platformSettings.defaultOrganizationLanguage')}</span>
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                onChange={(event) =>
                  updatePreference(
                    'defaultLocale',
                    event.target.value as PlatformPreferences['defaultLocale'],
                  )
                }
                value={preferences.defaultLocale}
              >
                {demoLanguages.map((option) => (
                  <option key={option} value={option}>
                    {languageLabels[option]}
                  </option>
                ))}
              </select>
            </label>

            <Input
              id="platform-default-currency"
              label={t('platformSettings.defaultCurrency')}
              maxLength={3}
              onChange={(event) =>
                updatePreference('defaultCurrency', event.target.value.toUpperCase())
              }
              value={preferences.defaultCurrency}
            />

            <div className="sm:col-span-2">
              <Input
                id="platform-default-timezone"
                label={t('platformSettings.defaultTimezone')}
                onChange={(event) => updatePreference('defaultTimezone', event.target.value)}
                value={preferences.defaultTimezone}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Languages aria-hidden="true" className="size-4 text-emerald-700" />
              <div>
                <div className="text-xs text-slate-500">{t('platformSettings.language')}</div>
                <div className="text-sm font-semibold text-slate-900">
                  {preferences.defaultLocale.toUpperCase()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Coins aria-hidden="true" className="size-4 text-emerald-700" />
              <div>
                <div className="text-xs text-slate-500">{t('platformSettings.currency')}</div>
                <div className="text-sm font-semibold text-slate-900">
                  {preferences.defaultCurrency || '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-4 text-emerald-700" />
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{t('platformSettings.timezone')}</div>
                <div className="truncate text-sm font-semibold text-slate-900">
                  {preferences.defaultTimezone || '—'}
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    </section>
  )
}
