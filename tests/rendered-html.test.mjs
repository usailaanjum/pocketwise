import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Pocketwise dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Pocketwise[^<]*<\/title>/i);
  assert.match(html, /pocketwise/i);
  assert.match(html, /Here[^<]*your money story/i);
  assert.match(html, /Import statement/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("keeps the MVP workflow and local-storage contract in source", async () => {
  const [page, layout, packageJson, prd] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCT_REQUIREMENTS.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /monthlyIncome/);
  assert.match(page, /spendingLimit/);
  assert.match(page, /originalCurrency/);
  assert.match(page, /parsePdfStatement/);
  assert.match(page, /The file name does not matter/);
  assert.doesNotMatch(page, /lowerName\.includes\("mastercard"\)/);
  assert.match(page, /Projected month-end/);
  assert.match(page, /Add custom category/);
  assert.match(page, /pocketwise\.categories\.v1/);
  assert.match(page, /Edit category limit/);
  assert.match(layout, /Pocketwise/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(prd, /## Testable MVP workflow/);
  assert.match(prd, /Custom categories/);
});
