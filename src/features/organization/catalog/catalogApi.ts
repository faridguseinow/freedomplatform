import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'
import type {
  CatalogCategoryRow,
  CatalogItemStatus,
  PlaceRow,
  ProductRow,
  ServiceRow,
} from '../../../lib/supabase/database.types'

export const categorySelect =
  'id,organization_id,type,name,description,image_path,sort_order,status,created_by,created_at,updated_at,archived_at'
const basePlaceSelect =
  'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,status,created_by,created_at,updated_at,archived_at'
export const placeSelect =
  'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,workspace_x,workspace_y,workspace_w,workspace_h,status,created_by,created_at,updated_at,archived_at'
export const productSelect =
  'id,organization_id,category_id,sku,name,description,characteristics,image_path,sale_price,purchase_price,stock_quantity,minimum_stock_quantity,average_purchase_cost,unit_name,track_stock,sort_order,status,created_by,created_at,updated_at,archived_at'
export const serviceSelect =
  'id,organization_id,category_id,name,description,characteristics,image_path,pricing_type,fixed_price,hourly_rate,minimum_minutes,billing_step_minutes,sort_order,status,created_by,created_at,updated_at,archived_at'

type UseCatalogParams = {
  organizationId: string | null
}

const isMissingWorkspaceLayoutColumn = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes('workspace_x') ||
    error.message.includes('workspace_y') ||
    error.message.includes('workspace_w') ||
    error.message.includes('workspace_h'))

const withWorkspaceLayoutDefaults = (place: Omit<PlaceRow, 'workspace_x' | 'workspace_y' | 'workspace_w' | 'workspace_h'> | PlaceRow): PlaceRow => ({
  ...place,
  workspace_x: 'workspace_x' in place ? place.workspace_x : null,
  workspace_y: 'workspace_y' in place ? place.workspace_y : null,
  workspace_w: 'workspace_w' in place ? place.workspace_w : null,
  workspace_h: 'workspace_h' in place ? place.workspace_h : null,
})

const stripWorkspaceLayoutFields = (input: PlaceInput) => {
  const { workspace_h: _workspaceH, workspace_w: _workspaceW, workspace_x: _workspaceX, workspace_y: _workspaceY, ...baseInput } = input
  void _workspaceH
  void _workspaceW
  void _workspaceX
  void _workspaceY
  return baseInput
}

export type CategoryInput = Omit<
  CatalogCategoryRow,
  'id' | 'created_at' | 'updated_at' | 'archived_at'
> &
  Partial<Pick<CatalogCategoryRow, 'id'>>
export type PlaceInput = Omit<PlaceRow, 'id' | 'created_at' | 'updated_at' | 'archived_at'> &
  Partial<Pick<PlaceRow, 'id'>>
export type ProductInput = Omit<
  ProductRow,
  'id' | 'created_at' | 'updated_at' | 'archived_at' | 'stock_quantity' | 'average_purchase_cost'
> &
  Partial<Pick<ProductRow, 'id' | 'stock_quantity' | 'average_purchase_cost'>>
export type ServiceInput = Omit<ServiceRow, 'id' | 'created_at' | 'updated_at' | 'archived_at'> &
  Partial<Pick<ServiceRow, 'id'>>

export function useCatalogCategories({ organizationId }: UseCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'catalog', 'categories', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_categories')
        .select(categorySelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function usePlaces({ organizationId }: UseCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'catalog', 'places', organizationId],
    queryFn: async () => {
      const query = supabase
        .from('places')
        .select(placeSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (!error) {
        return data.map((place) => withWorkspaceLayoutDefaults(place as PlaceRow))
      }

      if (!isMissingWorkspaceLayoutColumn(new Error(error.message))) {
        throw new Error(error.message)
      }

      const fallback = await supabase
        .from('places')
        .select(basePlaceSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (fallback.error) {
        throw new Error(fallback.error.message)
      }

      return fallback.data.map((place) => withWorkspaceLayoutDefaults(place))
    },
  })
}

export function usePlacesLayoutSchemaStatus(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'catalog', 'places-layout-schema', organizationId],
    queryFn: async () => {
      const { error } = await supabase
        .from('places')
        .select('id,workspace_x')
        .eq('organization_id', organizationId!)
        .limit(1)

      if (!error) return true
      if (isMissingWorkspaceLayoutColumn(new Error(error.message))) return false
      throw new Error(error.message)
    },
  })
}

export function useProducts({ organizationId }: UseCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'catalog', 'products', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(productSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function useServices({ organizationId }: UseCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'catalog', 'services', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select(serviceSelect)
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function useCategoryMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'catalog', 'categories', organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({ id, input }: { id: string | undefined; input: CategoryInput }) => {
        const query = id
          ? supabase
              .from('catalog_categories')
              .update(input)
              .eq('id', id)
              .select(categorySelect)
              .single()
          : supabase.from('catalog_categories').insert(input).select(categorySelect).single()
        const { data, error } = await query

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: CatalogItemStatus }) => {
        const { data, error } = await supabase.rpc('set_category_status', {
          target_id: id,
          target_status: status,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
    queryKey: ['admin', 'catalog', 'categories', organizationId] as const,
  }
}

export function usePlaceMutations(_organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', _organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({ id, input }: { id: string | undefined; input: PlaceInput }) => {
        const query = id
          ? supabase.from('places').update(input).eq('id', id).select(placeSelect).single()
          : supabase.from('places').insert(input).select(placeSelect).single()
        const { data, error } = await query

        if (!error) {
          return withWorkspaceLayoutDefaults(data as PlaceRow)
        }

        if (!isMissingWorkspaceLayoutColumn(new Error(error.message))) {
          throw new Error(error.message)
        }

        const baseInput = stripWorkspaceLayoutFields(input)
        const fallbackQuery = id
          ? supabase.from('places').update(baseInput).eq('id', id).select(basePlaceSelect).single()
          : supabase.from('places').insert(baseInput).select(basePlaceSelect).single()
        const fallback = await fallbackQuery

        if (fallback.error) {
          throw new Error(fallback.error.message)
        }

        return withWorkspaceLayoutDefaults(fallback.data)
      },
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: CatalogItemStatus }) => {
        const { data, error } = await supabase.rpc('set_place_status', {
          target_id: id,
          target_status: status,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
  }
}

export function useProductMutations(_organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'catalog', 'products', _organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({ id, input }: { id: string | undefined; input: ProductInput }) => {
        const query = id
          ? supabase.from('products').update(input).eq('id', id).select(productSelect).single()
          : supabase.from('products').insert(input).select(productSelect).single()
        const { data, error } = await query

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: CatalogItemStatus }) => {
        const { data, error } = await supabase.rpc('set_product_status', {
          target_id: id,
          target_status: status,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
    deleteUnused: useMutation({
      mutationFn: async ({ id, reason }: { id: string; reason?: string | null }) => {
        const { data, error } = await supabase.rpc('delete_unused_product', {
          target_product_id: id,
          target_reason: reason ?? null,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
  }
}

export function useServiceMutations(_organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'catalog', 'services', _organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async ({ id, input }: { id: string | undefined; input: ServiceInput }) => {
        const query = id
          ? supabase.from('services').update(input).eq('id', id).select(serviceSelect).single()
          : supabase.from('services').insert(input).select(serviceSelect).single()
        const { data, error } = await query

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: async ({ id, status }: { id: string; status: CatalogItemStatus }) => {
        const { data, error } = await supabase.rpc('set_service_status', {
          target_id: id,
          target_status: status,
        })

        if (error) {
          throw new Error(error.message)
        }

        return data
      },
      onSuccess: invalidate,
    }),
  }
}
