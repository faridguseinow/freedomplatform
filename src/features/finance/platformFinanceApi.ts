import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinanceDashboardSummaryRow,
  FinanceTransactionRow,
  FinancialPeriodRow,
} from '../../lib/supabase/database.types'
import { financeTransactionSelect } from './financeApi'
import { financialPeriodSelect } from './financialPeriodsApi'

export function usePlatformFinanceSummary() {
  return useQuery({
    queryKey: ['platform', 'finance', 'summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_dashboard_summary')
        .select('*')
        .order('platform_share_outstanding', { ascending: false })

      if (error) throw new Error(error.message)
      return data as FinanceDashboardSummaryRow[]
    },
  })
}

export function usePlatformOrganizationFinance(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['platform', 'finance', 'organization', organizationId],
    queryFn: async () => {
      const [summaryResult, periodsResult, transactionsResult] = await Promise.all([
        supabase
          .from('finance_dashboard_summary')
          .select('*')
          .eq('organization_id', organizationId!)
          .maybeSingle(),
        supabase
          .from('financial_periods')
          .select(financialPeriodSelect)
          .eq('organization_id', organizationId!)
          .order('period_start', { ascending: false })
          .limit(20),
        supabase
          .from('finance_transactions')
          .select(financeTransactionSelect)
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (summaryResult.error) throw new Error(summaryResult.error.message)
      if (periodsResult.error) throw new Error(periodsResult.error.message)
      if (transactionsResult.error) throw new Error(transactionsResult.error.message)

      return {
        summary: summaryResult.data as FinanceDashboardSummaryRow | null,
        periods: periodsResult.data as FinancialPeriodRow[],
        transactions: transactionsResult.data as FinanceTransactionRow[],
      }
    },
  })
}
