export function formatOrderDisplayNumber(
  orderNumber: number,
  customerLabel: string | null | undefined,
) {
  const normalizedLabel = customerLabel?.trim()
  return `#${orderNumber}${normalizedLabel ? ` — ${normalizedLabel}` : ''}`
}
