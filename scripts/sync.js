import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// ---- Config ----------------------------------------------------------------

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TRANSACTIONS_RANGE = 'Transactions!A:N';
const BALANCE_HISTORY_RANGE = 'Balance History!A:E';
const AUTOCAT_RANGE = 'AutoCat!A:D';

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
  // Tiller dates are typically M/D/YYYY
  const d = new Date(val);
  if (isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}

function parseAmount(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ---- AutoCat ---------------------------------------------------------------
// Reads the AutoCat tab. Expected columns:
//   A: Payee Pattern (substring match, case-insensitive)
//   B: Category
//   C: Subcategory (optional, stored in normalized_category as "Category > Subcategory")
//   D: Notes (ignored, just for your reference)

async function loadAutoCatRules() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: AUTOCAT_RANGE,
  });

  const rows = res.data.values || [];
  // Skip header row
  return rows.slice(1).filter(r => r[0]).map(r => ({
    pattern: r[0].trim(),
    category: r[1]?.trim() || '',
    subcategory: r[2]?.trim() || '',
  }));
}

function applyAutoCat(description, fullDescription, rules) {
  const haystack = `${description} ${fullDescription}`.toLowerCase();
  for (const rule of rules) {
    if (haystack.includes(rule.pattern.toLowerCase())) {
      return {
        normalized_payee: rule.pattern,
        normalized_category: rule.subcategory
          ? `${rule.category} > ${rule.subcategory}`
          : rule.category,
      };
    }
  }
  return { normalized_payee: null, normalized_category: null };
}

// ---- Transactions ----------------------------------------------------------

async function syncTransactions(rules) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: TRANSACTIONS_RANGE,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    console.log('No transaction rows found.');
    return;
  }

  // Tiller default column order (0-indexed):
  // 0:Date 1:Description 2:Category 3:Amount 4:Account 5:Account# 
  // 6:Institution 7:Month 8:Week 9:TransactionID 10:FullDescription 
  // 11:CheckNumber 12:Tags
  const [_header, ...dataRows] = rows;

  const records = dataRows
    .filter(r => r[9]) // must have a transaction ID
    .map(r => {
      const description = r[1] || '';
      const fullDescription = r[10] || '';
      const { normalized_payee, normalized_category } = applyAutoCat(
        description,
        fullDescription,
        rules
      );

      return {
        transaction_id: r[9],
        date: parseDate(r[0]),
        description,
        full_description: fullDescription,
        category: r[2] || null,
        amount: parseAmount(r[3]),
        account: r[4] || null,
        account_number: r[5] || null,
        institution: r[6] || null,
        month: r[7] || null,
        week: r[8] || null,
        check_number: r[11] || null,
        tags: r[12] || null,
        normalized_payee,
        normalized_category,
      };
    });

  console.log(`Upserting ${records.length} transactions...`);

  // Batch in chunks of 500 to stay within Supabase limits
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

  // Balance History default columns:
  // 0:Date 1:Account 2:Account# 3:Institution 4:Balance
  const [_header, ...dataRows] = rows;

  const records = dataRows
    .filter(r => r[2] && r[0]) // must have account# and date
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
  console.log('Loading AutoCat rules...');
  const rules = await loadAutoCatRules();
  console.log(`Loaded ${rules.length} AutoCat rules.`);

  await syncTransactions(rules);
  await syncBalances();

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
