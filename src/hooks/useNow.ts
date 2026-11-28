import { useSyncExternalStore } from 'react'

/**
 * Общие «часы» на всё приложение: один setInterval на всех подписчиков.
 * Перерисовываются только компоненты, которые вызвали useNow(true),
 * а не вся страница целиком.
 */

const TICK_MS = 1000

let nowMs = Date.now()
let intervalId: number | undefined
const listeners = new Set<() => void>()

const tick = () => {
  nowMs = Date.now()
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (intervalId === undefined) {
    nowMs = Date.now()
    intervalId = window.setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && intervalId !== undefined) {
      window.clearInterval(intervalId)
      intervalId = undefined
    }
  }
}

const subscribeNoop = () => () => {}
const getSnapshot = () => nowMs

/** Текущее время, обновляется раз в секунду, пока `live` = true. */
export function useNow(live = true) {
  return useSyncExternalStore(live ? subscribe : subscribeNoop, getSnapshot, getSnapshot)
}
