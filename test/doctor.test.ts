// `why doctor` (DESIGN.md §4, §8): the read-only health dashboard. A temp
// bundle seeds one of every condition and asserts each section's count and
// severity; examples/harbor pins its by-design yellow findings (expired
// constraint, open question) so the example and the command stay in sync.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import { DIG_STATE_FILENAME, DIG_STATE_VERSION, writeDigState } from "../src/dig-state.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeBundle, makeRepo, write } from "./helpers.ts";

const HARBOR = "examples/harbor";

/** Every section key, in report order — the stable `--json` surface. */
const SECTION_KEYS = [
  "lostAnchors",
  "staleAsOf",
  "reviewByPastDue",
  "unknownConstraints",
  "expiredConstraints",
  "openQuestions",
  "lintErrors",
] as const;

function doc(type: string, title: string, whyLines: string[], bodyLines: string[]): string {
  return [
    "---",
    `type: ${type}`,
    `title: ${title}`,
    "why:",
    ...whyLines.map((l) => `  ${l}`),
    "---",
    "",
    `# ${title}`,
    ...bodyLines.flatMap((l) => ["", l]),
  ].join("\n");
}

const WHY_SECTION = "# Why\n\nBecause reasons.";
const STILL_TRUE = "# Still true?\n\nChecked recently.";

/**
 * A repo two commits deep (so c1 is a real ancestor behind HEAD) whose bundle
 * exhibits one of every doctor condition.
 */
async function seedClinic(): Promise<{ repo: string; whyRoot: string; c1: string; head: string }> {
  const repo = await makeRepo("why-doctor-");
  await write(repo, "src/app.ts", "export const one = 1;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  const c1 = git(repo, "rev-parse", "--short", "HEAD");
  await write(repo, "src/app.ts", "export const one = 1;\nexport const two = 2;\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "advance HEAD past c1");
  const head = git(repo, "rev-parse", "--short", "HEAD");

  const whyRoot = await scaffoldBundle(repo);
  await write(repo, ".why/decisions/lost-anchor.md", doc("decision", "Lost anchor", [
    "status: active",
    "anchors:",
    "  - path: src/gone.rs",
    "    lines: 3-4",
    `    as_of: ${c1}`,
    "    state: lost",
  ], [WHY_SECTION]));
  await write(repo, ".why/decisions/stale-anchor.md", doc("decision", "Stale anchor", [
    "status: active",
    "anchors:",
    "  - path: src/app.ts",
    "    lines: 1",
    `    as_of: ${c1}`,
    "    state: live",
  ], [WHY_SECTION]));
  await write(repo, ".why/constraints/review-overdue.md", doc("constraint", "Review overdue", [
    "status: active",
    "verify:",
    "  method: review-by",
    "  review_by: 2001-01-02",
  ], [STILL_TRUE]));
  await write(repo, ".why/constraints/status-unknown.md", doc("constraint", "Status unknown", [
    "status: unknown",
  ], [STILL_TRUE]));
  await write(repo, ".why/constraints/expired.md", doc("constraint", "Expired", [
    "status: expired",
    "expired_on: 2025-06-30",
  ], [STILL_TRUE]));
  await write(repo, ".why/questions/newer-question.md", doc("question", "Newer question", [
    "status: open",
    "happened_on: 2025-02-03",
  ], []));
  await write(repo, ".why/questions/older-question.md", doc("question", "Older question", [
    "status: open",
    "happened_on: 2024-01-05",
  ], []));
  // The lint-error condition: a decision without its `# Why` section (W200).
  await write(repo, ".why/decisions/lint-error.md", doc("decision", "Lint error", [
    "status: active",
  ], []));
  return { repo, whyRoot, c1, head };
}

async function doctorJson(bundle: string, cwd: string) {
  const { io, out, err } = capture();
  const code = await main(["doctor", "--bundle", bundle, "--json"], cwd, io);
  return { code, report: JSON.parse(out.join("\n")), err };
}

test("temp bundle: every section appears with the right count and severity, exit 1 on red", async () => {
  const { repo, whyRoot, c1, head } = await seedClinic();
  try {
    const { code, report } = await doctorJson(whyRoot, repo);
    assert.equal(code, 1, "a red finding (lost anchor, lint error) must exit 1");

    // The stable schema: top-level keys and section keys, in order.
    assert.deepEqual(Object.keys(report), [
      "root", "head", "digState", "concepts", "healthy", "red", "yellow", "sections",
    ]);
    assert.equal(report.digState.status, "none", "clinic repo has never been dug");
    assert.deepEqual(Object.keys(report.sections), [...SECTION_KEYS]);
    for (const key of SECTION_KEYS) {
      const section = report.sections[key];
      assert.equal(section.count, section.items.length, `${key} count matches items`);
      assert.ok(["red", "yellow"].includes(section.severity), `${key} severity`);
    }

    assert.equal(report.head, head);
    assert.equal(report.concepts, 8);
    assert.equal(report.healthy, false);
    assert.equal(report.red, 2);
    assert.equal(report.yellow, 6);

    const s = report.sections;
    assert.equal(s.lostAnchors.severity, "red");
    assert.deepEqual(s.lostAnchors.items, [
      { concept: "decisions/lost-anchor", path: "src/gone.rs", lines: "3-4", as_of: c1 },
    ]);
    assert.equal(s.staleAsOf.severity, "yellow");
    assert.deepEqual(s.staleAsOf.items, [
      { concept: "decisions/stale-anchor", path: "src/app.ts", lines: "1", as_of: c1, reason: "behind-head" },
    ]);
    assert.equal(s.reviewByPastDue.severity, "yellow");
    assert.deepEqual(s.reviewByPastDue.items, [
      { concept: "constraints/review-overdue", review_by: "2001-01-02" },
    ]);
    assert.equal(s.unknownConstraints.severity, "yellow");
    assert.deepEqual(s.unknownConstraints.items, [{ concept: "constraints/status-unknown" }]);
    assert.equal(s.expiredConstraints.severity, "yellow");
    assert.deepEqual(s.expiredConstraints.items, [
      { concept: "constraints/expired", expired_on: "2025-06-30" },
    ]);
    assert.equal(s.openQuestions.severity, "yellow");
    assert.deepEqual(s.openQuestions.items, [
      { concept: "questions/older-question", happened_on: "2024-01-05" },
      { concept: "questions/newer-question", happened_on: "2025-02-03" },
    ], "open questions sort oldest first");
    assert.equal(s.lintErrors.severity, "red");
    assert.equal(s.lintErrors.count, 1);
    assert.equal(s.lintErrors.items[0].rule, "W200");
    assert.equal(s.lintErrors.items[0].file, "decisions/lint-error.md");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("human output names every section with its count, and doctor stays read-only", async () => {
  const { repo, whyRoot, c1 } = await seedClinic();
  try {
    const listing = git(repo, "status", "--porcelain");
    const { io, out } = capture();
    const code = await main(["doctor", "--bundle", whyRoot], repo, io);
    assert.equal(code, 1);
    const text = out.join("\n");
    assert.ok(/red\s+lost anchors\s+1$/m.test(text), text);
    assert.ok(text.includes(`decisions/lost-anchor  src/gone.rs:3-4 (last known, as_of ${c1})`), text);
    assert.ok(/yellow\s+stale as_of\s+1$/m.test(text), text);
    assert.ok(/yellow\s+review-by past due\s+1$/m.test(text), text);
    assert.ok(/yellow\s+constraints with status unknown\s+1$/m.test(text), text);
    assert.ok(/yellow\s+expired constraints\s+1$/m.test(text), text);
    assert.ok(/yellow\s+open questions\s+2$/m.test(text), text);
    assert.ok(/red\s+lint errors\s+1$/m.test(text), text);
    assert.ok(text.includes("8 findings (2 red, 6 yellow) — unhealthy"), text);
    assert.equal(git(repo, "status", "--porcelain"), listing, "doctor must write nothing");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("doctor reports dig-state freshness: commits since last dig, one line", async () => {
  const { repo, whyRoot, c1 } = await seedClinic();
  try {
    const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD");

    // Never dug: the line says so instead of silently showing nothing.
    const none = capture();
    await main(["doctor", "--bundle", whyRoot], repo, none.io);
    assert.ok(
      none.out.join("\n").includes(`dig state: none — branch ${branch} has never been dug`),
      none.out.join("\n"),
    );

    // Mark one commit behind HEAD (c1 is the clinic's first of two commits).
    const c1Full = git(repo, "rev-parse", c1);
    await writeDigState(whyRoot, {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: c1Full } },
    });
    const behind = await doctorJson(whyRoot, repo);
    assert.deepEqual(behind.report.digState, {
      status: "ok",
      branch,
      lastProcessed: c1Full,
      commitsSince: 1,
    });
    assert.equal(behind.report.red, 2, "dig-state freshness is informational, not a finding");
    const human = capture();
    await main(["doctor", "--bundle", whyRoot], repo, human.io);
    assert.ok(
      human.out.join("\n").includes(`dig state: 1 commit since last dig on ${branch}`),
      human.out.join("\n"),
    );

    // Mark at HEAD: zero commits since.
    const head = git(repo, "rev-parse", "HEAD");
    await writeDigState(whyRoot, {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: head } },
    });
    const fresh = await doctorJson(whyRoot, repo);
    assert.equal(fresh.report.digState.commitsSince, 0);

    // An unreadable state file reports invalid, loudly — doctor never throws.
    await writeFile(join(whyRoot, DIG_STATE_FILENAME), "not json {", "utf8");
    const invalid = await doctorJson(whyRoot, repo);
    assert.equal(invalid.report.digState.status, "invalid");
    const invalidHuman = capture();
    await main(["doctor", "--bundle", whyRoot], repo, invalidHuman.io);
    assert.ok(invalidHuman.out.join("\n").includes("dig state: invalid"), invalidHuman.out.join("\n"));

    // A mark the repository cannot resolve is invalid too, never a guess.
    await writeDigState(whyRoot, {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: "0123456789abcdef0123456789abcdef01234567" } },
    });
    const orphan = await doctorJson(whyRoot, repo);
    assert.equal(orphan.report.digState.status, "invalid");
    assert.ok(orphan.report.digState.detail.includes("does not resolve"), orphan.report.digState.detail);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("harbor: yellow for its by-design expired constraint and open question, exit 0", async () => {
  const { code, report } = await doctorJson(HARBOR, process.cwd());
  assert.equal(code, 0, "yellow-only findings are healthy — exit 0");
  assert.equal(report.healthy, true);
  assert.equal(report.red, 0);

  const s = report.sections;
  assert.equal(s.lostAnchors.count, 0);
  assert.equal(s.lintErrors.count, 0);
  assert.equal(s.expiredConstraints.severity, "yellow");
  assert.deepEqual(s.expiredConstraints.items, [
    { concept: "constraints/acme-45s-timeout", expired_on: "2025-06-30" },
  ]);
  assert.equal(s.openQuestions.severity, "yellow");
  assert.deepEqual(s.openQuestions.items, [
    { concept: "questions/why-retry-jitter-disabled", happened_on: "2024-06-02" },
  ]);
  // Harbor's anchors cite commits of the fictional harbor repo; against this
  // repository those as_of claims cannot be verified, and doctor says so.
  assert.equal(s.staleAsOf.count, 6);
  assert.ok(s.staleAsOf.items.every((i: { reason: string }) => i.reason === "unresolved"));
  assert.equal(typeof report.head, "string");
});

test("a bundle outside any git repo skips the as_of check loudly, not silently", async () => {
  const root = await makeBundle({
    "questions/open.md": doc("question", "Open", ["status: open", "happened_on: 2024-06-02"], []),
  });
  try {
    const { code, report } = await doctorJson(root, process.cwd());
    assert.equal(code, 0);
    assert.equal(report.head, null);
    assert.equal(report.sections.staleAsOf.count, 0);
    assert.equal(typeof report.sections.staleAsOf.skipped, "string");
    assert.deepEqual(report.digState, { status: "none" });

    // With a state file but no repo, freshness is unknowable — said out loud.
    await writeDigState(root, { version: DIG_STATE_VERSION, branches: { main: { lastProcessed: "abc" } } });
    const rerun = await doctorJson(root, process.cwd());
    assert.equal(rerun.report.digState.status, "unavailable");
    assert.equal(typeof rerun.report.digState.detail, "string");

    const { io, out } = capture();
    await main(["doctor", "--bundle", root], process.cwd(), io);
    assert.ok(out.join("\n").includes("not checked"), out.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor takes no positional arguments", async () => {
  const { io, err } = capture();
  assert.equal(await main(["doctor", "--bundle", HARBOR, "extra"], process.cwd(), io), 2);
  assert.ok(err.join("\n").includes("no positional"), err.join("\n"));
});
