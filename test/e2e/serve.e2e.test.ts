// Optional slow-tier browser test for `why serve` (issue 502) — excluded from
// `npm run verify` on purpose: the default suite must pass in a sandbox with
// no display, so this file lives behind `npm run test:e2e` and skips itself
// unless playwright is installed:
//
//   npm install --no-save playwright && npx playwright install chromium
//   npm run test:e2e
//
// It drives the real SPA in headless Chromium against the same
// harbor-derived temp repo the endpoint tests use: open a covered file,
// click the covered line, and require the story panel to show the story
// and the loud expired-constraint warning.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { startWhyServer } from "../../src/serve.ts";
import { makeHarborRepo } from "../helpers.ts";

// Resolved at runtime only: playwright is not a dependency (the default suite
// must verify without a browser), so keep the specifier opaque to tsc.
const PLAYWRIGHT = "playwright";
const playwright: any = await import(PLAYWRIGHT).catch(() => undefined);

test(
  "SPA in headless Chromium: blame gutter paints, story panel tells the lock.rs story",
  { skip: playwright === undefined ? "playwright not installed — npm install --no-save playwright && npx playwright install chromium" : false },
  async () => {
    const repo = await makeHarborRepo("why-e2e-");

    // Everything from here on must tear down on any failure — a leaked
    // server or browser keeps the test process alive past the failure.
    let running: Awaited<ReturnType<typeof startWhyServer>> | undefined;
    let browser: any;
    try {
      running = await startWhyServer(join(repo, ".why"));
      browser = await playwright.chromium.launch();
      const page = await browser.newPage();
      await page.goto(`${running.url}#/file/${encodeURIComponent("src/lock.rs")}`);

      // The blame gutter paints the covered span with its glyph.
      await page.waitForSelector("table.code tr.covered");
      const gutter = page.locator("table.code tr").nth(46).locator("td.why");
      assert.equal(await gutter.textContent(), "●");

      // Click line 47 → the story panel tells the queue-based-locking story
      // with the expired Acme warning loud.
      await page.locator("table.code tr").nth(46).click();
      const panel = page.locator(".story-panel");
      await panel.locator(".card").first().waitFor();
      const text = (await panel.textContent()) ?? "";
      assert.ok(text.includes("Queue-based locking"), text);
      assert.ok(text.includes("EXPIRED 2025-06-30"), text);
      assert.ok(text.includes("may now be scar tissue"), text);

      // The graph tab draws on a canvas without console errors.
      const errors: string[] = [];
      page.on("pageerror", (e: unknown) => errors.push(String(e)));
      await page.goto(`${running.url}#/graph`);
      await page.waitForSelector(".graph-view canvas");
      await page.waitForTimeout(300);
      assert.deepEqual(errors, []);
    } finally {
      if (browser) await browser.close();
      if (running) await running.close();
      await rm(repo, { recursive: true, force: true });
    }
  },
);
