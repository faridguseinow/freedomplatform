import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { FinanceTransactionRow } from '../../lib/supabase/database.types'
import type { MoneyInput } from './financeApi'
import { todayDate } from './financeApi'

export function useIncomeMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  return {
    createManualIncome: useMutation({
      mutationFn: async (input: MoneyInput) => {
        if (!organizationId) throw new Error('Organization is required.')
        const { data, error } = await supabase.rpc('create_manual_income', {
          target_organization_id: organizationId,
          target_title: input.title,
          target_amount: input.amount,
          target_payment_method: input.paymentMethod ?? null,
          target_accrual_date: input.accrualDate ?? todayDate(),
          target_paid_date: input.paidDate ?? todayDate(),
          target_category_id: input.categoryId ?? null,
          target_description: input.description ?? null,
          target_reference: input.reference ?? null,
        })

        if (error) throw new Error(error.message)
        return data as FinanceTransactionRow
      },
      onSuccess: invalidate,
    }),
  }
}
