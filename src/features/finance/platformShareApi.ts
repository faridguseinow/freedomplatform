import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinancePaymentMethod,
  PlatformSharePaymentRow,
} from '../../lib/supabase/database.types'

export const platformSharePaymentSelect =
  'id,organization_id,accrual_id,billing_period_start,billing_period_end,amount,payment_method,payment_date,reference,document_path,marked_sent_by,confirmed_received_by,marked_sent_at,confirmed_received_at,status,comment,created_at,updated_at'

export function usePlatformSharePayments(organizationId?: string | null) {
  return useQuery({
    queryKey: ['finance', 'platform-share-payments', organizationId ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('platform_share_payments')
        .select(platformSharePaymentSelect)
        .order('created_at', { ascending: false })

      if (organizationId) query = query.eq('organization_id', organizationId)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as PlatformSharePaymentRow[]
    },
  })
}

export function usePlatformShareMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  return {
    reportPeriodPayment: useMutation({
      mutationFn: async ({
        periodStart,
        periodEnd,
        amount,
        paymentMethod,
        paymentDate,
        reference,
        comment,
      }: {
        periodStart: string
        periodEnd: string
        amount: number
        paymentMethod: FinancePaymentMethod
        paymentDate: string
        reference?: string | null
        comment?: string | null
      }) => {
        if (!organizationId) throw new Error('Organization is required.')
        const { data, error } = await supabase.rpc('report_platform_period_payment', {
          target_organization_id: organizationId,
          target_period_start: periodStart,
          target_period_end: periodEnd,
          target_amount: amount,
          target_payment_method: paymentMethod,
          target_payment_date: paymentDate,
          target_reference: reference ?? null,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as PlatformSharePaymentRow
      },
      onSuccess: invalidate,
    }),
    convertExpenseToPeriodPayment: useMutation({
      mutationFn: async ({
        transactionId,
        periodStart,
        periodEnd,
      }: {
        transactionId: string
        periodStart: string
        periodEnd: string
      }) => {
        const { data, error } = await supabase.rpc('convert_expense_to_platform_period_payment', {
          target_transaction_id: transactionId,
          target_period_start: periodStart,
          target_period_end: periodEnd,
        })

        if (error) throw new Error(error.message)
        return data as PlatformSharePaymentRow
      },
      onSuccess: invalidate,
    }),
  }
}
