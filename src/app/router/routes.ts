import {
  BriefcaseBusiness,
  Building2,
  Box,
  Clock3,
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
  },
  {
    label: 'Товары',
    path: '/admin/products',
    icon: Package,
  },
  {
    label: 'Услуги',
    path: '/admin/services',
    icon: Tags,
  },
  {
    label: 'Склад',
    path: '/admin/inventory',
    icon: Warehouse,
  },
  {
    label: 'Комбо',
    path: '/admin/combos',
    icon: Gift,
  },
  {
    label: 'Заказы',
    path: '/admin/orders',
    icon: ReceiptText,
  },
  {
    label: 'Исправления',
    path: '/admin/adjustment-requests',
    icon: Clock3,
  },
  {
    label: 'Смены',
    path: '/admin/shifts',
    icon: Clock3,
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
  { label: 'Рабочая панель', path: '/employee/workspace', icon: BriefcaseBusiness },
  ...employeeNavItems,
]
