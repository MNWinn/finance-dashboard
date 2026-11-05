import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { parseOverview, parseTable, normalizePct, findEmptyOverwrites } from './lib/parse.mjs';

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

function readExisting(name) {
  const p = path.join(OUT, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function writeJson(name, data) {
  const p = path.join(OUT, name);
  const next = JSON.stringify(data, null, 2) + '\n';
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (prev === next) return false;
  fs.writeFileSync(p, next);
  return true;
}

function isDataRow(r) {
  return r && r.some(c => c !== '' && c != null);
}

function table(vals) {
  if (vals.length === 0) return [];
  return parseTable(vals[0], vals.slice(1));
}

function parseSpend(vals) {
  const rows = table(vals);
  if (rows.length === 0) return rows;
  const pctIdx = vals[0].indexOf('pct_of_spend');
  const dataRows = vals.slice(1).filter(isDataRow);
  return rows.map((r, i) => ({
    ...r,
    pct_of_spend: normalizePct(pctIdx >= 0 ? dataRows[i]?.[pctIdx] : undefined, r.pct_of_spend),
  }));
}

function parseMeta(vals) {
  const meta = {};
  for (const row of vals.slice(1)) {
    if (row[0]) meta[row[0]] = row[1] ?? '';
  }
  return meta;
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
  const metaFromTab = parseMeta(metaVals);

  const outputs = [
    { file: 'overview.json', tab: 'Overview', data: overview },
    { file: 'accounts.json', tab: 'Accounts', data: table(accountVals) },
    { file: 'recurring.json', tab: 'Recurring', data: table(recurringVals) },
    { file: 'spend_by_category.json', tab: 'Spend_by_Category', data: parseSpend(spendVals) },
    // Guard on the Meta tab itself, before Overview fallbacks, so an empty tab can't wipe owner_agent etc.
    { file: 'meta.json', tab: 'Meta', data: metaFromTab },
  ].map(o => ({ ...o, existing: readExisting(o.file) }));

  const errors = findEmptyOverwrites(outputs);
  if (errors.length) throw new Error(errors.join('\n'));

  const meta = { ...metaFromTab };
  if (!meta.last_refreshed && overview['Last refreshed']?.value) {
    meta.last_refreshed = overview['Last refreshed'].value;
  }
  if (!meta.gaps && overview['Data gaps']?.value) {
    meta.gaps = overview['Data gaps'].value;
  }
  outputs.find(o => o.file === 'meta.json').data = meta;

  let changed = false;
  for (const o of outputs) changed = writeJson(o.file, o.data) || changed;
  console.log(changed ? 'changed' : 'unchanged');
}

main().catch(e => { console.error(e); process.exit(1); });
