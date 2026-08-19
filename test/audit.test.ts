// `why audit` (DESIGN.md §5): constraint re-verification and the scar-tissue
// report. Temp bundles cover the flip machinery (passing/failing checks,
// blast radius, question dedupe, ask export/answers, review-by, timeouts);
// examples/harbor pins that an already-expired constraint is never
// double-flagged but its downstream candidacy stays visible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundle } from "../src/bundle.ts";
import { auditBundle, parseAnswers, renderQuestionnaire } from "../src/audit.ts";
import { main } from "../src/cli.ts";
import { capture, git, write } from "./helpers.ts";

const HARBOR = "examples/harbor";

/** Every top-level report key, in order — the stable `--json` surface. */
const REPORT_KEYS = [
  "root",
  "activeConstraints",
  "checks",
  "asks",
  "reviewByPastDue",
  "unverifiable",
  "expired",
  "alreadyExpired",
  "questionsWritten",
  "questionnaire",
] as const;

function doc(type: string, title: string, whyLines: string[], bodyLines: string[]): string {
  return [
    "---",
    `type: ${type}`,
    `title: ${title}`,
    "timestamp: 2026-07-11",
    "why:",
    ...whyLines.map((l) => `  ${l}`),
    "---",
    "",
    `# ${title}`,
    ...bodyLines.flatMap((l) => ["", l]),
    "",
  ].join("\n");
}

const STILL_TRUE = "# Still true?\n\nLast confirmed manually.";

/**
 * A temp "repo" dir (plain directory — audit needs no git) holding a `.why/`
 * bundle, so check commands run with a controlled cwd.
 */
async function makeClinic(files: Record<string, string>): Promise<{ dir: string; bundle: string }> {
  const dir = await mkdtemp(join(tmpdir(), "why-audit-"));
  for (const [rel, source] of Object.entries(files)) {
    await write(dir, join(".why", rel), source);
  }
  return { dir, bundle: join(dir, ".why") };
}

async function auditJson(bundle: string, cwd: string, ...extra: string[]) {
  const { io, out, err } = capture();
  const code = await main(["audit", "--bundle", bundle, "--json", ...extra], cwd, io);
  return { code, report: JSON.parse(out.join("\n")), err };
}

test("passing check: no change, byte-identical file, exit 0, stable JSON keys", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/dep-pin.md": doc("constraint", "Dep pin", [
      "status: active",
      "verify:",
      "  method: check",
      '  check: "echo still pinned"',
    ], [STILL_TRUE]),
  });
  try {
    const before = await readFile(join(bundle, "constraints/dep-pin.md"), "utf8");
    const { code, report } = await auditJson(bundle, dir);
    assert.equal(code, 0);
    assert.deepEqual(Object.keys(report), [...REPORT_KEYS]);
    assert.equal(report.activeConstraints, 1);
    assert.deepEqual(report.checks, [
      {
        concept: "constraints/dep-pin",
        command: "echo still pinned",
        outcome: "passed",
        exitCode: 0,
        output: "still pinned",
      },
    ]);
    assert.deepEqual(report.expired, []);
    assert.deepEqual(report.questionsWritten, []);
    const after = await readFile(join(bundle, "constraints/dep-pin.md"), "utf8");
    assert.equal(after, before, "an audited-but-unchanged concept must be untouched");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failing check: flip + evidence + blast radius (transitive) + questions, then a clean re-run", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/acme-cap.md": doc("constraint", "Acme cap", [
      "status: active",
      "happened_on: 2024-01-08",
      "verify:",
      "  method: check",
      '  check: "echo the contract is gone >&2; exit 3"',
    ], [STILL_TRUE, "# Notes\n\nHands off this section."]),
    "decisions/deadline.md": doc("decision", "Deadline", [
      "status: active",
    ], ["# Why\n\nBecause of the cap.", "# Because of\n\n- [Acme cap](/constraints/acme-cap.md)"]),
    // Reached transitively: retries ← deadline ← constraint.
    "decisions/retries.md": doc("decision", "Retries", [
      "status: active",
    ], ["# Why\n\nBecause of the deadline.", "# Because of\n\n- [Deadline](/decisions/deadline.md)"]),
    // Superseded — reached by the walk but not active, so no line, no question.
    "decisions/old-timeout.md": doc("decision", "Old timeout", [
      "status: superseded",
    ], ["# Why\n\nGone.", "# Because of\n\n- [Acme cap](/constraints/acme-cap.md)", "# Superseded by\n\n- [Deadline](/decisions/deadline.md)"]),
  });
  try {
    const decisionBefore = await readFile(join(bundle, "decisions/deadline.md"), "utf8");
    const { code, report } = await auditJson(bundle, dir);
    assert.equal(code, 1, "an expiry is the CI signal — exit 1");

    assert.equal(report.checks[0].outcome, "failed");
    assert.equal(report.checks[0].exitCode, 3);
    assert.equal(report.checks[0].output, "the contract is gone");
    assert.equal(report.expired.length, 1);
    const expired = report.expired[0];
    assert.equal(expired.concept, "constraints/acme-cap");
    assert.equal(expired.method, "check");
    assert.match(expired.expired_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(
      expired.blastRadius.map((b: { decision: string; written: boolean }) => [b.decision, b.written]),
      [["decisions/deadline", true], ["decisions/retries", true]],
      "active decisions only, transitive, sorted",
    );

    // The constraint file: frontmatter flipped, evidence appended to
    // `# Still true?`, every other section untouched.
    const flipped = await readFile(join(bundle, "constraints/acme-cap.md"), "utf8");
    assert.match(flipped, /status: expired/);
    assert.match(flipped, new RegExp(`expired_on: ${expired.expired_on}`));
    assert.match(flipped, /happened_on: 2024-01-08/, "unrelated frontmatter survives");
    assert.ok(flipped.includes("Last confirmed manually."), "prior Still true? content survives");
    assert.ok(flipped.includes("the verify check failed (exit 3)"), flipped);
    assert.ok(flipped.includes("$ echo the contract is gone >&2; exit 3"), "evidence names the command");
    assert.ok(flipped.includes("the contract is gone"), "evidence carries the output");
    assert.ok(flipped.includes("# Notes\n\nHands off this section."), "other sections byte-identical");

    // Untouched downstream decision file: byte preservation.
    assert.equal(await readFile(join(bundle, "decisions/deadline.md"), "utf8"), decisionBefore);

    // Generated questions link both ends of the pair.
    assert.deepEqual(report.questionsWritten, [
      "questions/is-deadline-still-needed.md",
      "questions/is-retries-still-needed.md",
    ]);
    const question = await readFile(join(bundle, "questions/is-deadline-still-needed.md"), "utf8");
    assert.ok(question.includes("(../constraints/acme-cap.md)"), question);
    assert.ok(question.includes("(../decisions/deadline.md)"), question);
    assert.match(question, /status: open/);
    const queued = (await loadBundle(bundle)).concepts.get("questions/is-deadline-still-needed")!;
    assert.equal(queued.why.captured_on, expired.expired_on);
    assert.ok(queued.why.review_by !== undefined && queued.why.review_by > expired.expired_on);
    assert.equal(queued.why.owner, undefined, "generated questions stay visibly unassigned");

    // Everything audit wrote lints clean (expired_on present, sections intact).
    const lint = capture();
    assert.equal(await main(["lint", "--bundle", bundle], dir, lint.io), 0, lint.out.join("\n"));

    // Re-run: already expired — no re-flip, no duplicate questions, exit 0.
    const rerun = await auditJson(bundle, dir);
    assert.equal(rerun.code, 0, "an already-expired constraint is never double-flagged");
    assert.deepEqual(rerun.report.expired, []);
    assert.deepEqual(rerun.report.questionsWritten, []);
    assert.deepEqual(rerun.report.alreadyExpired, [
      {
        concept: "constraints/acme-cap",
        expired_on: expired.expired_on,
        decisions: ["decisions/deadline", "decisions/retries"],
      },
    ]);
    const questions = (await readdir(join(bundle, "questions"))).sort();
    assert.deepEqual(questions, ["is-deadline-still-needed.md", "is-retries-still-needed.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an equivalent open question suppresses the generated one (dedupe by link pair)", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/acme-cap.md": doc("constraint", "Acme cap", [
      "status: active",
      "verify:",
      "  method: check",
      '  check: "exit 1"',
    ], [STILL_TRUE]),
    "decisions/deadline.md": doc("decision", "Deadline", [
      "status: active",
    ], ["# Why\n\nBecause of the cap.", "# Because of\n\n- [Acme cap](/constraints/acme-cap.md)"]),
    "questions/already-asked.md": doc("question", "Already asked", [
      "status: open",
    ], ["Covers [Acme cap](/constraints/acme-cap.md) and [Deadline](/decisions/deadline.md) already."]),
  });
  try {
    const { code, report } = await auditJson(bundle, dir);
    assert.equal(code, 1);
    assert.deepEqual(report.expired[0].blastRadius, [
      { decision: "decisions/deadline", question: "questions/already-asked", written: false },
    ]);
    assert.deepEqual(report.questionsWritten, []);
    assert.deepEqual(await readdir(join(bundle, "questions")), ["already-asked.md"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("overdue review_by is flagged, nothing flips, exit 0", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/renew.md": doc("constraint", "Renew", [
      "status: active",
      "verify:",
      "  method: review-by",
      "  review_by: 2001-01-02",
    ], [STILL_TRUE]),
    "constraints/later.md": doc("constraint", "Later", [
      "status: active",
      "verify:",
      "  method: review-by",
      "  review_by: 2999-01-01",
    ], [STILL_TRUE]),
  });
  try {
    const before = await readFile(join(bundle, "constraints/renew.md"), "utf8");
    const { code, report } = await auditJson(bundle, dir);
    assert.equal(code, 0, "overdue review-by is a flag for humans, not an expiry");
    assert.deepEqual(report.reviewByPastDue, [{ concept: "constraints/renew", review_by: "2001-01-02" }]);
    assert.deepEqual(report.expired, []);
    assert.equal(await readFile(join(bundle, "constraints/renew.md"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ask items are exported to the questionnaire, never executed", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/contract.md": doc("constraint", "Contract", [
      "status: active",
      "verify:",
      "  method: ask",
      '  ask: "touch pwned.txt — is the Initech contract still active?"',
    ], [STILL_TRUE]),
  });
  try {
    const questionnaire = join(dir, "questionnaire.md");
    const { code, report } = await auditJson(bundle, dir, "--questions-out", questionnaire);
    assert.equal(code, 0);
    assert.deepEqual(report.checks, [], "an ask is never run as a command");
    assert.deepEqual(report.asks, [
      {
        concept: "constraints/contract",
        ask: "touch pwned.txt — is the Initech contract still active?",
        answer: "unknown",
      },
    ]);
    assert.equal(report.questionnaire, questionnaire);
    const files = await readdir(dir);
    assert.ok(!files.includes("pwned.txt"), "the ask text must not be executed");
    const text = await readFile(questionnaire, "utf8");
    assert.ok(text.includes("## constraints/contract"), text);
    assert.ok(text.includes("is the Initech contract still active?"), text);
    assert.ok(text.includes("answer: unknown"), text);
    assert.ok(text.includes("why audit --answers"), text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("answers: no-longer-true flips with the evidence; still-true leaves the file untouched", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/contract.md": doc("constraint", "Contract", [
      "status: active",
      "verify:",
      "  method: ask",
      '  ask: "Is the Initech contract still active?"',
    ], [STILL_TRUE]),
    "constraints/sla.md": doc("constraint", "SLA", [
      "status: active",
      "verify:",
      "  method: ask",
      '  ask: "Does the 99.9% SLA still apply?"',
    ], [STILL_TRUE]),
    "decisions/deadline.md": doc("decision", "Deadline", [
      "status: active",
    ], ["# Why\n\nContractual.", "# Because of\n\n- [Contract](/constraints/contract.md)"]),
  });
  try {
    const slaBefore = await readFile(join(bundle, "constraints/sla.md"), "utf8");
    const answers = join(dir, "answers.md");
    await writeFile(answers, [
      "## constraints/contract",
      "",
      "Is the Initech contract still active?",
      "",
      "answer: no-longer-true",
      "",
      "Initech churned at the 2026 renewal — confirmed in SFDC #9182.",
      "",
      "## constraints/sla",
      "",
      "answer: still-true",
      "",
    ].join("\n"), "utf8");

    const { code, report } = await auditJson(bundle, dir, "--answers", answers);
    assert.equal(code, 1);
    assert.deepEqual(report.asks, [
      { concept: "constraints/contract", ask: "Is the Initech contract still active?", answer: "no-longer-true" },
      { concept: "constraints/sla", ask: "Does the 99.9% SLA still apply?", answer: "still-true" },
    ]);
    assert.equal(report.expired.length, 1);
    assert.equal(report.expired[0].concept, "constraints/contract");
    assert.equal(report.expired[0].method, "ask");
    assert.deepEqual(report.questionsWritten, ["questions/is-deadline-still-needed.md"]);

    const flipped = await readFile(join(bundle, "constraints/contract.md"), "utf8");
    assert.match(flipped, /status: expired/);
    assert.ok(flipped.includes("marked no longer true"), flipped);
    assert.ok(flipped.includes("> Initech churned at the 2026 renewal — confirmed in SFDC #9182."), flipped);
    assert.equal(await readFile(join(bundle, "constraints/sla.md"), "utf8"), slaBefore,
      "a still-true answer writes nothing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("answers are validated loudly: unknown ids, wrong method, missing evidence", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/checked.md": doc("constraint", "Checked", [
      "status: active",
      "verify:",
      "  method: check",
      '  check: "true"',
    ], [STILL_TRUE]),
  });
  try {
    const run = async (content: string) => {
      const answers = join(dir, "answers.md");
      await writeFile(answers, content, "utf8");
      const { io, err } = capture();
      const code = await main(["audit", "--bundle", bundle, "--answers", answers], dir, io);
      return { code, err: err.join("\n") };
    };

    const typo = await run("## constraints/nope\n\nanswer: still-true\n");
    assert.equal(typo.code, 1);
    assert.ok(typo.err.includes("not a constraint"), typo.err);

    const wrongMethod = await run("## constraints/checked\n\nanswer: still-true\n");
    assert.equal(wrongMethod.code, 1);
    assert.ok(wrongMethod.err.includes('method "ask"'), wrongMethod.err);

    const badAnswer = await run("## constraints/checked\n\nanswer: maybe\n");
    assert.equal(badAnswer.code, 1);
    assert.ok(badAnswer.err.includes('"maybe" is not an answer'), badAnswer.err);

    const noEvidence = await run("## constraints/checked\n\nanswer: no-longer-true\n");
    assert.equal(noEvidence.code, 1);
    assert.ok(noEvidence.err.includes("without evidence"), noEvidence.err);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("questionnaire round-trips through parseAnswers, placeholder stripped", () => {
  const rendered = renderQuestionnaire([
    { concept: "constraints/contract", ask: "Still active?", answer: "unknown" },
  ]);
  const parsed = parseAnswers(rendered);
  assert.deepEqual(parsed.get("constraints/contract"), { answer: "unknown", evidence: "" });

  const answered = rendered.replace("answer: unknown", "answer: no-longer-true");
  const withEvidence = parseAnswers(answered.replace(
    "(replace this line with the evidence for your answer)",
    "Contract ended per SFDC.",
  ));
  assert.deepEqual(withEvidence.get("constraints/contract"), {
    answer: "no-longer-true",
    evidence: "Contract ended per SFDC.",
  });
});

test("a check that cannot finish is an error, never an expiry", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/slow.md": doc("constraint", "Slow", [
      "status: active",
      "verify:",
      "  method: check",
      '  check: "sleep 5"',
    ], [STILL_TRUE]),
  });
  try {
    const before = await readFile(join(bundle, "constraints/slow.md"), "utf8");
    const report = await auditBundle(await loadBundle(bundle), { timeoutMs: 200 });
    assert.equal(report.checks[0].outcome, "error");
    assert.equal(report.checks[0].exitCode, null);
    assert.match(report.checks[0].detail!, /timed out after 200ms/);
    assert.deepEqual(report.expired, [], "no exit code is no evidence — nothing flips");
    assert.equal(await readFile(join(bundle, "constraints/slow.md"), "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an active constraint without a verify block is reported, not skipped silently", async () => {
  const { dir, bundle } = await makeClinic({
    "constraints/vague.md": doc("constraint", "Vague", ["status: active"], [STILL_TRUE]),
  });
  try {
    const { code, report } = await auditJson(bundle, dir);
    assert.equal(code, 0);
    assert.equal(report.unverifiable.length, 1);
    assert.equal(report.unverifiable[0].concept, "constraints/vague");
    assert.match(report.unverifiable[0].reason, /falsifiable/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("harbor: no double-flag of the expired Acme constraint; the 47s candidacy is reported, nothing written", async () => {
  const listing = git(process.cwd(), "status", "--porcelain", "--", HARBOR);
  const { code, report } = await auditJson(HARBOR, process.cwd());
  assert.equal(code, 0, "nothing newly expires — exit 0");
  assert.equal(report.activeConstraints, 0);
  assert.deepEqual(report.expired, []);
  assert.deepEqual(report.questionsWritten, []);
  assert.deepEqual(report.alreadyExpired, [
    {
      concept: "constraints/acme-45s-timeout",
      expired_on: "2025-06-30",
      decisions: ["decisions/47s-request-deadline"],
    },
  ]);
  const human = capture();
  assert.equal(await main(["audit", "--bundle", HARBOR], process.cwd(), human.io), 0);
  const text = human.out.join("\n");
  assert.ok(text.includes("decisions/47s-request-deadline is still active"), text);
  assert.ok(text.includes("candidate scar tissue"), text);
  assert.equal(
    git(process.cwd(), "status", "--porcelain", "--", HARBOR),
    listing,
    "audit on harbor must write nothing",
  );
});

test("audit takes no positional arguments", async () => {
  const { io, err } = capture();
  assert.equal(await main(["audit", "--bundle", HARBOR, "extra"], process.cwd(), io), 2);
  assert.ok(err.join("\n").includes("no positional"), err.join("\n"));
});
