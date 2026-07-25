import { Ban, FileText, Loader2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import {
  stockDocumentStatusLabel,
  stockDocumentTypeLabel,
  useInventoryMutations,
  useStockDocuments,
} from '../catalog/inventoryApi'

const formatDate = (value: string) => new Date(value).toLocaleDateString('ru')
const formatNumber = (value: number | null) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

export function AdminInventoryDocumentsPage() {
  const { organizationId } = useAuth()
  const documentsQuery = useStockDocuments(organizationId)
  const inventoryMutations = useInventoryMutations(organizationId)

  const cancelDocument = (documentId: string) => {
    const reason = window.prompt('Причина отмены документа')
    if (!reason) return
    inventoryMutations.cancelDocument.mutate({ documentId, reason })
  }

  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Складские документы</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Черновики, проведенные и отмененные документы склада.
        </p>
      </header>

      {documentsQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" />
          Загрузка документов
        </div>
      ) : null}

      {!documentsQuery.isLoading && !(documentsQuery.data ?? []).length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <FileText className="mx-auto size-8 text-cyan-700" />
          <h3 className="mt-3 text-base font-semibold text-slate-950">Документов пока нет</h3>
        </div>
      ) : null}

      <div className="grid gap-3">
        {(documentsQuery.data ?? []).map((document) => (
          <article
            className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]"
            key={document.id}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-950">#{document.document_number}</h3>
                <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800">
                  {stockDocumentTypeLabel[document.type]}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {stockDocumentStatusLabel[document.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {formatDate(document.document_date)} · {document.supplier_name || 'Без поставщика'} ·{' '}
                {document.reference || 'Без reference'}
              </p>
              {document.comment ? <p className="mt-1 text-sm text-slate-600">{document.comment}</p> : null}
            </div>
            <div className="flex items-start gap-2 lg:justify-end">
              <span className="min-h-10 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-900">
                {formatNumber(document.total_amount)} AZN
              </span>
              {document.status === 'draft' ? (
                <Button
                  onClick={() => inventoryMutations.postDocument.mutate(document.id)}
                  type="button"
                  variant="secondary"
                >
                  Провести
                </Button>
              ) : null}
              {document.status !== 'cancelled' ? (
                <Button onClick={() => cancelDocument(document.id)} type="button" variant="danger">
                  <Ban className="size-4" />
                  Отменить
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
