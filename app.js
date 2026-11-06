import {
  parseCsv, parseOverview, parseHeaderTable, parseSpend, parseMeta, entryCount,
} from './scripts/lib/parse.mjs';

const STALE_MS = 36 * 60 * 60 * 1000;
const LIVE_TIMEOUT_MS = 10000;
const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSDpdF4crgx3BHy32Vki1iD96SkKgemxXsysKwnPm3usTlifslbjZ2yhNT4IXSUowAmnTrnzM_U4fuj/pub';

// name = data/<name>.json snapshot; required = header a live table must have to be accepted.
const FEEDS = [
  { name: 'overview', tab: 'Overview', gid: '401796553', parse: parseOverview },
  { name: 'accounts', tab: 'Accounts', gid: '1430030995', parse: parseHeaderTable, required: 'institution' },
  { name: 'recurring', tab: 'Recurring', gid: '1942016769', parse: parseHeaderTable, required: 'name' },
  { name: 'spend_by_category', tab: 'Spend_by_Category', gid: '712914287', parse: parseSpend, required: 'category_primary' },
  { name: 'meta', tab: 'Meta', gid: '829989513', parse: parseMeta },
];

const KPIS = [
  ['Cash total', 'Cash'],
  ['Credit card debt total', 'CC debt'],
  ['Investment total (Fidelity)', 'Investments'],
  ['Net liquid (cash - CC debt)', 'Net liquid'],
  ['Card spend last 30d (excl payments)', '30d card spend'],
  ['Confirmed recurring monthly estimate', 'Confirmed recurring /mo'],
  ['Likely recurring monthly estimate', 'Likely recurring /mo'],
];

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const negCls = (n) => isNum(n) && n < 0 ? ' neg' : '';
const money = (n) => isNum(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';
const esc = (v) => v == null ? '' : String(v).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const $ = (id) => document.getElementById(id);

async function loadLive(feed) {
  const url = `${PUB_BASE}?gid=${feed.gid}&single=true&output=csv`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${feed.tab} ${res.status}`);
  // Unpublished or unknown tabs come back as 200 text/html.
  if (!(res.headers.get('content-type') || '').includes('text/csv')) throw new Error(`${feed.tab} not CSV`);
  const rows = parseCsv(await res.text());
  if (feed.required && !rows[0]?.includes(feed.required)) throw new Error(`${feed.tab} missing ${feed.required} header`);
  const data = feed.parse(rows);
  if (entryCount(data) === 0) throw new Error(`${feed.tab} empty`);
  return data;
}

async function loadSnapshot(feed) {
  const res = await fetch(`data/${feed.name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${feed.name}.json ${res.status}`);
  return res.json();
}

// Live CSV first; fall back to the committed last-known-good snapshot for that tab only.
async function load(feed) {
  try {
    return { data: await loadLive(feed), source: 'live' };
  } catch (liveErr) {
    console.warn('Live feed failed, using snapshot:', liveErr);
    try {
      return { data: await loadSnapshot(feed), source: 'snapshot' };
    } catch (snapErr) {
      console.warn('Snapshot failed:', snapErr);
      return { data: undefined, source: 'unavailable' };
    }
  }
}

function setBanner(el, text) {
  el.hidden = !text;
  el.textContent = text || '';
}

function unavailable(id, tab) {
  $(id).innerHTML = `<p class="empty">Unavailable — could not load ${esc(tab)} (live feed and snapshot both failed).</p>`;
}

function formatTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function renderKpis(overview) {
  $('kpis').innerHTML = KPIS.map(([key, label]) => {
    const cell = overview?.[key];
    let val = '—';
    let cls = '';
    if (cell && isNum(cell.value)) {
      val = money(cell.value);
      if (cell.value < 0) cls = ' neg';
    } else if (cell?.display) {
      val = esc(cell.display);
    }
    return `<div class="kpi" title="${esc(key)}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value${cls}">${val}</div></div>`;
  }).join('');
}

function table(headers, rows) {
  const head = headers.map(([h, num]) => `<th${num ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderAccounts(rows) {
  const groups = [['cash', 'Cash'], ['liability', 'Credit cards'], ['investment', 'Investments']];
  const html = groups.map(([cls, label]) => {
    const group = rows.filter((r) => r.class === cls);
    if (!group.length) return '';
    const body = group.map((r) => `<tr>
      <td>${esc(r.institution)}</td>
      <td>${esc(r.account_name)}</td>
      <td>${r.mask ? `••${esc(r.mask)}` : ''}</td>
      <td>${esc(r.subtype)}</td>
      <td class="num${negCls(r.current_balance)}">${money(r.current_balance)}</td>
      <td class="num${negCls(r.available_balance)}">${money(r.available_balance)}</td>
      <td>${esc(r.as_of_date)}</td>
    </tr>`);
    return `<h3>${label}</h3>${table(
      [['Institution'], ['Account'], ['Mask'], ['Type'], ['Balance', true], ['Available', true], ['As of']],
      body,
    )}`;
  }).join('');
  $('accounts').innerHTML = html || '<p class="empty">No accounts.</p>';
}

function renderRecurring(rows) {
  const headers = [['Name'], ['Cadence'], ['Category'], ['Avg', true], ['Monthly est.', true], ['Seen 90d', true], ['Last seen']];
  const block = (list) => list.length ? table(headers, list.map((r) => `<tr>
    <td title="${esc(r.notes)}">${esc(r.name)}</td>
    <td>${esc(r.cadence)}</td>
    <td>${esc(r.category)}</td>
    <td class="num">${money(r.avg_amount)}</td>
    <td class="num">${money(r.monthly_estimate)}</td>
    <td class="num">${isNum(r.occurrences_90d) ? r.occurrences_90d : '—'}</td>
    <td>${esc(r.last_seen)}</td>
  </tr>`)) : '<p class="empty">None.</p>';

  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const likely = rows.filter((r) => r.status === 'likely');
  const guess = rows.filter((r) => r.status === 'guess');

  $('recurring').innerHTML = `<h3>Confirmed (${confirmed.length})</h3>${block(confirmed)}
    <h3>Likely (${likely.length})</h3>${block(likely)}
    ${guess.length ? `<details><summary>Guess / discretionary (${guess.length}) — hidden by default</summary>${block(guess)}</details>` : ''}`;
}

function renderSpend(rows) {
  if (!rows.length) {
    $('spend').innerHTML = '<p class="empty">No spend data.</p>';
    return;
  }
  const body = rows.map((r) => {
    const pct = (r.pct_of_spend ?? 0) * 100;
    const width = Math.max(0, Math.min(100, pct));
    return `<tr>
      <td>${esc(r.category_primary)}</td>
      <td class="num">${money(r.total_out_30d)}</td>
      <td class="num">${pct.toFixed(1)}%</td>
      <td class="bar"><div class="track"><div class="fill" style="width:${width}%"></div></div></td>
    </tr>`;
  });
  $('spend').innerHTML = table([['Category'], ['30d out', true], ['% of spend', true], ['']], body);
}

async function main() {
  const results = await Promise.all(FEEDS.map(load));
  const data = {};
  const sources = {};
  FEEDS.forEach((f, i) => {
    data[f.name] = results[i].data;
    sources[f.name] = results[i].source;
  });
  window.__finance = { data, sources };

  const { overview, accounts, recurring, spend_by_category: spend, meta } = data;
  const tabsWith = (src) => FEEDS.filter((f) => sources[f.name] === src).map((f) => f.tab);
  const snapshotTabs = tabsWith('snapshot');
  const unavailableTabs = tabsWith('unavailable');

  // Timestamps and gaps always come from the sheet data (live preferred), never the browser clock.
  const metaFirst = sources.meta === 'live' || sources.overview !== 'live';
  const pick = (metaVal, overviewVal) => (metaFirst ? metaVal || overviewVal : overviewVal || metaVal) || '';
  const refreshed = pick(meta?.last_refreshed, overview?.['Last refreshed']?.value);
  $('refreshed').textContent = refreshed ? `Last refreshed ${formatTime(refreshed)}` : 'Last refreshed unknown';

  const liveCount = tabsWith('live').length;
  const sourceEl = $('source');
  sourceEl.textContent = liveCount === FEEDS.length ? 'Live'
    : liveCount === 0 ? 'Snapshot'
    : `Live · snapshot: ${[...snapshotTabs, ...unavailableTabs].join(', ')}`;
  sourceEl.className = `badge ${liveCount === FEEDS.length ? 'live' : 'snapshot'}`;

  const gaps = pick(meta?.gaps, overview?.['Data gaps']?.value);
  setBanner($('gaps'), gaps ? `Data gaps: ${gaps}` : '');

  const notices = [];
  if (snapshotTabs.length) notices.push(`Live feed unavailable for ${snapshotTabs.join(', ')}; showing last-known-good snapshot.`);
  if (unavailableTabs.length) notices.push(`Data unavailable: ${unavailableTabs.join(', ')}.`);
  const t = Date.parse(refreshed);
  if (!refreshed || !Number.isFinite(t)) notices.push('Last refresh time unknown; data freshness cannot be confirmed.');
  else if (Date.now() - t > STALE_MS) notices.push('Data may be stale (>36 hours since last refresh).');
  setBanner($('stale'), notices.join(' '));

  renderKpis(overview);
  if (Array.isArray(accounts)) renderAccounts(accounts); else unavailable('accounts', 'Accounts');
  if (Array.isArray(recurring)) renderRecurring(recurring); else unavailable('recurring', 'Recurring');
  if (Array.isArray(spend)) renderSpend(spend); else unavailable('spend', 'Spend_by_Category');
}

main();
