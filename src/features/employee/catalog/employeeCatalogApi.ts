import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'
import type { EmployeeProductRow } from '../../../lib/supabase/database.types'

type EmployeeCatalogParams = {
  organizationId: string | null
}

type EmployeeProductMaybeStock = Omit<
  EmployeeProductRow,
  'minimum_stock_quantity' | 'stock_quantity' | 'track_stock'
> &
  Partial<Pick<EmployeeProductRow, 'minimum_stock_quantity' | 'stock_quantity' | 'track_stock'>>

const normalizeEmployeeProducts = (rows: EmployeeProductMaybeStock[]): EmployeeProductRow[] =>
  rows.map((row) => ({
    ...row,
    minimum_stock_quantity: row.minimum_stock_quantity ?? 0,
    stock_quantity: row.stock_quantity ?? 0,
    track_stock: row.track_stock ?? false,
  }))

export function useEmployeeCategories({ organizationId }: EmployeeCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'catalog', 'categories', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_categories')
        .select('id,organization_id,type,name,description,image_path,sort_order,status')
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function useEmployeePlaces({ organizationId }: EmployeeCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'catalog', 'places', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_places')
        .select(
          'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,status',
        )
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function useEmployeeProducts({ organizationId }: EmployeeCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'catalog', 'products', 'stock-v2', organizationId],
    queryFn: async () => {
      const employeeProductSelect =
        'id,organization_id,category_id,sku,name,description,characteristics,image_path,sale_price,unit_name,stock_quantity,minimum_stock_quantity,track_stock,sort_order,status'
      const employeeProductBasicSelect =
        'id,organization_id,category_id,sku,name,description,characteristics,image_path,sale_price,unit_name,sort_order,status'
      const productSelect =
        'id,organization_id,category_id,sku,name,description,characteristics,image_path,sale_price,unit_name,stock_quantity,minimum_stock_quantity,track_stock,sort_order,status'
      const productBasicSelect =
        'id,organization_id,category_id,sku,name,description,characteristics,image_path,sale_price,unit_name,sort_order,status'

      const attempts = [
        () =>
          supabase
            .from('employee_products')
            .select(employeeProductSelect)
            .eq('organization_id', organizationId!)
            .order('sort_order', { ascending: true }),
        () =>
          supabase
            .from('products')
            .select(productSelect)
            .eq('organization_id', organizationId!)
            .eq('status', 'active')
            .order('sort_order', { ascending: true }),
        () =>
          supabase
            .from('employee_products')
            .select(employeeProductBasicSelect)
            .eq('organization_id', organizationId!)
            .order('sort_order', { ascending: true }),
        () =>
          supabase
            .from('products')
            .select(productBasicSelect)
            .eq('organization_id', organizationId!)
            .eq('status', 'active')
            .order('sort_order', { ascending: true }),
      ]

      let lastError: Error | null = null
      let firstEmptyResult: EmployeeProductRow[] | null = null
      for (const attempt of attempts) {
        const { data, error } = await attempt()
        if (error) {
          lastError = new Error(error.message)
          continue
        }
        const rows = normalizeEmployeeProducts((data ?? []) as EmployeeProductMaybeStock[])
        if (rows.length) {
          return rows
        }
        firstEmptyResult ??= rows
      }

      if (firstEmptyResult) return firstEmptyResult
      throw lastError ?? new Error('Məhsullar yüklənmədi.')
    },
  })
}

export function useEmployeeServices({ organizationId }: EmployeeCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'catalog', 'services', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_services')
        .select(
          'id,organization_id,category_id,name,description,characteristics,image_path,pricing_type,fixed_price,hourly_rate,minimum_minutes,billing_step_minutes,sort_order,status',
        )
        .eq('organization_id', organizationId!)
        .order('sort_order', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}

export function useEmployeeCombos({ organizationId }: EmployeeCatalogParams) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'combos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_combos')
        .select(
          'id,organization_id,category_id,name,description,image_path,sale_price,available_quantity,component_preview',
        )
        .eq('organization_id', organizationId!)
        .order('name', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
  })
}
