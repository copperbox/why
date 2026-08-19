import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { loadBundle } from "../src/bundle.ts";
import { buildReviewReport, renderReviewReport } from "../src/review.ts";
import { git, makeRepo, write } from "./helpers.ts";

test("review is one queue for owned drafts, overdue questions, and maintenance", async () => {
  const repo = await makeRepo("why-review-");
  try {
    await mkdir(`${repo}/.why/.drafts`, { recursive: true });
    await write(repo, ".why/index.md", "---\nokf_version: '0.1'\n---\n");
    await write(repo, ".why/.drafts/pr-7.md", `---
type: decision
title: Captured choice
why:
  status: active
  owner: '@jane'
  captured_on: 2026-07-01
  review_by: 2026-07-15
---

# Captured choice

# Why

Because.
`);
    await write(repo, ".why/questions/open.md", `---
type: question
title: Who owns this?
why:
  status: open
  happened_on: 2026-07-10
  review_by: 2026-09-01
---

# Who owns this?
`);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "queue");
    const report = await buildReviewReport(await loadBundle(`${repo}/.why`), new Date("2026-08-01T12:00:00Z"));
    assert.equal(report.total, 2);
    assert.equal(report.overdue, 1);
    assert.equal(report.unassigned, 1);
    assert.deepEqual(report.drafts[0], {
      id: "pr-7.md",
      title: "Captured choice",
      kind: "draft",
      owner: "@jane",
      captured_on: "2026-07-01",
      review_by: "2026-07-15",
      age_days: 31,
      overdue: true,
    });
    const text = renderReviewReport(report).join("\n");
    assert.match(text, /OVERDUE · @jane · 31d old/);
    assert.match(text, /unassigned/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
