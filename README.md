# pfi — Personal Finance Infrastructure

Syncs Tiller (Google Sheets) transactions and balances to Supabase daily via GitHub Actions.

## Stack

- **Tiller** -- bank/credit sync to Google Sheets
- **GitHub Actions** -- daily scheduled sync job
- **Supabase** -- Postgres database for querying
- **AutoCat** -- rule-based categorization DSL in a Sheet tab

## Setup

### GitHub Secrets Required

| Secret | Value |
|---|---|
| `GOOGLE_CREDENTIALS` | Full JSON contents of your Google service account key |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (not anon) |
| `SPREADSHEET_ID` | Tiller spreadsheet ID from the URL |

### AutoCat Tab

Create a tab named `AutoCat` in your Tiller sheet. See `AUTOCAT.md` for the schema and starter rules.

## Running Manually

```bash
cd scripts
npm install
GOOGLE_CREDENTIALS='...' SUPABASE_URL='...' SUPABASE_SERVICE_KEY='...' SPREADSHEET_ID='...' node sync.js
```

## Querying

Use the Supabase SQL editor, psql, or the Supabase MCP connector in Claude.

See `AUTOCAT.md` for useful starter queries.
