import type { EmployeeWorkspacePlaceRow, PlaceRow } from '../../lib/supabase/database.types'

const STORAGE_PREFIX = 'freedom-platform.workspace-places'

type CachedWorkspacePlace = Pick<
  PlaceRow,
  | 'id'
  | 'organization_id'
  | 'category_id'
  | 'name'
  | 'type'
  | 'custom_type_name'
  | 'description'
  | 'image_path'
  | 'has_timer'
  | 'hourly_rate'
  | 'minimum_minutes'
  | 'billing_step_minutes'
  | 'capacity'
  | 'sort_order'
  | 'workspace_x'
  | 'workspace_y'
  | 'workspace_w'
  | 'workspace_h'
  | 'status'
>

const getStorageKey = (organizationId: string) => `${STORAGE_PREFIX}.${organizationId}`

export function cacheWorkspacePlaces(organizationId: string | null, places: PlaceRow[]) {
  if (!organizationId || typeof window === 'undefined') return

  const activePlaces: CachedWorkspacePlace[] = places
    .filter((place) => place.status === 'active')
    .map((place) => ({
      billing_step_minutes: place.billing_step_minutes,
      capacity: place.capacity,
      category_id: place.category_id,
      custom_type_name: place.custom_type_name,
      description: place.description,
      has_timer: place.has_timer,
      hourly_rate: place.hourly_rate,
      id: place.id,
      image_path: place.image_path,
      minimum_minutes: place.minimum_minutes,
      name: place.name,
      organization_id: place.organization_id,
      sort_order: place.sort_order,
      status: place.status,
      type: place.type,
      workspace_h: place.workspace_h,
      workspace_w: place.workspace_w,
      workspace_x: place.workspace_x,
      workspace_y: place.workspace_y,
    }))

  window.localStorage.setItem(getStorageKey(organizationId), JSON.stringify(activePlaces))
}

export function readCachedWorkspacePlaces(organizationId: string | null) {
  if (!organizationId || typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(getStorageKey(organizationId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed as CachedWorkspacePlace[]
  } catch {
    return []
  }
}

export function toEmptyEmployeeWorkspacePlace(place: CachedWorkspacePlace): EmployeeWorkspacePlaceRow {
  return {
    ...place,
    active_order_id: null,
    active_order_item_count: 0,
    active_order_number: null,
    active_order_status: null,
    active_order_total: null,
    active_session_billing_step_minutes: null,
    active_session_hourly_rate: null,
    active_session_id: null,
    active_session_minimum_minutes: null,
    active_session_started_at: null,
  }
}
