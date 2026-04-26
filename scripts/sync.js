```javascript
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ---- Config ----------------------------------------------------------------

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TRANSACTIONS_RANGE = 'Transactions!A:O';
const BALANCE_HISTORY_RANGE = 'Balance History!A:E';

// ---- Auth ------------------------------------------------------------------

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ---- Helpers ---------------------------------------------------------------

function parseDate(val) {
  if (!val) return null;
  // Handle M/D/YYYY format from Tiller
  const parts = String(val).split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const d = new Date(val);
  if (isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}

function parseAmount(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ---- Transactions ----------------------------------------------------------
// Column mapping (0-indexed):
// 0:Date 1:Description 2:Category 3:Amount 4:Account 5:Account#
// 6:Institution 7:Month 8:Week 9:Transaction ID 10:Check Number
// 11:Full Description 12:Categorized Date 13:Date Added 14:Metadata

async function syncTransactions() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: TRANSACTIONS_RANGE,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    console.log('No transaction rows found.');
    return;
  }

  const [_header, ...dataRows] = rows;

  const records = dataRows
    .filter(r => r[9])
    .map(r => ({
      transaction_id: r[9],
      date: parseDate(r[0]),
      description: r[1] || null,
      full_description: r[11] || null,
      category: r[2] || null,
      amount: parseAmount(r[3]),
      account: r[4] || null,
      account_number: r[5] || null,
      institution: r[6] || null,
      month: r[7] || null,
      week: r[8] || null,
      check_number: r[10] || null,
      tags: r[14] || null,
      normalized_payee: r[1] || null,
      normalized_category: r[2] || null,
    }));

  console.log(`Upserting ${records.length} transactions...`);

  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'transaction_id' });

    if (error) {
      console.error(`Error upserting transactions chunk ${i}:`, error);
      process.exit(1);
    }
  }

  console.log('Transactions synced.');
}

// ---- Balances --------------------------------------------------------------
// Column mapping (0-indexed):
// 0:Date 1:Account 2:Account# 3:Institution 4:Balance

async function syncBalances() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: BALANCE_HISTORY_RANGE,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    console.log('No balance rows found.');
    return;
  }

  const [_header, ...dataRows] = rows;

  const records = dataRows
    .filter(r => r[2] && r[0])
    .map(r => ({
      date: parseDate(r[0]),
      account: r[1] || null,
      account_number: r[2],
      institution: r[3] || null,
      balance: parseAmount(r[4]),
    }));

  console.log(`Upserting ${records.length} balance rows...`);

  const { error } = await supabase
    .from('balances')
    .upsert(records, { onConflict: 'account_number,date' });

  if (error) {
    console.error('Error upserting balances:', error);
    process.exit(1);
  }

  console.log('Balances synced.');
}

// ---- Main ------------------------------------------------------------------

async function main() {
  await syncTransactions();
  await syncBalances();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```
