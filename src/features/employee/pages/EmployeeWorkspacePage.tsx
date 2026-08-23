import {
  Banknote,
  ChevronDown,
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
  Square,
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
import { isOpeningDayShiftName, useCurrentEmployeeShift } from '../../shifts/shiftsApi'
import {
  buildWorkspaceLayout,
  isTablePlace,
  normalizePlaceName,
  WORKSPACE_COLUMNS,
} from '../../places/workspaceLayout'

type PickerTab = 'products' | 'services' | 'combos'
type OrderCloseAction = 'finish-empty' | 'cancel'

const BILLING_GRACE_MINUTES = 10

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const formatAzn = (value: number | null | undefined) => `${formatMoney(value)} AZN`
const parseMoneyInput = (value: string) => Number(value.replace(',', '.'))

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
    actualMinutes <= minimum + BILLING_GRACE_MINUTES
      ? minimum
      : minimum + Math.ceil((actualMinutes - minimum - BILLING_GRACE_MINUTES) / step) * step
  return (place.active_session_hourly_rate * billable) / 60
}

const getSessionGraceNotice = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  if (!place.active_session_started_at || !place.active_session_hourly_rate) return null
  const actualMinutes = Math.max(
    1,
    Math.ceil((nowMs - new Date(place.active_session_started_at).getTime()) / 60_000),
  )
  const minimum = place.active_session_minimum_minutes ?? 60
  const step = place.active_session_billing_step_minutes ?? 30

  if (actualMinutes <= minimum) return null

  const minutesAfterMinimum = actualMinutes - minimum
  const minutesAfterLastBoundary = ((minutesAfterMinimum - 1) % step) + 1

  return minutesAfterLastBoundary <= BILLING_GRACE_MINUTES
    ? `Limit ${BILLING_GRACE_MINUTES} deq`
    : null
}

const isVipEquipmentPlace = (place: EmployeeWorkspacePlaceRow | null) => {
  if (!place) return false
  const name = normalizePlaceName(place.name)
  return place.type === 'vip_room' || place.type === 'private_room' || name.includes('vip')
}

const formatVipEquipmentSummary = (place: EmployeeWorkspacePlaceRow | null) => {
  if (!place?.vip_equipment_name && !place?.vip_equipment_time && !place?.vip_equipment_price) return null
  return [place.vip_equipment_name, place.vip_equipment_time, place.vip_equipment_price].filter(Boolean).join(' · ')
}

const placeStatus = (place: EmployeeWorkspacePlaceRow) => {
  if (place.status !== 'active') return 'Mümkün deyil'
  if (place.active_order_status === 'waiting_payment') return 'Ödəniş gözləyir'
  if (place.active_order_id || place.active_session_id) return 'Dolu'
  return 'Boş'
}

const getStatusIndicatorClassName = (status: ReturnType<typeof placeStatus>) =>
  cn(
    'size-3.5 shrink-0 rounded-full ring-4',
    status === 'Boş' && 'bg-emerald-500 ring-emerald-100',
    status === 'Dolu' && 'bg-red-500 ring-red-100',
    status === 'Ödəniş gözləyir' && 'bg-orange-500 ring-orange-100',
    status === 'Mümkün deyil' && 'bg-slate-400 ring-slate-100',
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

type CatalogAddButtonProps = {
  imagePath: string | null
  isOpeningDayShift: boolean
  isPressed: boolean
  name: string
  onClick: () => void
  price: number | null
}

function CatalogAddButton({
  imagePath,
  isOpeningDayShift,
  isPressed,
  name,
  onClick,
  price,
}: CatalogAddButtonProps) {
  return (
    <button
      className={cn(
        'grid grid-cols-[36px_1fr_auto] items-center gap-2 rounded-md border border-slate-200 p-1.5 text-left transition active:scale-[0.98]',
        'hover:border-emerald-200 hover:bg-emerald-50/40',
        isPressed && 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-600/20',
      )}
      onClick={onClick}
      type="button"
    >
      <CatalogImage alt={name} className="size-9" imagePath={imagePath} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-slate-950">{name}</span>
        {!isOpeningDayShift ? (
          <span className="text-xs text-slate-600">{formatAzn(price)}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md bg-emerald-700 text-white transition',
          isPressed && 'scale-110 bg-emerald-800',
        )}
      >
        <Plus className="size-4" />
      </span>
    </button>
  )
}

export function EmployeeWorkspacePage() {
  const { organizationId, role } = useAuth()
  const { t } = useI18n()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId)
  const productsQuery = useEmployeeProducts({ organizationId })
  const servicesQuery = useEmployeeServices({ organizationId })
  const combosQuery = useEmployeeCombos({ organizationId })
  const orderMutations = useEmployeeOrderMutations(organizationId)
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [pickerTab, setPickerTab] = useState<PickerTab>('products')
  const [paymentChoiceOrderId, setPaymentChoiceOrderId] = useState<string | null>(null)
  const [orderCloseAction, setOrderCloseAction] = useState<OrderCloseAction | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [removeRequestItem, setRemoveRequestItem] = useState<EmployeeOrderItemRow | null>(null)
  const [removeRequestReason, setRemoveRequestReason] = useState('')
  const [openingDayPaymentAmount, setOpeningDayPaymentAmount] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [cashSplitAmount, setCashSplitAmount] = useState('')
  const [cardSplitAmount, setCardSplitAmount] = useState('')
  const [orderComment, setOrderComment] = useState('')
  const [orderCustomerLabel, setOrderCustomerLabel] = useState('')
  const [vipEquipmentText, setVipEquipmentText] = useState('')
  const [isOrderCommentOpen, setIsOrderCommentOpen] = useState(false)
  const [pressedCatalogItemKey, setPressedCatalogItemKey] = useState<string | null>(null)
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
  const paymentChoiceOpen = Boolean(selectedOrderId && selectedOrderId === paymentChoiceOrderId)
  const isOpeningDayShift = isOpeningDayShiftName(currentShiftQuery.data?.template?.name)
  const openingDayPaymentValue = parseMoneyInput(openingDayPaymentAmount)
  const hasOpeningDayPaymentAmount =
    openingDayPaymentAmount.trim().length > 0 &&
    Number.isFinite(openingDayPaymentValue) &&
    openingDayPaymentValue >= 0
  const tipValue = parseMoneyInput(tipAmount)
  const hasValidTipAmount =
    tipAmount.trim().length === 0 ||
    (Number.isFinite(tipValue) && tipValue >= 0)
  const normalizedTipAmount = hasValidTipAmount && tipAmount.trim().length ? tipValue : 0
  const selectedOrderTotalWithTip = (selectedOrder?.total_amount ?? 0) + normalizedTipAmount
  const cashSplitValue = parseMoneyInput(cashSplitAmount)
  const cardSplitValue = parseMoneyInput(cardSplitAmount)
  const splitPaymentTargetTotal = isOpeningDayShift ? openingDayPaymentValue : selectedOrderTotalWithTip
  const splitPaymentTotal = cashSplitValue + cardSplitValue
  const isSplitPaymentValid =
    Number.isFinite(cashSplitValue) &&
    Number.isFinite(cardSplitValue) &&
    cashSplitValue >= 0 &&
    cardSplitValue >= 0 &&
    splitPaymentTotal > 0 &&
    Math.abs(splitPaymentTotal - splitPaymentTargetTotal) < 0.01
  const orderItems = orderItemsQuery.data ?? []
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places])
  const selectedOrderPlace = selectedOrder?.place_id ? placesById.get(selectedOrder.place_id) ?? null : null
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
      setError(nextError instanceof Error ? nextError.message : 'Əməliyyat yerinə yetirilmədi.')
    }
  }

  const markCatalogPress = (key: string) => {
    setPressedCatalogItemKey(key)
    window.setTimeout(() => {
      setPressedCatalogItemKey((current) => (current === key ? null : current))
    }, 180)
  }

  const selectOrder = (orderId: string) => {
    const order = orders.find((currentOrder) => currentOrder.id === orderId)
    const place = order?.place_id ? placesById.get(order.place_id) ?? null : null
    setPaymentChoiceOrderId(null)
    setOpeningDayPaymentAmount('')
    setTipAmount('')
    setCashSplitAmount('')
    setCardSplitAmount('')
    setOrderComment(order?.comment ?? '')
    setOrderCustomerLabel(order?.customer_label ?? '')
    setVipEquipmentText(formatVipEquipmentSummary(place) ?? '')
    setIsOrderCommentOpen(Boolean(order?.comment?.trim()))
    setSelectedOrderId(orderId)
  }

  const closeOrder = () => {
    setPaymentChoiceOrderId(null)
    setOrderCloseAction(null)
    setCancelReason('')
    setOpeningDayPaymentAmount('')
    setTipAmount('')
    setCashSplitAmount('')
    setCardSplitAmount('')
    setOrderComment('')
    setOrderCustomerLabel('')
    setVipEquipmentText('')
    setIsOrderCommentOpen(false)
    setRemoveRequestItem(null)
    setRemoveRequestReason('')
    setSelectedOrderId(null)
  }

  // Allow organization admins to view the workspace even when no shift is open.
  // Non-admin users still see the prompt to open a shift.
  if (!currentShiftQuery.isLoading && !currentShiftQuery.data?.shift && role !== 'organization_admin') {
    return (
      <section className="grid content-start gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <header className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950">İş paneli</h2>
            <p className="mt-1 text-sm leading-5 text-amber-900">
              Satışlar, sessiyalar və ödənişlər üçün açıq Növbə tələb olunur.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.
            </p>
          </header>
          <Button type="button">
            <Link className="inline-flex items-center gap-2" to="/employee/shift">
              <Clock3 className="size-4" /> Növbə aç
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  const createOrderForPlace = (place: EmployeeWorkspacePlaceRow) =>
    runAction(async () => {
      if (!currentShiftQuery.data?.shift) {
        if (role === 'organization_admin') {
          // Admins can view workspace without opening a shift, but should not create orders.
          setError('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
          return
        }
        throw new Error('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
      }
      const order = await orderMutations.createOrder.mutateAsync({ placeId: place.id })
      selectOrder(order.id)
    })

  const startSession = (place: EmployeeWorkspacePlaceRow) =>
    runAction(async () => {
      if (!currentShiftQuery.data?.shift) {
        if (role === 'organization_admin') {
          setError('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
          return
        }
        throw new Error('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
      }
      const session = await orderMutations.startSession.mutateAsync({ placeId: place.id })
      selectOrder(session.order_id)
    })

  const startSessionForOrder = (place: EmployeeWorkspacePlaceRow, orderId: string) =>
    runAction(async () => {
      if (!currentShiftQuery.data?.shift) {
        if (role === 'organization_admin') {
          setError('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
          return
        }
        throw new Error('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
      }
      await orderMutations.startSession.mutateAsync({ placeId: place.id, orderId })
    })

  const openPlaceOrder = (place: EmployeeWorkspacePlaceRow) => {
    if (place.active_order_id) {
      selectOrder(place.active_order_id)
      return
    }

    void createOrderForPlace(place)
  }

  const addItem = (kind: PickerTab, id: string) =>
    runAction(async () => {
      if (!selectedOrderId) return
      markCatalogPress(`${kind}:${id}`)
      if (kind === 'products') {
        await orderMutations.addProduct.mutateAsync({ orderId: selectedOrderId, productId: id, quantity: 1 })
      } else if (kind === 'services') {
        await orderMutations.addService.mutateAsync({ orderId: selectedOrderId, serviceId: id, quantity: 1 })
      } else {
        await orderMutations.addCombo.mutateAsync({ orderId: selectedOrderId, comboId: id, quantity: 1 })
      }
    })

  const changeItemQuantity = (item: EmployeeOrderItemRow, quantity: number) => {
    if (!selectedOrderId || quantity <= 0 || item.item_type === 'timed_session') return

    void runAction(() =>
      orderMutations.requestAdjustment.mutateAsync({
        orderId: selectedOrderId,
        orderItemId: item.id,
        requestType: 'change_quantity',
        reason: 'Məmur tərəfindən sürətli miqdar dəyişməsi.',
        requestedQuantity: quantity,
      }),
    )
  }

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
    const quantityText = window.prompt(t('Yeni miqdar'), String(item.quantity))
    if (!quantityText) return
    const quantity = Number(quantityText)
    if (!Number.isFinite(quantity) || quantity <= 0) return
    const reason = window.prompt(t('Miqdar dəyişməsinin səbəbi'))
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
      if (isOpeningDayShift) {
        if (!hasOpeningDayPaymentAmount) {
          throw new Error('Müştərinin həqiqətən qoyduğu məbləği daxil edin.')
        }

        await orderMutations.completeOpeningDayPayment.mutateAsync({
          orderId: selectedOrderId,
          method,
          amount: openingDayPaymentValue,
          comment: orderComment.trim() || null,
        })
      } else {
        if (!hasValidTipAmount) {
          throw new Error('Çaypulu mənfi ola bilməz.')
        }

        await orderMutations.completePaymentWithTip.mutateAsync({
          orderId: selectedOrderId,
          method,
          tipAmount: normalizedTipAmount,
          comment: orderComment.trim() || null,
        })
      }
      closeOrder()
    })
  }

  const completeSplitPayment = () => {
    if (!selectedOrderId) return
    void runAction(async () => {
      if (isOpeningDayShift) {
        if (!hasOpeningDayPaymentAmount) {
          throw new Error('Müştərinin həqiqətən qoyduğu məbləği daxil edin.')
        }
      } else if (!hasValidTipAmount) {
        throw new Error('Çaypulu mənfi ola bilməz.')
      }

      if (!Number.isFinite(cashSplitValue) || !Number.isFinite(cardSplitValue)) {
        throw new Error('Ödəniş məbləğlərini yoxlayın.')
      }

      if (cashSplitValue < 0 || cardSplitValue < 0) {
        throw new Error('Ödəniş məbləğləri mənfi ola bilməz.')
      }

      if (splitPaymentTotal <= 0) {
        throw new Error('Ən azı bir ödəniş məbləği daxil edin.')
      }

      if (Math.abs(splitPaymentTotal - splitPaymentTargetTotal) > 0.01) {
        throw new Error('Ödəniş məbləğləri sifarişin ümumi məbləğini tam örtməlidir.')
      }

      await orderMutations.completeSplitPayment.mutateAsync({
        orderId: selectedOrderId,
        cashAmount: cashSplitValue,
        cardAmount: cardSplitValue,
        comment: orderComment.trim() || null,
      })
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
      if (isOpeningDayShift && !openingDayPaymentAmount) {
        setOpeningDayPaymentAmount(String(selectedOrder.total_amount || 0))
      }
    })
  }

  const refusePayment = () => {
    if (!selectedOrderId) return
    const comment = window.prompt('Ödənişdən imtina üçün şərh')
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
      setError('Sifarişin ləğv səbəbini göstərin.')
      return
    }

    void runAction(async () => {
      if (orderCloseAction === 'finish-empty') {
        await orderMutations.completeEmptyOrder.mutateAsync({
          orderId: selectedOrder.id,
          comment: orderComment.trim() || null,
        })
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
      if (!currentShiftQuery.data?.shift) {
        if (role === 'organization_admin') {
          setError('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
          return
        }
        throw new Error('Növbə açılmayıb. Sifarişlərlə işə başlamaq üçün növbəni açın.')
      }
      const order = await orderMutations.createOrder.mutateAsync({})
      selectOrder(order.id)
    })

  const saveOrderCustomerLabel = () => {
    const nextLabel = orderCustomerLabel.trim()
    if (orderMutations.updateCustomerLabel.isPending || orderMutations.createOrder.isPending) return

    void runAction(async () => {
      // Ensure we have a selected order. If not, create one (no place)
      let orderId = selectedOrder?.id ?? selectedOrderId
      if (!orderId) {
        const order = await orderMutations.createOrder.mutateAsync({})
        selectOrder(order.id)
        orderId = order.id
      }

      // Reload selectedOrder reference
      const orderRef = orders.find((o) => o.id === orderId) ?? selectedOrder
      if (!orderRef || orderRef.place_id) return

      const currentLabel = orderRef.customer_label?.trim() ?? ''
      if (nextLabel === currentLabel) return

      await orderMutations.updateCustomerLabel.mutateAsync({ orderId, customerLabel: nextLabel || null })
    })
  }

  const saveVipEquipment = () => {
    if (!selectedOrder?.place_id) return
    const place = placesById.get(selectedOrder.place_id) ?? null
    if (!place || !isVipEquipmentPlace(place) || orderMutations.updateVipEquipment.isPending) return

    const nextEquipmentText = vipEquipmentText.trim()
    const currentEquipmentText = formatVipEquipmentSummary(place) ?? ''
    if (nextEquipmentText === currentEquipmentText) return

    void runAction(() =>
      orderMutations.updateVipEquipment.mutateAsync({
        placeId: place.id,
        equipmentName: nextEquipmentText || null,
        equipmentTime: null,
        equipmentPrice: null,
      }),
    )
  }

  const isOrderCloseActionPending =
    orderMutations.completeEmptyOrder.isPending ||
    orderMutations.cancelOrder.isPending ||
    orderMutations.completePayment.isPending ||
    orderMutations.completePaymentWithTip.isPending ||
    orderMutations.completeOpeningDayPayment.isPending ||
    orderMutations.refusePayment.isPending

  return (
    <section className="flex min-h-[calc(100svh-1rem)] flex-col gap-3">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {workspaceQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> İş yeri yüklənir
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
            const occupancyStartedAt =
              hasActiveSession
                ? place.active_session_started_at
                : isTable && hasActiveOrder
                  ? place.active_order_opened_at
                  : null
            const sessionAmount = calculateCurrentSessionAmount(place, nowMs)
            const sessionGraceNotice = getSessionGraceNotice(place, nowMs)
            const vipEquipmentSummary = isVipEquipmentPlace(place) ? formatVipEquipmentSummary(place) : null

            return (
              <article
                className={getSlotClassName(place, slot.shape)}
                key={slot.key}
                onClick={() => openPlaceOrder(place)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openPlaceOrder(place)
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
                        {place.name}
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
                    {vipEquipmentSummary ? (
                      <span className="font-semibold text-emerald-800">{vipEquipmentSummary}</span>
                    ) : null}
                    {occupancyStartedAt ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-900">
                        <Timer className="size-3.5" />
                        {formatElapsed(occupancyStartedAt, nowMs)}
                      </span>
                    ) : (
                      <span>{isTable ? 'Masa' : place.has_timer ? 'Sessiya başlanmayıb' : 'Taymersiz'}</span>
                    )}
                    <span>
                      {hasActiveOrder
                        ? `#${place.active_order_number} · ${place.active_order_item_count} məhsul.`
                        : 'Sifariş açılmayıb'}
                    </span>
                    <span className="font-semibold text-slate-950">
                      {isOpeningDayShift ? 'Əl ilə yekun' : formatAzn((place.active_order_total ?? 0) + sessionAmount)}
                    </span>
                    {sessionGraceNotice ? (
                      <span className="font-medium text-orange-700">{sessionGraceNotice}</span>
                    ) : null}
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
                          <Square className="size-3.5" /> Sessiyanı bağla
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
                          <Play className="size-3.5" /> Sessiyanı başlat
                        </button>
                      )}
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
                      {hasActiveOrder ? 'Sifarişi aç' : 'Sifariş yarat'}
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
            <h3 className="text-lg font-semibold text-slate-950">İş sxemi boşdur</h3>
            <p className="max-w-md text-sm text-slate-600">
              Təşkilat administratoru yerlər əlavə edə və onların yerləşdirilməsini tənzimləyə bilər.
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid max-h-44 gap-2 overflow-hidden border-t border-slate-200 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-950">Məkansız sifarişlər</h3>
            <p className="text-xs text-slate-500">{ordersWithoutPlace.length} aktiv.</p>
          </div>
          <Button className="min-h-9 px-3" onClick={createOrderWithoutPlace} type="button">
            <Plus className="size-4" /> Məkansız sifariş
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
                  <span className="min-w-0 font-semibold text-slate-950">
                    #{order.order_number}{order.customer_label ? ` · ${order.customer_label}` : ''}
                  </span>
                  <span className="text-sm text-slate-600">{orderStatusLabel[order.status]}</span>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {isOpeningDayShift ? 'Yekun əl ilə daxil ediləcək' : `Cəmi: ${formatAzn(order.total_amount)}`}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
            Məkansız sifariş yoxdur.
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
          <aside className="grid h-full w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white shadow-xl lg:w-[1040px]">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
              <div className="grid min-w-0 flex-1 gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="shrink-0 text-lg font-semibold text-slate-950">Sifariş #{selectedOrder.order_number}</h3>
                  {isVipEquipmentPlace(selectedOrderPlace) ? (
                    <input
                      className="min-h-8 min-w-40 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-950 outline-none transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onBlur={saveVipEquipment}
                      onChange={(event) => setVipEquipmentText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      value={vipEquipmentText}
                    />
                  ) : null}
                </div>
                <p className="text-sm text-slate-600">
                  {selectedOrder.customer_label ? `${selectedOrder.customer_label} · ` : ''}
                  {selectedOrder.current_place_name_snapshot ?? 'Məkansız'} · {orderStatusLabel[selectedOrder.status]}
                </p>
              </div>
              <button
                aria-label="Bağla"
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={closeOrder}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="grid min-h-0 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(0,1fr)_380px]">
              <section className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
                {(() => {
                  const selectedPlace = placesById.get(selectedOrder.place_id ?? '') ?? null
                  const hasActiveSession = Boolean(selectedPlace?.active_session_id)
                  const isOrderWithoutPlace = !selectedOrder.place_id
                  const hasNormalPaymentAmount = selectedOrderTotalWithTip > 0
                  const canPreparePayment =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') &&
                    !hasActiveSession &&
                    hasValidTipAmount &&
                    (isOpeningDayShift || hasNormalPaymentAmount)
                  const canFinishEmptyOrder =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') &&
                    !hasActiveSession &&
                    !isOpeningDayShift &&
                    selectedOrder.total_amount <= 0 &&
                    normalizedTipAmount <= 0
                  const canCancelOrder =
                    (selectedOrder.status === 'open' || selectedOrder.status === 'waiting_payment') && !hasActiveSession
                  const isClosingOrder = isOrderCloseActionPending

                  return (
                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-950">
                          {isOpeningDayShift ? 'Həqiqi məbləğ' : 'Sifariş məbləği'}
                        </span>
                        <span className="text-2xl font-semibold text-slate-950">
                          {isOpeningDayShift
                            ? hasOpeningDayPaymentAmount
                              ? formatAzn(openingDayPaymentValue)
                              : '—'
                            : formatAzn(selectedOrder.total_amount)}
                        </span>
                      </div>

                      {isOrderWithoutPlace ? (
                        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                            <span>Müştəri adı</span>
                            <input
                              className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              onBlur={saveOrderCustomerLabel}
                              onChange={(event) => setOrderCustomerLabel(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.currentTarget.blur()
                                }
                              }}
                              placeholder="Məsələn: Elvin"
                              value={orderCustomerLabel}
                            />
                          </label>
                          <Button
                            className="min-h-10"
                            disabled={orderMutations.updateCustomerLabel.isPending}
                            onClick={saveOrderCustomerLabel}
                            onMouseDown={(event) => event.preventDefault()}
                            type="button"
                            variant="secondary"
                          >
                            Saxla
                          </Button>
                        </div>
                      ) : null}

                      {isOpeningDayShift ? (
                        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                            <span>Müştəri nə qədər qoydu</span>
                            <input
                              className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              inputMode="decimal"
                              min={0}
                              onChange={(event) => setOpeningDayPaymentAmount(event.target.value)}
                              placeholder="Məsələn: 50"
                              type="number"
                              value={openingDayPaymentAmount}
                            />
                            <span className="text-xs font-normal text-slate-500">
                              Bu gün pul alınmasa 0 yazmaq da mümkündür.
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                            <span>Çayevoy</span>
                            <input
                              className={cn(
                                'min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15',
                                !hasValidTipAmount && 'border-red-300 focus:border-red-600 focus:ring-red-600/15',
                              )}
                              inputMode="decimal"
                              min={0}
                              onChange={(event) => setTipAmount(event.target.value)}
                              placeholder="Məsələn: 5"
                              type="number"
                              value={tipAmount}
                            />
                            <span className={cn('text-xs font-normal text-slate-500', !hasValidTipAmount && 'text-red-700')}>
                              {hasValidTipAmount
                                ? 'Çayevoy yoxdur, 0 və ya boş qoyun.'
                                : 'Çayevoy mənfi ola bilməz.'}
                            </span>
                          </label>
                          <div className="grid min-h-5 content-center rounded-md bg-green-900 px-2 py-2 text-sm text-white">
                            <span className="text-xs text-slate-300">Çayevoy ile cəmi</span>
                            <span className="text-base font-semibold">{formatAzn(selectedOrderTotalWithTip)}</span>
                          </div>
                        </div>
                      )}

                      <div className="rounded-md border border-slate-200 bg-white">
                        <button
                          className="flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                          onClick={() => setIsOrderCommentOpen((isOpen) => !isOpen)}
                          type="button"
                        >
                          <span>Sifariş şərhi</span>
                          <span className="inline-flex items-center gap-2 text-xs font-normal text-slate-500">
                            {orderComment.trim() ? 'Doldurulub' : 'Boş'}
                            <ChevronDown
                              className={cn('size-4 transition-transform', isOrderCommentOpen && 'rotate-180')}
                            />
                          </span>
                        </button>
                        {isOrderCommentOpen ? (
                          <label className="grid gap-1.5 border-t border-slate-200 p-3 text-sm font-medium text-slate-700">
                            <span className="sr-only">Sifariş şərhi</span>
                            <textarea
                              className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              onChange={(event) => setOrderComment(event.target.value)}
                              placeholder="Məsələn: müştəri daha çox qoydu, dostdan ödəmə, xüsusi şərtlər."
                              value={orderComment}
                            />
                            <span className="text-xs font-normal text-slate-500">
                              Bu şərh ödəniş və ya bağlanma sonrası sifarişdə saxlanılacaq.
                            </span>
                          </label>
                        ) : null}
                      </div>

                      {selectedOrder.status === 'payment_refused' ? (
                        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                          Ödəniş rədd edildi. {selectedOrder.payment_refusal_comment ?? ''}
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-3">
                          {isOpeningDayShift || hasNormalPaymentAmount ? (
                            <Button disabled={!canPreparePayment || isClosingOrder} onClick={openPaymentChoice} type="button">
                              <Hourglass className="size-4" />
                              {isOpeningDayShift
                                ? 'Məbləği yaz'
                                : selectedOrder.status === 'waiting_payment'
                                  ? 'Ödənişi qəbul et'
                                  : 'Ödənişə'}
                            </Button>
                          ) : (
                            <Button
                              disabled={!canFinishEmptyOrder || isClosingOrder}
                              onClick={finishEmptyOrder}
                              type="button"
                            >
                              <CheckCircle2 className="size-4" />
                              Sifarişi bitir
                            </Button>
                          )}

                          {paymentChoiceOpen ? (
                            <>
                              <Button
                                disabled={
                                  isClosingOrder ||
                                  (isOpeningDayShift && !hasOpeningDayPaymentAmount) ||
                                  (!isOpeningDayShift && !hasValidTipAmount)
                                }
                                onClick={() => completePayment('cash')}
                                type="button"
                              >
                                <Banknote className="size-4" /> Nağd
                              </Button>
                              <Button
                                disabled={
                                  isClosingOrder ||
                                  (isOpeningDayShift && !hasOpeningDayPaymentAmount) ||
                                  (!isOpeningDayShift && !hasValidTipAmount)
                                }
                                onClick={() => completePayment('card_transfer')}
                                type="button"
                                variant="secondary"
                              >
                                <CreditCard className="size-4" /> Kartla
                              </Button>
                              <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 md:col-span-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-slate-950">Ayrılmış ödəniş</span>
                                  <span className="text-sm font-medium text-slate-700">
                                    {formatAzn(splitPaymentTargetTotal)}
                                  </span>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                                    <span>Nağd</span>
                                    <input
                                      className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                                      inputMode="decimal"
                                      min={0}
                                      onChange={(event) => setCashSplitAmount(event.target.value)}
                                      placeholder="Məsələn: 3"
                                      type="number"
                                      value={cashSplitAmount}
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                                    <span>Kartla</span>
                                    <input
                                      className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                                      inputMode="decimal"
                                      min={0}
                                      onChange={(event) => setCardSplitAmount(event.target.value)}
                                      placeholder="Məsələn: 2"
                                      type="number"
                                      value={cardSplitAmount}
                                    />
                                  </label>
                                </div>
                                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                                  <span>Cəmi: {formatAzn(splitPaymentTotal)}</span>
                                  <span>{isSplitPaymentValid ? 'Məbləğ uyğun gəlir' : 'Ümumi məbləğə bərabər olmalıdır'}</span>
                                </div>
                                <Button
                                  disabled={
                                    isClosingOrder ||
                                    !isSplitPaymentValid ||
                                    (isOpeningDayShift && !hasOpeningDayPaymentAmount) ||
                                    (!isOpeningDayShift && !hasValidTipAmount)
                                  }
                                  onClick={completeSplitPayment}
                                  type="button"
                                >
                                  <Banknote className="size-4" /> Ayrılmış ödənişi qəbul et
                                </Button>
                              </div>
                            </>
                          ) : null}

                          {!isOpeningDayShift && hasNormalPaymentAmount ? (
                            <Button
                              disabled={hasActiveSession || isClosingOrder}
                              onClick={refusePayment}
                              type="button"
                              variant="danger"
                            >
                              Ödənişdən imtina
                            </Button>
                          ) : null}

                          <Button
                            disabled={!canCancelOrder || isClosingOrder}
                            onClick={cancelOrder}
                            type="button"
                            variant="danger"
                          >
                            <X className="size-4" />
                            Sifarişi ləğv et
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })()}

                <div className="grid gap-3 rounded-lg border border-emerald-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-950">Sifarişin tərkibi</h4>
                    </div>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                      {orderItems.length} məhsul.
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-300">
                    {orderItemsQuery.isLoading ? (
                      <div className="p-4 text-sm text-slate-600">Maddələr yüklənir...</div>
                    ) : null}
                    {orderItems.map((item) => {
                      const canEditQuantity =
                        item.status === 'active' &&
                        selectedOrder.status === 'open' &&
                        item.item_type !== 'timed_session' &&
                        item.item_type !== 'manual_item'

                      return (
                        <div
                          className="grid grid-cols-[80px_1fr] gap-5 border-b border-slate-200 p-3 last:border-b-0"
                          key={item.id}
                        >
                          <CatalogImage alt={item.name_snapshot} className="size-20" imagePath={item.image_path_snapshot} />
                          <div className="grid min-w-0 gap-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-950">{item.name_snapshot}</div>
                                {!isOpeningDayShift ? (
                                  <div className="text-sm text-slate-600">
                                    {item.quantity} × {formatAzn(item.unit_price)}
                                  </div>
                                ) : (
                                  <div className="text-sm text-slate-600">Qiymətsiz hesablama</div>
                                )}
                              </div>
                              {!isOpeningDayShift ? (
                                <div className="shrink-0 text-right font-semibold text-slate-950">
                                  {formatAzn(item.total_price)}
                                </div>
                              ) : null}
                            </div>
                            {item.status === 'active' && selectedOrder.status === 'open' ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {canEditQuantity ? (
                                  <div className="inline-grid grid-cols-[32px_44px_32px] overflow-hidden rounded-md border border-slate-200 bg-white">
                                    <button
                                      aria-label="1 azaldın"
                                      className="inline-flex min-h-8 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
                                      disabled={item.quantity <= 1 || orderMutations.requestAdjustment.isPending}
                                      onClick={() => changeItemQuantity(item, item.quantity - 1)}
                                      type="button"
                                    >
                                      -
                                    </button>
                                    <span className="inline-flex min-h-8 items-center justify-center border-x border-slate-200 text-sm font-semibold text-slate-950">
                                      {item.quantity}
                                    </span>
                                    <button
                                      aria-label="1 artırın"
                                      className="inline-flex min-h-8 items-center justify-center text-emerald-800 transition hover:bg-emerald-50 disabled:text-slate-300"
                                      disabled={orderMutations.requestAdjustment.isPending}
                                      onClick={() => changeItemQuantity(item, item.quantity + 1)}
                                      type="button"
                                    >
                                      <Plus className="size-4" />
                                    </button>
                                  </div>
                                ) : null}
                                {canEditQuantity ? (
                                  <Button className="min-h-8 px-3 py-1 text-xs" onClick={() => requestQuantity(item)} type="button" variant="secondary">
                                    Say
                                  </Button>
                                ) : null}
                                <Button className="min-h-8 px-3 py-1 text-xs" onClick={() => requestRemove(item)} type="button" variant="danger">
                                  Sil
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                    {!orderItems.length && !orderItemsQuery.isLoading ? (
                      <div className="grid min-h-28 place-items-center p-4 text-center text-sm text-slate-600">
                        Hələ məhsul əlavə edilməyib.
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
                {(() => {
                  const selectedPlace = placesById.get(selectedOrder.place_id ?? '') ?? null
                  const hasActiveSession = Boolean(selectedPlace?.active_session_id)
                  const selectedSessionGraceNotice = selectedPlace
                    ? getSessionGraceNotice(selectedPlace, nowMs)
                    : null
                  const isSelectedTable = Boolean(selectedPlace && isTablePlace(selectedPlace))
                  const tableOpenedAt =
                    isSelectedTable && selectedOrder.status !== 'paid'
                      ? selectedPlace?.active_order_opened_at ?? selectedOrder.opened_at
                      : null
                  const canAddItems = selectedOrder.status === 'open'
                  const hasNormalPaymentAmount = selectedOrderTotalWithTip > 0
                  const canStartSession =
                    canAddItems && Boolean(selectedPlace?.has_timer) && !selectedPlace?.active_session_id

                  return (
                    <>
                      {canAddItems ? (
                        <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 rounded-lg border border-slate-200 p-2">
                          <div className="grid grid-cols-3 gap-1.5">
                            {(['products', 'services', 'combos'] as const).map((tab) => (
                              <button
                                className={cn(
                                  'min-h-9 rounded-md border px-2 text-sm font-medium',
                                  pickerTab === tab
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-white text-slate-600',
                                )}
                                key={tab}
                                onClick={() => setPickerTab(tab)}
                                type="button"
                              >
                                {tab === 'products' ? 'Məhsullar' : tab === 'services' ? 'Xidmətlər' : 'Kombi'}
                              </button>
                            ))}
                          </div>
                          <label className="relative block">
                            <span className="sr-only">Axtarış</span>
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                            <input
                              className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              id="employee_catalog_search"
                              onChange={(event) => setSearch(event.target.value)}
                              placeholder="Axtarış"
                              type="search"
                              value={search}
                            />
                          </label>
                          <div className="grid min-h-0 content-start gap-1.5 overflow-y-auto pr-1">
                            {pickerTab === 'products' ? (
                              productsQuery.isLoading ? (
                                <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                                  Məhsullar yüklənir...
                                </div>
                              ) : productsQuery.error ? (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
                                  Məhsullar yüklənmədi: {productsQuery.error.message}
                                </div>
                              ) : filteredProducts.length ? (
                                filteredProducts.map((product) => (
                                  <CatalogAddButton
                                    imagePath={product.image_path}
                                    isOpeningDayShift={isOpeningDayShift}
                                    isPressed={pressedCatalogItemKey === `products:${product.id}`}
                                    key={product.id}
                                    name={product.name}
                                    onClick={() => addItem('products', product.id)}
                                    price={product.sale_price}
                                  />
                                ))
                              ) : (
                                <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                                  Məhsul tapılmadı.
                                </div>
                              )
                            ) : null}
                            {pickerTab === 'services'
                              ? filteredServices.map((service) => (
                                  <CatalogAddButton
                                    imagePath={service.image_path}
                                    isOpeningDayShift={isOpeningDayShift}
                                    isPressed={pressedCatalogItemKey === `services:${service.id}`}
                                    key={service.id}
                                    name={service.name}
                                    onClick={() => addItem('services', service.id)}
                                    price={service.fixed_price}
                                  />
                                ))
                              : null}
                            {pickerTab === 'combos'
                              ? filteredCombos.map((combo) => (
                                  <CatalogAddButton
                                    imagePath={combo.image_path}
                                    isOpeningDayShift={isOpeningDayShift}
                                    isPressed={pressedCatalogItemKey === `combos:${combo.id}`}
                                    key={combo.id}
                                    name={combo.name}
                                    onClick={() => addItem('combos', combo.id)}
                                    price={combo.sale_price}
                                  />
                                ))
                              : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-2 rounded-lg border border-slate-200 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-950">
                              {isSelectedTable ? 'Məşğulluq' : 'Sessiya'}
                            </h4>
                            <p className="mt-0.5 text-xs leading-5 text-slate-600">
                              {isSelectedTable
                                ? tableOpenedAt
                                  ? 'Masa məşğulluq vaxtı sifarişin açılmasından hesablanır.'
                                  : 'Masa məşğulluq vaxtını görmək üçün sifariş yaradın.'
                                : isOpeningDayShift
                                ? hasActiveSession
                                  ? 'Vaxt gedir. Sessiyanı bitirin, sonra müştərinin qoyduğu məbləği göstərin.'
                                  : 'Sifarişin sonunda müştərinin həqiqi məbləğini daxil edin.'
                                : hasActiveSession
                                  ? 'Əvvəl sessiyanı dayandırın, sonra sifarişi ödənişə keçirin.'
                                  : selectedOrder.status === 'waiting_payment'
                                    ? 'Sifariş ödənişə hazırdır.'
                                    : !hasNormalPaymentAmount
                                      ? 'Maddələr əlavə edə və ya ödənişsiz boş sifarişi bitirə bilərsiniz.'
                                      : 'Maddələr əlavə edin və ya sifarişi ödənişə keçirin.'}
                            </p>
                          </div>
                          {hasActiveSession ? (
                            <div className="shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1.5 text-right text-sm text-cyan-900">
                              <div className="flex items-center justify-end gap-1.5 font-semibold">
                                <Timer className="size-4" />
                                {formatElapsed(selectedPlace?.active_session_started_at ?? null, nowMs)}
                              </div>
                              <div className="mt-0.5 text-xs">
                                {isOpeningDayShift
                                  ? 'Qiymət əl ilə'
                                  : `Hazırda: ${formatAzn(selectedPlace ? calculateCurrentSessionAmount(selectedPlace, nowMs) : 0)}`}
                              </div>
                              {selectedSessionGraceNotice ? (
                                <div className="mt-0.5 text-xs font-semibold text-orange-700">
                                  {selectedSessionGraceNotice}
                                </div>
                              ) : null}
                            </div>
                          ) : tableOpenedAt ? (
                            <div className="shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1.5 text-right text-sm text-cyan-900">
                              <div className="flex items-center justify-end gap-1.5 font-semibold">
                                <Timer className="size-4" />
                                {formatElapsed(tableOpenedAt, nowMs)}
                              </div>
                              <div className="mt-0.5 text-xs">Masa açıqdır</div>
                            </div>
                          ) : null}
                        </div>

                        {!isSelectedTable ? (
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              className="min-h-9"
                              disabled={!canStartSession}
                              onClick={() => selectedPlace && startSessionForOrder(selectedPlace, selectedOrder.id)}
                              title="Sessiyanı başlat"
                              type="button"
                              variant="secondary"
                            >
                              <Play className="size-4" /> Başla
                            </Button>
                            <Button
                              className="min-h-9"
                              disabled={!hasActiveSession}
                              onClick={() =>
                                selectedPlace?.active_session_id &&
                                runAction(() => orderMutations.completeSession.mutateAsync(selectedPlace.active_session_id!))
                              }
                              title="Sessiyanı dayandır"
                              type="button"
                              variant="secondary"
                            >
                              <Square className="size-4" /> Dayandır
                            </Button>
                            <Button className="min-h-9" disabled title="Sessiya pauzu hələ server tərəfindən dəstəklənmir" type="button" variant="secondary">
                              <Pause className="size-4" /> Pauza
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  )
                })()}
              </section>
            </div>

            <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Taymer yerli hesablanır; sessiyanın son məbləği bitdikdə server tərəfindən yenidən hesablanır.
            </footer>
          </aside>

          {removeRequestItem ? (
            <Modal className="z-[60] bg-slate-950/45" onClose={closeRemoveRequest}>
              <section className="grid w-full max-w-md gap-4 rounded-xl bg-white p-5 shadow-xl">
                <div className="grid gap-1">
                  <h4 className="text-lg font-semibold text-slate-950">Məhsulu silmək?</h4>
                  <p className="text-sm text-slate-600">
                    «{removeRequestItem.name_snapshot}» məhsulu dərhal sifarişdən silinəcək və hərəkət jurnala yazılacaq.
                  </p>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Silinmə səbəbi</span>
                  <textarea
                    autoFocus
                    className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    onChange={(event) => setRemoveRequestReason(event.target.value)}
                    placeholder="Məsələn: müştəri məhsulu ləğv etdi"
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
                    Geri
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
                    Sil
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
                    {orderCloseAction === 'finish-empty' ? 'Sifarişi bitirmək?' : 'Sifarişi ləğv etmək?'}
                  </h4>
                  <p className="text-sm text-slate-600">
                    {orderCloseAction === 'finish-empty'
                      ? `#${selectedOrder.order_number} sifarişi ödənişsiz bağlanacaq, çünki məbləğ 0-dır.`
                      : `#${selectedOrder.order_number} sifarişi ləğv ediləcək və iş panelindən yox olacaq.`}
                  </p>
                </div>

                {orderCloseAction === 'cancel' ? (
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">Ləğv səbəbi</span>
                    <textarea
                      className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Məsələn: müştəri fikrini dəyişdi"
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
                    Geri
                  </Button>
                  <Button
                    disabled={isOrderCloseActionPending || (orderCloseAction === 'cancel' && !cancelReason.trim())}
                    onClick={confirmOrderCloseAction}
                    type="button"
                    variant={orderCloseAction === 'cancel' ? 'danger' : 'primary'}
                  >
                    {orderCloseAction === 'finish-empty' ? 'Bitir' : 'Ləğv et'}
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
