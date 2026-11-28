import { memo } from 'react'
import type { PlaceType } from '../../lib/supabase/database.types'
import { cn } from '../../lib/utils/cn'
import { PLACE_ICON_COLORS, PLACE_ICONS, resolvePlaceIcon } from '../../features/places/placeIcons'

type PlaceIconProps = {
  alt: string
  value: string | null | undefined
  placeType?: PlaceType | null | undefined
  className?: string | undefined
}

export const PlaceIcon = memo(function PlaceIcon({ alt, className, placeType, value }: PlaceIconProps) {
  const resolved = resolvePlaceIcon(value, placeType)
  const Icon = PLACE_ICONS[resolved.icon].icon
  const color = PLACE_ICON_COLORS[resolved.color]

  return (
    <div
      aria-label={alt}
      className={cn('grid shrink-0 place-items-center rounded-md border', className)}
      role="img"
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}4d`, color }}
    >
      <Icon aria-hidden="true" className="size-[55%] max-h-12 max-w-12" strokeWidth={1.75} />
    </div>
  )
})
