import { Building2 } from 'lucide-react'
import { useI18n } from '../lib/i18n/I18nContext'

type OrganizationNotFoundPageProps = {
  unavailable?: boolean
}

export function OrganizationNotFoundPage({ unavailable = false }: OrganizationNotFoundPageProps) {
  const { t } = useI18n()

  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-10">
      <section className="grid w-full max-w-md gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto inline-flex size-11 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Building2 aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-xl font-semibold text-slate-950">
            {unavailable ? t('organization.unavailable') : t('organization.notFound')}
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            {unavailable
              ? t('organization.unavailableDescription')
              : t('organization.notFoundDescription')}
          </p>
        </div>
      </section>
    </main>
  )
}
