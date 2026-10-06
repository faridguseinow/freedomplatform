import { Sofa, Timer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getCurrentLocale } from '../../../lib/i18n/translator'
import type { EmployeeWorkspacePlaceRow, PlaceType } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { useEmployeeOrderItems, useEmployeeWorkspaceData } from '../../orders/employeeOrdersApi'
import { useAdminShiftDetail, useAdminShifts } from '../../shifts/shiftsApi'

const BILLING_GRACE_MINUTES = 10
const LIVE_REFRESH_INTERVAL = 15_000

const placeTypeLabel: Record<PlaceType, string> = {
  table: 'Стол',
  vip_room: 'VIP',
  playstation: 'PlayStation',
  billiard: 'Бильярд',
  racing: 'Руль',
  private_room: 'Кабинет',
  service_area: 'Зона',
  other: 'Другое',
}

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

const formatAzn = (value: number | null | undefined) => `${formatMoney(value)} AZN`

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const formatElapsed = (
  startedAt: string | null,
  nowMs: number,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (!startedAt) return '00:00'
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}`
    : t('common.durationMinutes', { minutes: String(minutes).padStart(2, '0') })
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

const getPlaceStatus = (place: EmployeeWorkspacePlaceRow) =>
  place.active_order_status === 'waiting_payment' ? 'Ожидает оплату' : 'Занято'

const getStatusClassName = (status: string) =>
  cn(
    'inline-flex rounded-md px-2 py-1 text-[11px] font-semibold',
    status === 'Занято' && 'bg-red-50 text-red-700',
    status === 'Ожидает оплату' && 'bg-amber-50 text-amber-800',
  )

export function AdminLiveMonitorPage() {
  const { organizationId } = useAuth()
  const { t } = useI18n()
  const workspaceQuery = useEmployeeWorkspaceData(organizationId, LIVE_REFRESH_INTERVAL)
  const openShiftsQuery = useAdminShifts(organizationId, 'open', LIVE_REFRESH_INTERVAL)
  const activeShift = openShiftsQuery.data?.[0] ?? null
  const shiftDetailQuery = useAdminShiftDetail(activeShift?.id ?? null, LIVE_REFRESH_INTERVAL)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const places = useMemo(() => workspaceQuery.data?.places ?? [], [workspaceQuery.data?.places])
  const orders = useMemo(() => workspaceQuery.data?.orders ?? [], [workspaceQuery.data?.orders])
  const occupiedPlaces = useMemo(
    () =>
      places
        .filter((place) => place.active_order_id || place.active_session_id)
        .sort(
          (first, second) =>
            (first.sort_order || 0) - (second.sort_order || 0) || first.name.localeCompare(second.name),
        ),
    [places],
  )
  const selectedPlace = useMemo(
    () => occupiedPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [occupiedPlaces, selectedPlaceId],
  )
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedPlace?.active_order_id) ?? null,
    [orders, selectedPlace?.active_order_id],
  )
  const orderItemsQuery = useEmployeeOrderItems(selectedOrder?.id ?? null, LIVE_REFRESH_INTERVAL)
  const activeOrderItems = useMemo(
    () =>
      (orderItemsQuery.data ?? []).filter(
        (item) => item.status !== 'removed' && item.status !== 'cancelled',
      ),
    [orderItemsQuery.data],
  )

  const completedPayments = (shiftDetailQuery.data?.payments ?? []).filter(
    (payment) => payment.status === 'completed',
  )
  const cashRevenue = completedPayments.reduce(
    (sum, payment) => sum + (payment.method === 'cash' ? Number(payment.amount) : 0),
    0,
  )
  const cardRevenue = completedPayments.reduce(
    (sum, payment) => sum + (payment.method === 'card_transfer' ? Number(payment.amount) : 0),
    0,
  )
  const shiftRevenue = cashRevenue + cardRevenue
  const openingCash = Number(activeShift?.opening_cash_amount ?? 0)
  const expectedCash = openingCash + cashRevenue
  const isLoading = workspaceQuery.isLoading || openShiftsQuery.isLoading
  const firstError = workspaceQuery.error ?? openShiftsQuery.error ?? shiftDetailQuery.error

  return (
    <section className="grid gap-4">
      <header className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-950">{t("ui.mesta_onlayn_e379342")}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {activeShift ? `${t("ui.otkryta_87c42ed")} · ${formatDateTime(activeShift.opened_at)}` : t("ui.smena_ne_otkryta_a04a370")}
            </p>
          </div>
          <Sofa aria-hidden="true" className="size-6 shrink-0 text-emerald-700" />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[11px] font-medium uppercase text-emerald-700">{t("ui.vyruchka_smeny_7c55385")}</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{formatAzn(shiftRevenue)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.nachalnaya_kassa_607e0b0")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{formatAzn(openingCash)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.ozhidaemaya_kassa_0adb6d8")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{formatAzn(expectedCash)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.zanyato_ba8daf5")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{occupiedPlaces.length}</p>
          </div>
        </div>
      </header>

      {firstError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {firstError.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
          {t("ui.zagruzka_dannyh_6811312")}
        </div>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{t("ui.mesta_a661590")}</h2>
          <span className="text-sm font-medium text-slate-500">{occupiedPlaces.length}</span>
        </div>

        {occupiedPlaces.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {occupiedPlaces.map((place) => {
              const status = getPlaceStatus(place)
              const sessionAmount = calculateCurrentSessionAmount(place, nowMs)
              const occupancyStartedAt = place.active_session_started_at ?? place.active_order_opened_at
              const total = (place.active_order_total ?? 0) + sessionAmount

              return (
                <button
                  className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  key={place.id}
                  onClick={() => setSelectedPlaceId(place.id)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <CatalogImage alt={place.name} className="size-11 rounded-full" imagePath={place.image_path} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-slate-950">{place.name}</h3>
                        <span className={getStatusClassName(status)}>{t(status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {place.custom_type_name || t(placeTypeLabel[place.type])}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.vremya_c80d7e8")}</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {formatElapsed(occupancyStartedAt, nowMs, t)}
                      </p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.summa_99d7408")}</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatAzn(total)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    <span>
                      {t("ui.zakaz_c7b64dd")}: {place.active_order_number ? `#${place.active_order_number}` : t("ui.net_f82a821")}
                    </span>
                    <span className="font-medium text-emerald-700">{t("ui.detali_85a76a7")}</span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : !isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {t("ui.net_f82a821")}
          </div>
        ) : null}
      </section>

      {selectedPlace ? (
        <Modal
          align="end"
          className="bg-slate-950/35"
          onClose={() => setSelectedPlaceId(null)}
          padding="none"
          panelClassName="!h-full md:flex md:justify-end"
        >
          <aside className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white shadow-xl md:w-[620px] md:max-w-full">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <CatalogImage alt={selectedPlace.name} className="size-12 rounded-full" imagePath={selectedPlace.image_path} />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-950">{selectedPlace.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedOrder ? `#${selectedOrder.order_number} · ${t(getPlaceStatus(selectedPlace))}` : t(getPlaceStatus(selectedPlace))}
                  </p>
                </div>
              </div>
              <button
                aria-label={t("ui.zakryt_4ae50d3")}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => setSelectedPlaceId(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>

            <div className="grid min-h-0 content-start gap-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.vremya_c80d7e8")}</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatElapsed(selectedPlace.active_session_started_at ?? selectedPlace.active_order_opened_at, nowMs, t)}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-[11px] font-medium uppercase text-slate-500">{t("ui.summa_99d7408")}</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatAzn((selectedPlace.active_order_total ?? 0) + calculateCurrentSessionAmount(selectedPlace, nowMs))}
                  </p>
                </div>
              </div>

              {selectedPlace.active_session_id ? (
                <section className="grid gap-2 rounded-lg border border-slate-200 p-3">
                  <h3 className="font-semibold text-slate-950">{t("ui.sessiya_1c1e92b")}</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">{t("ui.otkryt_v_c50a347")}</dt>
                      <dd className="mt-1 font-medium text-slate-950">{formatDateTime(selectedPlace.active_session_started_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">{t("ui.tsena_za_chas_fe7e643")}</dt>
                      <dd className="mt-1 font-medium text-slate-950">{formatAzn(selectedPlace.active_session_hourly_rate)}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {selectedOrder ? (
                <section className="grid gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-950">
                        {t("ui.zakaz_c7b64dd")} #{selectedOrder.order_number}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {selectedOrder.customer_label || t("ui.bez_imeni_cdf641f")}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-950">{formatAzn(selectedOrder.total_amount)}</p>
                  </div>
                  <dl className="grid gap-1 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <dt>{t("ui.otkryt_3568fc6")}</dt>
                      <dd>{formatDateTime(selectedOrder.opened_at)}</dd>
                    </div>
                    {selectedOrder.comment ? (
                      <div className="grid gap-1 border-t border-slate-100 pt-2">
                        <dt className="text-xs font-medium uppercase text-slate-500">{t("ui.kommentariy_829038c")}</dt>
                        <dd className="text-slate-700">{selectedOrder.comment}</dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              {selectedOrder ? (
                <section className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-950">{t("ui.sostav_zakaza_35ccdc9")}</h3>
                    <span className="text-sm font-medium text-slate-500">{activeOrderItems.length}</span>
                  </div>

                  {orderItemsQuery.isLoading ? (
                    <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
                      {t("ui.zagruzka_dannyh_6811312")}
                    </div>
                  ) : null}

                  {activeOrderItems.length ? (
                    <div className="grid gap-2">
                      {activeOrderItems.map((item) => (
                        <article className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 p-3" key={item.id}>
                          <CatalogImage alt={item.name_snapshot} className="size-16 object-contain" imagePath={item.image_path_snapshot} />
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="font-semibold text-slate-950">{item.name_snapshot}</h4>
                              <span className="shrink-0 font-semibold text-slate-950">{formatAzn(item.total_price)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              {item.quantity} × {formatAzn(item.unit_price)}
                            </p>
                            {item.description_snapshot ? (
                              <p className="mt-1 text-sm text-slate-600">{item.description_snapshot}</p>
                            ) : null}
                            <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                              <Timer aria-hidden="true" className="size-3.5" />
                              {formatDateTime(item.added_at)}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : !orderItemsQuery.isLoading ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      {t("ui.net_f82a821")}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </aside>
        </Modal>
      ) : null}
    </section>
  )
}

export default AdminLiveMonitorPage
