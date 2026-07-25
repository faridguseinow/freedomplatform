import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'
import type {
  ComboComponentRow,
  ComboRow,
  ComboStatus,
} from '../../../lib/supabase/database.types'

export const comboSelect =
  'id,organization_id,category_id,name,description,image_path,sale_price,selection_mode,sort_order,status,created_by,created_at,updated_at,archived_at'
export const comboComponentSelect =
  'id,organization_id,combo_id,component_type,product_id,service_id,quantity,included_minutes,sort_order,is_required,created_at'

export type ComboInput = Omit<ComboRow, 'id' | 'created_at' | 'updated_at' | 'archived_at'>
export type ComboComponentInput = Omit<ComboComponentRow, 'id' | 'created_at'>

export function useCombos(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'combos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combos')
        .select(comboSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useComboComponents(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'combo-components', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_components')
        .select(comboComponentSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useComboAvailability(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'combo-availability', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('combo_availability')
        .select('combo_id,organization_id,is_available,available_quantity,missing_components')
        .eq('organization_id', organizationId!)

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useComboMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'combos', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'combo-components', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'combo-availability', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'combos', organizationId] })
  }

  return {
    upsertCombo: useMutation({
      mutationFn: async ({ id, input }: { id: string | undefined; input: ComboInput }) => {
        const query = id
          ? supabase.from('combos').update(input).eq('id', id).select(comboSelect).single()
          : supabase.from('combos').insert(input).select(comboSelect).single()
        const { data, error } = await query
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    addComponents: useMutation({
      mutationFn: async (components: ComboComponentInput[]) => {
        if (!components.length) return []
        const { data, error } = await supabase
          .from('combo_components')
          .insert(components)
          .select(comboComponentSelect)
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    removeComponent: useMutation({
      mutationFn: async (componentId: string) => {
        const { error } = await supabase.from('combo_components').delete().eq('id', componentId)
        if (error) throw new Error(error.message)
        return componentId
      },
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: ComboStatus }) => {
        const { data, error } = await supabase.rpc('set_combo_status', {
          target_id: id,
          target_status: status,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}

export const comboStatusLabel: Record<ComboStatus, string> = {
  active: 'Активно',
  inactive: 'Выключено',
  archived: 'Архив',
}
