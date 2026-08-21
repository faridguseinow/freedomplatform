import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { OrderItemRow, OrderRow, OrderStatus } from '../../lib/supabase/database.types'

export const adminOrderSelect =
  'id,organization_id,order_number,place_id,current_place_name_snapshot,status,customer_label,comment,subtotal,total_amount,paid_amount,unpaid_amount,opened_by,closed_by,opened_at,closed_at,payment_refusal_comment,created_at,updated_at'
export const adminOrderItemSelect =
  'id,organization_id,order_id,item_type,status,product_id,service_id,combo_id,timed_session_id,name_snapshot,description_snapshot,image_path_snapshot,quantity,unit_price,total_price,unit_cost_snapshot,total_cost_snapshot,metadata,added_by,added_at,removed_by,removed_at,removal_reason,created_at,updated_at'

type AdminOrderItemSummary = Pick<OrderItemRow, 'id' | 'order_id' | 'name_snapshot' | 'quantity' | 'total_price' | 'status'>

export type AdminOrderRow = OrderRow & {
  items_count: number
  items_preview: string[]
}

export function useAdminOrders(organizationId: string | null, status: OrderStatus | 'all' = 'all') {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'orders', organizationId, status],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(adminOrderSelect)
        .eq('organization_id', organizationId!)
        .order('opened_at', { ascending: false })
        .limit(200)

      if (status !== 'all') {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      const orders = (data ?? []) as OrderRow[]
      const orderIds = orders.map((order) => order.id)

      const { data: items, error: itemsError } = orderIds.length
        ? await supabase
            .from('order_items')
            .select('id,order_id,name_snapshot,quantity,total_price,status')
            .in('order_id', orderIds)
            .order('added_at', { ascending: true })
        : { data: [], error: null }

      if (itemsError) throw new Error(itemsError.message)

      const itemsByOrderId = new Map<string, AdminOrderItemSummary[]>()
      for (const item of (items ?? []) as AdminOrderItemSummary[]) {
        const nextItems = itemsByOrderId.get(item.order_id) ?? []
        nextItems.push(item)
        itemsByOrderId.set(item.order_id, nextItems)
      }

      return orders.map((order) => {
        const orderItems = itemsByOrderId.get(order.id) ?? []
        const activeItems = orderItems.filter((item) => item.status !== 'removed' && item.status !== 'cancelled')

        return {
          ...order,
          items_count: activeItems.length,
          items_preview: activeItems.slice(0, 3).map((item) => `${item.name_snapshot} × ${item.quantity}`),
        }
      }) satisfies AdminOrderRow[]
    },
  })
}

export function useAdminOrderDetail(orderId: string | null) {
  return useQuery({
    enabled: Boolean(orderId),
    queryKey: ['admin', 'order-detail', orderId],
    queryFn: async () => {
      const [orderResult, itemsResult, paymentsResult, sessionsResult, reservationsResult] =
        await Promise.all([
          supabase.from('orders').select(adminOrderSelect).eq('id', orderId!).single(),
          supabase
            .from('order_items')
            .select(adminOrderItemSelect)
            .eq('order_id', orderId!)
            .order('added_at', { ascending: true }),
          supabase
            .from('payments')
            .select('*')
            .eq('order_id', orderId!)
            .order('created_at', { ascending: false }),
          supabase
            .from('timed_sessions')
            .select('*')
            .eq('order_id', orderId!)
            .order('started_at', { ascending: false }),
          supabase
            .from('stock_reservations')
            .select('*')
            .eq('order_id', orderId!)
            .order('created_at', { ascending: true }),
        ])

      if (orderResult.error) throw new Error(orderResult.error.message)
      if (itemsResult.error) throw new Error(itemsResult.error.message)
      if (paymentsResult.error) throw new Error(paymentsResult.error.message)
      if (sessionsResult.error) throw new Error(sessionsResult.error.message)
      if (reservationsResult.error) throw new Error(reservationsResult.error.message)

      return {
        order: orderResult.data,
        items: itemsResult.data,
        payments: paymentsResult.data,
        sessions: sessionsResult.data,
        reservations: reservationsResult.data,
      }
    },
  })
}
