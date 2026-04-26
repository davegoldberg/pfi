import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TRANSACTIONS_RANGE = 'Transactions!A:O';
const BALANCE_HISTORY_RANGE = 'Balance History!A:E';

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

function parseDate(val) {
  if (!val) return null;
  const parts = String(val).split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return year + '-' + month + '-' + day;
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

  const dataRows = rows.slice(1);

  const records = dataRows
    .filter(function(r) { return r[9]; })
    .map(function(r) {
      return {
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
      };
    });

  console.log('Upserting ' + records.length + ' transactions...');

  const chunkSize = 500;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const result = await supabase
      .from('transactions')
      .upsert(chunk, { onConflict: 'transaction_id' });

    if (result.error) {
      console.error('Error upserting transactions chunk ' + i + ':', result.error);
      process.exit(1);
    }
  }

  console.log('Transactions synced.');
}

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

  const dataRows = rows.slice(1);

  const records = dataRows
    .filter(function(r) { return r[2] && r[0]; })
    .map(function(r) {
      return {
        date: parseDate(r[0]),
        account: r[1] || null,
        account_number: r[2],
        institution: r[3] || null,
        balance: parseAmount(r[4]),
      };
    });

  console.log('Upserting ' + records.length + ' balance rows...');

  const result = await supabase
    .from('balances')
    .upsert(records, { onConflict: 'account_number,date' });

  if (result.error) {
    console.error('Error upserting balances:', result.error);
    process.exit(1);
  }

  console.log('Balances synced.');
}

async function main() {
  await syncTransactions();
  await syncBalances();
  console.log('Done.');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
