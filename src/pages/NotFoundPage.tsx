import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-10">
      <section className="grid w-full max-w-md gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-emerald-800">404</p>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold text-slate-950">Страница не найдена</h1>
          <p className="text-sm leading-6 text-slate-600">
            Маршрут не существует или у вас нет прямой ссылки на нужный раздел.
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          to="/"
        >
          На главную
        </Link>
      </section>
    </main>
  )
}
