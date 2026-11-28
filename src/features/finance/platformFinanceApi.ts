import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinanceDashboardSummaryRow,
  FinanceTransactionRow,
  FinancialPeriodRow,
} from '../../lib/supabase/database.types'
import { financeTransactionSelect } from './financeApi'
import { financialPeriodSelect } from './financialPeriodsApi'
import { toServerError } from '../../lib/errors/serverErrors'

export function usePlatformFinanceSummary() {
  return useQuery({
    queryKey: ['platform', 'finance', 'summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_dashboard_summary')
        .select('*')
        .order('total_income', { ascending: false })

      if (error) throw toServerError(error)
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

      if (summaryResult.error) throw toServerError(summaryResult.error)
      if (periodsResult.error) throw toServerError(periodsResult.error)
      if (transactionsResult.error) throw toServerError(transactionsResult.error)

      return {
        summary: summaryResult.data as FinanceDashboardSummaryRow | null,
        periods: periodsResult.data as FinancialPeriodRow[],
        transactions: transactionsResult.data as FinanceTransactionRow[],
      }
    },
  })
}
