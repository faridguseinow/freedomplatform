import { zodResolver } from '@hookform/resolvers/zod'
import {
  Archive,
  Edit3,
  GripVertical,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { EmptyState } from '../../../components/common/EmptyState'
import { Button } from '../../../components/ui/Button'
import { ImageFileInput } from '../../../components/ui/ImageFileInput'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { CatalogItemStatus, PlaceRow, PlaceType } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  buildWorkspaceLayout,
  getPlaceDisplayLabel,
  WORKSPACE_COLUMNS,
  WORKSPACE_MIN_ROWS,
  toWorkspaceDisplayCoordinate,
  toWorkspaceDisplaySpan,
  toWorkspaceStorageCoordinate,
  toWorkspaceStorageSpan,
} from '../../places/workspaceLayout'
import { cacheWorkspacePlaces } from '../../places/workspacePlacesCache'
import {
  type PlaceInput,
  useCatalogCategories,
  usePlaceMutations,
  usePlaces,
  usePlacesLayoutSchemaStatus,
} from '../catalog/catalogApi'
import { uploadCatalogImage } from '../catalog/imageUpload'

const placeSchema = z
  .object({
    category_id: z.string().uuid().optional().or(z.literal('')),
    name: z.string().trim().min(2, 'Введите название.'),
    type: z.enum(['table', 'vip_room', 'playstation', 'billiard', 'racing', 'private_room', 'service_area', 'other']),
    custom_type_name: z.string().trim().optional(),
    description: z.string().trim().optional(),
    has_timer: z.boolean(),
    hourly_rate: z.number().min(0, 'Тариф не может быть отрицательным.').optional(),
    minimum_minutes: z.number().int().min(1, 'Минимум должен быть больше 0.').optional(),
    billing_step_minutes: z.number().int().min(1, 'Шаг должен быть больше 0.').optional(),
    capacity: z.number().int().min(1, 'Вместимость должна быть больше 0.').optional(),
    sort_order: z.number().int().min(0, 'Порядок не может быть отрицательным.'),
    workspace_x: z.number().int().min(1, 'Колонка от 1 до 12.').max(12, 'Колонка от 1 до 12.').optional(),
    workspace_y: z.number().int().min(1, 'Ряд должен быть больше 0.').optional(),
    workspace_w: z.number().int().min(1, 'Ширина от 1 до 12.').max(12, 'Ширина от 1 до 12.').optional(),
    workspace_h: z.number().int().min(1, 'Высота должна быть больше 0.').optional(),
    status: z.enum(['active', 'inactive', 'archived']),
    image: z.instanceof(FileList).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'other' && !value.custom_type_name) {
      context.addIssue({ code: 'custom', path: ['custom_type_name'], message: 'Укажите пользовательский тип.' })
    }
    if (value.has_timer && (!value.hourly_rate || !value.minimum_minutes || !value.billing_step_minutes)) {
      context.addIssue({ code: 'custom', path: ['hourly_rate'], message: 'Для таймера нужны тариф, минимум и шаг.' })
    }
  })

type PlaceFormValues = z.infer<typeof placeSchema>
type StatusFilter = CatalogItemStatus | 'all'
type TypeFilter = PlaceType | 'all'

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

const statusLabel: Record<CatalogItemStatus, string> = {
  active: 'Активно',
  inactive: 'Выключено',
  archived: 'Архив',
}

const statusClass: Record<CatalogItemStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800',
  inactive: 'bg-amber-50 text-amber-800',
  archived: 'bg-slate-100 text-slate-600',
}

const BOARD_GAP = 12
const BOARD_PADDING = 12
const BOARD_ROW_HEIGHT = 96

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

type BoardInteractionState = {
  mode: 'drag' | 'resize'
  placeId: string
  pointerId: number
  originClientX: number
  originClientY: number
  deltaX: number
  deltaY: number
  startX: number
  startY: number
  startW: number
  startH: number
  targetX: number
  targetY: number
  targetW: number
  targetH: number
  isValid: boolean
}

type WorkspaceDefaults = Pick<PlaceFormValues, 'workspace_x' | 'workspace_y' | 'workspace_w' | 'workspace_h' | 'sort_order'>

const placeToInput = (place: PlaceRow, patch: Partial<PlaceInput> = {}): PlaceInput => ({
  organization_id: place.organization_id,
  category_id: place.category_id,
  name: place.name,
  type: place.type,
  custom_type_name: place.custom_type_name,
  description: place.description,
  image_path: place.image_path,
  has_timer: place.has_timer,
  hourly_rate: place.hourly_rate,
  minimum_minutes: place.minimum_minutes,
  billing_step_minutes: place.billing_step_minutes,
  capacity: place.capacity,
  sort_order: place.sort_order,
  workspace_x: place.workspace_x,
  workspace_y: place.workspace_y,
  workspace_w: place.workspace_w,
  workspace_h: place.workspace_h,
  status: place.status,
  created_by: place.created_by,
  ...patch,
})

export function AdminPlacesPage() {
  const { organizationId, user } = useAuth()
  const { t } = useI18n()
  const boardRef = useRef<HTMLDivElement | null>(null)
  const placesQuery = usePlaces({ organizationId })
  const layoutSchemaQuery = usePlacesLayoutSchemaStatus(organizationId)
  const categoriesQuery = useCatalogCategories({ organizationId })
  const placeMutations = usePlaceMutations(organizationId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [editingPlace, setEditingPlace] = useState<PlaceRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<BoardInteractionState | null>(null)
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null)

  const { control, formState: { errors, isSubmitting }, handleSubmit, register, reset } = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      category_id: '',
      name: '',
      type: 'table',
      custom_type_name: '',
      description: '',
      has_timer: false,
      hourly_rate: undefined,
      minimum_minutes: undefined,
      billing_step_minutes: undefined,
      capacity: undefined,
      sort_order: 0,
      workspace_x: undefined,
      workspace_y: undefined,
      workspace_w: undefined,
      workspace_h: undefined,
      status: 'active',
    },
  })

  const hasTimer = useWatch({ control, name: 'has_timer' })
  const selectedType = useWatch({ control, name: 'type' })
  const places = useMemo(() => placesQuery.data ?? [], [placesQuery.data])
  const workspacePlaces = useMemo(
    () => places.filter((place) => place.status === 'active'),
    [places],
  )
  const workspaceLayout = useMemo(() => buildWorkspaceLayout(workspacePlaces), [workspacePlaces])
  const workspaceRows = useMemo(() => {
    const savedRows = workspacePlaces.reduce(
      (maximum, place) => Math.max(maximum, (place.workspace_y ?? 1) + (place.workspace_h ?? 2) - 1),
      WORKSPACE_MIN_ROWS,
    )
    if (!interaction) return savedRows
    const interactionRows = interaction.mode === 'drag'
      ? interaction.targetY + interaction.startH - 1
      : interaction.startY + interaction.targetH - 1
    return Math.max(savedRows, interactionRows)
  }, [interaction, workspacePlaces])
  const placeCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.type === 'place' && item.status !== 'archived'),
    [categoriesQuery.data],
  )
  const visiblePlaces = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return places.filter((place) => {
      if (place.status === 'archived') return false
      const matchesType = typeFilter === 'all' || place.type === typeFilter
      const matchesStatus = statusFilter === 'all' || place.status === statusFilter
      if (!matchesType || !matchesStatus) return false
      if (!needle) return true
      return [place.name, place.custom_type_name, place.description].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [places, search, statusFilter, typeFilter])
  const archivedPlaces = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return places.filter((place) => {
      if (place.status !== 'archived') return false
      if (typeFilter !== 'all' && place.type !== typeFilter) return false
      if (!needle) return true
      return [place.name, place.custom_type_name, place.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [places, search, typeFilter])

  useEffect(() => {
    cacheWorkspacePlaces(organizationId, places)
  }, [organizationId, places])

  const getNextWorkspaceDefaults = (): WorkspaceDefaults => {
    const occupied = new Set<string>()
    workspacePlaces.forEach((place) => {
      const x = toWorkspaceDisplayCoordinate(place.workspace_x ?? 1)
      const y = place.workspace_y ?? 1
      const w = toWorkspaceDisplaySpan(place.workspace_w ?? 2)
      const h = place.workspace_h ?? 2
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          occupied.add(`${col}:${row}`)
        }
      }
    })

    for (let row = 1; row <= Math.max(WORKSPACE_MIN_ROWS, workspacePlaces.length + 2); row += 1) {
      for (let col = 1; col <= WORKSPACE_COLUMNS; col += 1) {
        if (!occupied.has(`${col}:${row}`)) {
          return {
            sort_order: workspacePlaces.length,
            workspace_h: 2,
            workspace_w: toWorkspaceStorageSpan(1),
            workspace_x: toWorkspaceStorageCoordinate(col),
            workspace_y: row,
          }
        }
      }
    }

    return {
      sort_order: workspacePlaces.length,
      workspace_h: 2,
      workspace_w: toWorkspaceStorageSpan(1),
      workspace_x: 1,
      workspace_y: Math.max(1, workspacePlaces.length + 1),
    }
  }

  const openCreate = (workspaceDefaults?: Partial<WorkspaceDefaults>) => {
    setEditingPlace(null)
    setFormError(null)
    reset({ category_id: '', name: '', type: 'table', custom_type_name: '', description: '', has_timer: false, hourly_rate: undefined, minimum_minutes: undefined, billing_step_minutes: undefined, capacity: undefined, sort_order: workspaceDefaults?.sort_order ?? 0, workspace_x: workspaceDefaults?.workspace_x, workspace_y: workspaceDefaults?.workspace_y, workspace_w: workspaceDefaults?.workspace_w, workspace_h: workspaceDefaults?.workspace_h, status: 'active' })
    setIsModalOpen(true)
  }

  const openEdit = (place: PlaceRow) => {
    setEditingPlace(place)
    setFormError(null)
    reset({ category_id: place.category_id ?? '', name: place.name, type: place.type, custom_type_name: place.custom_type_name ?? '', description: place.description ?? '', has_timer: place.has_timer, hourly_rate: place.hourly_rate ?? undefined, minimum_minutes: place.minimum_minutes ?? undefined, billing_step_minutes: place.billing_step_minutes ?? undefined, capacity: place.capacity ?? undefined, sort_order: place.sort_order, workspace_x: place.workspace_x ?? undefined, workspace_y: place.workspace_y ?? undefined, workspace_w: place.workspace_w ?? undefined, workspace_h: place.workspace_h ?? undefined, status: place.status })
    setIsModalOpen(true)
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!organizationId || !user) {
      setFormError('Организация или пользователь не определены.')
      return
    }
    setFormError(null)
    try {
      const file = values.image?.item(0)

      if (!file && !editingPlace?.image_path) {
        setFormError('Загрузите фото места.')
        return
      }

      const placeId = editingPlace?.id ?? crypto.randomUUID()
      let imagePath = editingPlace?.image_path ?? null

      if (file) {
        imagePath = await uploadCatalogImage({ file, itemId: placeId, kind: 'places', organizationId })
      }

      const input: PlaceInput = {
        ...(editingPlace ? {} : { id: placeId }),
        organization_id: organizationId,
        category_id: values.category_id || null,
        name: values.name,
        type: values.type,
        custom_type_name: values.type === 'other' ? values.custom_type_name || null : null,
        description: values.description || null,
        image_path: imagePath,
        has_timer: values.has_timer,
        hourly_rate: values.has_timer ? values.hourly_rate ?? null : null,
        minimum_minutes: values.has_timer ? values.minimum_minutes ?? null : null,
        billing_step_minutes: values.has_timer ? values.billing_step_minutes ?? null : null,
        capacity: values.capacity ?? null,
        sort_order: values.sort_order,
        workspace_x: values.workspace_x ?? null,
        workspace_y: values.workspace_y ?? null,
        workspace_w: values.workspace_w ?? null,
        workspace_h: values.workspace_h ?? null,
        status: values.status,
        created_by: editingPlace?.created_by ?? user.id,
      }
      const saved = await placeMutations.upsert.mutateAsync({ id: editingPlace?.id, input })
      void saved
      setIsModalOpen(false)
      setEditingPlace(null)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сохранить место.')
    }
  })

  const savePlaceLayout = async (place: PlaceRow, patch: Partial<PlaceInput>) => {
    if (layoutSchemaQuery.data === false) {
      setBoardError('Для перемещения и изменения размера нужно применить миграцию workspace layout в Supabase.')
      return
    }

    setBoardError(null)
    try {
      await placeMutations.upsert.mutateAsync({ id: place.id, input: placeToInput(place, patch) })
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : 'Не удалось сохранить схему.')
    }
  }

  const getBoardMetrics = () => {
    const board = boardRef.current
    if (!board) return null

    const rect = board.getBoundingClientRect()
    const availableWidth = rect.width - BOARD_PADDING * 2 - BOARD_GAP * (WORKSPACE_COLUMNS - 1)
    const cellWidth = availableWidth / WORKSPACE_COLUMNS
    return {
      stepX: cellWidth + BOARD_GAP,
      stepY: BOARD_ROW_HEIGHT + BOARD_GAP,
    }
  }

  const isPlacementAvailable = (placeId: string, x: number, y: number, w: number, h: number) =>
    workspacePlaces.every((other) => {
      if (other.id === placeId || !other.workspace_x || !other.workspace_y) return true
      const otherX = toWorkspaceDisplayCoordinate(other.workspace_x)
      const otherY = other.workspace_y
      const otherW = toWorkspaceDisplaySpan(other.workspace_w ?? 2)
      const otherH = other.workspace_h ?? 2
      return x + w <= otherX || otherX + otherW <= x || y + h <= otherY || otherY + otherH <= y
    })

  const calculateInteraction = (event: PointerEvent, current: BoardInteractionState) => {
    const metrics = getBoardMetrics()
    if (!metrics) return current

    const rawDeltaX = event.clientX - current.originClientX
    const rawDeltaY = event.clientY - current.originClientY

    if (current.mode === 'drag') {
      const minDeltaX = -(current.startX - 1) * metrics.stepX
      const maxDeltaX = (WORKSPACE_COLUMNS - current.startX - current.startW + 1) * metrics.stepX
      const minDeltaY = -(current.startY - 1) * metrics.stepY
      const deltaX = clamp(rawDeltaX, minDeltaX, maxDeltaX)
      const deltaY = Math.max(minDeltaY, rawDeltaY)
      const targetX = clamp(
        current.startX + Math.round(deltaX / metrics.stepX),
        1,
        WORKSPACE_COLUMNS - current.startW + 1,
      )
      const targetY = Math.max(1, current.startY + Math.round(deltaY / metrics.stepY))

      return {
        ...current,
        deltaX,
        deltaY,
        targetX,
        targetY,
        isValid: isPlacementAvailable(current.placeId, targetX, targetY, current.startW, current.startH),
      }
    }

    const minDeltaX = -(current.startW - 1) * metrics.stepX
    const maxDeltaX = (WORKSPACE_COLUMNS - current.startX - current.startW + 1) * metrics.stepX
    const minDeltaY = -(current.startH - 1) * metrics.stepY
    const deltaX = clamp(rawDeltaX, minDeltaX, maxDeltaX)
    const deltaY = Math.max(minDeltaY, rawDeltaY)
    const targetW = clamp(
      current.startW + Math.round(deltaX / metrics.stepX),
      1,
      WORKSPACE_COLUMNS - current.startX + 1,
    )
    const targetH = Math.max(1, current.startH + Math.round(deltaY / metrics.stepY))

    return {
      ...current,
      deltaX,
      deltaY,
      targetW,
      targetH,
      isValid: isPlacementAvailable(current.placeId, current.startX, current.startY, targetW, targetH),
    }
  }

  const startInteraction = (
    event: PointerEvent<HTMLElement>,
    place: PlaceRow,
    mode: BoardInteractionState['mode'],
  ) => {
    if (layoutSchemaQuery.data === false) {
      setBoardError(t('places.layoutUnavailable'))
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setBoardError(null)
    setWorkspaceMenuId(null)
    const startX = toWorkspaceDisplayCoordinate(place.workspace_x ?? 1)
    const startY = place.workspace_y ?? 1
    const startW = toWorkspaceDisplaySpan(place.workspace_w ?? 2)
    const startH = place.workspace_h ?? 2
    setInteraction({
      mode,
      placeId: place.id,
      pointerId: event.pointerId,
      originClientX: event.clientX,
      originClientY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      startX,
      startY,
      startW,
      startH,
      targetX: startX,
      targetY: startY,
      targetW: startW,
      targetH: startH,
      isValid: true,
    })
  }

  const moveInteraction = (event: PointerEvent, place: PlaceRow) => {
    setInteraction((current) => {
      if (!current || current.placeId !== place.id || current.pointerId !== event.pointerId) return current
      return calculateInteraction(event, current)
    })
  }

  const finishInteraction = (event: PointerEvent<HTMLElement>, place: PlaceRow) => {
    if (!interaction || interaction.placeId !== place.id || interaction.pointerId !== event.pointerId) return
    const finished = calculateInteraction(event, interaction)
    event.currentTarget.releasePointerCapture(event.pointerId)
    setInteraction(null)

    if (!finished.isValid) {
      setBoardError(t('places.layoutCollision'))
      return
    }

    const patch = finished.mode === 'drag'
      ? { workspace_x: toWorkspaceStorageCoordinate(finished.targetX), workspace_y: finished.targetY }
      : { workspace_w: toWorkspaceStorageSpan(finished.targetW), workspace_h: finished.targetH }
    void savePlaceLayout(place, patch)
  }

  const archivePlaceFromBoard = (place: PlaceRow) => {
    const confirmed = window.confirm(t('dialog.archivePlace', { name: place.name }))
    if (!confirmed) return
    placeMutations.setStatus.mutate({ id: place.id, status: 'archived' })
  }

  const restorePlace = (place: PlaceRow) => {
    placeMutations.setStatus.mutate({ id: place.id, status: 'active' })
  }

  return (
    <section className="grid gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">Места</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">Столы, кабинеты, игровые зоны и другие места обслуживания.</p>
        </div>
        <Button onClick={() => openCreate()} type="button"><Plus className="size-4" />Создать место</Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Поиск</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pl-10 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" onChange={(event) => setSearch(event.target.value)} placeholder="Название или описание" type="search" value={search} />
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'table', 'vip_room', 'playstation', 'billiard', 'racing', 'private_room', 'service_area', 'other'] as const).map((item) => (
            <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', typeFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setTypeFilter(item)} type="button">
              {item === 'all' ? 'Все типы' : placeTypeLabel[item]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'active', 'inactive'] as const).map((item) => (
            <button className={cn('min-h-9 rounded-md border px-3 text-sm font-medium', statusFilter === item ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600')} key={item} onClick={() => setStatusFilter(item)} type="button">
              {item === 'all' ? 'Все статусы' : statusLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {placesQuery.isLoading ? <div className="inline-flex min-h-28 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600"><Loader2 className="size-4 animate-spin text-emerald-700" />Загрузка мест</div> : null}
      {placesQuery.isError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{placesQuery.error.message}</div> : null}
      {!placesQuery.isLoading && places.length > 0 && !visiblePlaces.length ? <EmptyState description="Измените фильтр или поиск." icon={MapPin} title="По фильтру мест нет" /> : null}

      {!placesQuery.isLoading ? (
        <section className="hidden gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <h3 className="text-lg font-semibold text-slate-950">Рабочая схема</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                {t('places.layoutHint')}
              </p>
            </div>
            <div className="grid gap-2">
              {layoutSchemaQuery.data === false ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Создание мест работает. Для сохранения перемещения и размера примените миграцию `202607230010_workspace_layout_fields.sql`.
                </div>
              ) : null}
              {boardError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{boardError}</div> : null}
              <Button onClick={() => openCreate(getNextWorkspaceDefaults())} type="button">
                <Plus className="size-4" /> Добавить рабочее место
              </Button>
            </div>
          </div>

          <div
            className="relative grid auto-rows-[96px] gap-3 overflow-auto rounded-lg bg-slate-100 p-3"
            ref={boardRef}
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(100, 116, 139, 0.42) 1px, transparent 1.5px)',
              backgroundPosition: '9px 9px',
              backgroundSize: '18px 18px',
              gridTemplateColumns: `repeat(${WORKSPACE_COLUMNS}, minmax(0, 1fr))`,
              minHeight: Math.max(
                WORKSPACE_MIN_ROWS * (BOARD_ROW_HEIGHT + BOARD_GAP) + BOARD_PADDING * 2,
                workspaceRows * (BOARD_ROW_HEIGHT + BOARD_GAP) + BOARD_PADDING * 2,
              ),
            }}
          >
            {!workspaceLayout.length ? (
              <div className="col-span-6 grid min-h-80 place-items-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-6 text-center">
                <div className="grid gap-3">
                  <MapPin className="mx-auto size-7 text-slate-400" />
                  <div>
                    <h4 className="font-semibold text-slate-950">Рабочих мест пока нет</h4>
                    <p className="mt-1 text-sm text-slate-600">Добавьте первое место и расположите его на сетке.</p>
                  </div>
                  <Button onClick={() => openCreate(getNextWorkspaceDefaults())} type="button">
                    <Plus className="size-4" /> Добавить рабочее место
                  </Button>
                </div>
              </div>
            ) : null}

            {workspaceLayout.map((slot) => {
              const place = slot.place
              const activeInteraction = interaction?.placeId === place.id ? interaction : null
              const interactionStyle = activeInteraction
                ? activeInteraction.mode === 'drag'
                  ? { transform: `translate3d(${activeInteraction.deltaX}px, ${activeInteraction.deltaY}px, 0)`, zIndex: 20 }
                  : { width: `calc(100% + ${activeInteraction.deltaX}px)`, height: `calc(100% + ${activeInteraction.deltaY}px)`, zIndex: 20 }
                : {}

              return (
                <article
                  className={cn(
                    'relative grid min-h-0 min-w-0 content-between overflow-visible rounded-lg border bg-white p-2 shadow-sm',
                    'select-none touch-none will-change-transform',
                    activeInteraction?.isValid === false
                      ? 'border-red-500 shadow-xl ring-2 ring-red-500/70'
                      : activeInteraction
                        ? 'border-emerald-500 shadow-xl ring-2 ring-emerald-600/70'
                        : 'border-slate-200 transition-[border-color,box-shadow] hover:border-emerald-300 hover:shadow-md',
                  )}
                  key={slot.key}
                  style={{ ...slot.style, ...interactionStyle }}
                >
                  <div className="flex min-w-0 items-start gap-1">
                    <button
                      aria-label={t('places.movePlace', { name: place.name })}
                      className="inline-flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
                      disabled={layoutSchemaQuery.data === false}
                      onPointerCancel={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                        setInteraction(null)
                      }}
                      onPointerDown={(event) => startInteraction(event, place, 'drag')}
                      onPointerMove={(event) => moveInteraction(event, place)}
                      onPointerUp={(event) => finishInteraction(event, place)}
                      type="button"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <div className="min-w-0 flex-1 pt-1">
                      <h4 className="truncate text-xs font-semibold leading-5 text-slate-950 sm:text-sm">
                        {getPlaceDisplayLabel(place, place.name)}
                      </h4>
                    </div>
                    <div className="relative shrink-0">
                      <button
                        aria-expanded={workspaceMenuId === place.id}
                        aria-label={t('places.cardActions')}
                        className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                        onClick={() => setWorkspaceMenuId((current) => current === place.id ? null : place.id)}
                        type="button"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                      {workspaceMenuId === place.id ? (
                        <div className="absolute right-0 top-8 z-30 grid min-w-40 gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-xl">
                          <button className="flex min-h-8 items-center gap-2 rounded px-2 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => { setWorkspaceMenuId(null); openEdit(place) }} type="button">
                            <Edit3 className="size-3.5" /> {t('places.editPlace')}
                          </button>
                          <button className="flex min-h-8 items-center gap-2 rounded px-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={layoutSchemaQuery.data === false} onClick={() => { setWorkspaceMenuId(null); void savePlaceLayout(place, { workspace_x: null, workspace_y: null, workspace_w: null, workspace_h: null }) }} type="button">
                            <RotateCcw className="size-3.5" /> {t('places.resetLayout')}
                          </button>
                          <button className="flex min-h-8 items-center gap-2 rounded px-2 text-left text-xs text-red-700 hover:bg-red-50" onClick={() => { setWorkspaceMenuId(null); archivePlaceFromBoard(place) }} type="button">
                            <Archive className="size-3.5" /> {t('places.archivePlace')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    </div>

                  <div className="contents">
                    <div className="contents">
                      <button
                        aria-label={t('places.resizePlace', { name: place.name })}
                        className="absolute bottom-0 right-0 size-6 cursor-se-resize touch-none rounded-tl-md border-l border-t border-slate-200 bg-slate-50/95 after:absolute after:bottom-1 after:right-1 after:size-2 after:border-b-2 after:border-r-2 after:border-slate-500 hover:bg-emerald-50"
                        disabled={layoutSchemaQuery.data === false}
                        onPointerCancel={(event) => {
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                          setInteraction(null)
                        }}
                        onPointerDown={(event) => startInteraction(event, place, 'resize')}
                        onPointerMove={(event) => moveInteraction(event, place)}
                        onPointerUp={(event) => finishInteraction(event, place)}
                        type="button"
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {!placesQuery.isLoading ? (
        <section className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900 md:hidden">
          <h3 className="font-semibold text-amber-950">Рабочая схема доступна только на компьютере</h3>
          <p>
            Перемещение мест и изменение размера скрыты на мобильной версии, чтобы не ломать рабочую сетку.
          </p>
        </section>
      ) : null}

      {visiblePlaces.length ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {visiblePlaces.map((place) => (
            <article className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:p-3" key={place.id}>
              <CatalogImage alt={place.name} className="h-16 w-full sm:h-20" imagePath={place.image_path} />
              <div className="grid gap-1 sm:flex sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{place.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-slate-600 sm:mt-1 sm:text-sm">{placeTypeLabel[place.type]}{place.custom_type_name ? ` · ${place.custom_type_name}` : ''}</p>
                </div>
                <span className={cn('w-fit rounded-md px-2 py-0.5 text-[11px] font-medium sm:py-1 sm:text-xs', statusClass[place.status])}>{statusLabel[place.status]}</span>
              </div>
              <dl className="grid grid-cols-2 gap-1 text-[11px] sm:text-xs">
                <div><dt className="text-xs uppercase text-slate-500">Таймер</dt><dd>{place.has_timer ? 'Да' : 'Нет'}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Тариф</dt><dd>{place.hourly_rate ?? '-'}</dd></div>
                <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">Минимум</dt><dd>{place.minimum_minutes ?? '-'}</dd></div>
                <div className="hidden sm:block"><dt className="text-xs uppercase text-slate-500">Шаг</dt><dd>{place.billing_step_minutes ?? '-'}</dd></div>
              </dl>
              <div className="grid grid-cols-2 gap-1.5">
                <Button className="min-h-8 px-2 text-xs" onClick={() => openEdit(place)} type="button" variant="secondary"><Edit3 className="size-3.5" />Редактировать</Button>
                <Button className="min-h-8 px-2 text-xs" onClick={() => archivePlaceFromBoard(place)} type="button" variant="danger">
                  <Archive className="size-4" />{t('places.archivePlace')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!placesQuery.isLoading ? (
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">{t('places.archiveTitle')}</h3>
              <p className="mt-1 text-sm text-slate-600">{t('places.archiveDescription')}</p>
            </div>
            <span className="w-fit rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
              {archivedPlaces.length}
            </span>
          </div>
          {archivedPlaces.length ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
              {archivedPlaces.map((place) => (
                <article className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:gap-3 sm:p-4" key={place.id}>
                  <CatalogImage alt={place.name} className="h-24 w-full opacity-80 sm:h-32" imagePath={place.image_path} />
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{place.name}</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-600 sm:text-sm">
                      {placeTypeLabel[place.type]}{place.custom_type_name ? ` · ${place.custom_type_name}` : ''}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button className="min-h-9 px-2 text-xs sm:text-sm" onClick={() => openEdit(place)} type="button" variant="secondary">
                      <Edit3 className="size-4" />{t('places.editPlace')}
                    </Button>
                    <Button className="min-h-9 px-2 text-xs sm:text-sm" disabled={placeMutations.setStatus.isPending} onClick={() => restorePlace(place)} type="button" variant="secondary">
                      <RotateCcw className="size-4" />{t('places.restorePlace')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">
              {t('places.archiveEmpty')}
            </div>
          )}
        </section>
      ) : null}

      {isModalOpen ? (
        <Modal onClose={() => setIsModalOpen(false)}>
          <form className="grid max-h-[calc(100svh-3rem)] w-full max-w-3xl gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" noValidate onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{editingPlace ? 'Редактировать место' : 'Создать место'}</h3>
              <button aria-label="Закрыть" className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setIsModalOpen(false)} type="button"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input error={errors.name?.message} id="place_name" label="Название" {...register('name')} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Тип</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('type')}>{Object.entries(placeTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {selectedType === 'other' ? <Input error={errors.custom_type_name?.message} id="custom_type_name" label="Название типа" {...register('custom_type_name')} /> : null}
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Категория</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('category_id')}><option value="">Без категории</option>{placeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700"><input type="checkbox" {...register('has_timer')} />Включить таймер</label>
              <Input error={errors.capacity?.message} id="capacity" label="Вместимость" min={1} type="number" {...register('capacity', { valueAsNumber: true })} />
              {hasTimer ? <><Input error={errors.hourly_rate?.message} id="hourly_rate" label="Почасовой тариф" min={0} step="0.01" type="number" {...register('hourly_rate', { valueAsNumber: true })} /><Input error={errors.minimum_minutes?.message} id="minimum_minutes" label="Минимум минут" min={1} type="number" {...register('minimum_minutes', { valueAsNumber: true })} /><Input error={errors.billing_step_minutes?.message} id="billing_step_minutes" label="Шаг расчета" min={1} type="number" {...register('billing_step_minutes', { valueAsNumber: true })} /></> : null}
              <Input error={errors.sort_order?.message} id="place_sort" label="Порядок" min={0} type="number" {...register('sort_order', { valueAsNumber: true })} />
              <Input error={errors.workspace_x?.message} id="workspace_x" label="Колонка X" max={12} min={1} type="number" {...register('workspace_x', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
              <Input error={errors.workspace_y?.message} id="workspace_y" label="Ряд Y" min={1} type="number" {...register('workspace_y', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
              <Input error={errors.workspace_w?.message} id="workspace_w" label="Ширина" max={12} min={1} type="number" {...register('workspace_w', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
              <Input error={errors.workspace_h?.message} id="workspace_h" label="Высота" min={1} type="number" {...register('workspace_h', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>Статус</span><select className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('status')}><option value="active">Активно</option><option value="inactive">Выключено</option><option value="archived">Архив</option></select></label>
              <ImageFileInput error={errors.image?.message} id="place_image" label="Фото" {...register('image')} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>Описание</span><textarea className="min-h-24 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15" {...register('description')} /></label>
            </div>
            {formError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => setIsModalOpen(false)} type="button" variant="secondary">Отмена</Button><Button disabled={isSubmitting || placeMutations.upsert.isPending} type="submit">{isSubmitting || placeMutations.upsert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Сохранить</Button></div>
          </form>
        </Modal>
      ) : null}
    </section>
  )
}
