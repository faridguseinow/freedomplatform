import { Loader2, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import {
  type ShiftTemplateInput,
  useShiftTemplateMutations,
  useShiftTemplates,
} from '../../shifts/shiftTemplatesApi'

export function AdminShiftTemplatesPage() {
  const { organizationId, user } = useAuth()
  const templatesQuery = useShiftTemplates(organizationId)
  const mutations = useShiftTemplateMutations(organizationId)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [crossesMidnight, setCrossesMidnight] = useState(false)
  const [lateCloseGrace, setLateCloseGrace] = useState(15)
  const [sortOrder, setSortOrder] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!organizationId || !user) return
    setError(null)
    try {
      const input: ShiftTemplateInput = {
        organization_id: organizationId,
        name,
        start_time: startTime,
        end_time: endTime,
        crosses_midnight: crossesMidnight,
        sort_order: sortOrder,
        is_active: true,
        expected_duration_minutes: null,
        late_close_grace_minutes: lateCloseGrace,
        created_by: user.id,
      }
      await mutations.upsert.mutateAsync({ input })
      setName('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось сохранить шаблон.')
    }
  }

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Шаблоны смен</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Настройте одну, две или больше смен. Данные The Liga создаются вручную, не миграцией.
        </p>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input id="shift_template_name" label="Название" onChange={(event) => setName(event.target.value)} value={name} />
        <Input id="shift_start" label="Начало" onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} />
        <Input id="shift_end" label="Завершение" onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} />
        <Input id="shift_grace" label="Задержка закрытия, мин" min={0} onChange={(event) => setLateCloseGrace(Number(event.target.value))} type="number" value={lateCloseGrace} />
        <Input id="shift_sort" label="Порядок" min={0} onChange={(event) => setSortOrder(Number(event.target.value))} type="number" value={sortOrder} />
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700">
          <input checked={crossesMidnight} onChange={(event) => setCrossesMidnight(event.target.checked)} type="checkbox" />
          Переход через полночь
        </label>
        <Button className="md:col-span-3" disabled={mutations.upsert.isPending || !name.trim()} type="submit">
          {mutations.upsert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Сохранить шаблон
        </Button>
      </form>

      <div className="grid gap-3">
        {templatesQuery.isLoading ? <div className="text-sm text-slate-600">Загрузка...</div> : null}
        {(templatesQuery.data ?? []).map((template) => (
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={template.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{template.name}</h3>
                <p className="text-sm text-slate-600">
                  {template.start_time.slice(0, 5)}-{template.end_time.slice(0, 5)}
                  {template.crosses_midnight ? ' · через полночь' : ''}
                </p>
              </div>
              <Button
                onClick={() =>
                  mutations.upsert.mutate({
                    id: template.id,
                    input: { ...template, is_active: !template.is_active },
                  })
                }
                type="button"
                variant="secondary"
              >
                {template.is_active ? 'Отключить' : 'Включить'}
              </Button>
            </div>
          </article>
        ))}
        {!(templatesQuery.data ?? []).length && !templatesQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            <Plus className="mb-2 size-5 text-slate-400" />
            Шаблонов пока нет.
          </div>
        ) : null}
      </div>
    </section>
  )
}
