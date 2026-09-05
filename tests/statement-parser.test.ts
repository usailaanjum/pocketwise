import assert from "node:assert/strict";
import test from "node:test";

import { parseStatementLines, supportedInstitutions } from "../lib/statement-parser/core.ts";
import type { StatementLine, TextFragment } from "../lib/statement-parser/core.ts";

function line(text: string, y: number, items?: TextFragment[], page = 1): StatementLine {
  return {
    text,
    page,
    y,
    items: items ?? [{ text, x: 20, width: text.length * 4 }],
  };
}

const institutionHeaders = [
  ["rbc", "RBC Royal Bank Credit Card Statement"],
  ["td", "TD Canada Trust Credit Card Statement"],
  ["scotiabank", "Scotiabank Credit Card Statement"],
  ["bmo", "BMO Bank of Montreal Credit Card Statement"],
  ["cibc", "Canadian Imperial Bank of Commerce Credit Card Statement"],
  ["national-bank", "National Bank of Canada Credit Card Statement"],
  ["amex", "American Express Canada Credit Card Statement"],
] as const;

test("exposes the seven initial Canadian institution adapters", () => {
  assert.deepEqual(
    supportedInstitutions.map((institution) => institution.id),
    institutionHeaders.map(([id]) => id),
  );
});

for (const [institutionId, header] of institutionHeaders) {
  test(`detects ${institutionId} from statement content, independent of filename`, () => {
    const result = parseStatementLines([
      line(`${header} Statement Date January 12, 2026`, 760),
      line("TRANSACTION POSTING DESCRIPTION AMOUNT", 720),
      line("DEC 24 DEC 29 SAMPLE MARKET $12.34", 680),
      line("DEC 30 DEC 30 PAYMENT - THANK YOU -$9.58", 660),
    ], "anything-at-all.pdf");

    assert.equal(result.institutionId, institutionId);
    assert.equal(result.accountKind, "credit-card");
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].amountCad, -12.34);
    assert.equal(result.transactions[1].amountCad, 9.58);
    assert.equal(result.transactions[0].transactionDate, "2025-12-24");
  });
}

test("preserves original currency details when the statement supplies them", () => {
  const result = parseStatementLines([
    line("American Express Canada Credit Card Statement January 31, 2026", 760),
    line("JAN 02 JAN 03 FOREIGN SHOP $13.50", 700),
    line("10.00 USD EXCHANGE RATE 1.3500", 688),
  ]);

  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].originalCurrency, "USD");
  assert.equal(result.transactions[0].originalAmount, 10);
  assert.equal(result.transactions[0].exchangeRate, 1.35);
});

test("uses positioned debit and credit columns and carries a deposit-account date", () => {
  const headerItems: TextFragment[] = [
    { text: "Date", x: 20, width: 30 },
    { text: "Description", x: 90, width: 80 },
    { text: "Withdrawals ($)", x: 390, width: 80 },
    { text: "Deposits ($)", x: 490, width: 70 },
    { text: "Balance ($)", x: 590, width: 70 },
  ];
  const result = parseStatementLines([
    line("RBC Royal Bank Chequing Account January 2, 2026", 780),
    line("Details of your account activity", 740),
    line("Date Description Withdrawals ($) Deposits ($) Balance ($)", 720, headerItems),
    line("5 Dec Payroll deposit", 690, [
      { text: "5 Dec", x: 20, width: 35 },
      { text: "Payroll deposit", x: 90, width: 100 },
    ]),
    line("Employer reference 1,000.00 2,000.00", 678, [
      { text: "Employer reference", x: 100, width: 110 },
      { text: "1,000.00", x: 500, width: 50 },
      { text: "2,000.00", x: 600, width: 50 },
    ]),
    line("CIBC MASTERCARD 125.00 1,875.00", 660, [
      { text: "CIBC MASTERCARD", x: 90, width: 120 },
      { text: "125.00", x: 405, width: 50 },
      { text: "1,875.00", x: 600, width: 50 },
    ]),
    line("Closing Balance 1,875.00", 630),
  ], "renamed.pdf");

  assert.equal(result.institutionId, "rbc");
  assert.equal(result.accountKind, "deposit-account");
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions.map((transaction) => transaction.amountCad), [1000, -125]);
  assert.deepEqual(result.transactions.map((transaction) => transaction.transactionDate), ["2025-12-05", "2025-12-05"]);
});

test("fails visibly instead of inventing transactions", () => {
  const result = parseStatementLines([
    line("Unfamiliar Financial Company Statement January 31, 2026", 700),
    line("This layout contains no supported transaction table", 680),
  ], "mystery.pdf");

  assert.equal(result.institutionId, "unknown");
  assert.equal(result.transactions.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("could not be identified")));
  assert.ok(result.warnings.some((warning) => warning.includes("No transaction rows")));
});
