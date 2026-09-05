import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCategorySpending,
  createDefaultCategories,
  isBudgetCategory,
} from "../lib/budget-categories.ts";

test("default category limits allocate the full user spending plan", () => {
  const categories = createDefaultCategories(4321.25);
  assert.equal(categories.length, 9);
  const allocated = Math.round(categories.reduce((total, category) => total + category.limit, 0) * 100) / 100;
  assert.equal(allocated, 4321.25);
  assert.ok(categories.every((category) => !category.custom));
});

test("category spending comes from expenses and sends unknown expenses to Other", () => {
  const categories = createDefaultCategories(3200);
  const spending = calculateCategorySpending(categories, [
    { category: "Groceries", amount: -82.4 },
    { category: "Groceries", amount: -17.6 },
    { category: "Income", amount: 2400 },
    { category: "Unmapped category", amount: -25 },
  ]);

  assert.equal(spending.Groceries, 100);
  assert.equal(spending.Other, 25);
  assert.equal(Object.values(spending).reduce((total, amount) => total + amount, 0), 125);
});

test("recognizes a persisted custom category", () => {
  assert.equal(isBudgetCategory({
    id: "custom-travel",
    name: "Travel",
    limit: 350,
    color: "#7f9cf5",
    icon: "T",
    custom: true,
  }), true);
});
