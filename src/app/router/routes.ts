import {
  Activity,
  BriefcaseBusiness,
  Building2,
  Box,
  Clock3,
  Landmark,
  Gift,
  LayoutDashboard,
  MapPin,
  Package,
  ReceiptText,
  Settings,
  Tags,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  path: string
  icon: LucideIcon
  end?: boolean
  mobile?: boolean
}

export const platformNavItems: NavItem[] = [
  {
    label: 'Обзор',
    path: '/platform',
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: 'Организации',
    path: '/platform/organizations',
    icon: Building2,
  },
  {
    label: 'Финансы',
    path: '/platform/finance',
    icon: Landmark,
  },
  {
    label: 'Настройки',
    path: '/platform/settings',
    icon: Settings,
  },
]

export const adminNavItems: NavItem[] = [
  {
    label: 'Обзор',
    path: '/admin',
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: 'Рабочее место',
    path: '/employee',
    icon: BriefcaseBusiness,
  },
  {
    label: 'Сотрудники',
    path: '/admin/employees',
    icon: Users,
  },
  {
    label: 'Каталог',
    path: '/admin/catalog',
    icon: Box,
  },
  {
    label: 'Места',
    path: '/admin/places',
    icon: MapPin,
    mobile: false,
  },
  {
    label: 'Товары',
    path: '/admin/products',
    icon: Package,
    mobile: false,
  },
  {
    label: 'Услуги',
    path: '/admin/services',
    icon: Tags,
    mobile: false,
  },
  {
    label: 'Склад',
    path: '/admin/inventory',
    icon: Warehouse,
    mobile: false,
  },
  {
    label: 'Комбо',
    path: '/admin/combos',
    icon: Gift,
    mobile: false,
  },
  {
    label: 'Заказы',
    path: '/admin/orders',
    icon: ReceiptText,
  },
  {
    label: 'Финансы',
    path: '/admin/finance',
    icon: Landmark,
    mobile: false,
  },
  {
    label: 'Исправления',
    path: '/admin/adjustment-requests',
    icon: Clock3,
    mobile: false,
  },
  {
    label: 'Журнал',
    path: '/admin/activity',
    icon: Activity,
    mobile: false,
  },
  {
    label: 'Смены',
    path: '/admin/shifts',
    icon: Clock3,
    mobile: false,
  },
  {
    label: 'Настройки',
    path: '/admin/settings',
    icon: Settings,
  },
]

export const employeeNavItems: NavItem[] = [
  {
    label: 'Рабочая панель',
    path: '/employee',
    icon: BriefcaseBusiness,
    end: true,
  },
  {
    label: 'Смена',
    path: '/employee/shift',
    icon: Clock3,
  },
]

export const pageTitles = [
  ...platformNavItems,
  { label: 'Обзор организации', path: '/admin/dashboard', icon: LayoutDashboard },
  ...adminNavItems,
  { label: 'Категории', path: '/admin/categories', icon: Tags },
  { label: 'Документы склада', path: '/admin/inventory/documents', icon: Warehouse },
  { label: 'История товара', path: '/admin/inventory/products', icon: Package },
  { label: 'Заказ', path: '/admin/orders', icon: ReceiptText },
  { label: 'Шаблоны смен', path: '/admin/shift-templates', icon: Clock3 },
  { label: 'Операционные дни', path: '/admin/operational-days', icon: Clock3 },
  { label: 'Уведомления', path: '/admin/notification-settings', icon: Settings },
  { label: 'Журнал действий', path: '/admin/activity', icon: Activity },
  { label: 'Доходы', path: '/admin/finance/income', icon: Landmark },
  { label: 'Расходы', path: '/admin/finance/expenses', icon: Landmark },
  { label: 'Регулярные расходы', path: '/admin/finance/recurring', icon: Landmark },
  { label: 'Закупки', path: '/admin/finance/purchases', icon: Landmark },
  { label: 'Cash flow', path: '/admin/finance/cash-flow', icon: Landmark },
  { label: 'P&L', path: '/admin/finance/profit-loss', icon: Landmark },
  { label: 'Финансовые периоды', path: '/admin/finance/periods', icon: Landmark },
  { label: 'Доля платформы', path: '/admin/finance/platform-share', icon: Landmark },
  { label: 'Настройки финансов', path: '/admin/finance/settings', icon: Landmark },
  { label: 'Финансы платформы', path: '/platform/finance', icon: Landmark },
  { label: 'Финансы организации', path: '/platform/finance/organizations', icon: Landmark },
  { label: 'Setup организации', path: '/platform/organizations', icon: Building2 },
  { label: 'Финансовый период', path: '/platform/finance/periods', icon: Landmark },
  { label: 'Платежи платформе', path: '/platform/finance/payments', icon: Landmark },
  { label: 'Рабочая панель', path: '/employee/workspace', icon: BriefcaseBusiness },
  ...employeeNavItems,
]
