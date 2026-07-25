import {
  Clock3,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Timer,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
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

type PickerTab = 'products' | 'services' | 'combos'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

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

export function EmployeeWorkspacePage() {
  const { organizationId } = useAuth()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId)
  const productsQuery = useEmployeeProducts({ organizationId })
  const servicesQuery = useEmployeeServices({ organizationId })
  const combosQuery = useEmployeeCombos({ organizationId })
  const orderMutations = useEmployeeOrderMutations(organizationId)
  const currentShiftQuery = useCurrentEmployeeShift(organizationId)
  const [nowMs, setNowMs] = useState(0)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [pickerTab, setPickerTab] = useState<PickerTab>('products')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const orderItemsQuery = useEmployeeOrderItems(selectedOrderId)

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const places = useMemo(() => workspaceQuery.data?.places ?? [], [workspaceQuery.data?.places])
  const orders = useMemo(() => workspaceQuery.data?.orders ?? [], [workspaceQuery.data?.orders])
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  )
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

  if (!currentShiftQuery.isLoading && !currentShiftQuery.data?.shift) {
    return (
      <section className="grid gap-5">
        <header className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Рабочая панель</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Для продаж, сессий и оплат нужна открытая смена.
          </p>
        </header>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Смена не открыта. Откройте смену, чтобы начать работу с заказами.
        </div>
        <div>
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
      setSelectedOrderId(order.id)
    })

  const startSession = (place: EmployeeWorkspacePlaceRow) =>
    runAction(async () => {
      const session = await orderMutations.startSession.mutateAsync({ placeId: place.id })
      setSelectedOrderId(session.order_id)
    })

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

  const requestRemove = (item: EmployeeOrderItemRow) => {
    if (!selectedOrderId) return
    const reason = window.prompt('Причина удаления позиции')
    if (!reason) return
    void runAction(() =>
      orderMutations.requestAdjustment.mutateAsync({
        orderId: selectedOrderId,
        orderItemId: item.id,
        requestType: 'remove_order_item',
        reason,
      }),
    )
  }

  const requestQuantity = (item: EmployeeOrderItemRow) => {
    if (!selectedOrderId) return
    const quantityText = window.prompt('Новое количество', String(item.quantity))
    if (!quantityText) return
    const quantity = Number(quantityText)
    if (!Number.isFinite(quantity) || quantity <= 0) return
    const reason = window.prompt('Причина изменения количества')
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
      setSelectedOrderId(null)
    })
  }

  const refusePayment = () => {
    if (!selectedOrderId) return
    const comment = window.prompt('Комментарий к отказу от оплаты')
    if (!comment) return
    void runAction(async () => {
      await orderMutations.refusePayment.mutateAsync({ orderId: selectedOrderId, comment })
      setSelectedOrderId(null)
    })
  }

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Рабочая панель</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Места, игровые сессии, открытые заказы и продажи без доступа к себестоимости.
          </p>
        </div>
        <Button
          onClick={() =>
            runAction(async () => {
              const order = await orderMutations.createOrder.mutateAsync({})
              setSelectedOrderId(order.id)
            })
          }
          type="button"
        >
          <Plus className="size-4" /> Заказ без места
        </Button>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      {workspaceQuery.isLoading ? (
        <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="size-4 animate-spin text-emerald-700" /> Загрузка рабочего места
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {places.map((place) => {
          const status = placeStatus(place)
          const sessionAmount = calculateCurrentSessionAmount(place, nowMs)
          return (
            <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={place.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-950">{place.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {place.custom_type_name ?? place.type}
                    {place.has_timer ? ' · таймер' : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium',
                    status === 'Свободно' && 'bg-emerald-50 text-emerald-800',
                    status === 'Занято' && 'bg-cyan-50 text-cyan-800',
                    status === 'Ожидает оплаты' && 'bg-amber-50 text-amber-800',
                    status === 'Недоступно' && 'bg-slate-100 text-slate-600',
                  )}
                >
                  {status}
                </span>
              </div>

              {place.active_session_id ? (
                <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <Timer className="size-4" /> {formatElapsed(place.active_session_started_at, nowMs)}
                  </div>
                  <div className="mt-1">Текущая сумма: {formatMoney(sessionAmount)}</div>
                </div>
              ) : null}

              {place.active_order_id ? (
                <dl className="grid gap-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Заказ</dt>
                    <dd>#{place.active_order_number}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Позиции</dt>
                    <dd>{place.active_order_item_count}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Итого</dt>
                    <dd>{formatMoney(place.active_order_total)}</dd>
                  </div>
                </dl>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {place.active_order_id ? (
                  <Button onClick={() => setSelectedOrderId(place.active_order_id)} type="button" variant="secondary">
                    <ReceiptText className="size-4" /> Открыть
                  </Button>
                ) : place.has_timer ? (
                  <Button onClick={() => startSession(place)} type="button">
                    <Clock3 className="size-4" /> Начать сессию
                  </Button>
                ) : (
                  <Button onClick={() => createOrderForPlace(place)} type="button">
                    <Plus className="size-4" /> Открыть заказ
                  </Button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {ordersWithoutPlace.length ? (
        <section className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Заказы без места</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ordersWithoutPlace.map((order) => (
              <button
                className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-200 hover:bg-emerald-50/40"
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
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
        </section>
      ) : null}

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 grid bg-slate-950/35 lg:place-items-end">
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
                onClick={() => setSelectedOrderId(null)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="grid min-h-0 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_340px]">
              <section className="grid content-start gap-3">
                <div className="rounded-lg border border-slate-200">
                  {orderItemsQuery.isLoading ? (
                    <div className="p-4 text-sm text-slate-600">Загрузка позиций...</div>
                  ) : null}
                  {orderItems.map((item) => (
                    <div className="grid gap-2 border-b border-slate-100 p-3 last:border-b-0" key={item.id}>
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
                  ))}
                  {!orderItems.length && !orderItemsQuery.isLoading ? (
                    <div className="p-4 text-sm text-slate-600">Позиции пока не добавлены.</div>
                  ) : null}
                </div>
              </section>

              <section className="grid content-start gap-3">
                <div className="grid gap-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Итого</span>
                    <span className="text-xl font-semibold text-slate-950">{formatMoney(selectedOrder.total_amount)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={selectedOrder.status !== 'open'}
                      onClick={() => runAction(() => orderMutations.waitPayment.mutateAsync(selectedOrder.id))}
                      type="button"
                      variant="secondary"
                    >
                      Ожидание
                    </Button>
                    <Button onClick={() => completePayment('cash')} type="button">
                      <CreditCard className="size-4" /> Cash
                    </Button>
                    <Button onClick={() => completePayment('card_transfer')} type="button">
                      Card
                    </Button>
                    <Button onClick={refusePayment} type="button" variant="danger">
                      Отказ
                    </Button>
                  </div>
                  {placesById.get(selectedOrder.place_id ?? '')?.active_session_id ? (
                    <Button
                      onClick={() =>
                        runAction(() =>
                          orderMutations.completeSession.mutateAsync(
                            placesById.get(selectedOrder.place_id ?? '')!.active_session_id!,
                          ),
                        )
                      }
                      type="button"
                      variant="secondary"
                    >
                      <Timer className="size-4" /> Завершить сессию
                    </Button>
                  ) : null}
                </div>

                {selectedOrder.status === 'open' ? (
                  <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
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
                              className="grid gap-1 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={product.id}
                              onClick={() => addItem('products', product.id)}
                              type="button"
                            >
                              <span className="font-medium text-slate-950">{product.name}</span>
                              <span className="text-sm text-slate-600">{formatMoney(product.sale_price)}</span>
                            </button>
                          ))
                        : null}
                      {pickerTab === 'services'
                        ? filteredServices.map((service) => (
                            <button
                              className="grid gap-1 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={service.id}
                              onClick={() => addItem('services', service.id)}
                              type="button"
                            >
                              <span className="font-medium text-slate-950">{service.name}</span>
                              <span className="text-sm text-slate-600">{formatMoney(service.fixed_price)}</span>
                            </button>
                          ))
                        : null}
                      {pickerTab === 'combos'
                        ? filteredCombos.map((combo) => (
                            <button
                              className="grid gap-1 rounded-md border border-slate-200 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50/40"
                              key={combo.id}
                              onClick={() => addItem('combos', combo.id)}
                              type="button"
                            >
                              <span className="font-medium text-slate-950">{combo.name}</span>
                              <span className="text-sm text-slate-600">{formatMoney(combo.sale_price)}</span>
                            </button>
                          ))
                        : null}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            <footer className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Таймер считается локально; финальная сумма сессии пересчитывается сервером при завершении.
            </footer>
          </aside>
        </div>
      ) : null}
    </section>
  )
}
