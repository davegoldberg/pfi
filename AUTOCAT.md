# AutoCat Rules

This file is for reference. The **live rules live in the AutoCat tab of your Tiller Sheet**.

## Sheet Tab Setup

Create a tab named exactly `AutoCat` with these columns:

| A: Payee Pattern | B: Category | C: Subcategory | D: Notes |
|---|---|---|---|
| WHOLE FOODS | Groceries | Supermarket | |
| TRADER JOE | Groceries | Supermarket | |
| AMAZON | Shopping | Amazon | |
| AMZN | Shopping | Amazon | Prime, marketplace |
| NETFLIX | Subscriptions | Streaming | |
| SPOTIFY | Subscriptions | Streaming | |
| HULU | Subscriptions | Streaming | |
| APPLE.COM/BILL | Subscriptions | Apple | |
| OPENAI | Subscriptions | AI Tools | |
| CON EDISON | Utilities | Electric | |
| NATIONAL GRID | Utilities | Gas | |
| OPTIMUM | Utilities | Internet | |
| VERIZON | Utilities | Phone | |
| UBER | Transportation | Rideshare | |
| LYFT | Transportation | Rideshare | |
| MTA | Transportation | Transit | |
| CITIBIKE | Transportation | Transit | |
| DELTA | Travel | Flights | |
| UNITED | Travel | Flights | |
| AMERICAN AIR | Travel | Flights | |
| AIRBNB | Travel | Lodging | |
| MARRIOTT | Travel | Hotel | |
| HILTON | Travel | Hotel | |
| GRUBHUB | Food & Drink | Delivery | |
| DOORDASH | Food & Drink | Delivery | |
| SEAMLESS | Food & Drink | Delivery | |
| CVSLOCATION | Health | Pharmacy | |
| WALGREENS | Health | Pharmacy | |
| VENMO | Transfers | P2P | |
| ZELLE | Transfers | P2P | |

## Rules

- Matching is **case-insensitive substring** -- "WHOLE FOODS" matches "WHOLE FOODS MARKET #123"
- Rules are applied **in order** -- first match wins, so put more specific patterns before generic ones
- If no rule matches, `normalized_payee` and `normalized_category` will be null in Supabase
- You can query unmatched transactions with: `SELECT DISTINCT description FROM transactions WHERE normalized_category IS NULL ORDER BY description`

## Useful Queries Once Live

```sql
-- Monthly spend by category
SELECT 
  DATE_TRUNC('month', date) as month,
  COALESCE(normalized_category, category) as category,
  SUM(amount) as total
FROM transactions
WHERE amount < 0
GROUP BY 1, 2
ORDER BY 1 DESC, 3;

-- Subscriptions (recurring charges)
SELECT description, normalized_category, amount, date
FROM transactions
WHERE normalized_category ILIKE '%subscription%'
ORDER BY date DESC;

-- Unmatched transactions to add to AutoCat
SELECT DISTINCT description, full_description, COUNT(*) as occurrences
FROM transactions
WHERE normalized_category IS NULL
GROUP BY 1, 2
ORDER BY 3 DESC;

-- Current balances per account
SELECT account, institution, balance, date
FROM balances
WHERE date = (SELECT MAX(date) FROM balances)
ORDER BY balance DESC;

-- Cashflow last 90 days
SELECT 
  DATE_TRUNC('week', date) as week,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
  SUM(amount) as net
FROM transactions
WHERE date >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;
```
