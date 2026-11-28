import {
  Armchair,
  Baby,
  Bath,
  Bed,
  Beer,
  Bell,
  Bike,
  BookOpen,
  Box,
  Briefcase,
  Cake,
  Car,
  CarFront,
  Cigarette,
  Circle,
  CircleDot,
  Clapperboard,
  Clock,
  Club,
  Coffee,
  Crosshair,
  Crown,
  CupSoda,
  Diamond,
  Dices,
  Disc3,
  DoorOpen,
  Drama,
  Drum,
  Dumbbell,
  Film,
  Flame,
  Gamepad,
  Gamepad2,
  Gem,
  Ghost,
  Gift,
  Goal,
  Guitar,
  Headphones,
  Headset,
  Heart,
  Hexagon,
  House,
  IceCreamCone,
  Joystick,
  Lamp,
  Laptop,
  Leaf,
  type LucideIcon,
  Martini,
  Medal,
  Mic,
  Monitor,
  MonitorPlay,
  Moon,
  Music,
  PartyPopper,
  Piano,
  Pizza,
  Popcorn,
  Projector,
  Puzzle,
  Rocket,
  Sandwich,
  Shapes,
  Sofa,
  Spade,
  Sparkles,
  Speaker,
  Square,
  Star,
  Sun,
  Swords,
  Table2,
  Target,
  Tent,
  Ticket,
  Trophy,
  Tv,
  UserRound,
  Users,
  Utensils,
  UtensilsCrossed,
  Volleyball,
  Waves,
  Wifi,
  Wine,
  Zap,
} from 'lucide-react'
import type { PlaceType } from '../../lib/supabase/database.types'

/**
 * Иконки мест вместо фотографий.
 * Значение хранится в существующем текстовом поле `image_path` как `icon:<key>:<color>`,
 * поэтому схема базы не меняется и сетевых запросов за картинками нет.
 */

export type PlaceIconCategory = 'games' | 'entertainment' | 'food' | 'everyday'

export const PLACE_ICON_CATEGORIES: readonly PlaceIconCategory[] = ['games', 'entertainment', 'food', 'everyday']

type PlaceIconDefinition = { icon: LucideIcon; category: PlaceIconCategory }

export const PLACE_ICONS = {
  'gamepad-2': { icon: Gamepad2, category: 'games' },
  gamepad: { icon: Gamepad, category: 'games' },
  joystick: { icon: Joystick, category: 'games' },
  dices: { icon: Dices, category: 'games' },
  puzzle: { icon: Puzzle, category: 'games' },
  trophy: { icon: Trophy, category: 'games' },
  medal: { icon: Medal, category: 'games' },
  target: { icon: Target, category: 'games' },
  crosshair: { icon: Crosshair, category: 'games' },
  swords: { icon: Swords, category: 'games' },
  spade: { icon: Spade, category: 'games' },
  club: { icon: Club, category: 'games' },
  diamond: { icon: Diamond, category: 'games' },
  heart: { icon: Heart, category: 'games' },
  'circle-dot': { icon: CircleDot, category: 'games' },
  'car-front': { icon: CarFront, category: 'games' },
  car: { icon: Car, category: 'games' },
  bike: { icon: Bike, category: 'games' },
  volleyball: { icon: Volleyball, category: 'games' },
  goal: { icon: Goal, category: 'games' },
  dumbbell: { icon: Dumbbell, category: 'games' },
  ghost: { icon: Ghost, category: 'games' },
  rocket: { icon: Rocket, category: 'games' },

  tv: { icon: Tv, category: 'entertainment' },
  monitor: { icon: Monitor, category: 'entertainment' },
  'monitor-play': { icon: MonitorPlay, category: 'entertainment' },
  projector: { icon: Projector, category: 'entertainment' },
  headphones: { icon: Headphones, category: 'entertainment' },
  headset: { icon: Headset, category: 'entertainment' },
  mic: { icon: Mic, category: 'entertainment' },
  music: { icon: Music, category: 'entertainment' },
  guitar: { icon: Guitar, category: 'entertainment' },
  piano: { icon: Piano, category: 'entertainment' },
  drum: { icon: Drum, category: 'entertainment' },
  disc: { icon: Disc3, category: 'entertainment' },
  speaker: { icon: Speaker, category: 'entertainment' },
  clapperboard: { icon: Clapperboard, category: 'entertainment' },
  film: { icon: Film, category: 'entertainment' },
  popcorn: { icon: Popcorn, category: 'entertainment' },
  ticket: { icon: Ticket, category: 'entertainment' },
  'party-popper': { icon: PartyPopper, category: 'entertainment' },
  drama: { icon: Drama, category: 'entertainment' },
  sparkles: { icon: Sparkles, category: 'entertainment' },
  star: { icon: Star, category: 'entertainment' },
  zap: { icon: Zap, category: 'entertainment' },
  flame: { icon: Flame, category: 'entertainment' },
  crown: { icon: Crown, category: 'entertainment' },
  gem: { icon: Gem, category: 'entertainment' },

  coffee: { icon: Coffee, category: 'food' },
  'cup-soda': { icon: CupSoda, category: 'food' },
  beer: { icon: Beer, category: 'food' },
  wine: { icon: Wine, category: 'food' },
  martini: { icon: Martini, category: 'food' },
  pizza: { icon: Pizza, category: 'food' },
  sandwich: { icon: Sandwich, category: 'food' },
  cake: { icon: Cake, category: 'food' },
  'ice-cream': { icon: IceCreamCone, category: 'food' },
  utensils: { icon: Utensils, category: 'food' },
  'utensils-crossed': { icon: UtensilsCrossed, category: 'food' },
  cigarette: { icon: Cigarette, category: 'food' },

  table: { icon: Table2, category: 'everyday' },
  armchair: { icon: Armchair, category: 'everyday' },
  sofa: { icon: Sofa, category: 'everyday' },
  bed: { icon: Bed, category: 'everyday' },
  lamp: { icon: Lamp, category: 'everyday' },
  users: { icon: Users, category: 'everyday' },
  user: { icon: UserRound, category: 'everyday' },
  baby: { icon: Baby, category: 'everyday' },
  briefcase: { icon: Briefcase, category: 'everyday' },
  book: { icon: BookOpen, category: 'everyday' },
  laptop: { icon: Laptop, category: 'everyday' },
  wifi: { icon: Wifi, category: 'everyday' },
  door: { icon: DoorOpen, category: 'everyday' },
  house: { icon: House, category: 'everyday' },
  tent: { icon: Tent, category: 'everyday' },
  waves: { icon: Waves, category: 'everyday' },
  bath: { icon: Bath, category: 'everyday' },
  leaf: { icon: Leaf, category: 'everyday' },
  sun: { icon: Sun, category: 'everyday' },
  moon: { icon: Moon, category: 'everyday' },
  gift: { icon: Gift, category: 'everyday' },
  bell: { icon: Bell, category: 'everyday' },
  clock: { icon: Clock, category: 'everyday' },
  box: { icon: Box, category: 'everyday' },
  shapes: { icon: Shapes, category: 'everyday' },
  hexagon: { icon: Hexagon, category: 'everyday' },
  square: { icon: Square, category: 'everyday' },
  circle: { icon: Circle, category: 'everyday' },
} as const satisfies Record<string, PlaceIconDefinition>

export type PlaceIconKey = keyof typeof PLACE_ICONS

export const PLACE_ICON_COLORS = {
  emerald: '#10b981',
  green: '#22c55e',
  lime: '#84cc16',
  teal: '#14b8a6',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  slate: '#64748b',
} as const

export type PlaceIconColor = keyof typeof PLACE_ICON_COLORS

export type PlaceIconValue = { icon: PlaceIconKey; color: PlaceIconColor }

const ICON_PREFIX = 'icon:'

const isPlaceIconKey = (value: string): value is PlaceIconKey => Object.hasOwn(PLACE_ICONS, value)
const isPlaceIconColor = (value: string): value is PlaceIconColor => Object.hasOwn(PLACE_ICON_COLORS, value)

export const DEFAULT_PLACE_ICON_BY_TYPE: Record<PlaceType, PlaceIconValue> = {
  table: { icon: 'table', color: 'emerald' },
  vip_room: { icon: 'crown', color: 'amber' },
  playstation: { icon: 'gamepad-2', color: 'blue' },
  billiard: { icon: 'circle-dot', color: 'green' },
  racing: { icon: 'car-front', color: 'red' },
  private_room: { icon: 'door', color: 'violet' },
  service_area: { icon: 'shapes', color: 'slate' },
  other: { icon: 'shapes', color: 'slate' },
}

const FALLBACK_ICON: PlaceIconValue = { icon: 'shapes', color: 'slate' }

export const isPlaceIconPath = (value: string | null | undefined): value is string =>
  Boolean(value?.startsWith(ICON_PREFIX))

/** Старые фото мест из хранилища: больше не загружаем, показываем иконку. */
export const isLegacyPlacePhotoPath = (value: string | null | undefined) =>
  Boolean(value && /(?:^|\/)places\//.test(value))

export function parsePlaceIcon(value: string | null | undefined): PlaceIconValue | null {
  if (!isPlaceIconPath(value)) return null
  const [icon = '', color = ''] = value.slice(ICON_PREFIX.length).split(':')
  if (!isPlaceIconKey(icon)) return null
  return { icon, color: isPlaceIconColor(color) ? color : FALLBACK_ICON.color }
}

export const encodePlaceIcon = ({ icon, color }: PlaceIconValue) => `${ICON_PREFIX}${icon}:${color}`

export function resolvePlaceIcon(value: string | null | undefined, placeType?: PlaceType | null): PlaceIconValue {
  return parsePlaceIcon(value) ?? (placeType ? DEFAULT_PLACE_ICON_BY_TYPE[placeType] : FALLBACK_ICON)
}
