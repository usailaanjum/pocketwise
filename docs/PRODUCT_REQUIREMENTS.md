# Pocketwise Product Requirements

Last updated: August 19, 2026

## Product intent

Pocketwise helps an individual understand spending and anticipate future costs without connecting a bank account. The first version should be private, local, simple to test, and useful after importing one statement.

## Product principles

- Private by default: financial data stays on the user’s device in the first version.
- Explain the numbers: forecasts and health indicators should show how they were calculated.
- Review before trusting: imported categories are suggestions until the user confirms them.
- Progressive complexity: CAD-first, with original-currency details preserved when a source file provides them.
- Calm, actionable language: report patterns and next steps without shame or alarmist wording.

## Current decisions

| Area | Decision |
| --- | --- |
| Base currency | CAD |
| Foreign transactions | Show original currency, original amount, and exchange rate when supplied by the statement |
| Data source | Manual entry plus uploaded CSV or supported searchable PDF statements |
| Storage | Browser-local storage for the MVP |
| Budget inputs | User sets monthly take-home income and monthly spending limit |
| Forecast | Recurring/fixed costs plus the recent daily average of flexible spending |
| Default categories | Housing, Groceries, Dining, Transportation, Utilities, Shopping, Entertainment, Health, Income, and Other |

## Testable MVP workflow

1. On first use, prompt for monthly take-home income and monthly spending limit in CAD.
2. Save those settings locally in the browser.
3. Let the user drag in or select a CSV or a supported PDF statement.
4. Extract transaction date, merchant/description, CAD amount, and any available original-currency details.
5. Suggest a category for each transaction using transparent merchant rules.
6. Show the number of extracted transactions and how many require review.
7. Add confirmed transactions to the transaction list.
8. Recalculate spending, available budget, projected month-end spending, and projected savings rate.
9. Let the user edit each category’s monthly CAD limit and add custom spending categories.
10. Preserve settings, transactions, category limits, and custom categories after a page refresh on the same device.

### MVP acceptance check

- A new user can enter income and spending limits and reach the dashboard.
- The supplied RBC Mastercard statement imports three line items: two purchases and one payment.
- Renaming a PDF does not change detection or extraction; statement contents determine the parser path.
- Institution signatures are covered for RBC, TD, Scotiabank, BMO, CIBC, National Bank, and American Express Canada.
- CSV imports support common date, description, debit, credit, and amount column names.
- CSV imports preserve original amount, original currency, and exchange rate when matching columns exist.
- Imported purchases reduce available spending; card payments are shown as transfers rather than new spending.
- The dashboard forecast changes when transactions or budget settings change.
- Category cards calculate spent amounts from the selected month’s transactions rather than placeholder values.
- A user can edit any category limit and create a custom category with a name and monthly CAD limit.
- Custom categories appear in transaction entry and filtering immediately.
- The Settings action reopens the monthly baseline form.
- Reloading the page retains local data.
- Unsupported PDF layouts return a clear message and do not invent transactions.

## Forecast definition for MVP

Projected month-end spending is calculated as:

`fixed or recurring spending + (flexible spending to date / elapsed days) × days in month`

The UI should label this as an estimate. A later version should improve the model using multiple months, pay cycles, known future bills, seasonality, and user-confirmed recurring transactions.

## Import requirements

### CSV

- Detect common aliases for transaction date, merchant/description, amount, debit, and credit.
- Support quoted values and commas inside quoted merchant names.
- Treat debits as spending and credits as inflows.
- Preserve optional original amount, original currency, and exchange-rate columns.
- Flag unknown merchants as `Other` for review.

### PDF

- Detect the institution and account type from statement contents, never from the filename.
- The initial content adapters recognize RBC, TD, Scotiabank, BMO, CIBC, National Bank, and American Express Canada.
- Support both credit-card transaction/posting-date rows and deposit-account debit/credit/balance tables.
- Use positioned PDF text fragments to distinguish transaction amounts from running balances and unrelated sidebars.
- Require a searchable-text PDF in the MVP. Image-only/scanned statements return an OCR-specific explanation and import nothing.
- Extract only financial fields needed by Pocketwise; do not retain addresses, full card numbers, or unrelated statement text.
- Never silently import totals, credit limits, rewards balances, or minimum payments as transactions.
- Flag unknown merchants, unknown institutions, single-amount-column rows, and other low-confidence results for review.
- Reject unsupported layouts with an actionable explanation instead of inventing transactions.

Public bank guidance establishes a common transaction core but does not guarantee that every historical or future PDF uses the same geometry. The parser therefore combines institution signatures with conservative row/column rules and needs redacted fixtures for layout-specific regression coverage. Research references: [RBC statement guide](https://www.rbcroyalbank.com/credit-cards/cardholders/read-your-credit-card-statement.html), [TD statement guide](https://www.td.com/ca/en/personal-banking/solutions/student-advice/reading-your-credit-card-statement), [Scotiabank Statements Centre](https://www.scotiabank.com/ca/en/personal/bank-your-way/statements-centre.html), [BMO bank statement guide](https://www.bmo.com/en-ca/main/personal/bank-accounts/what-is-a-bank-statement/), [CIBC statement guide](https://www.cibc.com/en/personal-banking/credit-cards/how-to-read-your-credit-card-statement.html), [National Bank statement help](https://www.nbc.ca/personal/help-centre/credit-card/transactions/how-can-i-view-my-credit-card-statement.html), and [American Express Canada statement help](https://www.americanexpress.com/en-ca/customer-service/payments-and-billings/faq.card-statements.html).

## Feature backlog

| Feature | Stage | Notes |
| --- | --- | --- |
| Local budget setup | MVP | Monthly income, spending limit, CAD |
| Local transaction persistence | MVP | Browser-only; no account required |
| Manual transaction entry | MVP | Merchant, amount, category, note |
| CSV statement import | MVP | Flexible common-column mapping |
| Multi-institution PDF import | MVP | Content detection plus conservative card/account row parsers |
| Import review queue | MVP | Confirm categories before reporting |
| Original-currency display | MVP | Only when source data provides it |
| Month-end spending forecast | MVP | Fixed costs plus flexible-spend average |
| Default categories | MVP | Editable limits; spending comes from selected-month transactions |
| Custom categories | MVP | Create and rename locally, assign a colour, and set a monthly limit |
| Category archive/delete | Next | Move affected transactions safely before removing a custom category |
| Recurring transaction controls | Next | Confirm frequency and next expected date |
| Category correction rules | Next | Remember that a merchant belongs to a chosen category |
| Editable/deletable transactions | Next | Include duplicate detection and undo |
| Additional layout fixtures | Next | Add real redacted bank/account variants and regression tests |
| OCR for scanned statements | Next | Local-first OCR with a review gate; never infer missing amounts |
| CSV column-mapping screen | Next | User can correct unfamiliar headers before import |
| Saved user account | Future | Authentication and encrypted durable storage |
| Cross-device sync | Future | User-controlled backup and restore |
| File history | Future | Track source statement, import date, and duplicate status |
| Advanced forecasting | Future | Multiple months, seasonality, pay cycles, and known bills |
| Multi-currency budgets | Future | Base-currency selection and historical FX handling |
| Bank connections | Future | Optional and explicitly consented; not required for core use |
| Goals and sinking funds | Future | Emergency fund, travel, debt payoff, and large purchases |
| Alerts | Future | Overspending, unusual activity, upcoming bills, low cash buffer |
| Export | Future | CSV, PDF summary, and portable backup |
| Shared household budget | Future | Roles, shared categories, and private transactions |

## Durable-storage direction

When Pocketwise moves beyond device-local use, structured records should be stored in an account-backed database and uploaded statement files in encrypted object storage. Users should be able to export and delete their complete data. The application should retain only the minimum fields required for budgeting and should never store full payment-card numbers.

## Open product questions

- Should credit-card payments be hidden from spending reports by default or shown in a separate Transfers category?
- Should the monthly spending limit include fixed costs such as rent, or represent flexible spending only?
- How should refunds be linked to the original purchase?
- Should income be entered only as a monthly baseline, imported as transactions, or both?
- What review confidence threshold should allow automatic categorization?
- Which redacted statement variants from each supported institution should become regression fixtures next?

## Change log

- 2026-08-19: Established CAD-first MVP, local persistence, user-set income and spending limit, supplied RBC PDF test case, original-currency preservation, forecast method, default categories, and custom-category backlog.
- 2026-08-19: Replaced filename-specific RBC import with searchable-PDF content detection for seven Canadian institutions, coordinate-aware card/deposit parsing, low-confidence warnings, and an OCR backlog item.
- 2026-08-19: Added locally persisted editable category limits, transaction-derived category spending, and custom categories shared by planning, entry, and filtering.
