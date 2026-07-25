import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { FinanceTransactionRow } from '../../lib/supabase/database.types'
import type { MoneyInput } from './financeApi'
import { todayDate } from './financeApi'

export function useExpenseMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  return {
    createExpense: useMutation({
      mutationFn: async (input: MoneyInput & { categoryId: string }) => {
        if (!organizationId) throw new Error('Organization is required.')
        const { data, error } = await supabase.rpc('create_expense', {
          target_organization_id: organizationId,
          target_title: input.title,
          target_amount: input.amount,
          target_category_id: input.categoryId,
          target_payment_method: input.paymentMethod ?? null,
          target_accrual_date: input.accrualDate ?? todayDate(),
          target_paid_date: input.paidDate ?? null,
          target_recipient_or_supplier: input.recipientOrSupplier ?? null,
          target_description: input.description ?? null,
          target_document_path: input.documentPath ?? null,
          target_source_type: 'manual',
          target_source_id: null,
        })

        if (error) throw new Error(error.message)
        return data as FinanceTransactionRow
      },
      onSuccess: invalidate,
    }),
    approveExpense: useMutation({
      mutationFn: async ({
        transactionId,
        decision,
        comment,
      }: {
        transactionId: string
        decision: 'approved' | 'rejected'
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('approve_expense', {
          target_transaction_id: transactionId,
          target_decision: decision,
          target_comment: comment ?? null,
        })

        if (error) throw new Error(error.message)
        return data as FinanceTransactionRow
      },
      onSuccess: invalidate,
    }),
  }
}
