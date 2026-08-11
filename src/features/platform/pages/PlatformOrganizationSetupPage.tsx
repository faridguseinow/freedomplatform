import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  Circle,
  Landmark,
  MapPin,
  Package,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { supabase } from '../../../lib/supabase/client'
import type { OrganizationReadiness } from '../../../lib/supabase/database.types'
import { usePlatformOrganizations } from '../platformApi'

const checklistItems: Array<{
  key: keyof OrganizationReadiness
  label: string
  description: string
  icon: typeof Building2
  optional?: boolean
}> = [
  {
    key: 'has_admin',
    label: 'Администратор',
    description: 'Назначен активный администратор организации.',
    icon: ShieldCheck,
  },
  {
    key: 'has_employee',
    label: 'Сотрудник',
    description: 'Создан хотя бы один активный сотрудник.',
    icon: Users,
  },
  {
    key: 'has_places',
    label: 'Места',
    description: 'Созданы рабочие места организации.',
    icon: MapPin,
  },
  {
    key: 'has_timed_places',
    label: 'Timed места',
    description: 'Есть хотя бы одно место с почасовой тарификацией.',
    icon: Boxes,
  },
  {
    key: 'has_shift_templates',
    label: 'Смены',
    description: 'Настроены шаблоны смен.',
    icon: CheckCircle2,
  },
  {
    key: 'has_finance_categories',
    label: 'Финансовые категории',
    description: 'Созданы категории для доходов и расходов.',
    icon: Landmark,
  },
  {
    key: 'has_share_rate',
    label: 'Доля платформы',
    description: 'Задана ставка Freedom Platform.',
    icon: Landmark,
  },
  {
    key: 'telegram_configured',
    label: 'Telegram',
    description: 'Настроены уведомления. Не блокирует запуск.',
    icon: Bell,
    optional: true,
  },
  {
    key: 'has_products',
    label: 'Товары',
    description: 'Необязательно для организаций только с услугами.',
    icon: Package,
    optional: true,
  },
  {
    key: 'has_services',
    label: 'Услуги',
    description: 'Необязательно, если организация работает только с товарами.',
    icon: Tags,
    optional: true,
  },
]

export function PlatformOrganizationSetupPage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const organizations = usePlatformOrganizations()

  const readiness = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['platform', 'organizations', organizationId, 'readiness'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_organization_readiness', {
        target_organization_id: organizationId!,
      })

      if (error) throw new Error(error.message)
      return data as OrganizationReadiness
    },
  })

  const organization = organizations.data?.find((item) => item.id === organizationId)

  return (
    <section className="grid gap-5">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          to="/platform/organizations"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Организации
        </Link>
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Setup организации
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            {organization?.name ?? 'Организация'}: проверка готовности к первому рабочему запуску.
          </p>
        </div>
      </header>

      {readiness.data ? (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Готовность</p>
              <p className="text-3xl font-semibold text-slate-950">
                {readiness.data.readiness_percentage}%
              </p>
            </div>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
              to={`/platform/finance/organizations/${organizationId}`}
            >
              Финансы организации
            </Link>
          </div>
          {readiness.data.blockers.length ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Блокеры: {readiness.data.blockers.join(', ')}
            </div>
          ) : null}
          {readiness.data.warnings.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Предупреждения: {readiness.data.warnings.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {readiness.isError ? (
        <EmptyState
          description={readiness.error.message}
          icon={Building2}
          title="Readiness пока недоступен"
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {checklistItems.map((item) => {
          const value = readiness.data?.[item.key]
          const isReady = value === true
          const Icon = item.icon

          return (
            <article className="rounded-md border border-slate-200 bg-white p-4" key={item.key}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-emerald-700">
                  {isReady ? (
                    <CheckCircle2 aria-hidden="true" className="size-5" />
                  ) : (
                    <Circle aria-hidden="true" className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-slate-500" />
                    <h3 className="font-medium text-slate-950">{item.label}</h3>
                    {item.optional ? (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        optional
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
