import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { PaymentMethod } from '../../lib/supabase/database.types'

export function usePaymentMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (orderId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'order-detail', orderId] })
  }

  return {
    complete: useMutation({
      mutationFn: async ({ orderId, method }: { orderId: string; method: PaymentMethod }) => {
        const { data, error } = await supabase.rpc('complete_order_payment', {
          target_order_id: orderId,
          target_method: method,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    refuse: useMutation({
      mutationFn: async ({ orderId, comment }: { orderId: string; comment: string }) => {
        const { data, error } = await supabase.rpc('mark_order_payment_refused', {
          target_order_id: orderId,
          target_comment: comment,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
  }
}
