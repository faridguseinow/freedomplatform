import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'
import type {
  StockDocumentRow,
  StockDocumentStatus,
  StockDocumentItemRow,
  StockMovementType,
} from '../../../lib/supabase/database.types'

export const stockDocumentSelect =
  'id,organization_id,document_number,type,status,document_date,supplier_name,reference,comment,total_amount,created_by,posted_by,posted_at,cancelled_by,cancelled_at,cancellation_reason,created_at,updated_at'
export const stockDocumentItemSelect =
  'id,organization_id,document_id,product_id,quantity,unit_cost,line_total,comment,created_at'
export const stockMovementSelect =
  'id,organization_id,product_id,document_id,document_item_id,movement_type,quantity_delta,unit_cost,total_cost,reference_type,reference_id,comment,created_by,created_at'

export type StockDocumentInput = Pick<StockDocumentRow, 'organization_id' | 'type' | 'created_by'> &
  Partial<
    Pick<
      StockDocumentRow,
      'document_date' | 'supplier_name' | 'reference' | 'comment' | 'total_amount' | 'status'
    >
  >

export type StockDocumentItemInput = Pick<
  StockDocumentItemRow,
  'organization_id' | 'document_id' | 'product_id' | 'quantity'
> &
  Partial<Pick<StockDocumentItemRow, 'unit_cost' | 'line_total' | 'comment'>>

export function useInventoryBalances(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'inventory', 'balances', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(
          'id,organization_id,category_id,sku,name,image_path,sale_price,purchase_price,stock_quantity,minimum_stock_quantity,average_purchase_cost,unit_name,track_stock,status',
        )
        .eq('organization_id', organizationId!)
        .eq('track_stock', true)
        .neq('status', 'archived')
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useInventoryRecentAdditions(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'inventory', 'recent-additions', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id,product_id,movement_type,quantity_delta,created_at')
        .eq('organization_id', organizationId!)
        .in('movement_type', ['opening_balance', 'purchase', 'return_in', 'adjustment_in', 'transfer_in'])
        .order('created_at', { ascending: false })
        .limit(1000)

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useStockDocuments(organizationId: string | null, type?: StockMovementType) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'inventory', 'documents', organizationId, type ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('stock_documents')
        .select(stockDocumentSelect)
        .eq('organization_id', organizationId!)

      if (type) query = query.eq('type', type)

      const { data, error } = await query
        .order('document_date', { ascending: false })
        .limit(100)

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useStockDocumentDetail(documentId: string | null) {
  return useQuery({
    enabled: Boolean(documentId),
    queryKey: ['admin', 'inventory', 'document', documentId],
    queryFn: async () => {
      const { data: document, error } = await supabase
        .from('stock_documents')
        .select(stockDocumentSelect)
        .eq('id', documentId!)
        .single()

      if (error) throw new Error(error.message)

      const { data: items, error: itemsError } = await supabase
        .from('stock_document_items')
        .select(stockDocumentItemSelect)
        .eq('document_id', documentId!)
        .order('created_at', { ascending: true })

      if (itemsError) throw new Error(itemsError.message)

      const productIds = [...new Set(items.map((item) => item.product_id))]
      const { data: products, error: productsError } = productIds.length
        ? await supabase
            .from('products')
            .select('id,name,unit_name')
            .in('id', productIds)
        : { data: [], error: null }

      if (productsError) throw new Error(productsError.message)

      return { document, items, products }
    },
  })
}

export function useProductMovements(productId: string | null) {
  return useQuery({
    enabled: Boolean(productId),
    queryKey: ['admin', 'inventory', 'movements', productId],
    queryFn: async () => {
      const [movementsResult, productResult] = await Promise.all([
        supabase
          .from('stock_movements')
          .select(stockMovementSelect)
          .eq('product_id', productId!)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('products')
          .select('id,name,stock_quantity,unit_name')
          .eq('id', productId!)
          .single(),
      ])

      if (movementsResult.error) throw new Error(movementsResult.error.message)
      if (productResult.error) throw new Error(productResult.error.message)
      return { movements: movementsResult.data, product: productResult.data }
    },
  })
}

export function useInventoryMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'catalog', 'products', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['finance'] }),
      queryClient.invalidateQueries({ queryKey: ['platform', 'finance'] }),
    ])
  }

  return {
    createDocument: useMutation({
      mutationFn: async (input: StockDocumentInput) => {
        const { data, error } = await supabase
          .from('stock_documents')
          .insert(input)
          .select(stockDocumentSelect)
          .single()

        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    updateDocument: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: Partial<StockDocumentInput> }) => {
        const { data, error } = await supabase
          .from('stock_documents')
          .update(input)
          .eq('id', id)
          .select(stockDocumentSelect)
          .single()

        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    addItems: useMutation({
      mutationFn: async (items: StockDocumentItemInput[]) => {
        if (!items.length) return []
        const { data, error } = await supabase
          .from('stock_document_items')
          .insert(items)
          .select(stockDocumentItemSelect)

        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    postDocument: useMutation({
      mutationFn: async (documentId: string) => {
        const { data, error } = await supabase.rpc('post_stock_document', {
          target_document_id: documentId,
        })
        if (error) throw new Error(error.message)
        if (data?.type === 'purchase') {
          const { error: financeError } = await supabase.rpc('create_purchase_finance_transaction', {
            target_document_id: data.id,
          })
          if (financeError) throw new Error(financeError.message)
        }
        return data
      },
      onSuccess: invalidate,
    }),
    syncPurchaseFinanceTransaction: useMutation({
      mutationFn: async (documentId: string) => {
        const { data, error } = await supabase.rpc('create_purchase_finance_transaction', {
          target_document_id: documentId,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    cancelDocument: useMutation({
      mutationFn: async ({ documentId, reason }: { documentId: string; reason: string }) => {
        const { data, error } = await supabase.rpc('cancel_stock_document', {
          target_document_id: documentId,
          target_reason: reason,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    createOpeningStock: useMutation({
      mutationFn: async ({
        productId,
        quantity,
        unitCost,
        comment,
      }: {
        productId: string
        quantity: number
        unitCost?: number | null
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('create_opening_stock_document', {
          target_product_id: productId,
          target_quantity: quantity,
          target_unit_cost: unitCost ?? null,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    reconcileProduct: useMutation({
      mutationFn: async (productId: string) => {
        const { data, error } = await supabase.rpc('reconcile_product_stock', {
          target_product_id: productId,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}

export const stockDocumentTypeLabel: Record<StockMovementType, string> = {
  opening_balance: 'Начальный остаток',
  purchase: 'Закупка',
  sale: 'Продажа',
  return_in: 'Возврат приход',
  return_out: 'Возврат расход',
  write_off: 'Списание',
  adjustment_in: 'Корректировка +',
  adjustment_out: 'Корректировка -',
  combo_reservation: 'Резерв комбо',
  combo_release: 'Снятие резерва комбо',
  order_reservation: 'Резерв заказа',
  order_release: 'Снятие резерва заказа',
  transfer_in: 'Перемещение +',
  transfer_out: 'Перемещение -',
}

export const stockDocumentStatusLabel: Record<StockDocumentStatus, string> = {
  draft: 'Черновик',
  posted: 'Проведен',
  cancelled: 'Отменен',
}
