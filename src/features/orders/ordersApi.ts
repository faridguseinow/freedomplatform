import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { OrderStatus } from '../../lib/supabase/database.types'

export const adminOrderSelect =
  'id,organization_id,order_number,place_id,current_place_name_snapshot,status,customer_label,comment,subtotal,total_amount,paid_amount,unpaid_amount,opened_by,closed_by,opened_at,closed_at,payment_refusal_comment,created_at,updated_at'
export const adminOrderItemSelect =
  'id,organization_id,order_id,item_type,status,product_id,service_id,combo_id,timed_session_id,name_snapshot,description_snapshot,image_path_snapshot,quantity,unit_price,total_price,unit_cost_snapshot,total_cost_snapshot,metadata,added_by,added_at,removed_by,removed_at,removal_reason,created_at,updated_at'

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
      return data
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
