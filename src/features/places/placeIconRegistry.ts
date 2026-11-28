import { useSyncExternalStore } from 'react'
import type { PlaceType } from '../../lib/supabase/database.types'

/**
 * Общий справочник «id места → иконка и тип».
 * Заполняется везде, где загружаются места. По нему строки заказа, история заказа
 * и монитор показывают актуальную иконку места, даже если в заказе сохранён
 * путь к старому фото (`organizations/<org>/places/<placeId>/main.webp`).
 */

export type RegisteredPlace = { image_path: string | null; type: PlaceType }

const registry = new Map<string, RegisteredPlace>()
const listeners = new Set<() => void>()
let version = 0

export function registerPlaces(places: ReadonlyArray<{ id: string; image_path: string | null; type: PlaceType }>) {
  let changed = false
  for (const place of places) {
    const current = registry.get(place.id)
    if (current?.image_path === place.image_path && current.type === place.type) continue
    registry.set(place.id, { image_path: place.image_path, type: place.type })
    changed = true
  }
  if (changed) {
    version += 1
    listeners.forEach((listener) => listener())
  }
}

const PLACE_ID_IN_PATH = /(?:^|\/)places\/([0-9a-f-]{36})(?:\/|$)/i

export const extractPlaceIdFromPath = (path: string | null | undefined) =>
  path ? PLACE_ID_IN_PATH.exec(path)?.[1] ?? null : null

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getVersion = () => version
const subscribeNoop = () => () => {}

/** Актуальная иконка места по id (или null, пока места не загружены). */
export function useRegisteredPlace(placeId: string | null) {
  useSyncExternalStore(placeId ? subscribe : subscribeNoop, getVersion, getVersion)
  return placeId ? registry.get(placeId) ?? null : null
}
