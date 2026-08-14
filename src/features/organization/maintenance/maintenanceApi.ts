import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'

export type OrganizationTestOrderResetSummary = {
  organization_id: string
  organization_name: string
  orders_deleted: number
  payments_deleted: number
  order_income_deleted: number
  stock_movements_deleted: number
  operational_days_deleted: number
  shifts_deleted: number
  financial_periods_deleted: number
  platform_share_transactions_deleted: number
  audit_logs_deleted: number
  finance_audit_logs_deleted: number
  affected_products: number
}

export function useOrganizationMaintenanceMutations() {
  const queryClient = useQueryClient()

  return {
    resetTestOrders: useMutation({
      mutationFn: async ({
        confirmation,
        organizationId,
      }: {
        confirmation: string
        organizationId: string
      }) => {
        const { data, error } = await supabase.rpc('reset_organization_test_orders', {
          target_organization_id: organizationId,
          target_confirmation: confirmation,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data as OrganizationTestOrderResetSummary
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries()
      },
    }),
  }
}
