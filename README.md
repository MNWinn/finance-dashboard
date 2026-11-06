# Finance dashboard

Read-only personal finance dashboard for Matthew Winn, served by GitHub Pages.

**Live site:** https://mnwinn.github.io/finance-dashboard/

## How data gets here

The page fetches Money Manager’s Google Sheet directly in the browser as **published CSV** (File → Share → Publish to web). Only these five tabs are published:

| Tab | Shape |
| --- | --- |
| Overview | label, value (first two columns) |
| Accounts | header row, then rows |
| Recurring | header row, then rows |
| Spend_by_Category | header row, then rows (`pct_of_spend` normalized to 0–1) |
| Meta | key, value rows |

Transactions_30d, Schema and Move_Plan are not published. The sheet itself stays private for editing.

- **Refresh** follows the sheet: when Money Manager updates it, the next page load shows the new numbers. Google’s publish-to-web cache can lag a few minutes. The “Last refreshed” time comes from the sheet, never the browser clock.
- **Fallback:** if a live tab fails (network error, not CSV, missing headers, or empty), that tab alone loads from the committed last-known-good snapshot in `data/*.json`. The header badge shows **Live** or which tabs are on **Snapshot**.
- **No Google Cloud project, billing, service account, secrets, or GitHub Action** is involved.

Feed URLs (gids) are in `app.js`. Parsers in `scripts/lib/parse.mjs` are shared by the browser and the Node tests.

## Local

No dependencies to install.

```bash
npm test
python3 -m http.server 8080   # then open http://localhost:8080
```

## v1 scope

Overview KPIs, Accounts, Recurring (confirmed + likely, guesses collapsed), Spend_by_Category. Transactions_30d deferred.
