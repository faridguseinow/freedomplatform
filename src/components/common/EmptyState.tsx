import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
}

export function EmptyState({ description, icon: Icon, title }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-md justify-items-center gap-3 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </section>
  )
}
