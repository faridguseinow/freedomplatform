import assert from 'node:assert/strict'
import test from 'node:test'
import { formatOrderDisplayNumber } from '../src/features/orders/orderDisplay.ts'

test('shows the customer name next to the order number', () => {
  assert.equal(formatOrderDisplayNumber(2748, 'MARIF'), '#2748 — MARIF')
})

test('keeps orders without a customer name compact', () => {
  assert.equal(formatOrderDisplayNumber(2748, null), '#2748')
  assert.equal(formatOrderDisplayNumber(2748, '   '), '#2748')
})
