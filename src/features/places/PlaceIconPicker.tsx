import { Check } from 'lucide-react'
import { useState } from 'react'
import { PlaceIcon } from '../../components/common/PlaceIcon'
import { useI18n } from '../../lib/i18n/I18nContext'
import { cn } from '../../lib/utils/cn'
import {
  encodePlaceIcon,
  PLACE_ICON_CATEGORIES,
  PLACE_ICON_COLORS,
  PLACE_ICONS,
  type PlaceIconCategory,
  type PlaceIconColor,
  type PlaceIconKey,
  type PlaceIconValue,
} from './placeIcons'

type PlaceIconPickerProps = {
  value: PlaceIconValue
  onChange: (value: PlaceIconValue) => void
  previewLabel: string
}

const iconKeys = Object.keys(PLACE_ICONS) as PlaceIconKey[]
const colorKeys = Object.keys(PLACE_ICON_COLORS) as PlaceIconColor[]

export function PlaceIconPicker({ onChange, previewLabel, value }: PlaceIconPickerProps) {
  const { t } = useI18n()
  const [category, setCategory] = useState<PlaceIconCategory>(PLACE_ICONS[value.icon].category)
  const activeColor = PLACE_ICON_COLORS[value.color]

  return (
    <fieldset className="grid gap-3 rounded-md border border-slate-200 p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium text-slate-700">{t('placeIcons.title')}</legend>

      <div className="flex items-center gap-3">
        <PlaceIcon alt={previewLabel} className="size-14 rounded-xl" value={encodePlaceIcon(value)} />
        <div className="min-w-0 text-sm">
          <div className="truncate font-semibold text-slate-950">{previewLabel}</div>
          <div className="text-xs text-slate-500">{t('placeIcons.hint')}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {PLACE_ICON_CATEGORIES.map((item) => (
          <button
            aria-selected={category === item}
            className={cn(
              'min-h-8 rounded-md border px-2.5 text-xs font-medium transition-colors',
              category === item
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
            key={item}
            onClick={() => setCategory(item)}
            role="tab"
            type="button"
          >
            {t(`placeIcons.category.${item}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
        {iconKeys
          .filter((key) => PLACE_ICONS[key].category === category)
          .map((key) => {
            const Icon = PLACE_ICONS[key].icon
            const isActive = value.icon === key
            return (
              <button
                aria-label={key}
                aria-pressed={isActive}
                className={cn(
                  'grid aspect-square place-items-center rounded-md border transition-colors',
                  isActive ? 'border-2' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
                key={key}
                onClick={() => onChange({ ...value, icon: key })}
                style={isActive ? { borderColor: activeColor, backgroundColor: `${activeColor}1f`, color: activeColor } : undefined}
                title={key}
                type="button"
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </button>
            )
          })}
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-slate-600">{t('placeIcons.color')}</span>
        <div className="flex flex-wrap gap-1.5">
          {colorKeys.map((key) => {
            const isActive = value.color === key
            return (
              <button
                aria-label={key}
                aria-pressed={isActive}
                className={cn(
                  'grid size-8 place-items-center rounded-full ring-offset-2 transition-shadow',
                  isActive ? 'ring-2 ring-slate-400' : 'hover:ring-2 hover:ring-slate-200',
                )}
                key={key}
                onClick={() => onChange({ ...value, color: key })}
                style={{ backgroundColor: PLACE_ICON_COLORS[key] }}
                title={key}
                type="button"
              >
                {isActive ? <Check aria-hidden="true" className="size-4 text-white" /> : null}
              </button>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}
