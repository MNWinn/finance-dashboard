# Finance Dashboard — Design Spec

Date: 2026-11-05  
Owner: Dev (for Matthew Winn)  
Sheet owner: Money Manager  
Status: Approved in chat; awaiting Matthew review of this written spec

## Goal

A public, read-only personal finance dashboard on GitHub Pages that displays KPIs and tables from Money Manager’s Google Sheet. No payment actions. Matthew accepts that anyone with the URL can see the numbers.

## Decisions (Matthew-approved)

| Decision | Choice |
|---|---|
| Hosting | Public GitHub Pages |
| Repo | `MNWinn/finance-dashboard` → `https://mnwinn.github.io/finance-dashboard/` |
| Data load | Daily JSON snapshot in the repo (not live Sheets from the browser) |
| v1 scope | Overview, Accounts, Recurring, Spend_by_Category |
| Out of v1 | Transactions_30d drill-down |
| Look | Clean finance: light background, dense KPI cards and tables |
| Architecture | Static HTML/CSS/JS + GitHub Action that rewrites `data/*.json` |

## Source of truth

- Spreadsheet: [Money Manager — Finance Control](https://docs.google.com/spreadsheets/d/1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U/edit)
- Id: `1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U`
- Money Manager refreshes the sheet daily. The dashboard does not write to the sheet.
- Column contracts live on the sheet’s **Schema** tab; the site and Action must follow Schema, not invent fields.

### Tabs used in v1

- **Overview** — label/value KPI pairs (cash, CC debt, investments, net liquid, 30d spend, recurring estimates, gaps, last refreshed)
- **Accounts** — institution, balances, class, ids
- **Recurring** — bills/subs with status, cadence, monthly_estimate
- **Spend_by_Category** — 30d category totals
- **Meta** — gaps and source notes (banner + footer)

### Deferred

- **Transactions_30d** — detail/drill-down in a later version
- **Schema** — documentation for builders; not rendered as a UI tab

## Architecture

```
Money Manager  --daily-->  Google Sheet
                              |
                     GitHub Action (cron + manual)
                              |
                              v
                     data/*.json in repo
                              |
                     GitHub Pages static site
                              |
                              v
                     Browser (fetch JSON only)
```

- No Sheets API key in client code.
- Action secret holds Sheets credentials (service account or OAuth token — implementation picks the simplest that can read this private sheet).
- Seed `data/*.json` once at first ship so Pages works before the first Action run.

### JSON files

- `data/overview.json` — object of KPI label → value (plus parsed numbers where useful)
- `data/accounts.json` — array of account rows
- `data/recurring.json` — array of recurring rows
- `data/spend_by_category.json` — array of category rows
- `data/meta.json` — key/value map including `last_refreshed` and `gaps`

Exact shapes follow Schema column names. Numbers may be stored as numbers in JSON even when the sheet displays currency formatting.

## UI

- Light background; dense KPI cards and tables; mobile stacks, desktop tight rows.
- Header: title + last-refreshed timestamp.
- Gaps banner (amber) when Overview/Meta reports data gaps.
- KPI strip: Cash, CC debt, Investments, Net liquid, 30d card spend, Confirmed recurring /mo, Likely recurring /mo.
- Sections (tabs or anchor nav):
  - **Accounts** — grouped by `class` (cash / liability / investment); show institution, account_name, mask, current_balance, available_balance when present.
  - **Recurring** — `confirmed` first (with `monthly_estimate`), then `likely`; `guess` collapsed or hidden by default.
  - **Spend** — category table or CSS bar chart with `total_out_30d` and `pct_of_spend`.
- No chart library required for v1.
- Never invent or interpolate missing numbers; show empty/unavailable/stale states explicitly.
- Stale rule: if `last_refreshed` is older than 36 hours, show a clear stale warning.

## Refresh / GitHub Action

- Triggers: scheduled daily (after Money Manager’s refresh window) and `workflow_dispatch`.
- Steps: authenticate → read the five tabs → write JSON under `data/` → commit only if contents changed.
- Failures: Action fails loudly (no silent empty overwrite). Site keeps last good JSON and can show stale.
- Manual path: Dev or Money Manager can ask for a re-run after an ad-hoc sheet refresh.

## Non-goals (v1)

- Auth / private hosting
- Write-back, transfers, bill pay
- Editing recurring classifications
- Live Sheets fetch from the browser
- Transactions drill-down
- Heavy charting libraries

## Success criteria

1. Pages URL loads without login and shows current Overview KPIs from seeded or Action-written JSON.
2. Accounts, Recurring (confirmed prioritized), and Spend sections match the sheet after an Action run.
3. Gaps banner reflects Meta/Overview gaps text.
4. No secrets in the published site; Action secret is the only Sheets credential.
5. Stale or missing data surfaces a clear UI state; numbers are never fabricated.

## Open implementation notes (not blocking design)

- Exact Action auth method (service account vs PAT + gviz) chosen during implementation for least friction with this private sheet.
- Repo creation: public `MNWinn/finance-dashboard` with Pages from `main` `/` (or `/docs` if needed).
- Money Manager FYI’d after ship so they know the Action depends on their daily sheet refresh.
