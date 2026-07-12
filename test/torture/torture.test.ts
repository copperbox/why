// Anchor torture test (issue: replay a real history, measure survival).
// The synthetic scenario replays nine scripted refactor classes commit by
// commit through the real `why anchor` command; the gate is zero WRONG —
// no anchor may end the replay live but pointing at the wrong code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, renderReport, runTorture, type TortureResult } from "./harness.ts";
import { buildSyntheticScenario } from "./synthetic.ts";

test("synthetic scenario: nine refactor classes replay with zero WRONG anchors", async () => {
  const scenario = await buildSyntheticScenario();
  const result = await runTorture(scenario);
  const report = renderReport(result);

  assert.ok(result.stats, "ground truth was supplied, so stats must be judged");
  assert.equal(result.stats.total, 9);
  assert.equal(result.stats.wrong, 0, `silently-wrong anchors:\n${report}`);
  const honest = (result.stats.correct + result.stats.lost) / result.stats.total;
  assert.ok(honest >= 0.9, `survival gate (>90% correct-or-honestly-lost) missed:\n${report}`);

  const journeys = new Map(result.journeys.map((j) => [j.seed.id, j]));
  const verdictOf = (id: string) => journeys.get(id)?.verdict;

  // Classes the resolver must survive outright.
  for (const id of ["control", "rename", "move", "shift", "rewrite", "revert"]) {
    assert.equal(verdictOf(id), "correct", `${id} should resolve correctly:\n${report}`);
  }
  // Classes where the code is truly gone: lost is the correct answer.
  for (const id of ["inline", "delete"]) {
    assert.equal(verdictOf(id), "correct", `${id} should honestly report lost:\n${report}`);
  }
  // A split may honestly lose the trail (the file the symbol landed in is not
  // git-rename-connected); it must never claim a wrong location.
  assert.notEqual(verdictOf("split-file"), "WRONG", report);

  // Moved anchors followed their files; shifted/rewritten anchors re-lined.
  assert.equal(journeys.get("rename")!.final.path, "src/renamed.rs");
  assert.equal(journeys.get("rename")!.final.lines, "3-6");
  assert.equal(journeys.get("move")!.final.path, "src/deep/nested/move.rs");
  assert.equal(journeys.get("shift")!.final.lines, "5-6");
  assert.equal(journeys.get("rewrite")!.final.lines, "3-9");

  // The revert class dips to lost mid-history and recovers to live.
  const revert = journeys.get("revert")!;
  assert.ok(revert.steps.some((s) => s.state === "lost"), "revert never went lost mid-replay");
  assert.equal(revert.final.state ?? "live", "live");

  // Every journey has one step per replayed commit — nothing skipped.
  assert.ok(result.steps >= 9, `expected at least one commit per refactor class, got ${result.steps}`);
  for (const journey of result.journeys) {
    assert.equal(journey.steps.length, result.steps, `${journey.seed.id} journey incomplete`);
  }
});

test("judge: live-and-right is correct, lost is honest, live-and-wrong is WRONG", () => {
  const at = (path: string, lines?: string, state?: "live" | "lost") =>
    ({ path, lines, state }) as const;
  const span = (path: string, lines?: string) => ({ kind: "span", path, lines }) as const;
  const lost = { kind: "lost" } as const;

  assert.equal(judge(at("src/a.rs", "3-5", "live"), span("src/a.rs", "3-5")), "correct");
  assert.equal(judge(at("src/a.rs", "3-5"), span("src/a.rs", "3-5")), "correct"); // state defaults live
  assert.equal(judge(at("src/a.rs", undefined, "live"), span("src/a.rs")), "correct"); // whole-file
  assert.equal(judge(at("src/a.rs", "3-5", "lost"), lost), "correct"); // gone code reported gone

  assert.equal(judge(at("src/a.rs", "3-5", "lost"), span("src/b.rs", "9-12")), "honestly-lost");

  assert.equal(judge(at("src/a.rs", "4-6", "live"), span("src/a.rs", "3-5")), "WRONG"); // wrong lines
  assert.equal(judge(at("src/b.rs", "3-5", "live"), span("src/a.rs", "3-5")), "WRONG"); // wrong file
  assert.equal(judge(at("src/a.rs", "3-5", "live"), lost), "WRONG"); // claims live code that is gone
});

const fakeResult: TortureResult = {
  repo: "/tmp/fake-repo",
  startRef: "aaa1111",
  head: "ccc3333",
  steps: 2,
  journeys: [
    {
      seed: { id: "good", path: "src/a.rs", symbol: "alpha", lines: "3-5" },
      steps: [
        { commit: "bbb2222", subject: "touch | pipe in subject", path: "src/a.rs", lines: "3-5", state: "live", changed: false },
        { commit: "ccc3333", subject: "shift alpha down", path: "src/a.rs", lines: "4-6", state: "live", changed: true },
      ],
      final: { path: "src/a.rs", symbol: "alpha", lines: "4-6", as_of: "ccc3333", state: "live" },
      expected: { kind: "span", path: "src/a.rs", lines: "4-6" },
      verdict: "correct",
    },
    {
      seed: { id: "bad", path: "src/b.rs", lines: "1-2" },
      steps: [
        { commit: "bbb2222", subject: "touch | pipe in subject", path: "src/b.rs", lines: "1-2", state: "live", changed: false },
        { commit: "ccc3333", subject: "shift alpha down", path: "src/b.rs", lines: "8-9", state: "live", changed: true },
      ],
      final: { path: "src/b.rs", lines: "8-9", as_of: "ccc3333", state: "live" },
      expected: { kind: "span", path: "src/other.rs", lines: "1-2" },
      verdict: "WRONG",
    },
  ],
  stats: { correct: 1, lost: 0, wrong: 1, total: 2 },
};

test("report structure: header, survival stats, failure list, one journey per anchor", () => {
  const report = renderReport(fakeResult);
  const lines = report.split("\n");

  assert.equal(lines[0], "# Anchor torture report");
  assert.ok(lines.includes("## Survival"));
  assert.ok(report.includes("1 correct · 0 honestly lost · 1 WRONG"), report);
  assert.ok(lines.includes("## Failures"));
  assert.ok(lines.some((l) => l.startsWith("- **bad**")), "WRONG anchor not listed under Failures");
  assert.ok(lines.includes("## Journeys"));
  assert.ok(lines.includes("### good — correct"));
  assert.ok(lines.includes("### bad — WRONG"));

  // One table row per (anchor, replayed commit): 2 journeys × 2 steps.
  const rows = lines.filter((l) => l.startsWith("| `"));
  assert.equal(rows.length, 4, report);
  // Pipes in commit subjects must not break table structure.
  assert.ok(report.includes("touch \\| pipe in subject"), "table cell pipes unescaped");
  for (const row of rows) {
    assert.equal(row.split(" | ").length, 4, `malformed row: ${row}`);
  }
});

test("report structure: without ground truth it asks for a spot-audit, no Failures section", () => {
  const unjudged: TortureResult = {
    ...fakeResult,
    journeys: fakeResult.journeys.map((j) => ({ ...j, expected: undefined, verdict: undefined })),
    stats: undefined,
  };
  const report = renderReport(unjudged);
  assert.ok(report.includes("no ground truth"), report);
  assert.ok(report.includes("spot-audit"), report);
  assert.ok(!report.includes("## Failures"), report);
  assert.ok(report.includes("### good"), report);
  assert.ok(!report.includes("undefined"), report);
});
