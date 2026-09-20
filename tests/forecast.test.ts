import assert from "node:assert/strict";
import test from "node:test";
import { calculateSpendingForecast } from "../lib/forecast.ts";

test("projects only flexible spending while keeping recorded fixed costs", () => {
  const forecast = calculateSpendingForecast([
    { amount: -1000, category: "Housing" },
    { amount: -300, category: "Groceries" },
    { amount: -500, category: "Payments & transfers" },
  ], "September 2026", 3000, new Date(2026, 8, 15));
  assert.equal(forecast.spent, 1300);
  assert.equal(forecast.fixedSpending, 1000);
  assert.equal(forecast.flexibleSpending, 300);
  assert.equal(forecast.projectedTotal, 1600);
  assert.equal(forecast.projectedSavings, 1400);
});

test("a past month displays recorded spending without extending its daily pace", () => {
  const forecast = calculateSpendingForecast([{ amount: -450, category: "Groceries" }], "August 2026", 2000, new Date(2026, 8, 15));
  assert.equal(forecast.elapsedDays, 31);
  assert.equal(forecast.projectedTotal, 450);
});
