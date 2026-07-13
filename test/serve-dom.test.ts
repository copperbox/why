// DOM-level smoke test for the SPA's story panel (issue 502): render the
// panel from fixture story JSON in jsdom — no browser — and assert the two
// things the UI must never lose: the hedge prefix arrives verbatim from
// renderedRationale, and an expired-constraint warning is visually loud in
// the DOM (EXPIRED badge + downstream scar-tissue line). The fixture story is
// real engine output (buildBlameReport over a throwaway bundle), validated
// against the story schema, so this test cannot drift from the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { JSDOM } from "jsdom";
import { renderStoryPanel } from "../ui/story-panel.js";
import { buildAnchorIndex } from "../src/anchors.ts";
import { buildBlameReport } from "../src/blame.ts";
import { loadBundle } from "../src/bundle.ts";
import { makeBundle } from "./helpers.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

const concept = (lines: string[]) => lines.join("\n");

/** An inferred decision (must hedge) plus an expired constraint whose led-to
 * edge makes the decision candidate scar tissue. */
const FIXTURE = {
  "decisions/hunch.md": concept([
    "---",
    "type: decision",
    "title: Hunch",
    "description: The cache is sized to fit one shard.",
    "why:",
    "  status: active",
    "  happened_on: 2024-02-01",
    "  confidence: inferred",
    "  anchors:",
    "    - path: src/cache.ts",
    "      lines: 1-10",
    "---",
    "",
    "# Hunch",
    "",
    "# Why",
    "",
    "Body.",
    "",
    "# Citations",
    "",
    "[1] [PR #9: size the cache](https://example.test/pr/9)",
  ]),
  "constraints/one-box.md": concept([
    "---",
    "type: constraint",
    "title: One-box deployment",
    "description: Everything had to fit a single host.",
    "why:",
    "  status: expired",
    "  happened_on: 2023-11-01",
    "  expired_on: 2025-06-30",
    "  confidence: recorded",
    "  verify:",
    "    method: review-by",
    "    review_by: 2027-01-01",
    "---",
    "",
    "# One-box deployment",
    "",
    "# Why",
    "",
    "Body.",
    "",
    "# Led to",
    "",
    "- [Hunch](/decisions/hunch.md)",
  ]),
};

test("story panel: hedge prefix and expired warning survive into the DOM", async () => {
  const bundleRoot = await makeBundle(FIXTURE);
  try {
    const bundle = await loadBundle(bundleRoot);
    const story = buildBlameReport(
      bundle,
      { path: "src/cache.ts", lines: { start: 5, end: 5 } },
      buildAnchorIndex(bundle),
    );

    // The fixture must be a contract-valid story before it may prove anything.
    const ajv = new Ajv2020({ allErrors: true });
    ajv.addKeyword("schemaVersion");
    const validate = ajv.compile(
      JSON.parse(readFileSync(join(root, "schemas/story.schema.json"), "utf8")),
    );
    assert.ok(
      validate(JSON.parse(JSON.stringify(story))),
      `fixture story is not schema-valid:\n${JSON.stringify(validate.errors, null, 2)}`,
    );

    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const panel = renderStoryPanel(doc, story);
    doc.body.append(panel);

    // The hedge is data, displayed verbatim — "likely — " for inferred.
    const rationale = doc.querySelector(".card.type-decision .rationale");
    assert.ok(rationale, "the hit card renders its rationale");
    assert.ok(
      rationale.textContent!.startsWith("likely — "),
      `hedge prefix missing from the DOM: "${rationale.textContent}"`,
    );
    assert.ok(rationale.classList.contains("hedged"), "hedged rationale carries the hedged class");

    // The expired constraint is visually loud: warning card, EXPIRED badge,
    // downstream blast radius as scar tissue.
    const warning = doc.querySelector(".card.expired.warning");
    assert.ok(warning, "the expired constraint renders as a warning card");
    assert.ok(warning.textContent!.includes("One-box deployment"));
    assert.ok(warning.textContent!.includes("EXPIRED 2025-06-30"), warning.textContent!);
    const scar = warning.querySelector(".scar");
    assert.ok(scar, "the downstream blast radius renders");
    assert.equal(scar.textContent, '→ downstream decision "Hunch" may now be scar tissue.');

    // Warnings render before hits, matching the VS Code hover/webview order.
    const hit = doc.querySelector(".card.type-decision")!;
    assert.ok(
      warning.compareDocumentPosition(hit) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      "the expired-constraint warning card precedes the hit card in the DOM",
    );

    // Citations render as real links.
    const citation = doc.querySelector(".card.type-decision .citations a") as HTMLAnchorElement;
    assert.ok(citation, "citations render as links");
    assert.equal(citation.textContent, "PR #9: size the cache");
    assert.equal(citation.href, "https://example.test/pr/9");
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("story panel: an uncovered target renders the nearby fallback, never empty", async () => {
  const bundleRoot = await makeBundle(FIXTURE);
  try {
    const bundle = await loadBundle(bundleRoot);
    const story = buildBlameReport(
      bundle,
      { path: "does/not/exist.rs" },
      buildAnchorIndex(bundle),
    );
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const panel = renderStoryPanel(dom.window.document, story);
    assert.ok(panel.textContent!.includes("No concepts anchor does/not/exist.rs."));
    assert.ok(panel.querySelector(".nearby-item"), "nearby anchored concepts are listed");
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});
