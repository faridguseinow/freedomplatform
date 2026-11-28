import { cn } from '../../lib/utils/cn'

/**
 * Скелетоны вместо надписи «Загрузка»: показывают форму будущего содержимого,
 * поэтому страница не прыгает, когда данные приходят.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-md', className)} />
}

function SkeletonRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={className} role="status">
      <span className="sr-only">Загрузка</span>
      {children}
    </div>
  )
}

/** Сетка карточек: каталог товаров, услуг, мест. */
export function SkeletonCardGrid({
  className,
  count = 8,
  variant = 'catalog',
}: {
  className?: string
  count?: number
  variant?: 'catalog' | 'compact'
}) {
  return (
    <SkeletonRegion
      className={cn(
        'grid gap-3',
        variant === 'catalog' ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={index}>
          {variant === 'catalog' ? <Skeleton className="h-24 w-full sm:h-28" /> : null}
          <div className="flex items-center gap-2">
            {variant === 'compact' ? <Skeleton className="size-8 shrink-0 rounded-full" /> : null}
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="grid gap-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          {variant === 'catalog' ? <Skeleton className="h-8 w-full" /> : null}
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Строки таблицы или списка: заказы, сотрудники, журнал, склад. */
export function SkeletonList({ className, rows = 6 }: { className?: string; rows?: number }) {
  return (
    <SkeletonRegion className={cn('overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0" key={index}>
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Skeleton className={cn('h-3.5', index % 3 === 0 ? 'w-1/2' : index % 3 === 1 ? 'w-2/5' : 'w-3/5')} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Плитки показателей: обзор, финансы. */
export function SkeletonStats({ className, count = 4 }: { className?: string; count?: number }) {
  return (
    <SkeletonRegion className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, index) => (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={index}>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Заготовка страницы целиком: пока загружается код раздела. */
export function PageSkeleton() {
  return (
    <SkeletonRegion className="grid content-start gap-5 animate-fade-in">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="hidden h-10 w-40 sm:block" />
      </div>
      <SkeletonCardGrid count={8} />
    </SkeletonRegion>
  )
}
