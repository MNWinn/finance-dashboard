import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, parseMoney, parseOverview, parseTable, parseHeaderTable, parseSpend, parseMeta,
  normalizePct, entryCount,
} from './parse.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !≈ ${b}`);

test('parseCsv handles quoted commas, escaped quotes, and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n"multi\nline",,\r\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['x, y', 'say "hi"', '3'],
    ['multi\nline', '', ''],
  ]);
});

test('parseCsv handles LF, BOM, and missing trailing newline', () => {
  assert.deepEqual(parseCsv('\uFEFFk,v\nLast refreshed,"$164,760.20"'), [
    ['k', 'v'],
    ['Last refreshed', '$164,760.20'],
  ]);
  assert.deepEqual(parseCsv(''), []);
});

test('normalizePct rounds to 6 decimals', () => {
  assert.equal(normalizePct('16.94%', 16.94), 0.1694);
  assert.equal(normalizePct('16.94', 16.94), 0.1694);
});

test('normalizePct converts percents to 0–1 fractions', () => {
  close(normalizePct('27.31%', 27.31), 0.2731);
  close(normalizePct('27.31', 27.31), 0.2731);
  assert.equal(normalizePct('0.2731', 0.2731), 0.2731);
  assert.equal(normalizePct('0.5%', 0.5), 0.005);
  assert.equal(normalizePct('', null), null);
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

test('parseOverview reads Overview CSV using only the first two columns', () => {
  const o = parseOverview(parseCsv('Investment total (Fidelity),"$164,760.20",ignored\nNet liquid (cash - CC debt),-$389.33,\n'));
  assert.equal(o['Investment total (Fidelity)'].value, 164760.2);
  assert.equal(o['Net liquid (cash - CC debt)'].value, -389.33);
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

test('parseHeaderTable reads Recurring CSV with header row and integer counts', () => {
  const rows = parseHeaderTable(parseCsv(
    'name,status,occurrences_90d,monthly_estimate,notes\n'
    + '222 Subscription,confirmed,1,$42.22,"Seen once in 90d; known subscription"\n'
    + ',,,,\n'
  ));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    name: '222 Subscription', status: 'confirmed', occurrences_90d: 1,
    monthly_estimate: 42.22, notes: 'Seen once in 90d; known subscription',
  });
  assert.deepEqual(parseHeaderTable(parseCsv('name,status\n')), []);
});

test('parseSpend normalizes pct_of_spend to 0–1', () => {
  const rows = parseSpend(parseCsv('category_primary,total_out_30d,pct_of_spend\nFOOD_AND_DRINK,"$1,059.65",27.31%\nX,$1.00,0.5%\n'));
  assert.deepEqual(rows[0], { category_primary: 'FOOD_AND_DRINK', total_out_30d: 1059.65, pct_of_spend: 0.2731 });
  assert.equal(rows[1].pct_of_spend, 0.005);
});

test('parseMeta reads key,value rows and skips the header row', () => {
  const meta = parseMeta(parseCsv('key,value\nlast_refreshed,2026-11-05T15:38:54-05:00\nsources,"Finance/Plaid; Chase, Capital One"\n,\n'));
  assert.deepEqual(meta, {
    last_refreshed: '2026-11-05T15:38:54-05:00',
    sources: 'Finance/Plaid; Chase, Capital One',
  });
});

test('entryCount counts arrays and objects', () => {
  assert.equal(entryCount([]), 0);
  assert.equal(entryCount([{}]), 1);
  assert.equal(entryCount({}), 0);
  assert.equal(entryCount({ a: 1 }), 1);
  assert.equal(entryCount(null), 0);
});
