import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { loadBundle } from "../src/bundle.ts";
import { lintBundle, renderFindings, RULES, type RuleId, type Severity } from "../src/lint.ts";
import { main } from "../src/cli.ts";
import { capture, makeBundle } from "./helpers.ts";

const HARBOR = "examples/harbor";

function concept(type: string, title: string, whyLines: string[], bodyLines: string[]): string {
  return [
    "---",
    `type: ${type}`,
    `title: ${title}`,
    ...(whyLines.length > 0 ? ["why:", ...whyLines.map((l) => `  ${l}`)] : []),
    "---",
    "",
    `# ${title}`,
    ...bodyLines.flatMap((l) => ["", l]),
  ].join("\n");
}

const WHY_SECTION = "# Why\n\nBecause reasons.";
const STILL_TRUE = "# Still true?\n\nChecked recently.";

/** One deliberately-broken file per rule id, plus valid link targets. */
const BROKEN: Record<string, string> = {
  // Valid concepts to serve as edge-section link targets.
  "questions/target-question.md": concept("question", "Target question", ["status: open"], []),
  "attempts/target-attempt.md": concept("attempt", "Target attempt", ["status: failed"], []),
  "decisions/target-decision.md": concept("decision", "Target decision", ["status: active"], [WHY_SECTION]),

  // W001: OKF-level finding passed through (a broken link is an OKF warning).
  "decisions/broken-link.md": concept("decision", "Broken link", ["status: active"], [
    "# Why\n\nSee [gone](/decisions/gone.md).",
  ]),
  // W100: malformed `why:` value that is not one of the specific vocabularies.
  "decisions/why-not-a-map.md": concept("decision", "Why not a map", ["happened_on: [2024]"], [WHY_SECTION]),
  // W101: status outside the concept type's vocabulary.
  "decisions/bad-status.md": concept("decision", "Bad status", ["status: sideways"], [WHY_SECTION]),
  // W102: unknown confidence.
  "decisions/bad-confidence.md": concept("decision", "Bad confidence", ["status: active", "confidence: banana"], [WHY_SECTION]),
  // W103: anchor entry without a path.
  "decisions/bad-anchor.md": concept("decision", "Bad anchor", ["status: active", "anchors:", "  - symbol: nope"], [WHY_SECTION]),
  // W104: verify block with an unknown method.
  "constraints/bad-verify.md": concept("constraint", "Bad verify", ["status: active", "verify:", "  method: vibes"], [STILL_TRUE]),
  // W105: unrecognized `why:` key.
  "decisions/unknown-key.md": concept("decision", "Unknown key", ["status: active", "banana: true"], [WHY_SECTION]),
  // W106: a field the §2 table scopes to another concept type.
  "decisions/misplaced-verify.md": concept("decision", "Misplaced verify", ["status: active", "verify:", "  method: check", '  check: "true"'], [WHY_SECTION]),
  // W200: decision without `# Why`.
  "decisions/missing-why-section.md": concept("decision", "Missing why section", ["status: active"], []),
  // W201: inferred confidence without `# Citations`.
  "attempts/uncited-inference.md": concept("attempt", "Uncited inference", ["status: failed", "confidence: inferred"], []),
  // W202: constraint without `# Still true?`.
  "constraints/missing-still-true.md": concept("constraint", "Missing still true", ["status: active"], []),
  // W300: `# Because of` may not target a question.
  "decisions/bad-because-of.md": concept("decision", "Bad because of", ["status: active"], [
    WHY_SECTION,
    "# Because of\n\n- [Target question](/questions/target-question.md)",
  ]),
  // W301: `# Instead of` may only target an attempt.
  "decisions/bad-instead-of.md": concept("decision", "Bad instead of", ["status: active"], [
    WHY_SECTION,
    "# Instead of\n\n- [Target decision](/decisions/target-decision.md)",
  ]),
  // W302: `# Superseded by` may only target a decision.
  "decisions/bad-superseded-by.md": concept("decision", "Bad superseded by", ["status: superseded"], [
    WHY_SECTION,
    "# Superseded by\n\n- [Target attempt](/attempts/target-attempt.md)",
  ]),
  // W303: `# Led to` may only target a decision or incident.
  "incidents/bad-led-to.md": concept("incident", "Bad led to", ["status: resolved"], [
    "# Led to\n\n- [Target attempt](/attempts/target-attempt.md)",
  ]),
  // W400: status superseded without a `# Superseded by` link.
  "decisions/superseded-without-section.md": concept("decision", "Superseded without section", ["status: superseded"], [WHY_SECTION]),
  // W401: a `# Superseded by` link without status superseded.
  "decisions/active-with-superseded-by.md": concept("decision", "Active with superseded by", ["status: active"], [
    WHY_SECTION,
    "# Superseded by\n\n- [Target decision](/decisions/target-decision.md)",
  ]),
  // W402: expired constraint without expired_on.
  "constraints/expired-without-date.md": concept("constraint", "Expired without date", ["status: expired"], [STILL_TRUE]),
};

/** (rule, severity, file) triple each fixture above must produce. */
const EXPECTED: Array<[RuleId, Severity, string]> = [
  ["W001", "warning", "decisions/broken-link.md"],
  ["W100", "error", "decisions/why-not-a-map.md"],
  ["W101", "error", "decisions/bad-status.md"],
  ["W102", "error", "decisions/bad-confidence.md"],
  ["W103", "error", "decisions/bad-anchor.md"],
  ["W104", "error", "constraints/bad-verify.md"],
  ["W105", "warning", "decisions/unknown-key.md"],
  ["W106", "warning", "decisions/misplaced-verify.md"],
  ["W200", "error", "decisions/missing-why-section.md"],
  ["W201", "error", "attempts/uncited-inference.md"],
  ["W202", "error", "constraints/missing-still-true.md"],
  ["W300", "error", "decisions/bad-because-of.md"],
  ["W301", "error", "decisions/bad-instead-of.md"],
  ["W302", "error", "decisions/bad-superseded-by.md"],
  ["W303", "error", "incidents/bad-led-to.md"],
  ["W400", "error", "decisions/superseded-without-section.md"],
  ["W401", "error", "decisions/active-with-superseded-by.md"],
  ["W402", "error", "constraints/expired-without-date.md"],
];

test("harbor lints clean: no findings, exit 0, positional and --bundle forms", async () => {
  const findings = await lintBundle(await loadBundle(HARBOR));
  assert.deepEqual(findings, []);

  for (const argv of [["lint", HARBOR], ["lint", "--bundle", HARBOR]]) {
    const { io, out, err } = capture();
    assert.equal(await main(argv, process.cwd(), io), 0, err.join("\n"));
    assert.ok(out.join("\n").includes("no findings"), out.join("\n"));
  }
});

test("the broken fixtures cover every rule id with the expected severity and file", async () => {
  const root = await makeBundle(BROKEN);
  try {
    const findings = await lintBundle(await loadBundle(root));
    for (const [rule, severity, file] of EXPECTED) {
      const hit = findings.find((f) => f.rule === rule && f.file === file);
      assert.ok(hit, `no ${rule} finding on ${file} in:\n${JSON.stringify(findings, null, 1)}`);
      assert.equal(hit.severity, severity, `${rule} severity`);
    }
    const covered = new Set(findings.map((f) => f.rule));
    for (const rule of Object.keys(RULES)) {
      assert.ok(covered.has(rule as RuleId), `EXPECTED table misses rule ${rule}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--json round-trips through JSON.parse and carries the same findings", async () => {
  const root = await makeBundle(BROKEN);
  try {
    const { io, out } = capture();
    const code = await main(["lint", "--bundle", root, "--json"], process.cwd(), io);
    assert.equal(code, 1, "error-severity findings must exit 1");
    const parsed = JSON.parse(out.join("\n"));
    assert.equal(parsed.root, root);
    assert.deepEqual(parsed.findings, await lintBundle(await loadBundle(root)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("human output groups findings by file and exits 1 on errors", async () => {
  const root = await makeBundle(BROKEN);
  try {
    const { io, out } = capture();
    assert.equal(await main(["lint", root], process.cwd(), io), 1);
    const text = out.join("\n");
    const fileHeading = out.indexOf("decisions/bad-status.md");
    assert.ok(fileHeading !== -1, text);
    assert.ok(out[fileHeading + 1]?.includes("W101"), `finding not under its file heading:\n${text}`);
    assert.ok(/\d+ findings \(\d+ errors?, \d+ warnings?\)/.test(text), text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("warning-only findings exit 0", async () => {
  const root = await makeBundle({
    "decisions/unknown-key.md": concept("decision", "Unknown key", ["status: active", "banana: true"], [WHY_SECTION]),
  });
  try {
    const { io, out } = capture();
    assert.equal(await main(["lint", root], process.cwd(), io), 0);
    assert.ok(out.join("\n").includes("W105"), out.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("usage errors exit 2: two positionals, or positional plus --bundle", async () => {
  {
    const { io, err } = capture();
    assert.equal(await main(["lint", HARBOR, HARBOR], process.cwd(), io), 2);
    assert.ok(err.join("\n").includes("at most one bundle path"), err.join("\n"));
  }
  {
    const { io, err } = capture();
    assert.equal(await main(["lint", "--bundle", HARBOR, HARBOR], process.cwd(), io), 2);
    assert.ok(err.join("\n").includes("not both"), err.join("\n"));
  }
});
