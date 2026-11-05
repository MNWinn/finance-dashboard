const MONEY_COLS = new Set([
  'current_balance', 'available_balance', 'avg_amount', 'min_amount',
  'max_amount', 'monthly_estimate', 'total_out_30d', 'pct_of_spend',
]);

export function parseMoney(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input).trim().replace(/[$,%"]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseOverview(rows) {
  const out = {};
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const [label, raw] = row;
    if (!label) continue;
    const display = raw == null ? '' : String(raw);
    if (label === 'Last refreshed' || label === 'Data gaps') {
      out[label] = { display, value: display };
    } else {
      out[label] = { display, value: parseMoney(raw) };
    }
  }
  return out;
}

export function parseTable(headers, rows) {
  return rows.filter(r => r && r.some(c => c !== '' && c != null)).map(r => {
    const o = {};
    headers.forEach((h, i) => {
      const raw = r[i];
      if (MONEY_COLS.has(h)) o[h] = parseMoney(raw);
      else if (raw === '' || raw == null) o[h] = null;
      else o[h] = raw;
    });
    return o;
  });
}
