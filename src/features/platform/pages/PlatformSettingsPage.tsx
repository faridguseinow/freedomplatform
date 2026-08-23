import {
  Bell,
  Database,
  Globe2,
  KeyRound,
  Landmark,
  LockKeyhole,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { languageLabels, supportedLanguages, type SystemLanguage } from '../../../lib/i18n/translations'

type PlatformSettings = {
  publicBaseUrl: string
  organizationUrlMode: 'path'
  defaultLocale: 'ru' | 'az' | 'en'
  defaultTimezone: string
  defaultCurrency: string
  requireOrganizationSlug: boolean
  sessionTimeoutMinutes: number
  requireEmployeePin: boolean
  employeePinDigits: number
  requireAdminPinApproval: boolean
  defaultPlatformSharePercent: number
  paymentDueDays: number
  largeExpenseThreshold: number
  maxOrganizations: number
  maxActiveUsersPerOrganization: number
  storageLimitGbPerOrganization: number
  auditRetentionDays: number
  telegramWorkerEnabled: boolean
  emailNotificationsEnabled: boolean
  maintenanceMode: boolean
}

type SettingSectionProps = {
  title: string
  description: string
  icon: typeof Settings
  children: React.ReactNode
}

const storageKey = 'freedom-platform.platform-settings'

const defaultSettings: PlatformSettings = {
  publicBaseUrl: 'https://freedomplatform.vercel.app',
  organizationUrlMode: 'path',
  defaultLocale: 'az',
  defaultTimezone: 'Asia/Baku',
  defaultCurrency: 'AZN',
  requireOrganizationSlug: true,
  sessionTimeoutMinutes: 720,
  requireEmployeePin: true,
  employeePinDigits: 4,
  requireAdminPinApproval: true,
  defaultPlatformSharePercent: 10,
  paymentDueDays: 10,
  largeExpenseThreshold: 500,
  maxOrganizations: 100,
  maxActiveUsersPerOrganization: 50,
  storageLimitGbPerOrganization: 5,
  auditRetentionDays: 365,
  telegramWorkerEnabled: false,
  emailNotificationsEnabled: false,
  maintenanceMode: false,
}

const loadStoredSettings = () => {
  if (typeof window === 'undefined') return defaultSettings

  const stored = window.localStorage.getItem(storageKey)
  if (!stored) return defaultSettings

  try {
    return { ...defaultSettings, ...JSON.parse(stored) } as PlatformSettings
  } catch {
    window.localStorage.removeItem(storageKey)
    return defaultSettings
  }
}

function SettingSection({ children, description, icon: Icon, title }: SettingSectionProps) {
  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-50 text-cyan-700">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function ToggleSetting({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean
  description?: string
  label: string
  onChange: (value: boolean) => void
}) {
  const statusText = checked ? 'Активно' : 'Выключено'

  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={[
            'rounded-full px-2 py-1 text-xs font-semibold',
            checked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
          ].join(' ')}
        >
          {statusText}
        </span>
        <button
          aria-label={`${label}: ${statusText}`}
          aria-pressed={checked}
          className={[
            'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700',
            checked ? 'bg-emerald-700' : 'bg-slate-300',
          ].join(' ')}
          onClick={() => onChange(!checked)}
          type="button"
        >
          <span
            className={[
              'absolute top-1 size-4 rounded-full bg-white transition-transform',
              checked ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>
    </div>
  )
}

export function PlatformSettingsPage() {
  const { language, setLanguage } = useI18n()
  const [settings, setSettings] = useState<PlatformSettings>(loadStoredSettings)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const organizationExampleUrl = useMemo(
    () => `${settings.publicBaseUrl.replace(/\/+$/, '')}/the-liga`,
    [settings.publicBaseUrl],
  )

  const updateSetting = <Key extends keyof PlatformSettings>(key: Key, value: PlatformSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const saveSettings = () => {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
    setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
  }

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as SystemLanguage)
  }

  return (
    <section className="grid content-start gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Настройки платформы
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Базовые параметры Freedom Platform: ссылки организаций, безопасность, финансы,
            лимиты и системные интеграции.
          </p>
        </div>
        <Button className="shrink-0" onClick={saveSettings} type="button">
          <Save aria-hidden="true" className="size-4" />
          Сохранить
        </Button>
      </header>

      {savedAt ? (
        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          Настройки сохранены в этом браузере в {savedAt}.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingSection
          description="Публичный адрес Vercel и формат ссылок организаций."
          icon={Globe2}
          title="Домен и ссылки"
        >
          <Input
            id="platform_public_base_url"
            label="Публичный адрес"
            onChange={(event) => updateSetting('publicBaseUrl', event.target.value)}
            value={settings.publicBaseUrl}
          />
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Формат ссылки организации</span>
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={() => updateSetting('organizationUrlMode', 'path')}
              value={settings.organizationUrlMode}
            >
              <option value="path">/slug</option>
            </select>
          </label>
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">
            Пример: <strong>{organizationExampleUrl}</strong>
          </div>
          <ToggleSetting
            checked={settings.requireOrganizationSlug}
            description="Организация должна иметь короткую ссылку вида /the-liga."
            label="Slug обязателен"
            onChange={(value) => updateSetting('requireOrganizationSlug', value)}
          />
        </SettingSection>

        <SettingSection
          description="Сессии, PIN-код рабочего экрана и подтверждения администратора."
          icon={ShieldCheck}
          title="Безопасность"
        >
          <Input
            id="platform_session_timeout"
            label="Таймаут сессии, минут"
            min={15}
            onChange={(event) => updateSetting('sessionTimeoutMinutes', Number(event.target.value))}
            type="number"
            value={settings.sessionTimeoutMinutes}
          />
          <Input
            id="platform_pin_digits"
            label="Длина PIN сотрудника"
            max={6}
            min={4}
            onChange={(event) => updateSetting('employeePinDigits', Number(event.target.value))}
            type="number"
            value={settings.employeePinDigits}
          />
          <ToggleSetting
            checked={settings.requireEmployeePin}
            description="Сотрудник блокирует и открывает рабочий экран PIN-кодом."
            label="PIN рабочего экрана"
            onChange={(value) => updateSetting('requireEmployeePin', value)}
          />
          <ToggleSetting
            checked={settings.requireAdminPinApproval}
            description="Критичные действия по смене требуют PIN администратора."
            label="PIN подтверждения смены"
            onChange={(value) => updateSetting('requireAdminPinApproval', value)}
          />
        </SettingSection>

        <SettingSection
          description="Значения по умолчанию для новых организаций и финансовых периодов."
          icon={Landmark}
          title="Финансы"
        >
          <Input
            id="platform_share_percent"
            label="Доля платформы, %"
            max={100}
            min={0}
            onChange={(event) => updateSetting('defaultPlatformSharePercent', Number(event.target.value))}
            step="0.01"
            type="number"
            value={settings.defaultPlatformSharePercent}
          />
          <Input
            id="platform_payment_due_days"
            label="Срок оплаты доли, дней"
            min={0}
            onChange={(event) => updateSetting('paymentDueDays', Number(event.target.value))}
            type="number"
            value={settings.paymentDueDays}
          />
          <Input
            id="platform_large_expense_threshold"
            label="Крупный расход от"
            min={0}
            onChange={(event) => updateSetting('largeExpenseThreshold', Number(event.target.value))}
            step="0.01"
            type="number"
            value={settings.largeExpenseThreshold}
          />
          <Input
            id="platform_default_currency"
            label="Валюта по умолчанию"
            maxLength={3}
            onChange={(event) => updateSetting('defaultCurrency', event.target.value.toUpperCase())}
            value={settings.defaultCurrency}
          />
        </SettingSection>

        <SettingSection
          description="Ограничения роста, хранения и активности tenant-организаций."
          icon={Users}
          title="Лимиты организаций"
        >
          <Input
            id="platform_max_organizations"
            label="Максимум организаций"
            min={1}
            onChange={(event) => updateSetting('maxOrganizations', Number(event.target.value))}
            type="number"
            value={settings.maxOrganizations}
          />
          <Input
            id="platform_max_users"
            label="Пользователей на организацию"
            min={1}
            onChange={(event) => updateSetting('maxActiveUsersPerOrganization', Number(event.target.value))}
            type="number"
            value={settings.maxActiveUsersPerOrganization}
          />
          <Input
            id="platform_storage_limit"
            label="Хранилище на организацию, GB"
            min={1}
            onChange={(event) => updateSetting('storageLimitGbPerOrganization', Number(event.target.value))}
            type="number"
            value={settings.storageLimitGbPerOrganization}
          />
          <Input
            id="platform_audit_retention"
            label="Хранение audit logs, дней"
            min={30}
            onChange={(event) => updateSetting('auditRetentionDays', Number(event.target.value))}
            type="number"
            value={settings.auditRetentionDays}
          />
        </SettingSection>

        <SettingSection
          description="Язык, часовой пояс и региональные значения для новых организаций."
          icon={SlidersHorizontal}
          title="Региональные параметры"
        >
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Язык интерфейса</span>
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={handleLanguageChange}
              value={language}
            >
              {supportedLanguages.map((option) => (
                <option key={option} value={option}>
                  {languageLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Язык новых организаций по умолчанию</span>
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              onChange={(event) =>
                updateSetting('defaultLocale', event.target.value as PlatformSettings['defaultLocale'])
              }
              value={settings.defaultLocale}
            >
              <option value="az">az</option>
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
          </label>
          <Input
            id="platform_default_timezone"
            label="Часовой пояс"
            onChange={(event) => updateSetting('defaultTimezone', event.target.value)}
            value={settings.defaultTimezone}
          />
        </SettingSection>

        <SettingSection
          description="Флаги интеграций и технического обслуживания."
          icon={Database}
          title="Система и интеграции"
        >
          <ToggleSetting
            checked={settings.telegramWorkerEnabled}
            description="Интеграция отправки служебных сообщений в Telegram."
            label="Telegram worker"
            onChange={(value) => updateSetting('telegramWorkerEnabled', value)}
          />
          <ToggleSetting
            checked={settings.emailNotificationsEnabled}
            description="Email для системных уведомлений и важных событий."
            label="Email-уведомления"
            onChange={(value) => updateSetting('emailNotificationsEnabled', value)}
          />
          <ToggleSetting
            checked={settings.maintenanceMode}
            description="Технический режим, когда платформу нужно временно ограничить."
            label="Режим обслуживания"
            onChange={(value) => updateSetting('maintenanceMode', value)}
          />
        </SettingSection>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-cyan-50 text-cyan-700">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-950">Что уже контролируется системой</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Эти параметры связаны с текущей архитектурой и видны владельцу платформы для контроля.
            </p>
          </div>
        </header>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { Icon: LockKeyhole, label: 'RLS и роли Supabase', value: 'platform_owner / admin / employee' },
            { Icon: Globe2, label: 'Slug организаций', value: '/the-liga/admin и /the-liga/employee' },
            { Icon: Bell, label: 'Очередь уведомлений', value: 'notification_outbox' },
          ].map(({ Icon, label, value }) => (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={label}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}
