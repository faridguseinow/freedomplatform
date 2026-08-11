import type { CSSProperties } from 'react'
import type { PlaceType } from '../../lib/supabase/database.types'

export type WorkspacePlaceLike = {
  id: string
  name: string
  type: PlaceType
  sort_order: number
  workspace_x?: number | null
  workspace_y?: number | null
  workspace_w?: number | null
  workspace_h?: number | null
}

export type WorkspaceLayoutSlot<TPlace extends WorkspacePlaceLike> = {
  key: string
  label: string
  place: TPlace
  shape: 'compact' | 'room' | 'wide' | 'table'
  style: CSSProperties
}

export const WORKSPACE_COLUMNS = 12

export const normalizePlaceName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[№#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const getPlaceNumber = (place: Pick<WorkspacePlaceLike, 'name'>) => {
  const match = normalizePlaceName(place.name).match(/(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

export const isTablePlace = (place: Pick<WorkspacePlaceLike, 'name' | 'type'>) =>
  place.type === 'table' || normalizePlaceName(place.name).includes('masa')

export const getPlaceDisplayLabel = (
  place: Pick<WorkspacePlaceLike, 'name' | 'type'> | null,
  fallback = 'Место',
) => {
  if (!place) return fallback
  const name = normalizePlaceName(place.name)
  const number = getPlaceNumber(place)

  if (isTablePlace(place)) return number ? `masa ${number}` : 'masa'
  if (place.type === 'billiard' || name.includes('bilyard') || name.includes('billiard')) return 'BILYARD'
  if (name.includes('vip') && name.includes('ps5')) return 'VIP PS 5'
  if (name.includes('vip') && name.includes('ps4')) return 'VIP PS 4'
  if (name.includes('vip') && name.includes('ps3')) return 'VIP PS 3'
  if (name.includes('ps3')) return 'PS 3'

  return place.name
}

export const getWorkspaceShape = (place: Pick<WorkspacePlaceLike, 'name' | 'type'>) => {
  const name = normalizePlaceName(place.name)

  if (isTablePlace(place)) return 'table' as const
  if (place.type === 'billiard' || name.includes('bilyard') || name.includes('billiard')) return 'wide' as const
  if (place.type === 'vip_room' || place.type === 'private_room' || name.includes('vip')) return 'room' as const

  return 'compact' as const
}

export const getDefaultWorkspaceSize = (place: Pick<WorkspacePlaceLike, 'name' | 'type'>) => {
  const shape = getWorkspaceShape(place)

  if (shape === 'wide') return { w: 3, h: 2 }
  if (shape === 'compact') return { w: 2, h: 1 }

  return { w: 2, h: 2 }
}

export const getWorkspaceSizeLabel = (place: Pick<WorkspacePlaceLike, 'name' | 'type'>) => {
  const shape = getWorkspaceShape(place)
  if (shape === 'compact') return 'Компакт'
  if (shape === 'wide') return 'Широкий'
  return 'Средний'
}

export const buildWorkspaceLayout = <TPlace extends WorkspacePlaceLike>(
  places: TPlace[],
): WorkspaceLayoutSlot<TPlace>[] =>
  [...places]
    .sort((a, b) => (a.workspace_y ?? 999) - (b.workspace_y ?? 999) || (a.workspace_x ?? 999) - (b.workspace_x ?? 999) || a.sort_order - b.sort_order)
    .map((place) => {
      const shape = getWorkspaceShape(place)
      const fallbackSize = getDefaultWorkspaceSize(place)
      const x = place.workspace_x
      const y = place.workspace_y
      const w = Math.min(WORKSPACE_COLUMNS, Math.max(1, place.workspace_w ?? fallbackSize.w))
      const h = Math.max(1, place.workspace_h ?? fallbackSize.h)
      const style: CSSProperties =
        x && y
          ? {
              gridColumn: `${Math.min(WORKSPACE_COLUMNS, Math.max(1, x))} / span ${w}`,
              gridRow: `${Math.max(1, y)} / span ${h}`,
            }
          : {
              gridColumn: `span ${w}`,
              gridRow: `span ${h}`,
            }

      return {
        key: place.id,
        label: getPlaceDisplayLabel(place),
        place,
        shape,
        style,
      }
    })
