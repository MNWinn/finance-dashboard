import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseOverview, parseTable } from './parse.mjs';

test('parseMoney strips $ and commas', () => {
  assert.equal(parseMoney('$1,234.50'), 1234.5);
  assert.equal(parseMoney('-$389.33'), -389.33);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney(42), 42);
});

test('parseOverview maps labels to display+value', () => {
  const o = parseOverview([
    ['Last refreshed', '2026-11-05T15:38:54-05:00'],
    ['Cash total', '$467.90'],
    ['Data gaps', 'No Chase checking'],
  ]);
  assert.equal(o['Cash total'].value, 467.9);
  assert.equal(o['Cash total'].display, '$467.90');
  assert.equal(o['Last refreshed'].value, '2026-11-05T15:38:54-05:00');
  assert.equal(o['Data gaps'].value, 'No Chase checking');
});

test('parseTable coerces money columns', () => {
  const rows = parseTable(
    ['institution', 'current_balance', 'available_balance'],
    [['Capital One', '$370.88', ''], ['Chase', '$88.03', '$26,911.97']]
  );
  assert.equal(rows[0].current_balance, 370.88);
  assert.equal(rows[0].available_balance, null);
  assert.equal(rows[1].available_balance, 26911.97);
});
