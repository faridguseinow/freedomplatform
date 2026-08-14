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
  const [sortOrder, setSortOrder] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!organizationId || !user) return
    setError(null)
    try {
      const input: ShiftTemplateInput = {
        organization_id: organizationId,
        name,
        start_time: null,
        end_time: null,
        crosses_midnight: false,
        sort_order: sortOrder,
        is_active: true,
        expected_duration_minutes: null,
        late_close_grace_minutes: 0,
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
          Настройте названия смен без фиксированного времени. Итоги считаются по фактическому открытию и закрытию смены.
        </p>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(240px,1fr)_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Input id="shift_template_name" label="Название" onChange={(event) => setName(event.target.value)} value={name} />
        <Input id="shift_sort" label="Порядок" min={0} onChange={(event) => setSortOrder(Number(event.target.value))} type="number" value={sortOrder} />
        <Button className="self-end" disabled={mutations.upsert.isPending || !name.trim()} type="submit">
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
                <p className="text-sm text-slate-600">Без фиксированного времени</p>
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
