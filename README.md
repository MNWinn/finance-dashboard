# Finance dashboard

Read-only personal finance dashboard for Matthew Winn. Public GitHub Pages site sourced from Money Manager’s Google Sheet via a daily JSON snapshot.

**Target site:** https://mnwinn.github.io/finance-dashboard/ (live once Pages is enabled — step 1 below).

## Setup (one-time)

1. **Pages:** Settings → Pages → Deploy from branch `main` / root (`/`).
2. **Service account:** Create a Google Cloud service account, enable Google Sheets API, download a JSON key.
3. **Repo secret:** Add `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON string of the key).
4. **Share sheet:** Share spreadsheet `1QYxStHP2I6AU9QmB5-XVkUHa7FrvqRzGwtnJZx2sk3U` with the service account email as **Viewer**.
5. **First sync:** Actions → “Sync finance sheet” → Run workflow.

Until the Action runs successfully, the site serves the seeded `data/*.json` snapshot.

## Local

`npm ci` installs from the committed `package-lock.json` (the sync Action uses it too). `npm run sync` needs `GOOGLE_SERVICE_ACCOUNT_JSON` set.

```bash
npm ci
npm test
python3 -m http.server 8080
```

## v1 scope

Overview KPIs, Accounts, Recurring (confirmed + likely), Spend_by_Category. Transactions_30d deferred.
