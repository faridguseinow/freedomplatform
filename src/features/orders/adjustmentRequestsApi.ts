import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  AdjustmentRequestStatus,
  OrderAdjustmentRequestRow,
  OrderItemRow,
  OrderRow,
  ProfileRow,
} from '../../lib/supabase/database.types'

type AdjustmentProfile = Pick<ProfileRow, 'id' | 'email' | 'full_name'>
type AdjustmentOrder = Pick<OrderRow, 'id' | 'order_number' | 'current_place_name_snapshot' | 'customer_label' | 'status' | 'total_amount'>
type AdjustmentItem = Pick<OrderItemRow, 'id' | 'name_snapshot' | 'quantity' | 'unit_price' | 'total_price' | 'status'>

export type AdminAdjustmentRequestRow = OrderAdjustmentRequestRow & {
  order: AdjustmentOrder | null
  order_item: AdjustmentItem | null
  requested_by_profile: AdjustmentProfile | null
  reviewed_by_profile: AdjustmentProfile | null
}

export function useAdminAdjustmentRequests(
  organizationId: string | null,
  status: AdjustmentRequestStatus | 'all' = 'pending',
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'adjustment-requests', organizationId, status],
    queryFn: async () => {
      let query = supabase
        .from('order_adjustment_requests')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('requested_at', { ascending: false })
        .limit(200)

      if (status !== 'all') {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      const requests = (data ?? []) as OrderAdjustmentRequestRow[]
      const userIds = [
        ...new Set(requests.flatMap((request) => [request.requested_by, request.reviewed_by]).filter(Boolean) as string[]),
      ]
      const orderIds = [...new Set(requests.map((request) => request.order_id))]
      const itemIds = [
        ...new Set(requests.map((request) => request.order_item_id).filter(Boolean) as string[]),
      ]

      const [profilesResult, ordersResult, itemsResult] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('id,email,full_name').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabase
              .from('orders')
              .select('id,order_number,current_place_name_snapshot,customer_label,status,total_amount')
              .in('id', orderIds)
          : Promise.resolve({ data: [], error: null }),
        itemIds.length
          ? supabase
              .from('order_items')
              .select('id,name_snapshot,quantity,unit_price,total_price,status')
              .in('id', itemIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (profilesResult.error) throw new Error(profilesResult.error.message)
      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (itemsResult.error) throw new Error(itemsResult.error.message)

      const profilesById = new Map((profilesResult.data as AdjustmentProfile[]).map((profile) => [profile.id, profile]))
      const ordersById = new Map((ordersResult.data as AdjustmentOrder[]).map((order) => [order.id, order]))
      const itemsById = new Map((itemsResult.data as AdjustmentItem[]).map((item) => [item.id, item]))

      return requests.map((request) => ({
        ...request,
        order: ordersById.get(request.order_id) ?? null,
        order_item: request.order_item_id ? itemsById.get(request.order_item_id) ?? null : null,
        requested_by_profile: profilesById.get(request.requested_by) ?? null,
        reviewed_by_profile: request.reviewed_by ? profilesById.get(request.reviewed_by) ?? null : null,
      })) satisfies AdminAdjustmentRequestRow[]
    },
  })
}

export function useAdjustmentRequestMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'adjustment-requests', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
  }

  return {
    review: useMutation({
      mutationFn: async ({
        requestId,
        decision,
        comment,
      }: {
        requestId: string
        decision: 'approved' | 'rejected'
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('review_order_adjustment', {
          target_request_id: requestId,
          target_decision: decision,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}
