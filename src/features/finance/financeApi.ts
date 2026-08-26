import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinanceCategoryRow,
  FinanceDashboardSummaryRow,
  FinancePaymentMethod,
  FinanceTransactionRow,
  FinanceTransactionType,
  FinancialPeriodSummary,
  OrganizationFinanceSettingsRow,
} from '../../lib/supabase/database.types'

export const financeCategorySelect =
  'id,organization_id,transaction_type,name,description,system_code,affects_profit,affects_cash_flow,eligible_for_platform_share_deduction,sort_order,is_active,is_system,created_by,created_at,updated_at'
export const financeTransactionSelect =
  'id,organization_id,transaction_type,category_id,source_type,source_id,title,description,amount,paid_amount,status,payment_method,accrual_date,paid_date,recipient_or_supplier,reference,document_path,affects_profit,affects_cash_flow,eligible_for_platform_share_deduction,expense_approval_status,approval_requested_by,approved_by,approved_at,created_by,cancelled_by,cancelled_at,cancellation_reason,created_at,updated_at'
export const financeSettingsSelect =
  'organization_id,large_expense_threshold,require_large_expense_approval,default_platform_share_percentage,monthly_platform_fee,reporting_currency_code,financial_month_close_day,platform_share_payment_due_days,created_at,updated_at'

export function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function monthStartDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

export function useFinanceDashboardSummary(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'dashboard-summary', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_dashboard_summary')
        .select('*')
        .eq('organization_id', organizationId!)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data as FinanceDashboardSummaryRow | null
    },
  })
}

export function useFinanceCategories(
  organizationId: string | null,
  type?: FinanceTransactionType,
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'categories', organizationId, type ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('finance_categories')
        .select(financeCategorySelect)
        .eq('organization_id', organizationId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (type) query = query.eq('transaction_type', type)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as FinanceCategoryRow[]
    },
  })
}

export function useFinanceTransactions(
  organizationId: string | null,
  type?: FinanceTransactionType,
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'transactions', organizationId, type ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('finance_transactions')
        .select(financeTransactionSelect)
        .eq('organization_id', organizationId!)
        .order('accrual_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)

      if (type) query = query.eq('transaction_type', type)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as FinanceTransactionRow[]
    },
  })
}

export function useFinancePeriodSummary(
  organizationId: string | null,
  periodStart: string,
  periodEnd: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && periodStart && periodEnd),
    queryKey: ['finance', 'period-summary', organizationId, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_financial_period', {
        target_organization_id: organizationId!,
        target_period_start: periodStart,
        target_period_end: periodEnd,
      })

      if (error) throw new Error(error.message)
      return data as FinancialPeriodSummary
    },
  })
}

export function useFinanceSettings(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_finance_settings')
        .select(financeSettingsSelect)
        .eq('organization_id', organizationId!)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data as OrganizationFinanceSettingsRow | null
    },
  })
}

export function useFinanceSettingsMutation(organizationId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Partial<OrganizationFinanceSettingsRow>) => {
      if (!organizationId) throw new Error('Organization is required.')
      const { data, error } = await supabase
        .from('organization_finance_settings')
        .upsert({ ...input, organization_id: organizationId })
        .select(financeSettingsSelect)
        .single()

      if (error) throw new Error(error.message)
      return data as OrganizationFinanceSettingsRow
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance', 'settings', organizationId] })
    },
  })
}

export type MoneyInput = {
  title: string
  amount: number
  categoryId?: string | null
  paymentMethod?: FinancePaymentMethod | null
  accrualDate?: string
  paidDate?: string | null
  description?: string | null
  reference?: string | null
  recipientOrSupplier?: string | null
  documentPath?: string | null
}
