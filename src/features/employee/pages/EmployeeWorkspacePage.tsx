import {
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  Hourglass,
  Loader2,
  Pause,
  Play,
  Plus,
  ReceiptText,
  Search,
  Timer,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type {
  EmployeeOrderItemRow,
  EmployeeWorkspacePlaceRow,
  PaymentMethod,
} from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  useEmployeeCombos,
  useEmployeeProducts,
  useEmployeeServices,
} from '../catalog/employeeCatalogApi'
import {
  orderStatusLabel,
  useEmployeeOrderItems,
  useEmployeeOrderMutations,
  useEmployeeWorkspaceData,
} from '../../orders/employeeOrdersApi'
import { useCurrentEmployeeShift } from '../../shifts/shiftsApi'
import {
  buildWorkspaceLayout,
  getPlaceDisplayLabel,
  isTablePlace,
  WORKSPACE_COLUMNS,
} from '../../places/workspaceLayout'

type PickerTab = 'products' | 'services' | 'combos'
type OrderCloseAction = 'finish-empty' | 'cancel'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatAzn = (value: number | null | undefined) => `${formatMoney(value)} AZN`

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

const calculateCurrentSessionAmount = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  if (!place.active_session_started_at || !place.active_session_hourly_rate) return 0
  const actualMinutes = Math.max(
    1,
    Math.ceil((nowMs - new Date(place.active_session_started_at).getTime()) / 60_000),
  )
  const minimum = place.active_session_minimum_minutes ?? 60
  const step = place.active_session_billing_step_minutes ?? 30
  const billable =
    actualMinutes <= minimum ? minimum : minimum + Math.ceil((actualMinutes - minimum) / step) * step
  return (place.active_session_hourly_rate * billable) / 60
}

const placeStatus = (place: EmployeeWorkspacePlaceRow) => {
  if (place.status !== 'active') return 'Недоступно'
  if (place.active_order_status === 'waiting_payment') return 'Ожидает оплаты'
  if (place.active_order_id || place.active_session_id) return 'Занято'
  return 'Свободно'
}

const getStatusIndicatorClassName = (status: ReturnType<typeof placeStatus>) =>
  cn(
    'size-3.5 shrink-0 rounded-full ring-4',
    status === 'Свободно' && 'bg-emerald-500 ring-emerald-100',
    status === 'Занято' && 'bg-red-500 ring-red-100',
    status === 'Ожидает оплаты' && 'bg-orange-500 ring-orange-100',
    status === 'Недоступно' && 'bg-slate-400 ring-slate-100',
  )

const getSlotClassName = (place: EmployeeWorkspacePlaceRow, shape: string) =>
  cn(
    'group relative grid min-h-24 content-between overflow-hidden rounded-lg border p-3 text-left shadow-sm transition',
    'focus-within:ring-2 focus-within:ring-emerald-700 hover:-translate-y-0.5 hover:shadow-md',
    place.active_order_id || place.active_session_id
      ? 'border-red-200 bg-red-50/70'
      : 'border-slate-200 bg-white hover:border-emerald-200',
    place.active_order_status === 'waiting_payment' && 'border-orange-200 bg-orange-50',
    place.status !== 'active' && 'border-slate-200 bg-slate-100 opacity-70',
    shape === 'compact' && 'min-h-24',
    shape === 'room' && 'min-h-36',
    shape === 'wide' && 'min-h-36',
    shape === 'table' && 'min-h-32',
  )

export function EmployeeWorkspacePage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId)
  const productsQuery = useEmployeeProducts({ organizationId })
  const servicesQuery = useEmployeeServices({ organizationId })
  const combosQuery = useEmployeeCombos({ organizationId })
  const orderMutations = useEmployeeOrderMutations(organizationId)
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [pickerTab, setPickerTab] = useState<PickerTab>('products')
  const [paymentChoiceOrderId, setPaymentChoiceOrderId] = useState<string | null>(null)
  const [orderCloseAction, setOrderCloseAction] = useState<OrderCloseAction | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [removeRequestItem, setRemoveRequestItem] = useState<EmployeeOrderItemRow | null>(null)
  const [removeRequestReason, setRemoveRequestReason] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const orderItemsQuery = useEmployeeOrderItems(selectedOrderId)

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const places = useMemo(() => workspaceQuery.data?.places ?? [], [workspaceQuery.data?.places])
  const orders = useMemo(() => workspaceQuery.data?.orders ?? [], [workspaceQuery.data?.orders])
  const placeLayout = useMemo(() => buildWorkspaceLayout(places), [places])
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  )
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  )
  const paymentChoiceOpen = Boolean(selectedOrderId && selectedOrderId === paymentChoiceOrderId)
  const orderItems = orderItemsQuery.data ?? []
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places])
  const ordersWithoutPlace = orders.filter((order) => !order.place_id && order.status !== 'paid')

  const filteredProducts = (productsQuery.data ?? []).filter((item) =>
    [item.name, item.sku, item.characteristics].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  )
  const filteredServices = (servicesQuery.data ?? [])
    .filter((item) => item.pricing_type === 'fixed')
    .filter((item) =>
      [item.name, item.characteristics].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
    )
  const filteredCombos = (combosQuery.data ?? []).filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  const runAction = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Операция не выполнена.')
    }
  }

  const selectOrder = (orderId: string) => {
    setPaymentChoiceOrderId(null)
    setSelectedOrderId(orderId)
  }

  const closeOrder = () => {
    setPaymentChoiceOrderId(null)
    setOrderCloseAction(null)
    setCancelReason('')
    setRemoveRequestItem(null)
    setRemoveRequestReason('')
    setSelectedOrderId(null)
  }

  const closePlaceDialog = () => {
    setSelectedPlaceId(null)
  }

  if (!currentShiftQuery.isLoading && !currentShiftQuery.data?.shift) {
    return (
      <section className="grid content-start gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <header className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950">Рабочая панель</h2>
            <p className="mt-1 text-sm leading-5 text-amber-900">
              Для продаж, сессий и оплат нужна открытая смена.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Смена не открыта. Откройте смену, чтобы начать работу с заказами.
            </p>
          </header>
          <Button type="button">
            <Link className="inline-flex items-center gap-2" to="/employee/shift">
              <Clock3 className="size-4" /> Открыть смену
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  const createOrderForPlace = (place: EmployeeWorkspacePlaceRow) =>
    runAction(async () => {
      const order = await orderMutations.createOrder.mutateAsync({ placeId: place.id })
      closePlaceDialog()
      selectOrder(order.id)
    })

  const startSession = (place: EmployeeWorkspacePlaceRow) =>
    runAction(async () => {
      const session = await orderMutations.startSession.mutateAsync({ placeId: place.id })
      closePlaceDialog()
      selectOrder(session.order_id)
    })

  const startSessionForOrder = (place: EmployeeWorkspacePlaceRow, orderId: string) =>
    runAction(async () => {
      await orderMutations.startSession.mutateAsync({ placeId: place.id, orderId })
      closePlaceDialog()
    })

  const openPlaceOrder = (place: EmployeeWorkspacePlaceRow) => {
    if (place.active_order_id) {
      closePlaceDialog()
      selectOrder(place.active_order_id)
      return
    }

    void createOrderForPlace(place)
  }

  const addItem = (kind: PickerTab, id: string) =>
    runAction(async () => {
      if (!selectedOrderId) return
      if (kind === 'products') {
        await orderMutations.addProduct.mutateAsync({ orderId: selectedOrderId, productId: id, quantity: 1 })
      } else if (kind === 'services') {
        await orderMutations.addService.mutateAsync({ orderId: selectedOrderId, serviceId: id, quantity: 1 })
      } else {
        await orderMutations.addCombo.mutateAsync({ orderId: selectedOrderId, comboId: id, quantity: 1 })
      }
    })

  const addItemToPlace = (place: EmployeeWorkspacePlaceRow, kind: PickerTab, id: string) =>
    runAction(async () => {
      const orderId = place.active_order_id ?? (await orderMutations.createOrder.mutateAsync({ placeId: place.id })).id

      if (kind === 'products') {
        await orderMutations.addProduct.mutateAsync({ orderId, productId: id, quantity: 1 })
      } else if (kind === 'services') {
        await orderMutations.addService.mutateAsync({ orderId, serviceId: id, quantity: 1 })
      } else {
        await orderMutations.addCombo.mutateAsync({ orderId, comboId: id, quantity: 1 })
      }

      closePlaceDialog()
      selectOrder(orderId)
    })

  const requestRemove = (item: EmployeeOrderItemRow) => {
    setRemoveRequestItem(item)
    setRemoveRequestReason('')
  }

  const closeRemoveRequest = () => {
    if (orderMutations.requestAdjustment.isPending) return
    setRemoveRequestItem(null)
    setRemoveRequestReason('')
  }

  const submitRemoveRequest = () => {
    if (!selectedOrderId || !removeRequestItem || !removeRequestReason.trim()) return
    void runAction(async () => {
      await orderMutations.requestAdjustment.mutateAsync({
        orderId: selectedOrderId,
        orderItemId: removeRequestItem.id,
        requestType: 'remove_order_item',
        reason: removeRequestReason.trim(),
      })
      setRemoveRequestItem(null)
      setRemoveRequestReason('')
    })
  }

  const requestQuantity = (item: EmployeeOrderItemRow) => {
    if (!selectedOrderId) return
    const quantityText = window.prompt(t('Новое количество'), String(item.quantity))
    if (!quantityText) return
    const quantity = Number(quantityText)
    if (!Number.isFinite(quantity) || quantity <= 0) return
    const reason = window.prompt(t('Причина изменения количества'))
    if (!reason) return
    void runAction(() =>
      orderMutations.requestAdjustment.mutateAsync({
        orderId: selectedOrderId,
        orderItemId: item.id,
        requestType: 'change_quantity',
        reason,
        requestedQuantity: quantity,
      }),
    )
  }

  const completePayment = (method: PaymentMethod) => {
    if (!selectedOrderId) return
    void runAction(async () => {
      await orderMutations.completePayment.mutateAsync({ orderId: selectedOrderId, method })
      closeOrder()
    })
  }

  const openPaymentChoice = () => {
    if (!selectedOrderId || !selectedOrder) return
    void runAction(async () => {
      if (selectedOrder.status === 'open') {
        await orderMutations.waitPayment.mutateAsync(selectedOrder.id)
      }
      setPaymentChoiceOrderId(selectedOrder.id)
    })
  }

  const refusePayment = () => {
    if (!selectedOrderId) return
    const comment = window.prompt('Комментарий к отказу от оплаты')
    if (!comment) return
    void runAction(async () => {
      await orderMutations.refusePayment.mutateAsync({ orderId: selectedOrderId, comment })
      closeOrder()
    })
  }

  const finishEmptyOrder = () => {
    if (!selectedOrder) return
    setOrderCloseAction('finish-empty')
  }

  const cancelOrder = () => {
    if (!selectedOrder) return
    setCancelReason('')
    setOrderCloseAction('cancel')
  }

  const confirmOrderCloseAction = () => {
    if (!selectedOrder || !orderCloseAction) return
    if (orderCloseAction === 'cancel' && !cancelReason.trim()) {
      setError('Укажите причину отмены заказа.')
      return
    }

    void runAction(async () => {
      if (orderCloseAction === 'finish-empty') {
        await orderMutations.completeEmptyOrder.mutateAsync(selectedOrder.id)
      } else {
        await orderMutations.cancelOrder.mutateAsync({
          orderId: selectedOrder.id,
          reason: cancelReason.trim(),
        })
      }
      closeOrder()
    })
  }

  const createOrderWithoutPlace = () =>
    runAction(async () => {
      const order = await orderMutations.createOrder.mutateAsync({})
      selectOrder(order.id)
    })
  const isOrderCloseActionPending =
    orderMutations.completeEmptyOrder.isPending ||
    orderMutations.cancelOrder.isPending ||
    orderMutations.completePayment.isPending ||
    orderMutations.refusePayment.isPending

  return (
    <section className="flex min-h-[calc(100svh-1rem)] flex-col gap-3">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {workspaceQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка рабочего места
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-2 shadow-sm ring-1 ring-slate-200 sm:p-3">
        <div
          className="grid min-h-full auto-rows-[minmax(88px,auto)] gap-2 xl:gap-3"
          style={{
            gridTemplateColumns: `repeat(${WORKSPACE_COLUMNS}, minmax(0, 1fr))`,
          }}
        >
          {placeLayout.map((slot) => {
            const place = slot.place
            const status = placeStatus(place)
            const isTable = isTablePlace(place)
            const hasActiveSession = Boolean(place.active_session_id)
            const hasActiveOrder = Boolean(place.active_order_id)
            const sessionAmount = calculateCurrentSessionAmount(place, nowMs)

            return (
              <article
                className={getSlotClassName(place, slot.shape)}
                key={slot.key}
                onClick={() => setSelectedPlaceId(place.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedPlaceId(place.id)
                  }
                }}
                role="button"
                style={slot.style}
                tabIndex={0}
              >
                <div className="grid gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <CatalogImage alt={place.name} className="size-10 rounded-full" imagePath={place.image_path} />
                      <h3 className="min-w-0 break-words text-base font-semibold leading-tight text-slate-950">
                        {getPlaceDisplayLabel(place, slot.label)}
                      </h3>
                    </div>
                    <span
                      aria-label={status}
                      className={getStatusIndicatorClassName(status)}
                      role="img"
                      title={status}
                    />
                  </div>

                  <div className="grid gap-1 text-xs text-slate-600">
                    {hasActiveSession ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-900">
                        <Timer className="size-3.5" />
                        {formatElapsed(place.active_session_started_at, nowMs)}
                      </span>
                    ) : (
                      <span>{isTable ? 'Стол' : place.has_timer ? 'Сессия не начата' : 'Без таймера'}</span>
                    )}
                    <span>
                      {hasActiveOrder
                        ? `#${place.active_order_number} · ${place.active_order_item_count} поз.`
                        : 'Заказ не открыт'}
                    </span>
                    <span className="font-semibold text-slate-950">
                      {formatMoney((place.active_order_total ?? 0) + sessionAmount)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-1.5">
                  {!isTable ? (
                    <>
                      {hasActiveSession ? (
                        <button
                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-50"
                          onClick={(event) => {
                            event.stopPropagation()
                            void runAction(() =>
                              orderMutations.completeSession.mutateAsync(place.active_session_id!),
                            )
                          }}
                          type="button"
                        >
                          <CheckCircle2 className="size-3.5" /> Закрыть сессию
                        </button>
                      ) : (
                        <button
                          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md bg-emerald-700 px-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
                          disabled={!place.has_timer}
                          onClick={(event) => {
                            event.stopPropagation()
                            void (hasActiveOrder ? startSessionForOrder(place, place.active_order_id!) : startSession(place))
                          }}
                          type="button"
                        >
                          <Play className="size-3.5" /> Начать сессию
                        </button>
                      )}
                      <button
                        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedPlaceId(place.id)
                        }}
                        type="button"
                      >
                        <Plus className="size-3.5" /> Товары и услуги
                      </button>
                    </>
                  ) : (
                    <button
                      className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openPlaceOrder(place)
                      }}
                      type="button"
                    >
                      <ReceiptText className="size-3.5" />
                      {hasActiveOrder ? 'Открыть заказ' : 'Создать заказ'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {!workspaceQuery.isLoading && !placeLayout.length ? (
        <section className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
          <div className="grid gap-2">
            <h3 className="text-lg font-semibold text-slate-950">Рабочая схема пустая</h3>
            <p className="max-w-md text-sm text-slate-600">
              Администратор организации может добавить места и настроить их расположение.
            </p>
          </div>
        </section>
      ) : null}

      {selectedPlace ? (
        <Modal className="bg-slate-950/35" onClose={closePlaceDialog}>
          <section className="grid max-h-[calc(100svh-2rem)] w-full max-w-3xl grid-rows-[auto_1fr] overflow-hidden rounded-xl bg-white shadow-xl">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <CatalogImage
                  alt={selectedPlace.name}
                  className="size-14 rounded-full"
                  imagePath={selectedPlace.image_path}
                />
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-semibold text-slate-950">
                    {getPlaceDisplayLabel(selectedPlace, selectedPlace.name)}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedPlace.custom_type_name ?? selectedPlace.type} · {placeStatus(selectedPlace)}
                  </p>
                  {selectedPlace.has_timer ? (
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Минимум {selectedPlace.minimum_minutes ?? 60} мин. · шаг {selectedPlace.billing_step_minutes ?? 30} мин.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-3">
                {selectedPlace.has_timer ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
                    <p className="text-xs font-medium text-emerald-700">Цена за час</p>
                    <p className="text-2xl font-semibold text-emerald-900">
                      {formatAzn(selectedPlace.hourly_rate)}
                    </p>
                  </div>
                ) : null}
                <button
                  aria-label="Закрыть"
                  className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  onClick={closePlaceDialog}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div className="grid gap-4 overflow-y-auto p-5">
              {!isTablePlace(selectedPlace) ? (
                <div className="grid gap-4 rounded-lg border border-slate-200 p-4">
                  {!selectedPlace.has_timer ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Для этой зоны не включён таймер. Администратор может включить тариф в настройках места.
                    </div>
                  ) : null}

                  {selectedPlace.active_session_id ? (
                    <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <Timer className="size-4" /> {formatElapsed(selectedPlace.active_session_started_at, nowMs)}
                      </div>
                      <div className="mt-1">
                        Сейчас: {formatMoney(calculateCurrentSessionAmount(selectedPlace, nowMs))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {selectedPlace.active_order_id ? (
                      <Button onClick={() => openPlaceOrder(selectedPlace)} type="button" variant="secondary">
                        <ReceiptText className="size-4" /> Открыть заказ
                      </Button>
                    ) : null}
                    {!selectedPlace.active_session_id ? (
                      <Button
                        disabled={!selectedPlace.has_timer}
                        onClick={() =>
                          selectedPlace.active_order_id
                            ? startSessionForOrder(selectedPlace, selectedPlace.active_order_id)
                            : startSession(selectedPlace)
                        }
                        type="button"
                      >
                        <Play className="size-4" /> Начать сессию
                      </Button>
                    ) : (
                      <Button
                        onClick={() =>
                          runAction(() => orderMutations.completeSession.mutateAsync(selectedPlace.active_session_id!))
                        }
                        type="button"
                        variant="secondary"
                      >
                        <CheckCircle2 className="size-4" /> Завершить сессию
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-3 gap-2">
                      {(['products', 'services', 'combos'] as const).map((tab) => (
                        <button
                          className={cn(
                            'min-h-10 rounded-md border px-2 text-sm font-medium',
                            pickerTab === tab
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-white text-slate-600',
                          )}
                          key={tab}
                          onClick={() => setPickerTab(tab)}
                          type="button"
                        >
                          {tab === 'products' ? 'Товары' : tab === 'services' ? 'Услуги' : 'Комбо'}
                        </button>
                      ))}
                    </div>

                    <label className="relative block">
                      <span className="sr-only">Поиск</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Поиск товара или услуги"
                        type="search"
                        value={search}
                      />
                    </label>

                    <div className="grid max-h-64 gap-2 overflow-y-auto">
                      {pickerTab === 'products'
                        ? filteredProducts.map((product) => (
                            <button
                              className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={product.id}
                              onClick={() => addItemToPlace(selectedPlace, 'products', product.id)}
                              type="button"
                            >
                              <CatalogImage alt={product.name} className="size-12" imagePath={product.image_path} />
                              <span className="grid gap-1"><span className="font-medium text-slate-950">{product.name}</span><span className="text-sm text-slate-600">{formatMoney(product.sale_price)}</span></span>
                            </button>
                          ))
                        : null}
                      {pickerTab === 'services'
                        ? filteredServices.map((service) => (
                            <button
                              className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={service.id}
                              onClick={() => addItemToPlace(selectedPlace, 'services', service.id)}
                              type="button"
                            >
                              <CatalogImage alt={service.name} className="size-12" imagePath={service.image_path} />
                              <span className="grid gap-1"><span className="font-medium text-slate-950">{service.name}</span><span className="text-sm text-slate-600">{formatMoney(service.fixed_price)}</span></span>
                            </button>
                          ))
                        : null}
                      {pickerTab === 'combos'
                        ? filteredCombos.map((combo) => (
                            <button
                              className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={combo.id}
                              onClick={() => addItemToPlace(selectedPlace, 'combos', combo.id)}
                              type="button"
                            >
                              <CatalogImage alt={combo.name} className="size-12" imagePath={combo.image_path} />
                              <span className="grid gap-1"><span className="font-medium text-slate-950">{combo.name}</span><span className="text-sm text-slate-600">{formatMoney(combo.sale_price)}</span></span>
                            </button>
                          ))
                        : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-950">Заказ на стол</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        Выберите товары или откройте текущий заказ для полной корзины.
                      </p>
                    </div>
                    <Button onClick={() => openPlaceOrder(selectedPlace)} type="button">
                      <ReceiptText className="size-4" />
                      {selectedPlace.active_order_id ? 'Открыть заказ' : 'Создать заказ'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(['products', 'services', 'combos'] as const).map((tab) => (
                      <button
                        className={cn(
                          'min-h-10 rounded-md border px-2 text-sm font-medium',
                          pickerTab === tab
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600',
                        )}
                        key={tab}
                        onClick={() => setPickerTab(tab)}
                        type="button"
                      >
                        {tab === 'products' ? 'Товары' : tab === 'services' ? 'Услуги' : 'Комбо'}
                      </button>
                    ))}
                  </div>

                  <label className="relative block">
                    <span className="sr-only">Поиск</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Поиск товара или услуги"
                      type="search"
                      value={search}
                    />
                  </label>

                  <div className="grid max-h-72 gap-2 overflow-y-auto">
                    {pickerTab === 'products'
                      ? filteredProducts.map((product) => (
                          <button
                            className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                            key={product.id}
                            onClick={() => addItemToPlace(selectedPlace, 'products', product.id)}
                            type="button"
                          >
                            <CatalogImage alt={product.name} className="size-12" imagePath={product.image_path} />
                            <span className="grid gap-1"><span className="font-medium text-slate-950">{product.name}</span><span className="text-sm text-slate-600">{formatMoney(product.sale_price)}</span></span>
                          </button>
                        ))
                      : null}
                    {pickerTab === 'services'
                      ? filteredServices.map((service) => (
                          <button
                            className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                            key={service.id}
                            onClick={() => addItemToPlace(selectedPlace, 'services', service.id)}
                            type="button"
                          >
                            <CatalogImage alt={service.name} className="size-12" imagePath={service.image_path} />
                            <span className="grid gap-1"><span className="font-medium text-slate-950">{service.name}</span><span className="text-sm text-slate-600">{formatMoney(service.fixed_price)}</span></span>
                          </button>
                        ))
                      : null}
                    {pickerTab === 'combos'
                      ? filteredCombos.map((combo) => (
                          <button
                            className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                            key={combo.id}
                            onClick={() => addItemToPlace(selectedPlace, 'combos', combo.id)}
                            type="button"
                          >
                            <CatalogImage alt={combo.name} className="size-12" imagePath={combo.image_path} />
                            <span className="grid gap-1"><span className="font-medium text-slate-950">{combo.name}</span><span className="text-sm text-slate-600">{formatMoney(combo.sale_price)}</span></span>
                          </button>
                        ))
                      : null}
                  </div>
                </div>
              )}
            </div>
          </section>
        </Modal>
      ) : null}

      <section className="grid max-h-44 gap-2 overflow-hidden border-t border-slate-200 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-950">Заказы без места</h3>
            <p className="text-xs text-slate-500">{ordersWithoutPlace.length} активн.</p>
          </div>
          <Button className="min-h-9 px-3" onClick={createOrderWithoutPlace} type="button">
            <Plus className="size-4" /> Заказ без места
          </Button>
        </div>

        {ordersWithoutPlace.length ? (
          <div className="grid max-h-28 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
            {ordersWithoutPlace.map((order) => (
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-emerald-200 hover:bg-emerald-50/40"
                key={order.id}
                onClick={() => selectOrder(order.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-950">#{order.order_number}</span>
                  <span className="text-sm text-slate-600">{orderStatusLabel[order.status]}</span>
                </div>
                <div className="mt-2 text-sm text-slate-600">Итого: {formatMoney(order.total_amount)}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
            Заказов без места нет.
          </div>
        )}
      </section>

      {selectedOrder ? (
        <Modal
          align="end"
          className="bg-slate-950/35"
          onClose={closeOrder}
          padding="none"
          panelClassName="h-full lg:flex lg:justify-end"
        >
          <aside className="grid h-full w-full max-w-5xl grid-rows-[auto_1fr_auto] overflow-hidden bg-white shadow-xl lg:w-[920px]">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Заказ #{selectedOrder.order_number}</h3>
                <p className="text-sm text-slate-600">
                  {selectedOrder.current_place_name_snapshot ?? 'Без места'} · {orderStatusLabel[selectedOrder.status]}
                </p>
              </div>
              <button
                aria-label="Закрыть"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={closeOrder}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="grid min-h-0 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_360px]">
              <section className="grid content-start gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-slate-950">Состав заказа</h4>
                    <p className="text-sm text-slate-600">Позиции, сессия и корректировки.</p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {orderItems.length} поз.
                  </span>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {orderItemsQuery.isLoading ? (
                    <div className="p-4 text-sm text-slate-600">Загрузка позиций...</div>
                  ) : null}
                  {orderItems.map((item) => (
                    <div className="grid grid-cols-[48px_1fr] gap-3 border-b border-slate-100 p-3 last:border-b-0" key={item.id}>
                      <CatalogImage alt={item.name_snapshot} className="size-12" imagePath={item.image_path_snapshot} />
                      <div className="grid gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-950">{item.name_snapshot}</div>
                          <div className="text-sm text-slate-600">
                            {item.quantity} × {formatMoney(item.unit_price)}
                          </div>
                        </div>
                        <div className="text-right font-semibold text-slate-950">{formatMoney(item.total_price)}</div>
                      </div>
                      {item.status === 'active' && selectedOrder.status === 'open' ? (
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => requestQuantity(item)} type="button" variant="secondary">
                            Кол-во
                          </Button>
                          <Button onClick={() => requestRemove(item)} type="button" variant="danger">
                            Запросить удаление
                          </Button>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  ))}
                  {!orderItems.length && !orderItemsQuery.isLoading ? (
                    <div className="grid min-h-28 place-items-center p-4 text-center text-sm text-slate-600">
                      Позиции пока не добавлены.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="grid content-start gap-3">
                {(() => {
                  const selectedPlace = placesById.get(selectedOrder.place_id ?? '') ?? null
                  const hasActiveSession = Boolean(selectedPlace?.active_session_id)
                  const canAddItems = selectedOrder.status === 'open'
                  const canPreparePayment =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') &&
                    !hasActiveSession &&
                    selectedOrder.total_amount > 0
                  const canFinishEmptyOrder =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') &&
                    !hasActiveSession &&
                    selectedOrder.total_amount <= 0
                  const canCancelOrder =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') && !hasActiveSession
                  const canStartSession =
                    canAddItems && Boolean(selectedPlace?.has_timer) && !selectedPlace?.active_session_id
                  const isClosingOrder = isOrderCloseActionPending

                  return (
                    <>
                      <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-950">Сессия и статус</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            {hasActiveSession
                              ? 'Сначала завершите сессию, затем переводите заказ к оплате.'
                              : selectedOrder.status === 'waiting_payment'
                                ? 'Заказ готов к оплате.'
                                : selectedOrder.total_amount <= 0
                                  ? 'Можно добавить позиции или завершить пустой заказ без оплаты.'
                                  : 'Добавьте позиции или переведите заказ к оплате.'}
                          </p>
                        </div>

                        {hasActiveSession ? (
                          <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                            <div className="flex items-center gap-2 font-semibold">
                              <Timer className="size-4" />
                              {formatElapsed(selectedPlace?.active_session_started_at ?? null, nowMs)}
                            </div>
                            <div className="mt-1">
                              Сейчас: {formatMoney(selectedPlace ? calculateCurrentSessionAmount(selectedPlace, nowMs) : 0)}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid grid-cols-2 gap-2">
                          {canStartSession ? (
                            <Button
                              onClick={() => startSessionForOrder(selectedPlace!, selectedOrder.id)}
                              type="button"
                              variant="secondary"
                            >
                              <Play className="size-4" /> Начать
                            </Button>
                          ) : null}
                          {hasActiveSession ? (
                            <Button
                              onClick={() =>
                                runAction(() =>
                                  orderMutations.completeSession.mutateAsync(selectedPlace!.active_session_id!),
                                )
                              }
                              type="button"
                              variant="secondary"
                            >
                              <CheckCircle2 className="size-4" /> Завершить
                            </Button>
                          ) : null}
                          <Button disabled title="Пауза сессии пока не поддержана сервером" type="button" variant="secondary">
                            <Pause className="size-4" /> Пауза
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">Итого к оплате</span>
                          <span className="text-2xl font-semibold text-slate-950">
                            {formatMoney(selectedOrder.total_amount)}
                          </span>
                        </div>

                        {selectedOrder.status === 'payment_refused' ? (
                          <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                            Оплата отклонена. {selectedOrder.payment_refusal_comment ?? ''}
                          </div>
                        ) : (
                          <>
                            {selectedOrder.total_amount > 0 ? (
                              <Button disabled={!canPreparePayment || isClosingOrder} onClick={openPaymentChoice} type="button">
                                <Hourglass className="size-4" />
                                {selectedOrder.status === 'waiting_payment' ? 'Принять оплату' : 'К оплате'}
                              </Button>
                            ) : (
                              <Button
                                disabled={!canFinishEmptyOrder || isClosingOrder}
                                onClick={finishEmptyOrder}
                                type="button"
                              >
                                <CheckCircle2 className="size-4" />
                                Завершить заказ
                              </Button>
                            )}

                            {paymentChoiceOpen ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Button disabled={isClosingOrder} onClick={() => completePayment('cash')} type="button">
                                  <Banknote className="size-4" /> Наличными
                                </Button>
                                <Button
                                  disabled={isClosingOrder}
                                  onClick={() => completePayment('card_transfer')}
                                  type="button"
                                  variant="secondary"
                                >
                                  <CreditCard className="size-4" /> Картой
                                </Button>
                              </div>
                            ) : null}

                            {selectedOrder.total_amount > 0 ? (
                              <Button
                                disabled={hasActiveSession || isClosingOrder}
                                onClick={refusePayment}
                                type="button"
                                variant="danger"
                              >
                                Отказ от оплаты
                              </Button>
                            ) : null}

                            <Button
                              disabled={!canCancelOrder || isClosingOrder}
                              onClick={cancelOrder}
                              type="button"
                              variant="danger"
                            >
                              <X className="size-4" />
                              Отменить заказ
                            </Button>
                          </>
                        )}
                      </div>

                      {canAddItems ? (
                        <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-950">Добавить справа</h4>
                            <span className="text-xs text-slate-500">Товары, услуги, комбо</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(['products', 'services', 'combos'] as const).map((tab) => (
                              <button
                                className={cn(
                                  'min-h-10 rounded-md border px-2 text-sm font-medium',
                                  pickerTab === tab
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-white text-slate-600',
                                )}
                                key={tab}
                                onClick={() => setPickerTab(tab)}
                                type="button"
                              >
                                {tab === 'products' ? 'Товары' : tab === 'services' ? 'Услуги' : 'Комбо'}
                              </button>
                            ))}
                          </div>
                          <label className="relative block">
                            <span className="sr-only">Поиск</span>
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                            <input
                              className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              id="employee_catalog_search"
                              onChange={(event) => setSearch(event.target.value)}
                              placeholder="Поиск"
                              type="search"
                              value={search}
                            />
                          </label>
                          <div className="grid max-h-[36svh] gap-2 overflow-y-auto">
                            {pickerTab === 'products'
                              ? filteredProducts.map((product) => (
                                  <button
                                    className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                                    key={product.id}
                                    onClick={() => addItem('products', product.id)}
                                    type="button"
                                  >
                                    <CatalogImage alt={product.name} className="size-12" imagePath={product.image_path} />
                                    <span className="grid gap-1"><span className="font-medium text-slate-950">{product.name}</span><span className="text-sm text-slate-600">{formatMoney(product.sale_price)}</span></span>
                                  </button>
                                ))
                              : null}
                            {pickerTab === 'services'
                              ? filteredServices.map((service) => (
                                  <button
                                    className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                                    key={service.id}
                                    onClick={() => addItem('services', service.id)}
                                    type="button"
                                  >
                                    <CatalogImage alt={service.name} className="size-12" imagePath={service.image_path} />
                                    <span className="grid gap-1"><span className="font-medium text-slate-950">{service.name}</span><span className="text-sm text-slate-600">{formatMoney(service.fixed_price)}</span></span>
                                  </button>
                                ))
                              : null}
                            {pickerTab === 'combos'
                              ? filteredCombos.map((combo) => (
                                  <button
                                    className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                                    key={combo.id}
                                    onClick={() => addItem('combos', combo.id)}
                                    type="button"
                                  >
                                    <CatalogImage alt={combo.name} className="size-12" imagePath={combo.image_path} />
                                    <span className="grid gap-1"><span className="font-medium text-slate-950">{combo.name}</span><span className="text-sm text-slate-600">{formatMoney(combo.sale_price)}</span></span>
                                  </button>
                                ))
                              : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )
                })()}
              </section>
            </div>

            <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Таймер считается локально; финальная сумма сессии пересчитывается сервером при завершении.
            </footer>
          </aside>

          {removeRequestItem ? (
            <Modal className="z-[60] bg-slate-950/45" onClose={closeRemoveRequest}>
              <section className="grid w-full max-w-md gap-4 rounded-xl bg-white p-5 shadow-xl">
                <div className="grid gap-1">
                  <h4 className="text-lg font-semibold text-slate-950">Запросить удаление?</h4>
                  <p className="text-sm text-slate-600">
                    Позиция «{removeRequestItem.name_snapshot}» останется в заказе до одобрения администратора.
                  </p>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Причина удаления</span>
                  <textarea
                    autoFocus
                    className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    onChange={(event) => setRemoveRequestReason(event.target.value)}
                    placeholder="Например: клиент отменил позицию"
                    value={removeRequestReason}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={orderMutations.requestAdjustment.isPending}
                    onClick={closeRemoveRequest}
                    type="button"
                    variant="secondary"
                  >
                    Назад
                  </Button>
                  <Button
                    disabled={orderMutations.requestAdjustment.isPending || !removeRequestReason.trim()}
                    onClick={submitRemoveRequest}
                    type="button"
                    variant="danger"
                  >
                    {orderMutations.requestAdjustment.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Отправить запрос
                  </Button>
                </div>
              </section>
            </Modal>
          ) : null}

          {orderCloseAction ? (
            <Modal
              className="z-[60] bg-slate-950/45"
              onClose={() => {
                setOrderCloseAction(null)
                setCancelReason('')
              }}
            >
              <section className="grid w-full max-w-md gap-4 rounded-xl bg-white p-5 shadow-xl">
                <div className="grid gap-1">
                  <h4 className="text-lg font-semibold text-slate-950">
                    {orderCloseAction === 'finish-empty' ? 'Завершить заказ?' : 'Отменить заказ?'}
                  </h4>
                  <p className="text-sm text-slate-600">
                    {orderCloseAction === 'finish-empty'
                      ? `Заказ #${selectedOrder.order_number} будет закрыт без оплаты, потому что сумма равна 0.`
                      : `Заказ #${selectedOrder.order_number} будет отменён и исчезнет из рабочей панели.`}
                  </p>
                </div>

                {orderCloseAction === 'cancel' ? (
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">Причина отмены</span>
                    <textarea
                      className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Например: клиент передумал"
                      value={cancelReason}
                    />
                  </label>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={isOrderCloseActionPending}
                    onClick={() => {
                      setOrderCloseAction(null)
                      setCancelReason('')
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Назад
                  </Button>
                  <Button
                    disabled={isOrderCloseActionPending || (orderCloseAction === 'cancel' && !cancelReason.trim())}
                    onClick={confirmOrderCloseAction}
                    type="button"
                    variant={orderCloseAction === 'cancel' ? 'danger' : 'primary'}
                  >
                    {orderCloseAction === 'finish-empty' ? 'Завершить' : 'Отменить'}
                  </Button>
                </div>
              </section>
            </Modal>
          ) : null}
        </Modal>
      ) : null}
    </section>
  )
}
