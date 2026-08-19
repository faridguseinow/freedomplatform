import {
  AlertTriangle,
  Boxes,
  Clock3,
  LayoutDashboard,
  MapPin,
  Package,
  ReceiptText,
  Tags,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { cn } from '../../../lib/utils/cn'
import { useFinanceDashboardSummary } from '../../finance/financeApi'
import { usePaymentsForDate, usePaymentsByPlace } from '../../orders/paymentsApi'
import { orderStatusLabel } from '../../orders/employeeOrdersApi'
import { useAdminOrders } from '../../orders/ordersApi'
import { useAdminShifts } from '../../shifts/shiftsApi'
import { useShiftTemplates } from '../../shifts/shiftTemplatesApi'
import { useCombos } from '../catalog/comboApi'
import { useInventoryBalances } from '../catalog/inventoryApi'
import { usePlaces, useProducts, useServices } from '../catalog/catalogApi'

const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value ?? 0)

const todayKey = () => new Date().toISOString().slice(0, 10)

type StatCardProps = {
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

function StatCard({ label, tone = 'default', value }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 shadow-sm sm:p-4',
        tone === 'default' && 'border-slate-200',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/40',
        tone === 'warning' && 'border-amber-200 bg-amber-50/50',
        tone === 'danger' && 'border-red-200 bg-red-50/50',
      )}
    >
      <p className="text-[11px] font-medium uppercase leading-4 text-slate-500 sm:text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950 sm:mt-2 sm:text-2xl">{value}</p>
    </div>
  )
}

function SetupItem({
  done,
  label,
  path,
}: {
  done: boolean
  label: string
  path: string
}) {
  return (
    <Link
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm font-medium transition-colors',
        done
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
      to={path}
    >
      <span>{label}</span>
      <span>{done ? 'Готово' : 'Открыть'}</span>
    </Link>
  )
}

export function AdminDashboardPage() {
  const { currentOrganization, organizationId } = useAuth()
  const ordersQuery = useAdminOrders(organizationId, 'all')
  const shiftsQuery = useAdminShifts(organizationId, 'all')
  const placesQuery = usePlaces({ organizationId })
  const productsQuery = useProducts({ organizationId })
  const servicesQuery = useServices({ organizationId })
  const combosQuery = useCombos(organizationId)
  const inventoryQuery = useInventoryBalances(organizationId)
  const templatesQuery = useShiftTemplates(organizationId)
  const financeQuery = useFinanceDashboardSummary(organizationId)

  const orders = ordersQuery.data ?? []
  const shifts = shiftsQuery.data ?? []
  const places = placesQuery.data ?? []
  const products = productsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const combos = combosQuery.data ?? []
  const inventory = inventoryQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const finance = financeQuery.data

  const today = todayKey()
  const paymentsTodayQuery = usePaymentsForDate(organizationId, today)
  const paymentsToday = paymentsTodayQuery.data ?? []
  const cashToday = paymentsToday
    .filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const cardToday = paymentsToday
    .filter((p) => p.method === 'card_transfer')
    .reduce((sum, p) => sum + (p.amount ?? 0), 0)

  const paymentsByPlaceQuery = usePaymentsByPlace(organizationId, today)
  const paymentsByPlace = paymentsByPlaceQuery.data
  const openOrders = orders.filter((order) => order.status === 'open').length
  const waitingPayment = orders.filter((order) => order.status === 'waiting_payment').length
  const refusedOrders = orders.filter((order) => order.status === 'payment_refused').length
  const paidToday = orders.filter(
    (order) => order.status === 'paid' && (order.closed_at ?? order.opened_at).slice(0, 10) === today,
  )
  const revenueToday = paidToday.reduce((total, order) => total + (order.total_amount ?? 0), 0)
  const openShifts = shifts.filter((shift) => shift.status === 'open' || shift.status === 'closing').length
  const timedPlaces = places.filter((place) => place.has_timer).length
  const lowStock = inventory.filter((item) => item.stock_quantity <= item.minimum_stock_quantity).length

  const isLoading =
    ordersQuery.isLoading ||
    shiftsQuery.isLoading ||
    placesQuery.isLoading ||
    productsQuery.isLoading ||
    servicesQuery.isLoading ||
    combosQuery.isLoading ||
    inventoryQuery.isLoading ||
    templatesQuery.isLoading ||
    financeQuery.isLoading

  const firstError =
    ordersQuery.error ??
    shiftsQuery.error ??
    placesQuery.error ??
    productsQuery.error ??
    servicesQuery.error ??
    combosQuery.error ??
    inventoryQuery.error ??
    templatesQuery.error ??
    financeQuery.error
  const buildAdminPath = (path: string) =>
    currentOrganization?.slug ? `/${currentOrganization.slug}${path}` : path

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CatalogImage
            alt={currentOrganization?.name ?? 'Организация'}
            className="size-14"
            imagePath={currentOrganization?.logo_path}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-slate-500">Обзор организации</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-slate-950 sm:text-3xl">
              {currentOrganization?.name ?? 'Организация'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {currentOrganization?.description ||
                'Операционная сводка по заказам, сменам, рабочим местам, складу и финансам.'}
            </p>
          </div>
        </div>
        <Button className="shrink-0" type="button">
          <Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/places')}>
            <MapPin className="size-4" /> Настроить места
          </Link>
        </Button>
      </header>

      {firstError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {firstError.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm">
          Загрузка показателей...
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatCard label="Выручка сегодня (всего)" tone="success" value={formatMoney(revenueToday)} />
        <StatCard label="Выручка наличными" tone="success" value={formatMoney(cashToday)} />
        <StatCard label="Выручка по карте" tone="default" value={formatMoney(cardToday)} />
        <StatCard label="Открытые заказы" tone={openOrders ? 'warning' : 'default'} value={openOrders} />
        <StatCard label="Ожидают оплату" tone={waitingPayment ? 'warning' : 'default'} value={waitingPayment} />
        <StatCard label="Открытые смены" tone={openShifts ? 'success' : 'default'} value={openShifts} />
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Выручка по площадкам (сегодня)</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <StatCard label="Playstation" tone="default" value={formatMoney(paymentsByPlace?.playstation ?? 0)} />
          <StatCard label="Billiard" tone="default" value={formatMoney(paymentsByPlace?.billiard ?? 0)} />
          <StatCard label="Tables" tone="default" value={formatMoney(paymentsByPlace?.tables ?? 0)} />
          <StatCard label="Goods" tone="default" value={formatMoney(paymentsByPlace?.goods ?? 0)} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">Рабочее состояние</h3>
            <LayoutDashboard className="size-5 text-emerald-700" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatCard label="Места" value={`${places.length} / таймер ${timedPlaces}`} />
            <StatCard label="Товары" value={products.length} />
            <StatCard label="Услуги" value={services.length} />
            <StatCard label="Комбо" value={combos.length} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/orders')}><ReceiptText className="size-4" />Заказы</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/shifts')}><Clock3 className="size-4" />Смены</Link></Button>
            <Button type="button" variant="secondary"><Link className="inline-flex items-center gap-2" to={buildAdminPath('/admin/inventory')}><Boxes className="size-4" />Склад</Link></Button>
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">Контроль</h3>
            <AlertTriangle className="size-5 text-amber-600" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-3">
            <StatCard label="Низкий остаток" tone={lowStock ? 'danger' : 'default'} value={lowStock} />
            <StatCard label="Отказы от оплаты" tone={refusedOrders ? 'danger' : 'default'} value={refusedOrders} />
            <StatCard label="Периоды на проверке" tone={finance?.periods_waiting_review ? 'warning' : 'default'} value={finance?.periods_waiting_review ?? 0} />
          </div>
        </section>
      </div>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Настройка организации</h3>
          <TrendingUp className="size-5 text-emerald-700" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <SetupItem done={places.length > 0} label="Добавить места и рабочую схему" path={buildAdminPath('/admin/places')} />
          <SetupItem done={products.length > 0} label="Добавить товары" path={buildAdminPath('/admin/products')} />
          <SetupItem done={services.length > 0} label="Добавить услуги" path={buildAdminPath('/admin/services')} />
          <SetupItem done={combos.length > 0} label="Собрать комбо" path={buildAdminPath('/admin/combos')} />
          <SetupItem done={templates.length > 0} label="Настроить шаблоны смен" path={buildAdminPath('/admin/shift-templates')} />
          <SetupItem done={inventory.length > 0} label="Проверить склад" path={buildAdminPath('/admin/inventory')} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50" to={buildAdminPath('/admin/employees')}>
          <Users className="size-5 text-slate-500" />
          <p className="mt-3 font-semibold text-slate-950">Сотрудники</p>
          <p className="mt-1 text-sm text-slate-600">Доступы и роли команды.</p>
        </Link>
        <Link className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50" to={buildAdminPath('/admin/catalog')}>
          <Tags className="size-5 text-slate-500" />
          <p className="mt-3 font-semibold text-slate-950">Каталог</p>
          <p className="mt-1 text-sm text-slate-600">Категории, товары, услуги и комбо.</p>
        </Link>
        <Link className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50" to={buildAdminPath('/admin/products')}>
          <Package className="size-5 text-slate-500" />
          <p className="mt-3 font-semibold text-slate-950">Товары</p>
          <p className="mt-1 text-sm text-slate-600">Цены, остатки и продажа.</p>
        </Link>
      </section>

      {orders.length ? (
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Последние заказы</h3>
          <div className="grid gap-2">
            {orders.slice(0, 5).map((order) => (
              <Link
                className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-slate-200 px-3 text-sm hover:bg-slate-50"
                key={order.id}
                to={buildAdminPath(`/admin/orders/${order.id}`)}
              >
                <span className="font-medium text-slate-950">#{order.order_number} · {order.current_place_name_snapshot ?? 'Без места'}</span>
                <span className="text-slate-600">{orderStatusLabel[order.status]} · {formatMoney(order.total_amount)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}
