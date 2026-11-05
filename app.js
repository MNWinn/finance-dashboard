const STALE_MS = 36 * 60 * 60 * 1000;
const FILES = ['overview', 'accounts', 'recurring', 'spend_by_category', 'meta'];

const KPIS = [
  ['Cash total', 'Cash'],
  ['Credit card debt total', 'CC debt'],
  ['Investment total (Fidelity)', 'Investments'],
  ['Net liquid (cash - CC debt)', 'Net liquid'],
  ['Card spend last 30d (excl payments)', '30d spend'],
  ['Confirmed recurring monthly estimate', 'Confirmed /mo'],
  ['Likely recurring monthly estimate', 'Likely /mo'],
];

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const money = (n) => isNum(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';
const esc = (v) => v == null ? '' : String(v).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const $ = (id) => document.getElementById(id);

async function load(name) {
  const res = await fetch(`data/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}.json ${res.status}`);
  return res.json();
}

function setBanner(el, text) {
  el.hidden = !text;
  el.textContent = text || '';
}

function unavailable(id, name) {
  $(id).innerHTML = `<p class="empty">Unavailable — could not load ${esc(name)}.json.</p>`;
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
      <td class="num">${money(r.current_balance)}</td>
      <td class="num">${money(r.available_balance)}</td>
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
  const results = await Promise.allSettled(FILES.map(load));
  const data = {};
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') data[FILES[i]] = r.value;
    else failed.push(FILES[i]);
  });
  window.__finance = { data, failed };

  const { overview, accounts, recurring, spend_by_category: spend, meta } = data;

  const refreshed = meta?.last_refreshed || overview?.['Last refreshed']?.value || '';
  $('refreshed').textContent = refreshed ? `Last refreshed ${formatTime(refreshed)}` : 'Last refreshed unknown';

  const gaps = meta?.gaps || overview?.['Data gaps']?.value || '';
  setBanner($('gaps'), gaps ? `Data gaps: ${gaps}` : '');

  const notices = [];
  if (failed.length) notices.push(`Data unavailable: ${failed.map((f) => `${f}.json`).join(', ')}.`);
  const t = Date.parse(refreshed);
  if (!refreshed || !Number.isFinite(t)) notices.push('Last refresh time unknown; data freshness cannot be confirmed.');
  else if (Date.now() - t > STALE_MS) notices.push('Data may be stale (>36 hours since last refresh).');
  setBanner($('stale'), notices.join(' '));

  renderKpis(overview);
  if (Array.isArray(accounts)) renderAccounts(accounts); else unavailable('accounts', 'accounts');
  if (Array.isArray(recurring)) renderRecurring(recurring); else unavailable('recurring', 'recurring');
  if (Array.isArray(spend)) renderSpend(spend); else unavailable('spend', 'spend_by_category');
}

main();
