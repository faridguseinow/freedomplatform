import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { CustomerDebtRow, PaymentMethod } from '../../lib/supabase/database.types'

const debtSelect =
  'id,organization_id,order_id,order_number_snapshot,customer_name,customer_phone,original_amount,paid_amount,balance_amount,status,incurred_on,due_on,comment,created_by,created_at,paid_at,updated_at'

export function useCustomerDebts(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['customer-debts', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_debts')
        .select(debtSelect)
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return data as CustomerDebtRow[]
    },
  })
}

export function useDebtMutations(organizationId: string | null) {
  const queryClient = useQueryClient()

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer-debts', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-orders', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['finance'] }),
    ])
  }

  const create = useMutation({
    mutationFn: async (input: {
      orderId: string
      customerName: string
      customerPhone: string
      dueOn?: string | null
      comment?: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_customer_debt', {
        target_order_id: input.orderId,
        target_customer_name: input.customerName,
        target_customer_phone: input.customerPhone,
        target_due_on: input.dueOn || null,
        target_comment: input.comment || null,
      })
      if (error) throw new Error(error.message)
      return data as CustomerDebtRow
    },
    onSuccess: refresh,
  })

  const receivePayment = useMutation({
    mutationFn: async (input: {
      debtId: string
      amount: number
      method: PaymentMethod
      comment?: string | null
    }) => {
      const { data, error } = await supabase.rpc('record_customer_debt_payment', {
        target_debt_id: input.debtId,
        target_amount: input.amount,
        target_method: input.method,
        target_comment: input.comment || null,
      })
      if (error) throw new Error(error.message)
      return data as CustomerDebtRow
    },
    onSuccess: refresh,
  })

  const update = useMutation({
    mutationFn: async (input: {
      debtId: string
      customerName: string
      customerPhone: string
      dueOn?: string | null
      comment?: string | null
    }) => {
      const { data, error } = await supabase.rpc('update_customer_debt', {
        target_debt_id: input.debtId,
        target_customer_name: input.customerName,
        target_customer_phone: input.customerPhone,
        target_due_on: input.dueOn || null,
        target_comment: input.comment || null,
      })
      if (error) throw new Error(error.message)
      return data as CustomerDebtRow
    },
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: async (input: { debtId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('delete_customer_debt', {
        target_debt_id: input.debtId,
        target_reason: input.reason,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: refresh,
  })

  return { create, receivePayment, update, remove }
}
