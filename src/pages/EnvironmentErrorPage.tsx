import { AlertTriangle } from 'lucide-react'

type EnvironmentErrorPageProps = {
  missingKeys: string[]
}

export function EnvironmentErrorPage({ missingKeys }: EnvironmentErrorPageProps) {
  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-8 text-slate-950">
      <section className="grid w-full max-w-lg gap-4 rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-xl font-semibold">Не настроено окружение</h1>
          <p className="text-sm leading-6 text-slate-600">
            Создайте `.env.local` в корне проекта и заполните публичные Supabase переменные.
            Значения ключей не выводятся в интерфейс.
          </p>
        </div>
        <ul className="grid gap-1 text-sm font-medium text-slate-800">
          {missingKeys.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
