import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  FinancePaymentMethod,
  RecurringExpenseRow,
  RecurringFrequency,
} from '../../lib/supabase/database.types'
import { todayDate } from './financeApi'

export const recurringExpenseSelect =
  'id,organization_id,category_id,title,amount,frequency,start_date,next_generation_date,end_date,payment_method,recipient_or_supplier,description,affects_profit,affects_cash_flow,is_active,last_generated_at,created_by,created_at,updated_at'

export type RecurringExpenseInput = {
  organization_id: string
  category_id: string
  title: string
  amount: number
  frequency: RecurringFrequency
  start_date: string
  next_generation_date: string
  end_date?: string | null
  payment_method?: FinancePaymentMethod | null
  recipient_or_supplier?: string | null
  description?: string | null
  created_by: string
}

export function useRecurringExpenses(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['finance', 'recurring-expenses', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(recurringExpenseSelect)
        .eq('organization_id', organizationId!)
        .order('next_generation_date', { ascending: true })

      if (error) throw new Error(error.message)
      return data as RecurringExpenseRow[]
    },
  })
}

export function useRecurringExpenseMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({
        id,
        input,
      }: {
        id?: string
        input: RecurringExpenseInput | Partial<RecurringExpenseInput>
      }) => {
        const query = id
          ? supabase
              .from('recurring_expenses')
              .update(input)
              .eq('id', id)
              .select(recurringExpenseSelect)
              .single()
          : supabase
              .from('recurring_expenses')
              .insert(input as RecurringExpenseInput)
              .select(recurringExpenseSelect)
              .single()

        const { data, error } = await query
        if (error) throw new Error(error.message)
        return data as RecurringExpenseRow
      },
      onSuccess: invalidate,
    }),
    generateDue: useMutation({
      mutationFn: async (untilDate?: string) => {
        if (!organizationId) throw new Error('Organization is required.')
        const { data, error } = await supabase.rpc('generate_due_recurring_expenses', {
          target_organization_id: organizationId,
          target_until_date: untilDate ?? todayDate(),
        })

        if (error) throw new Error(error.message)
        return data as number
      },
      onSuccess: invalidate,
    }),
  }
}
