import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../../components/common/EmptyState'
import { stockDocumentTypeLabel, useProductMovements } from '../catalog/inventoryApi'

const formatNumber = (value: number | null) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 3 }).format(value ?? 0)

export function AdminInventoryProductPage() {
  const { productId } = useParams<{ productId: string }>()
  const movementsQuery = useProductMovements(productId ?? null)

  let running = 0
  const chronological = [...(movementsQuery.data ?? [])].reverse()
  const balanceByMovement = new Map<string, number>()
  chronological.forEach((movement) => {
    running += movement.quantity_delta
    balanceByMovement.set(movement.id, running)
  })

  return (
    <section className="grid gap-5">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          to="/admin/inventory"
        >
          <ArrowLeft className="size-4" />
          Склад
        </Link>
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">История товара</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Последние движения по товару. Показано до 100 записей.
          </p>
        </div>
      </header>

      {movementsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" />
          Загрузка истории
        </div>
      ) : null}

      {!movementsQuery.isLoading && !(movementsQuery.data ?? []).length ? (
        <EmptyState description="По товару пока нет складских движений." icon={ArrowLeft} title="История пуста" />
      ) : null}

      <div className="grid gap-3">
        {(movementsQuery.data ?? []).map((movement) => (
          <article
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-[1fr_auto]"
            key={movement.id}
          >
            <div>
              <p className="font-semibold text-slate-950">{stockDocumentTypeLabel[movement.movement_type]}</p>
              <p className="mt-1 text-slate-600">
                {new Date(movement.created_at).toLocaleString('ru')} · {movement.comment || 'Без комментария'}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-right">
              <div><dt className="text-xs uppercase text-slate-500">Движение</dt><dd>{formatNumber(movement.quantity_delta)}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">Цена</dt><dd>{formatNumber(movement.unit_cost)}</dd></div>
              <div><dt className="text-xs uppercase text-slate-500">После</dt><dd>{formatNumber(balanceByMovement.get(movement.id) ?? 0)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
