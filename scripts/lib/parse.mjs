const MONEY_COLS = new Set([
  'current_balance', 'available_balance', 'avg_amount', 'min_amount',
  'max_amount', 'monthly_estimate', 'total_out_30d', 'pct_of_spend',
]);
const INT_COLS = new Set(['occurrences_90d']);

// RFC 4180: quoted fields may contain commas, CR/LF, and "" escapes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

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

// Returns pct as a 0–1 fraction. A literal "%" always means percent; otherwise values > 1 are assumed to be percents.
export function normalizePct(raw, parsed) {
  if (parsed == null) return null;
  const frac = String(raw ?? '').includes('%') || parsed > 1 ? parsed / 100 : parsed;
  return Math.round(frac * 1e6) / 1e6;
}

const isDataRow = (r) => r && r.some((c) => c !== '' && c != null);

export function parseTable(headers, rows) {
  return rows.filter(isDataRow).map((r) => {
    const o = {};
    headers.forEach((h, i) => {
      const raw = r[i];
      if (MONEY_COLS.has(h)) o[h] = parseMoney(raw);
      else if (raw === '' || raw == null) o[h] = null;
      else if (INT_COLS.has(h)) o[h] = Number.isFinite(Number(raw)) ? Number(raw) : null;
      else o[h] = raw;
    });
    return o;
  });
}

// First row is headers.
export function parseHeaderTable(rows) {
  if (!rows.length) return [];
  return parseTable(rows[0], rows.slice(1));
}

export function parseSpend(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  const pctIdx = headers.indexOf('pct_of_spend');
  const dataRows = rows.slice(1).filter(isDataRow);
  return parseTable(headers, dataRows).map((r, i) => ({
    ...r,
    pct_of_spend: normalizePct(pctIdx >= 0 ? dataRows[i][pctIdx] : undefined, r.pct_of_spend),
  }));
}

// Meta is key,value rows; an optional "key,value" header row is skipped.
export function parseMeta(rows) {
  const meta = {};
  for (const [k, v] of rows) {
    if (!k || (k === 'key' && v === 'value')) continue;
    meta[k] = v ?? '';
  }
  return meta;
}

export function entryCount(data) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 0;
}
