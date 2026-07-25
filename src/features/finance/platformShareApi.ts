import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinancePaymentMethod,
  OrganizationPlatformShareRateRow,
  PlatformShareAccrualRow,
  PlatformSharePaymentRow,
} from '../../lib/supabase/database.types'

export const platformShareAccrualSelect =
  'id,organization_id,financial_period_id,percentage_snapshot,net_profit_snapshot,accrued_amount,paid_amount,outstanding_amount,status,due_date,approved_at,fully_paid_at,created_at,updated_at'
export const platformSharePaymentSelect =
  'id,organization_id,accrual_id,amount,payment_method,payment_date,reference,document_path,marked_sent_by,confirmed_received_by,marked_sent_at,confirmed_received_at,status,comment,created_at,updated_at'
export const platformShareRateSelect =
  'id,organization_id,percentage,effective_from,effective_to,created_by,created_at,comment'

export function usePlatformShareAccruals(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'platform-share-accruals', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_share_accruals')
        .select(platformShareAccrualSelect)
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return data as PlatformShareAccrualRow[]
    },
  })
}

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

export function usePlatformShareRates(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'platform-share-rates', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_platform_share_rates')
        .select(platformShareRateSelect)
        .eq('organization_id', organizationId!)
        .order('effective_from', { ascending: false })

      if (error) throw new Error(error.message)
      return data as OrganizationPlatformShareRateRow[]
    },
  })
}

export function usePlatformShareMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  return {
    reportPayment: useMutation({
      mutationFn: async ({
        accrualId,
        amount,
        paymentMethod,
        paymentDate,
        reference,
        documentPath,
        comment,
      }: {
        accrualId: string
        amount: number
        paymentMethod: FinancePaymentMethod
        paymentDate: string
        reference?: string | null
        documentPath?: string | null
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('report_platform_share_payment', {
          target_accrual_id: accrualId,
          target_amount: amount,
          target_payment_method: paymentMethod,
          target_payment_date: paymentDate,
          target_reference: reference ?? null,
          target_document_path: documentPath ?? null,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as PlatformSharePaymentRow
      },
      onSuccess: invalidate,
    }),
    setRate: useMutation({
      mutationFn: async ({
        percentage,
        effectiveFrom,
        comment,
      }: {
        percentage: number
        effectiveFrom: string
        comment?: string | null
      }) => {
        if (!organizationId) throw new Error('Organization is required.')
        const { data, error } = await supabase.rpc('set_platform_share_rate', {
          target_organization_id: organizationId,
          target_percentage: percentage,
          target_effective_from: effectiveFrom,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as OrganizationPlatformShareRateRow
      },
      onSuccess: invalidate,
    }),
    confirmPayment: useMutation({
      mutationFn: async ({
        paymentId,
        decision,
        comment,
      }: {
        paymentId: string
        decision: 'confirmed' | 'rejected'
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('confirm_platform_share_payment', {
          target_payment_id: paymentId,
          target_decision: decision,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as PlatformSharePaymentRow
      },
      onSuccess: invalidate,
    }),
  }
}
