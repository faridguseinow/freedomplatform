import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { FinancialPeriodRow } from '../../lib/supabase/database.types'

export const financialPeriodSelect =
  'id,organization_id,period_start,period_end,status,revenue,cogs,gross_profit,operating_expenses,other_income,net_profit_before_platform_share,platform_share_percentage,platform_share_amount,organization_owner_amount,cash_inflow,cash_outflow,submitted_by,submitted_at,reviewed_by,reviewed_at,review_comment,locked_at,created_at,updated_at'

export function useFinancialPeriods(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'periods', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_periods')
        .select(financialPeriodSelect)
        .eq('organization_id', organizationId!)
        .order('period_start', { ascending: false })

      if (error) throw new Error(error.message)
      return data as FinancialPeriodRow[]
    },
  })
}

export function useFinancialPeriod(periodId: string | null) {
  return useQuery({
    enabled: Boolean(periodId),
    queryKey: ['finance', 'period', periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_periods')
        .select(financialPeriodSelect)
        .eq('id', periodId!)
        .single()

      if (error) throw new Error(error.message)
      return data as FinancialPeriodRow
    },
  })
}

export function useFinancialPeriodMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (periodId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
    if (periodId) await queryClient.invalidateQueries({ queryKey: ['finance', 'period', periodId] })
  }

  return {
    submit: useMutation({
      mutationFn: async ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) => {
        const { data, error } = await supabase.rpc('submit_financial_period', {
          target_period_start: periodStart,
          target_period_end: periodEnd,
        })

        if (error) throw new Error(error.message)
        return data as FinancialPeriodRow
      },
      onSuccess: (period) => invalidate(period.id),
    }),
    review: useMutation({
      mutationFn: async ({
        periodId,
        decision,
        comment,
      }: {
        periodId: string
        decision: 'approved' | 'clarification_requested' | 'rejected'
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('review_financial_period', {
          target_period_id: periodId,
          target_decision: decision,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as FinancialPeriodRow
      },
      onSuccess: (period) => invalidate(period.id),
    }),
    update: useMutation({
      mutationFn: async ({
        periodId,
        periodStart,
        periodEnd,
      }: {
        periodId: string
        periodStart: string
        periodEnd: string
      }) => {
        const { data, error } = await supabase.rpc('update_financial_period', {
          target_period_id: periodId,
          target_period_start: periodStart,
          target_period_end: periodEnd,
        })

        if (error) throw new Error(error.message)
        return data as FinancialPeriodRow
      },
      onSuccess: (period) => invalidate(period.id),
    }),
    cancel: useMutation({
      mutationFn: async ({ periodId, comment }: { periodId: string; comment?: string | null }) => {
        const { data, error } = await supabase.rpc('cancel_financial_period', {
          target_period_id: periodId,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as FinancialPeriodRow
      },
      onSuccess: (period) => invalidate(period.id),
    }),
    organizationId,
  }
}
