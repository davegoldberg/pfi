import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ---- Config ----------------------------------------------------------------

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TRANSACTIONS_RANGE = 'Transactions!A:N';
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
      full_description: r[10] || null,
      category: r[2] || null,
      amount: parseAmount(r[3]),
      account: r[4] || null,
      account_number: r[5] || null,
      institution: r[6] || null,
      month: r[7] || null,
      week: r[8] || null,
      check_numbe
