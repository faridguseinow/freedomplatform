import type { LucideIcon } from 'lucide-react'
import { EmptyState } from './EmptyState'

type PageScaffoldProps = {
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  icon: LucideIcon
}

export function PageScaffold({
  description,
  emptyDescription,
  emptyTitle,
  icon,
  title,
}: PageScaffoldProps) {
  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          {description}
        </p>
      </header>

      <EmptyState description={emptyDescription} icon={icon} title={emptyTitle} />
    </section>
  )
}
