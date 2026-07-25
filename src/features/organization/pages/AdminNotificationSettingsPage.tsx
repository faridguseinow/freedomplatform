import { Loader2, Save } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import {
  useNotificationSettings,
  useNotificationSettingsMutations,
} from '../../shifts/notificationSettingsApi'

export function AdminNotificationSettingsPage() {
  const { organizationId } = useAuth()
  const settingsQuery = useNotificationSettings(organizationId)
  const mutations = useNotificationSettingsMutations(organizationId)
  const settings = settingsQuery.data

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Telegram уведомления</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Chat ID хранится в настройках организации. Bot token должен быть только в Edge Function secret `TELEGRAM_BOT_TOKEN`.
        </p>
      </header>
      {settingsQuery.isLoading ? <div className="text-sm text-slate-600"><Loader2 className="mr-2 inline size-4 animate-spin" /> Загрузка</div> : null}
      <form
        className="grid max-w-2xl gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        key={settings?.id ?? 'empty'}
        onSubmit={(event) => {
          event.preventDefault()
          if (!organizationId) return
          const formData = new FormData(event.currentTarget)
          mutations.upsert.mutate({
            organization_id: organizationId,
            telegram_enabled: formData.get('telegram_enabled') === 'on',
            telegram_chat_id: String(formData.get('telegram_chat_id') ?? '') || null,
          })
        }}
      >
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
          <input defaultChecked={settings?.telegram_enabled ?? false} name="telegram_enabled" type="checkbox" />
          Включить Telegram
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Telegram Chat ID</span>
          <input
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            defaultValue={settings?.telegram_chat_id ?? ''}
            name="telegram_chat_id"
          />
        </label>
        <Button disabled={mutations.upsert.isPending} type="submit">
          {mutations.upsert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Сохранить
        </Button>
      </form>
    </section>
  )
}
