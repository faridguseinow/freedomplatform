import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Delete, Loader2, LockKeyhole, Pencil, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import type { EmployeeWorkspacePlaceRow } from '../../../lib/supabase/database.types'
import { supabase } from '../../../lib/supabase/client'
import { cn } from '../../../lib/utils/cn'
import {
  buildWorkspaceLayout,
  getPlaceDisplayLabel,
} from '../../places/workspaceLayout'
import { useEmployeeWorkspaceData } from '../../orders/employeeOrdersApi'

const pinPattern = /^\d{4}$/

const normalizePin = (value: string) => value.replace(/\D/g, '').slice(0, 4)
const lockStoreEventName = 'freedom-employee-lock-change'

const notifyLockStoreChanged = () => {
  window.dispatchEvent(new Event(lockStoreEventName))
}

const subscribeLockStore = (onStoreChange: () => void) => {
  window.addEventListener(lockStoreEventName, onStoreChange)
  window.addEventListener('storage', onStoreChange)

  return () => {
    window.removeEventListener(lockStoreEventName, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

type EmployeeLockState = {
  membership_id: string
  has_pin: boolean
  pin_set_at: string | null
  has_pending_pin_change: boolean
  pending_pin_change_requested_at: string | null
}

type EmployeeLockScreenProps = {
  collapsed?: boolean
}

const keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const formatElapsed = (startedAt: string | null, nowMs: number) => {
  if (!startedAt) return '00:00'
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const isBusyPlace = (place: EmployeeWorkspacePlaceRow) =>
  Boolean(place.active_order_id || place.active_session_id)

const getLockedCardClassName = (place: EmployeeWorkspacePlaceRow, shape: string) =>
  cn(
    'relative grid content-start gap-2 overflow-hidden rounded-lg border p-3 text-left shadow-lg',
    isBusyPlace(place)
      ? 'border-red-200 bg-red-50 text-slate-950'
      : 'border-slate-200 bg-white text-slate-950',
    place.status !== 'active' && 'border-slate-200 bg-slate-100 opacity-80',
    shape,
  )

export function EmployeeLockScreen({ collapsed = false }: EmployeeLockScreenProps) {
  const queryClient = useQueryClient()
  const { organizationId, user } = useAuth()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId)
  const [unlockPin, setUnlockPin] = useState('')
  const [requestedPin, setRequestedPin] = useState('')
  const [isRequestOpen, setIsRequestOpen] = useState(false)
  const [isUnlockOpen, setIsUnlockOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const portalTarget = typeof document === 'undefined' ? null : document.body

  const lockStorageKey = useMemo(() => {
    if (!organizationId || !user?.id) return null
    return `freedom.employeeLock.${organizationId}.${user.id}`
  }, [organizationId, user?.id])

  const lockStateQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'lock-state', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_employee_lock_state', {
        target_organization_id: organizationId!,
      })

      if (error) {
        throw new Error(error.message)
      }

      return (data[0] ?? null) as EmployeeLockState | null
    },
  })

  const lockState = lockStateQuery.data ?? null
  const lockButtonDisabled = lockStateQuery.isLoading || !lockState?.membership_id
  const lockedPlaces = useMemo(
    () => workspaceQuery.data?.places ?? [],
    [workspaceQuery.data?.places],
  )
  const lockedPlaceLayout = useMemo(() => buildWorkspaceLayout(lockedPlaces), [lockedPlaces])
  const isStoredLocked = useSyncExternalStore(
    subscribeLockStore,
    () => Boolean(lockStorageKey && window.sessionStorage.getItem(lockStorageKey) === '1'),
    () => false,
  )
  const isLocked = Boolean(lockState?.has_pin && isStoredLocked)

  useEffect(() => {
    if (!isLocked) return

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [isLocked])

  useEffect(() => {
    if (!lockStorageKey || lockStateQuery.isLoading) return

    if (!lockState?.has_pin) {
      window.sessionStorage.removeItem(lockStorageKey)
      notifyLockStoreChanged()
    }
  }, [lockState?.has_pin, lockStateQuery.isLoading, lockStorageKey])

  const verifyPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      if (!lockState?.membership_id) {
        throw new Error('PIN для рабочего места не настроен.')
      }

      const { data, error } = await supabase.rpc('verify_employee_lock_pin', {
        target_membership_id: lockState.membership_id,
        target_pin: pin,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: (isValid) => {
      if (!isValid) {
        setMessage('Неверный PIN.')
        return
      }

      if (lockStorageKey) {
        window.sessionStorage.removeItem(lockStorageKey)
        notifyLockStoreChanged()
      }
      setUnlockPin('')
      setMessage(null)
      setIsUnlockOpen(false)
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'Не удалось проверить PIN.')
    },
  })

  const requestPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      if (!lockState?.membership_id) {
        throw new Error('Рабочее место сотрудника не найдено.')
      }

      const { error } = await supabase.rpc('request_employee_lock_pin_change', {
        target_membership_id: lockState.membership_id,
        target_pin: pin,
      })

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employee', 'lock-state', organizationId] })
      setRequestedPin('')
      setIsRequestOpen(false)
      setMessage('Заявка на PIN отправлена администратору.')
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.')
    },
  })

  const lockWorkplace = () => {
    if (!lockState?.membership_id) return

    if (!lockState.has_pin) {
      if (lockState.has_pending_pin_change) {
        setMessage('PIN ожидает одобрения администратора.')
        return
      }

      setMessage(null)
      setRequestedPin('')
      setIsRequestOpen(true)
      return
    }

    if (!lockStorageKey) return

    window.sessionStorage.setItem(lockStorageKey, '1')
    notifyLockStoreChanged()
    setUnlockPin('')
    setMessage(null)
    setIsUnlockOpen(false)
  }

  const submitUnlock = useCallback(() => {
    if (!pinPattern.test(unlockPin)) {
      setMessage('Введите 4 цифры.')
      return
    }

    verifyPinMutation.mutate(unlockPin)
  }, [unlockPin, verifyPinMutation])

  const submitPinRequest = () => {
    if (!pinPattern.test(requestedPin)) {
      setMessage('Новый PIN должен состоять из 4 цифр.')
      return
    }

    requestPinMutation.mutate(requestedPin)
  }

  const addUnlockDigit = useCallback((digit: string) => {
    setMessage(null)
    setUnlockPin((current) => normalizePin(`${current}${digit}`))
  }, [])

  const removeUnlockDigit = useCallback(() => {
    setMessage(null)
    setUnlockPin((current) => current.slice(0, -1))
  }, [])

  useEffect(() => {
    if (!isLocked || !isUnlockOpen || isRequestOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        addUnlockDigit(event.key)
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        removeUnlockDigit()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        submitUnlock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addUnlockDigit, isLocked, isRequestOpen, isUnlockOpen, removeUnlockDigit, submitUnlock])

  const renderPinDots = (value: string) => (
    <div className="flex justify-center gap-3" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span
          className={cn(
            'size-3 rounded-full border border-white/35',
            value.length > index ? 'bg-white' : 'bg-transparent',
          )}
          key={index}
        />
      ))}
    </div>
  )

  return (
    <>
      <section className={collapsed ? 'grid place-items-center px-2 py-2' : 'grid gap-2 px-3 py-2'}>
        <button
          aria-label="Заблокировать рабочий экран"
          className={cn(
            'inline-flex min-h-10 items-center rounded-md text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50',
            collapsed ? 'size-10 justify-center px-0' : 'justify-start gap-3 px-2',
          )}
          disabled={lockButtonDisabled}
          onClick={lockWorkplace}
          title={
            lockStateQuery.isLoading
              ? 'Проверка PIN'
              : lockState?.has_pin
                ? 'Заблокировать экран'
                : lockState?.has_pending_pin_change
                  ? 'PIN ожидает одобрения'
                  : 'Задать PIN'
          }
          type="button"
        >
          <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
          {collapsed ? null : (
            <span className="min-w-0 truncate">
              {lockState?.has_pin
                ? 'Заблокировать'
                : lockState?.has_pending_pin_change
                  ? 'PIN ожидает одобрения'
                  : 'Задать PIN'}
            </span>
          )}
        </button>

        {message && !isLocked && !collapsed ? (
          <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-900">
            {message}
          </div>
        ) : null}
      </section>

      {message && !isLocked && collapsed ? (
        <div className="fixed bottom-20 left-20 z-[80] rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-900 shadow-lg">
          {message}
        </div>
      ) : null}

      {isRequestOpen ? (
        <Modal className="z-[80]" onClose={() => setIsRequestOpen(false)}>
          <section className="grid w-full max-w-md gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {lockState?.has_pin ? 'Заявка на смену PIN' : 'Задать PIN'}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {lockState?.has_pin
                  ? 'Новый PIN начнёт работать только после одобрения администратора.'
                  : 'PIN начнёт работать после одобрения администратора.'}
              </p>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              <span>Новый PIN</span>
              <input
                autoFocus
                className="min-h-12 rounded-md border border-slate-200 bg-white px-3 text-center text-2xl font-semibold tracking-[0.4em] text-slate-950 outline-none transition-colors placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => setRequestedPin(normalizePin(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitPinRequest()
                  }
                }}
                placeholder="0000"
                type="password"
                value={requestedPin}
              />
            </label>
            {requestPinMutation.isError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {requestPinMutation.error.message}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setIsRequestOpen(false)} type="button" variant="secondary">
                Отмена
              </Button>
              <Button disabled={requestPinMutation.isPending} onClick={submitPinRequest} type="button">
                {requestPinMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Отправить
              </Button>
            </div>
          </section>
        </Modal>
      ) : null}

      {isLocked && portalTarget
        ? createPortal(
            <div className="fixed inset-0 z-[70] bg-slate-950 text-white">
              {!isUnlockOpen ? (
                <>
                  <section className="h-full overflow-auto p-3 pb-24 sm:p-5 sm:pb-24">
                    <div className="grid content-start gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] xl:gap-3">
                      {lockedPlaceLayout.map((slot) => {
                        const place = slot.place
                        const isBusy = isBusyPlace(place)
                        const indicatorLabel =
                          place.status !== 'active' ? 'Недоступно' : isBusy ? 'Занято' : 'Свободно'

                        return (
                          <article
                            className={getLockedCardClassName(place, slot.shape)}
                            key={slot.key}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <CatalogImage
                                  alt={place.name}
                                  className="size-10 rounded-full"
                                  imagePath={place.image_path}
                                />
                                <h3 className="min-w-0 break-words text-base font-semibold leading-tight">
                                  {getPlaceDisplayLabel(place, slot.label)}
                                </h3>
                              </div>
                              <span
                                aria-label={indicatorLabel}
                                className={cn(
                                  'size-3.5 shrink-0 rounded-full ring-4',
                                  indicatorLabel === 'Свободно' && 'bg-emerald-500 ring-emerald-100',
                                  indicatorLabel === 'Занято' && 'bg-red-500 ring-red-100',
                                  indicatorLabel === 'Недоступно' && 'bg-slate-400 ring-slate-100',
                                )}
                                role="img"
                                title={indicatorLabel}
                              />
                            </div>

                            {place.active_session_id ? (
                              <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-900">
                                <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
                                {formatElapsed(place.active_session_started_at, nowMs)}
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  </section>

                  <button
                    className="fixed bottom-5 left-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    onClick={() => {
                      setMessage(null)
                      setUnlockPin('')
                      setIsUnlockOpen(true)
                    }}
                    type="button"
                  >
                    <LockKeyhole className="size-4" />
                    Unpin
                  </button>
                </>
              ) : null}

              {isUnlockOpen ? (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950 px-4">
                  <section className="grid w-full max-w-sm gap-5 text-center">
                    <div className="flex justify-end">
                      <button
                        aria-label="Сменить PIN"
                        className="inline-flex size-10 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        onClick={() => {
                          setMessage(null)
                          setRequestedPin('')
                          setIsRequestOpen(true)
                        }}
                        title="Сменить PIN"
                        type="button"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                    <div className="mx-auto inline-flex size-14 items-center justify-center rounded-lg bg-white/10">
                      <LockKeyhole className="size-7" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">Экран заблокирован</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Введите PIN сотрудника, чтобы продолжить работу.
                      </p>
                    </div>
                    <label className="grid gap-3 text-left text-sm font-medium text-slate-200">
                      <span className="sr-only">PIN</span>
                      <input
                        autoFocus
                        className="sr-only"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) => {
                          setMessage(null)
                          setUnlockPin(normalizePin(event.target.value))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            submitUnlock()
                          }
                        }}
                        placeholder="0000"
                        type="password"
                        value={unlockPin}
                      />
                      {renderPinDots(unlockPin)}
                    </label>
                    {message ? <div className="text-sm font-medium text-red-200">{message}</div> : null}
                    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-3">
                      {keypadKeys.map((digit) => (
                        <button
                          className="inline-flex aspect-square items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                          key={digit}
                          onClick={() => addUnlockDigit(digit)}
                          type="button"
                        >
                          {digit}
                        </button>
                      ))}
                      <button
                        className="inline-flex aspect-square items-center justify-center rounded-full text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        onClick={() => setIsUnlockOpen(false)}
                        type="button"
                      >
                        Назад
                      </button>
                      <button
                        className="inline-flex aspect-square items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        onClick={() => addUnlockDigit('0')}
                        type="button"
                      >
                        0
                      </button>
                      <button
                        aria-label="Удалить цифру"
                        className="inline-flex aspect-square items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        onClick={removeUnlockDigit}
                        type="button"
                      >
                        <Delete className="size-6" />
                      </button>
                    </div>
                    <Button
                      className="min-h-12"
                      disabled={verifyPinMutation.isPending}
                      onClick={submitUnlock}
                      type="button"
                    >
                      {verifyPinMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                      Разблокировать
                    </Button>
                  </section>
                </div>
              ) : null}
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}
