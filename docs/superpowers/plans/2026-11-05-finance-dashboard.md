# Finance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public read-only personal finance dashboard on GitHub Pages at `https://mnwinn.github.io/finance-dashboard/` that renders Overview KPIs, Accounts, Recurring, and Spend_by_Category from daily JSON snapshots of Money Manager’s Google Sheet.

**Architecture:** Static `index.html` + `styles.css` + `app.js` fetch `data/*.json`. A Node script (`scripts/sync-sheet.mjs`) reads the private sheet via a Google service account and rewrites those JSON files. A GitHub Action runs the script on a daily cron and on `workflow_dispatch`, committing only when files change. Seed JSON ships in the first commit so Pages works before the first Action run.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no chart library), Node 20 + `googleapis` for the sync script, GitHub Actions, GitHub Pages from `main` `/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-05-finance-dashboard-design.md` (copy into the repo in Task 1).
- Spreadsheet id: `1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U` (read-only).
- Public Pages; Matthew accepts URL exposure. No Sheets secrets in client code.
- v1 tabs only: Overview, Accounts, Recurring, Spend_by_Category, Meta. No Transactions_30d.
- Never invent numbers; show empty/unavailable/stale (>36h past `last_refreshed`) explicitly.
- Light finance look: dense KPI cards and tables.
- Follow Schema column names; do not invent fields.
- Repo name: `MNWinn/finance-dashboard`.

## File map

| Path | Responsibility |
|---|---|
| `index.html` | Page shell: header, gaps banner, KPI strip, section nav, section containers |
| `styles.css` | Light dense finance layout |
| `app.js` | Fetch JSON, format money/dates, render KPIs/tables, stale/gaps states |
| `data/overview.json` | KPI map |
| `data/accounts.json` | Account rows array |
| `data/recurring.json` | Recurring rows array |
| `data/spend_by_category.json` | Spend rows array |
| `data/meta.json` | Meta key/value including `last_refreshed`, `gaps` |
| `scripts/sync-sheet.mjs` | Sheets → JSON writer |
| `scripts/lib/parse.mjs` | Shared parsers (money, overview rows, tabular tabs) |
| `scripts/lib/parse.test.mjs` | Node test runner assertions for parsers |
| `.github/workflows/sync-finance.yml` | Daily + manual sync Action |
| `package.json` | `googleapis` dep; `npm test` / `npm run sync` |
| `README.md` | Setup: Pages, service-account secret, share sheet with SA email |
| `docs/superpowers/specs/2026-11-05-finance-dashboard-design.md` | Locked design |
| `docs/superpowers/plans/2026-11-05-finance-dashboard.md` | This plan |

---

### Task 1: Create public repo + seed data + docs

**Files:**
- Create: repo `MNWinn/finance-dashboard` (public)
- Create: `README.md`, `.gitignore`, `package.json`, `data/*.json`, docs from Dev’s box at `/workspace/finance-dashboard/`

**Interfaces:**
- Produces: public empty-ish repo with seeded `data/*.json` matching Schema column names; Pages can be enabled after Task 3.

- [ ] **Step 1: Create the public GitHub repo**

```bash
gh repo create MNWinn/finance-dashboard --public --description "Personal finance dashboard (read-only; sourced from Money Manager sheet)" --clone=false
```

Expected: repo URL `https://github.com/MNWinn/finance-dashboard`

- [ ] **Step 2: Initialize local working tree and copy seed + docs**

Use a Cursor cloud agent `new_repo: false` on `https://github.com/MNWinn/finance-dashboard` **or** create via cloud agent that creates the repo. Prefer: CloudAgent launch on the new empty repo after `gh repo create`, with prompt to add the files below. Seed JSON already prepared on Dev’s box at `/workspace/finance-dashboard/data/` and docs under `/workspace/finance-dashboard/docs/` — attach those files to the cloud agent launch (`files: [...]`).

`package.json`:

```json
{
  "name": "finance-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test scripts/lib/parse.test.mjs",
    "sync": "node scripts/sync-sheet.mjs"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
```

`.gitignore`:

```
node_modules/
.env
*.pem
service-account.json
```

`README.md` must document:
1. Pages: Settings → Pages → Deploy from branch `main` / root.
2. Create a Google Cloud service account with Sheets API enabled; download JSON key; add repo secret `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON string).
3. Share spreadsheet `1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U` with the service account email as **Viewer**.
4. Run Action “Sync finance sheet” manually once after secret + share.

- [ ] **Step 3: Verify seed JSON shapes**

```bash
node -e "for (const f of ['overview','accounts','recurring','spend_by_category','meta']) { JSON.parse(require('fs').readFileSync('data/'+f+'.json','utf8')); console.log(f,'ok') }"
```

Expected: five `ok` lines. `accounts` length 13; `recurring` length 52; `spend_by_category` length 7.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: seed finance dashboard repo with design, plan, and data snapshot"
git push -u origin main
```

---

### Task 2: Sheet → JSON parsers (TDD)

**Files:**
- Create: `scripts/lib/parse.mjs`
- Create: `scripts/lib/parse.test.mjs`

**Interfaces:**
- Produces:
  - `parseMoney(input: string|number|null|undefined): number|null`
  - `parseOverview(rows: string[][]): object` — keys are Overview labels; values `{ display: string, value: number|string|null }`
  - `parseTable(headers: string[], rows: string[][]): object[]` — objects keyed by header; money-like columns coerced via `parseMoney`; blank → `null`
  - Money-like column names: `current_balance`, `available_balance`, `avg_amount`, `min_amount`, `max_amount`, `monthly_estimate`, `total_out_30d`, `pct_of_spend`

- [ ] **Step 1: Write the failing tests**

```js
// scripts/lib/parse.test.mjs
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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './parse.mjs'` or similar.

- [ ] **Step 3: Implement parsers**

```js
// scripts/lib/parse.mjs
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/parse.mjs scripts/lib/parse.test.mjs package.json
git commit -m "feat: add sheet JSON parsers with tests"
```

---

### Task 3: Static site UI (HTML/CSS/JS)

**Files:**
- Create: `index.html`, `styles.css`, `app.js`

**Interfaces:**
- Consumes: `data/overview.json`, `accounts.json`, `recurring.json`, `spend_by_category.json`, `meta.json`
- Produces: rendered dashboard; `window.__finance` debug object optional

- [ ] **Step 1: Write `index.html` shell**

Structure:
- `<header>` title “Finance” + `#refreshed`
- `#gaps` banner (hidden by default)
- `#stale` banner (hidden by default)
- `#kpis` grid
- `<nav>` links: Accounts, Recurring, Spend
- `<section id="accounts">`, `#recurring`, `#spend`
- `<script type="module" src="app.js">`

- [ ] **Step 2: Write `styles.css`**

Light background (`#f6f7f9`), white cards, 12–14px dense type, KPI grid `repeat(auto-fit,minmax(140px,1fr))`, tables full width with subtle row borders, amber `#gaps` / `#stale` banners, CSS bar for spend `%` via `width` on an inner div. Mobile: single column.

- [ ] **Step 3: Write `app.js`**

```js
const STALE_MS = 36 * 60 * 60 * 1000;
const money = (n) => n == null || Number.isNaN(n) ? '—' :
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

async function load(name) {
  const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.json();
}

function setBanner(el, text) {
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false; el.textContent = text;
}

function renderKpis(overview) {
  const order = [
    ['Cash total', 'Cash'],
    ['Credit card debt total', 'CC debt'],
    ['Investment total (Fidelity)', 'Investments'],
    ['Net liquid (cash - CC debt)', 'Net liquid'],
    ['Card spend last 30d (excl payments)', '30d spend'],
    ['Confirmed recurring monthly estimate', 'Confirmed /mo'],
    ['Likely recurring monthly estimate', 'Likely /mo'],
  ];
  const root = document.getElementById('kpis');
  root.innerHTML = order.map(([key, label]) => {
    const cell = overview[key];
    const val = cell ? (cell.value != null && typeof cell.value === 'number' ? money(cell.value) : (cell.display || '—')) : '—';
    return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div></div>`;
  }).join('');
}

function renderAccounts(rows) {
  const order = ['cash', 'liability', 'investment'];
  const labels = { cash: 'Cash', liability: 'Credit cards', investment: 'Investments' };
  const root = document.getElementById('accounts');
  root.innerHTML = order.map(cls => {
    const group = rows.filter(r => r.class === cls);
    if (!group.length) return '';
    const body = group.map(r => `<tr>
      <td>${r.institution ?? ''}</td>
      <td>${r.account_name ?? ''}</td>
      <td>••${r.mask ?? ''}</td>
      <td class="num">${money(r.current_balance)}</td>
      <td class="num">${money(r.available_balance)}</td>
    </tr>`).join('');
    return `<h3>${labels[cls]}</h3>
      <table><thead><tr><th>Institution</th><th>Account</th><th>Mask</th><th>Balance</th><th>Available</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }).join('');
}

function renderRecurring(rows) {
  const root = document.getElementById('recurring');
  const confirmed = rows.filter(r => r.status === 'confirmed');
  const likely = rows.filter(r => r.status === 'likely');
  const table = (list) => `<table><thead><tr>
    <th>Name</th><th>Cadence</th><th>Category</th><th>Monthly est.</th><th>Last seen</th>
  </tr></thead><tbody>${list.map(r => `<tr>
    <td>${r.name ?? ''}</td><td>${r.cadence ?? ''}</td><td>${r.category ?? ''}</td>
    <td class="num">${money(r.monthly_estimate)}</td><td>${r.last_seen ?? ''}</td>
  </tr>`).join('')}</tbody></table>`;
  root.innerHTML = `<h3>Confirmed</h3>${table(confirmed)}
    <h3>Likely</h3>${table(likely)}
    <p class="muted">Guess / discretionary items hidden in v1.</p>`;
}

function renderSpend(rows) {
  const root = document.getElementById('spend');
  const max = Math.max(...rows.map(r => r.pct_of_spend || 0), 0.0001);
  root.innerHTML = `<table><thead><tr><th>Category</th><th>30d out</th><th>%</th><th></th></tr></thead>
    <tbody>${rows.map(r => {
      const pct = r.pct_of_spend == null ? 0 : (r.pct_of_spend > 1 ? r.pct_of_spend : r.pct_of_spend * 100);
      // seed used percent-like numbers already converted: if value was 27.31 from "27.31%", parseMoney kept 27.31
      const width = Math.min(100, (Number(r.pct_of_spend) > 1 ? Number(r.pct_of_spend) : Number(r.pct_of_spend) * 100));
      const label = Number(r.pct_of_spend) > 1 ? `${Number(r.pct_of_spend).toFixed(1)}%` : `${(Number(r.pct_of_spend||0)*100).toFixed(1)}%`;
      return `<tr><td>${r.category_primary ?? ''}</td><td class="num">${money(r.total_out_30d)}</td>
        <td class="num">${label}</td>
        <td class="bar"><div style="width:${width}%"></div></td></tr>`;
    }).join('')}</tbody></table>`;
}

async function main() {
  try {
    const [overview, accounts, recurring, spend, meta] = await Promise.all([
      load('overview'), load('accounts'), load('recurring'), load('spend_by_category'), load('meta'),
    ]);
    const refreshed = meta.last_refreshed || overview['Last refreshed']?.value || '';
    document.getElementById('refreshed').textContent = refreshed ? `Last refreshed ${refreshed}` : 'Last refreshed unknown';
    const gaps = meta.gaps || overview['Data gaps']?.value || '';
    setBanner(document.getElementById('gaps'), gaps ? `Gaps: ${gaps}` : '');
    if (refreshed) {
      const t = Date.parse(refreshed);
      setBanner(document.getElementById('stale'),
        Number.isFinite(t) && (Date.now() - t > STALE_MS) ? 'Data may be stale (>36 hours since last refresh).' : '');
    }
    renderKpis(overview);
    renderAccounts(accounts);
    renderRecurring(recurring);
    renderSpend(spend);
  } catch (e) {
    setBanner(document.getElementById('stale'), `Data unavailable: ${e.message}`);
  }
}
main();
```

Normalize `pct_of_spend` in the sync script to a 0–1 fraction so the UI can always multiply by 100 (fix in Task 4). Update `renderSpend` to always treat `pct_of_spend` as 0–1:

```js
const pct = (r.pct_of_spend ?? 0) * 100;
```

And re-seed `spend_by_category.json` so values are fractions (0.2731 not 27.31).

- [ ] **Step 4: Manual browser check**

Serve locally:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Confirm KPIs match seed, Accounts grouped, Recurring confirmed then likely, Spend bars, gaps banner visible.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js data/spend_by_category.json
git commit -m "feat: render finance dashboard from seeded JSON"
```

---

### Task 4: Sync script + GitHub Action

**Files:**
- Create: `scripts/sync-sheet.mjs`
- Create: `.github/workflows/sync-finance.yml`
- Modify: `data/*.json` when run

**Interfaces:**
- Consumes: env `GOOGLE_SERVICE_ACCOUNT_JSON`, spreadsheet id constant
- Produces: rewritten `data/*.json`; exit 0; prints `changed` or `unchanged`

- [ ] **Step 1: Implement `scripts/sync-sheet.mjs`**

```js
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { parseOverview, parseTable, parseMoney } from './lib/parse.mjs';

const SHEET_ID = '1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U';
const OUT = new URL('../data/', import.meta.url);

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing');
  const creds = JSON.parse(raw);
  const jwt = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
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
  const p = path.join(OUT.pathname, name);
  const next = JSON.stringify(data, null, 2) + '\n';
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (prev === next) return false;
  fs.writeFileSync(p, next);
  return true;
}

function normalizeSpend(rows) {
  return rows.map(r => {
    let pct = r.pct_of_spend;
    if (pct != null && pct > 1) pct = pct / 100;
    return { ...r, pct_of_spend: pct };
  });
}

async function main() {
  const sheets = auth();
  const overviewRows = await values(sheets, 'Overview');
  const accountVals = await values(sheets, 'Accounts');
  const recurringVals = await values(sheets, 'Recurring');
  const spendVals = await values(sheets, 'Spend_by_Category');
  const metaVals = await values(sheets, 'Meta');

  if (overviewRows.length < 2) throw new Error('Overview empty — refusing to overwrite');

  const overview = parseOverview(overviewRows);
  const accounts = parseTable(accountVals[0], accountVals.slice(1));
  const recurring = parseTable(recurringVals[0], recurringVals.slice(1));
  const spend = normalizeSpend(parseTable(spendVals[0], spendVals.slice(1)));
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
```

- [ ] **Step 2: Workflow file**

```yaml
# .github/workflows/sync-finance.yml
name: Sync finance sheet
on:
  schedule:
    - cron: '0 21 * * *'   # 16:00 America/New_York during EST; after MM daily refresh
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - name: Sync from Google Sheet
        env:
          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
        run: npm run sync
      - name: Commit data if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/*.json
          if git diff --staged --quiet; then
            echo "No data changes"
          else
            git commit -m "chore: refresh finance data from sheet"
            git push
          fi
```

- [ ] **Step 3: Normalize seed spend fractions + re-test parsers**

Update `data/spend_by_category.json` so `pct_of_spend` is 0–1. Re-run `npm test`.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-sheet.mjs .github/workflows/sync-finance.yml data/spend_by_category.json package.json
git commit -m "feat: add Sheets sync script and daily GitHub Action"
git push
```

- [ ] **Step 5: Human setup (Matthew / Dev in chat) — required before Action succeeds**

1. Create GCP service account + Sheets API + JSON key.
2. Repo secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. Share the finance sheet with the SA email as Viewer.
4. Run workflow_dispatch once; confirm `data/*.json` commit appears.

Until this is done, Pages still serves seed data.

---

### Task 5: Enable Pages + verify live

**Files:** none (settings + verify)

- [ ] **Step 1: Enable GitHub Pages**

```bash
gh api -X PUT repos/MNWinn/finance-dashboard/pages -f build_type=legacy -f source[branch]=main -f source[path]=/
```

Or Settings → Pages → Deploy from `main` / root.

- [ ] **Step 2: Fetch live URL**

```bash
curl -sI https://mnwinn.github.io/finance-dashboard/ | head -n 5
curl -s https://mnwinn.github.io/finance-dashboard/data/overview.json | head
```

Expected: 200; JSON contains Cash total.

- [ ] **Step 3: Spot-check UI**

Open the Pages URL. Confirm KPIs, gaps banner, three sections. No console errors for missing JSON.

- [ ] **Step 4: FYI Money Manager** (Dev sends via SendToAgent, priority false)

Tell Money Manager: public dashboard live at the Pages URL; Action syncs daily from their sheet; keep refreshing the sheet; SA email needs Viewer if not already shared.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Public Pages `MNWinn/finance-dashboard` | 1, 5 |
| Daily JSON snapshot, no browser Sheets | 4 |
| Overview / Accounts / Recurring / Spend / Meta | 3, 4 |
| No Transactions v1 | 3 (omitted) |
| Light dense UI | 3 |
| Gaps banner + last refreshed | 3 |
| Stale >36h | 3 |
| Action secret only | 4 |
| Seed before first Action | 1 |
| Never invent numbers | 3 catch + empty states |
| Schema column names | 2, 4 |

## Placeholder / consistency self-review

- No TBD steps; SA setup is an explicit human Step in Task 4.
- `pct_of_spend` normalized to 0–1 in sync + seed; UI multiplies by 100.
- Parser money column set matches Schema numeric fields used in v1.
