import {
  Activity,
  BriefcaseBusiness,
  Box,
  Clock3,
  HandCoins,
  Landmark,
  Lock,
  MapPin,
  ReceiptText,
  Rocket,
  Settings,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export type HelpAudience = 'admin' | 'employee'

export type HelpSection = {
  id: string
  icon: LucideIcon
  /** Route inside the organization (without the slug), opened by the "Open section" link. */
  path?: string
  steps: number
}

export const helpSections: Record<HelpAudience, HelpSection[]> = {
  admin: [
    { id: 'start', icon: Rocket, steps: 6 },
    { id: 'places', icon: MapPin, path: '/admin/places', steps: 4 },
    { id: 'catalog', icon: Box, path: '/admin/catalog', steps: 5 },
    { id: 'inventory', icon: Warehouse, path: '/admin/inventory', steps: 4 },
    { id: 'employees', icon: Users, path: '/admin/employees', steps: 4 },
    { id: 'shifts', icon: Clock3, path: '/admin/shifts', steps: 5 },
    { id: 'orders', icon: ReceiptText, path: '/admin/orders', steps: 5 },
    { id: 'debts', icon: HandCoins, path: '/admin/debts', steps: 3 },
    { id: 'finance', icon: Landmark, path: '/admin/finance', steps: 5 },
    { id: 'monitoring', icon: Activity, path: '/admin/live', steps: 3 },
    { id: 'settings', icon: Settings, path: '/admin/settings', steps: 3 },
  ],
  employee: [
    { id: 'openShift', icon: Clock3, path: '/employee/shift', steps: 3 },
    { id: 'workspace', icon: BriefcaseBusiness, path: '/employee', steps: 4 },
    { id: 'payment', icon: Wallet, path: '/employee', steps: 4 },
    { id: 'closeShift', icon: Clock3, path: '/employee/shift', steps: 3 },
    { id: 'lock', icon: Lock, steps: 2 },
  ],
}

export const helpFaqCount = 5

export const helpKey = (audience: HelpAudience, sectionId: string, field: string) =>
  `help.${audience}.${sectionId}.${field}`

export const helpPath = (audience: HelpAudience, sectionId?: string) =>
  `/${audience}/help${sectionId ? `#${sectionId}` : ''}`
