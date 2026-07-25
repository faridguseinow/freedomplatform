import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'

export function useSessionMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (orderId?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', organizationId] })
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: ['employee', 'order-items', orderId] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'order-detail', orderId] })
    }
  }

  return {
    start: useMutation({
      mutationFn: async ({ placeId, orderId }: { placeId: string; orderId?: string | null }) => {
        const { data, error } = await supabase.rpc('start_timed_session', {
          target_place_id: placeId,
          target_order_id: orderId ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (session) => invalidate(session.order_id),
    }),
    complete: useMutation({
      mutationFn: async (sessionId: string) => {
        const { data, error } = await supabase.rpc('complete_timed_session', {
          target_session_id: sessionId,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (session) => invalidate(session.order_id),
    }),
  }
}
