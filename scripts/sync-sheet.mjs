import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { parseOverview, parseTable } from './lib/parse.mjs';

const SHEET_ID = '1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U';
const OUT = fileURLToPath(new URL('../data/', import.meta.url));

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  const creds = JSON.parse(raw);
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth: jwt });
}

async function values(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return res.data.values || [];
}

function writeJson(name, data) {
  const p = path.join(OUT, name);
  const next = JSON.stringify(data, null, 2) + '\n';
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (prev === next) return false;
  fs.writeFileSync(p, next);
  return true;
}

function table(vals) {
  if (vals.length === 0) return [];
  return parseTable(vals[0], vals.slice(1));
}

// The dashboard expects pct_of_spend as a 0–1 fraction; the sheet may render it as "27.31%".
function parseSpend(vals) {
  const rows = table(vals);
  if (rows.length === 0) return rows;
  const pctIdx = vals[0].indexOf('pct_of_spend');
  const dataRows = vals.slice(1).filter(r => r && r.some(c => c !== '' && c != null));
  return rows.map((r, i) => {
    let pct = r.pct_of_spend;
    const raw = pctIdx >= 0 ? dataRows[i]?.[pctIdx] : undefined;
    if (pct != null && (String(raw ?? '').includes('%') || pct > 1)) pct = pct / 100;
    return { ...r, pct_of_spend: pct };
  });
}

async function main() {
  const sheets = auth();
  const [overviewRows, accountVals, recurringVals, spendVals, metaVals] = await Promise.all([
    values(sheets, 'Overview'),
    values(sheets, 'Accounts'),
    values(sheets, 'Recurring'),
    values(sheets, 'Spend_by_Category'),
    values(sheets, 'Meta'),
  ]);

  if (overviewRows.length < 2) throw new Error('Overview empty — refusing to overwrite');

  const overview = parseOverview(overviewRows);
  const accounts = table(accountVals);
  const recurring = table(recurringVals);
  const spend = parseSpend(spendVals);
  const meta = {};
  for (const row of metaVals.slice(1)) {
    if (row[0]) meta[row[0]] = row[1] ?? '';
  }
  if (!meta.last_refreshed && overview['Last refreshed']?.value) {
    meta.last_refreshed = overview['Last refreshed'].value;
  }
  if (!meta.gaps && overview['Data gaps']?.value) {
    meta.gaps = overview['Data gaps'].value;
  }

  let changed = false;
  changed = writeJson('overview.json', overview) || changed;
  changed = writeJson('accounts.json', accounts) || changed;
  changed = writeJson('recurring.json', recurring) || changed;
  changed = writeJson('spend_by_category.json', spend) || changed;
  changed = writeJson('meta.json', meta) || changed;
  console.log(changed ? 'changed' : 'unchanged');
}

main().catch(e => { console.error(e); process.exit(1); });
