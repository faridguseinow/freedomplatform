import type { SystemLanguage } from './translations'

const itemUnitAliases = new Set(['шт', 'шт.', 'штука', 'штук', 'ədəd'])

export function formatUnitName(unitName: string | null | undefined, language: SystemLanguage) {
  const normalized = unitName?.trim() ?? ''
  if (!normalized) return ''

  return itemUnitAliases.has(normalized.toLocaleLowerCase())
    ? language === 'az'
      ? 'ədəd'
      : 'шт.'
    : normalized
}

export function formatUnitsInText(value: string, language: SystemLanguage) {
  const itemUnit = language === 'az' ? 'ədəd' : 'шт.'
  return value.replace(/(?:шт\.*|штук(?:а|и)?|ədəd)(?=\s|$|[,;:!?])/giu, itemUnit)
}
