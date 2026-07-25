import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { ShiftTemplateRow } from '../../lib/supabase/database.types'

export type ShiftTemplateInput = Omit<
  ShiftTemplateRow,
  'id' | 'created_at' | 'updated_at'
>

const select = 'id,organization_id,name,start_time,end_time,crosses_midnight,sort_order,is_active,expected_duration_minutes,late_close_grace_minutes,created_by,created_at,updated_at'

export function useShiftTemplates(organizationId: string | null, activeOnly = false) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'shift-templates', organizationId, activeOnly],
    queryFn: async () => {
      let query = supabase
        .from('shift_templates')
        .select(select)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })

      if (activeOnly) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useShiftTemplateMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'shift-templates', organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({ id, input }: { id?: string; input: ShiftTemplateInput }) => {
        const query = id
          ? supabase.from('shift_templates').update(input).eq('id', id).select(select).single()
          : supabase.from('shift_templates').insert(input).select(select).single()
        const { data, error } = await query
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}
