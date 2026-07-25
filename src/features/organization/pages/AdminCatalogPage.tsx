import { Box, MapPin, Package, Tags } from 'lucide-react'
import { Link } from 'react-router-dom'

const catalogSections = [
  {
    title: 'Категории',
    description: 'Группы для мест, товаров и услуг.',
    href: '/admin/categories',
    icon: Tags,
  },
  {
    title: 'Места',
    description: 'Столы, VIP-кабинеты, игровые зоны и другие локации.',
    href: '/admin/places',
    icon: MapPin,
  },
  {
    title: 'Товары',
    description: 'Каталог продаж с ценами и базовым остатком.',
    href: '/admin/products',
    icon: Package,
  },
  {
    title: 'Услуги',
    description: 'Фиксированные и почасовые услуги организации.',
    href: '/admin/services',
    icon: Box,
  },
]

export function AdminCatalogPage() {
  return (
    <section className="grid gap-5">
      <header className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          Каталог
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Конструктор организации: места обслуживания, товары, услуги и категории.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {catalogSections.map((section) => (
          <Link
            className="flex min-h-32 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/30"
            key={section.href}
            to={section.href}
          >
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
              <section.icon aria-hidden="true" className="size-5" />
            </span>
            <span className="grid gap-1">
              <span className="text-base font-semibold text-slate-950">{section.title}</span>
              <span className="text-sm leading-6 text-slate-600">{section.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
