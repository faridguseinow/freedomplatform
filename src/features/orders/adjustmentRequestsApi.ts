import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { AdjustmentRequestStatus } from '../../lib/supabase/database.types'

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
      return data
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
