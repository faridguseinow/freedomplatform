import { ImageIcon } from 'lucide-react'
import { useCatalogImageUrl } from '../../features/catalog/catalogImages'
import { isLegacyPlacePhotoPath, isPlaceIconPath } from '../../features/places/placeIcons'
import { extractPlaceIdFromPath, useRegisteredPlace } from '../../features/places/placeIconRegistry'
import type { PlaceType } from '../../lib/supabase/database.types'
import { cn } from '../../lib/utils/cn'
import { PlaceIcon } from './PlaceIcon'

type CatalogImageProps = {
  alt: string
  imagePath: string | null | undefined
  className?: string
  /** Для мест: фото не загружается, всегда рисуется иконка (выбранная или по типу места). */
  placeType?: PlaceType | null | undefined
}

export function CatalogImage({ alt, className, imagePath, placeType }: CatalogImageProps) {
  const isLegacyPlacePhoto = isLegacyPlacePhotoPath(imagePath)
  const isPlaceVisual = Boolean(placeType) || isPlaceIconPath(imagePath) || isLegacyPlacePhoto
  // Старое фото места в заказе: подставляем актуальную иконку этого места.
  const registeredPlace = useRegisteredPlace(isLegacyPlacePhoto ? extractPlaceIdFromPath(imagePath) : null)
  const imageQuery = useCatalogImageUrl(isPlaceVisual ? null : imagePath)
  const imageUrl = imageQuery.data ?? null

  if (isPlaceVisual) {
    return (
      <PlaceIcon
        alt={alt}
        className={className}
        placeType={placeType ?? registeredPlace?.type}
        value={registeredPlace?.image_path ?? imagePath}
      />
    )
  }

  if (!imageUrl) {
    return (
      <div
        aria-label={imagePath ? 'Фото не загружено' : 'Фото отсутствует'}
        className={cn(
          'grid shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-400',
          className,
        )}
        role="img"
      >
        <ImageIcon aria-hidden="true" className="size-5" />
      </div>
    )
  }

  return (
    <img
      alt={alt}
      className={cn('shrink-0 rounded-md border border-slate-200 bg-slate-50 object-cover', className)}
      loading="lazy"
      src={imageUrl}
    />
  )
}
