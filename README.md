# Pocketwise

Pocketwise is a local-first personal budgeting workspace for understanding spending, planning ahead, and importing statement data without a direct bank connection.

## What’s included

- First-run CAD budget setup with user-defined income and spending limit
- Overview dashboard with available-to-spend, month-end forecast, savings rate, and financial health score
- Transactions workspace with search, category filtering, manual entries, and CSV/PDF import review
- Content-based PDF detection for RBC, TD, Scotiabank, BMO, CIBC, National Bank, and American Express Canada
- Categories with budget progress and flexible-spending summaries
- Editable category limits and locally saved custom categories
- Reports with month-over-month insights and practical nudges
- Responsive layout that compresses to a compact navigation rail on smaller screens

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the development server starts.

Settings and transactions are stored in the current browser. CSV files and searchable-text PDFs are parsed locally, including optional original-currency fields. PDF institution detection uses document contents rather than the filename, and supports both card rows and bank-account debit/credit tables. Unknown layouts are flagged for review; image-only/scanned PDFs need the planned OCR feature.

For a quick currency-import check, use [`tests/fixtures/sample-transactions.csv`](tests/fixtures/sample-transactions.csv). Its USD purchase should display both the CAD charge and the original USD amount.

The evolving product scope and feature backlog are tracked in [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md).
