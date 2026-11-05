import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoney, parseOverview, parseTable, normalizePct, findEmptyOverwrites, mergeMeta,
} from './parse.mjs';

test('normalizePct rounds to 6 decimals', () => {
  assert.equal(normalizePct('16.94%', 16.94), 0.1694);
  assert.equal(normalizePct('16.94', 16.94), 0.1694);
});

test('mergeMeta keeps existing keys when Meta tab is partial', () => {
  const existing = { owner_agent: 'Money Manager', intended_consumer: 'Dashboard', last_refreshed: 'old', gaps: 'old gaps' };
  const fromTab = { last_refreshed: 'tab', refresh_cadence: 'daily' };
  const overview = { 'Last refreshed': { value: 'overview' }, 'Data gaps': { value: '' } };
  assert.deepEqual(mergeMeta(existing, fromTab, overview), {
    owner_agent: 'Money Manager',
    intended_consumer: 'Dashboard',
    last_refreshed: 'overview',
    gaps: 'old gaps',
    refresh_cadence: 'daily',
  });
  assert.deepEqual(mergeMeta(null, { a: '1' }, {}), { a: '1' });
});

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !≈ ${b}`);

test('normalizePct converts percents to 0–1 fractions', () => {
  close(normalizePct('27.31%', 27.31), 0.2731);
  close(normalizePct('27.31', 27.31), 0.2731);
  assert.equal(normalizePct('0.2731', 0.2731), 0.2731);
  assert.equal(normalizePct('0.5%', 0.5), 0.005);
  assert.equal(normalizePct('', null), null);
});

test('findEmptyOverwrites blocks empty output over non-empty existing', () => {
  const errs = findEmptyOverwrites([
    { file: 'accounts.json', tab: 'Accounts', data: [], existing: [{ a: 1 }] },
    { file: 'meta.json', tab: 'Meta', data: {}, existing: { owner_agent: 'Money Manager' } },
    { file: 'recurring.json', tab: 'Recurring', data: [], existing: [] },
    { file: 'new.json', tab: 'New', data: [], existing: null },
    { file: 'spend.json', tab: 'Spend', data: [{ x: 1 }], existing: [{ x: 2 }] },
  ]);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /Accounts/);
  assert.match(errs[1], /Meta/);
});

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
