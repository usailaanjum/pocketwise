import assert from "node:assert/strict";
import test from "node:test";

import { availableMonths, localDateInput, monthLabel } from "../lib/calendar.ts";

test("uses local calendar dates for new transactions", () => {
  const date = new Date(2026, 8, 17, 23, 30);
  assert.equal(localDateInput(date), "2026-09-17");
  assert.equal(monthLabel(date), "September 2026");
});

test("month picker includes the current, selected, and imported months in order", () => {
  const months = availableMonths(new Date(2026, 8, 17), "March 2024", ["January 2027", "July 2026", "January 2027"]);
  assert.equal(months[0], "January 2027");
  assert.ok(months.includes("September 2026"));
  assert.ok(months.includes("March 2024"));
  assert.equal(months.filter((month) => month === "January 2027").length, 1);
});
