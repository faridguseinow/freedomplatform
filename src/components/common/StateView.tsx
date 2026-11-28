import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../ui/Skeleton'

type StateViewProps = {
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}

/** Первая загрузка приложения: заготовка интерфейса вместо надписи «Загрузка». */
export function FullPageLoader() {
  return (
    <main aria-busy="true" className="flex min-h-svh bg-slate-50 animate-fade-in" role="status">
      <span className="sr-only">Загрузка</span>
      <aside aria-hidden="true" className="hidden w-64 shrink-0 flex-col gap-3 border-r border-slate-200 bg-white p-4 md:flex">
        <div className="flex items-center gap-3 pb-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton className="h-9 w-full" key={index} />
        ))}
      </aside>
      <div aria-hidden="true" className="grid flex-1 content-start gap-5 p-4 sm:p-6">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3" key={index}>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
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
