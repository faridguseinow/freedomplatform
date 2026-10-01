import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCurrentFinancialCycle,
  getNextFinancialPeriodRange,
} from '../src/features/finance/financialCycle.ts'

const periods = [
  { period_end: '2026-09-14', status: 'locked' },
  { period_end: '2026-09-30', status: 'locked' },
]

test('starts the current calculation after the latest locked period', () => {
  assert.deepEqual(getCurrentFinancialCycle(periods, '2026-10-01'), {
    end: '2026-10-31',
    start: '2026-10-01',
    toDate: '2026-10-01',
  })
})

test('offers the next complete calendar month without gaps', () => {
  assert.deepEqual(getNextFinancialPeriodRange(periods, '2026-11-01'), {
    end: '2026-10-31',
    isReady: true,
    start: '2026-10-01',
  })
})

test('does not allow submitting a month before it is complete', () => {
  assert.deepEqual(getNextFinancialPeriodRange(periods, '2026-10-01'), {
    end: '2026-10-31',
    isReady: false,
    start: '2026-10-01',
  })
})
