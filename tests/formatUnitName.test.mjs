import assert from 'node:assert/strict'
import test from 'node:test'
import { formatUnitName, formatUnitsInText } from '../src/lib/i18n/formatUnitName.ts'

test('localizes common item units without changing custom units', () => {
  assert.equal(formatUnitName('шт.', 'az'), 'ədəd')
  assert.equal(formatUnitName('ədəd', 'ru'), 'шт.')
  assert.equal(formatUnitName('кг', 'az'), 'кг')
})

test('localizes item units embedded in inventory comments', () => {
  assert.equal(formatUnitsInText('26 шт. -> 13 шт.', 'az'), '26 ədəd -> 13 ədəd')
  assert.equal(formatUnitsInText('26 шт. -> 13 шт.. Причина', 'az'), '26 ədəd -> 13 ədəd Причина')
  assert.equal(formatUnitsInText('26 ədəd -> 13 ədəd', 'ru'), '26 шт. -> 13 шт.')
})
