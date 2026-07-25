import { AlertTriangle, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

type StateViewProps = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}

export function FullPageLoader() {
  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4">
      <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
        Загрузка
      </div>
    </main>
  )
}

export function StateView({ actionHref, actionLabel, description, title }: StateViewProps) {
  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-10">
      <section className="grid w-full max-w-md gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto inline-flex size-11 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {actionHref && actionLabel ? (
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            to={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </section>
    </main>
  )
}
