import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIDENCE_LEVELS, loadBundle } from "../src/bundle.ts";

const HARBOR = "examples/harbor";

async function makeBundle(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "why-bundle-"));
  for (const [rel, source] of Object.entries(files)) {
    await mkdir(join(root, rel, ".."), { recursive: true });
    await writeFile(join(root, rel), source);
  }
  return root;
}

test("harbor loads all six concepts with no diagnostics", async () => {
  const bundle = await loadBundle(HARBOR);
  assert.equal(bundle.concepts.size, 6);
  assert.deepEqual(bundle.diagnostics, []);
});

test("queue-based-locking carries its anchors, confidence, and Because-of edges", async () => {
  const bundle = await loadBundle(HARBOR);
  const concept = bundle.concepts.get("decisions/queue-based-locking");
  assert.ok(concept, "decisions/queue-based-locking missing");
  assert.equal(concept.why.anchors.length, 2);
  assert.equal(concept.why.confidence, "recorded");
  const becauseOf = new Set(
    concept.links
      .filter((l) => l.section === "Because of" && l.resolvedId)
      .map((l) => l.resolvedId),
  );
  assert.deepEqual(
    becauseOf,
    new Set(["incidents/2024-03-lock-stall", "attempts/striped-rwlock"]),
  );
});

test("body sections come back in document order", async () => {
  const bundle = await loadBundle(HARBOR);
  const concept = bundle.concepts.get("decisions/queue-based-locking")!;
  assert.deepEqual(
    concept.sections.map((s) => s.heading),
    ["Queue-based locking", "Why", "Because of", "Instead of", "Citations"],
  );
});

test("single-line anchor lines normalize to a string", async () => {
  const bundle = await loadBundle(HARBOR);
  const question = bundle.concepts.get("questions/why-retry-jitter-disabled")!;
  assert.equal(question.why.anchors[0]?.lines, "31");
});

test("an unknown confidence loads with a diagnostic naming file, field, and allowed values", async () => {
  const root = await makeBundle({
    "decisions/banana.md": [
      "---",
      "type: decision",
      "title: Banana",
      "why:",
      "  status: active",
      "  confidence: banana",
      "---",
      "",
      "# Banana",
      "",
      "# Why",
      "",
      "Because.",
    ].join("\n"),
  });
  try {
    const bundle = await loadBundle(root);
    assert.equal(bundle.concepts.size, 1);
    assert.equal(bundle.concepts.get("decisions/banana")?.why.confidence, undefined);
    const diag = bundle.diagnostics.find((d) => d.field === "why.confidence");
    assert.ok(diag, "no diagnostic for why.confidence");
    assert.equal(diag.path, "decisions/banana.md");
    for (const level of CONFIDENCE_LEVELS) {
      assert.ok(diag.message.includes(level), `message missing "${level}": ${diag.message}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed why data collects diagnostics instead of throwing", async () => {
  const root = await makeBundle({
    "decisions/mess.md": [
      "---",
      "type: decision",
      "title: Mess",
      "why:",
      "  status: sideways",
      "  anchors: not-a-list",
      "  verify:",
      "    method: vibes",
      "  extra_key: true",
      "---",
      "",
      "# Mess",
    ].join("\n"),
    "constraints/half-verify.md": [
      "---",
      "type: constraint",
      "title: Half verify",
      "why:",
      "  status: active",
      "  confidence: recorded",
      "  verify:",
      "    method: check",
      "---",
      "",
      "# Half verify",
    ].join("\n"),
  });
  try {
    const bundle = await loadBundle(root);
    assert.equal(bundle.concepts.size, 2);
    const fields = bundle.diagnostics
      .filter((d) => d.path === "decisions/mess.md")
      .map((d) => d.field);
    assert.ok(fields.includes("why.status"), `missing why.status in ${fields}`);
    assert.ok(fields.includes("why.anchors"), `missing why.anchors in ${fields}`);
    assert.ok(fields.includes("why.verify.method"), `missing why.verify.method in ${fields}`);
    assert.ok(fields.includes("why.extra_key"), `missing why.extra_key in ${fields}`);
    const statusDiag = bundle.diagnostics.find((d) => d.field === "why.status")!;
    for (const allowed of ["active", "superseded", "reversed"]) {
      assert.ok(statusDiag.message.includes(allowed), `status message missing "${allowed}"`);
    }
    const verifyDetail = bundle.diagnostics.find(
      (d) => d.path === "constraints/half-verify.md" && d.field === "why.verify.check",
    );
    assert.ok(verifyDetail, "method: check without a check command should be diagnosed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("anchor entries validate per entry, keeping the good ones", async () => {
  const root = await makeBundle({
    "decisions/anchored.md": [
      "---",
      "type: decision",
      "title: Anchored",
      "why:",
      "  status: active",
      "  confidence: recorded",
      "  anchors:",
      "    - path: src/a.ts",
      "      lines: 1-5",
      "      as_of: abc1234",
      "      state: live",
      "    - symbol: missingPath",
      "    - path: src/b.ts",
      "      state: wobbly",
      "---",
      "",
      "# Anchored",
    ].join("\n"),
  });
  try {
    const bundle = await loadBundle(root);
    const anchors = bundle.concepts.get("decisions/anchored")!.why.anchors;
    assert.deepEqual(
      anchors.map((a) => a.path),
      ["src/a.ts", "src/b.ts"],
    );
    assert.equal(anchors[1]?.state, undefined);
    const fields = bundle.diagnostics.map((d) => d.field);
    assert.ok(fields.includes("why.anchors[1].path"), `missing anchor path diag in ${fields}`);
    const stateDiag = bundle.diagnostics.find((d) => d.field === "why.anchors[2].state")!;
    assert.ok(stateDiag.message.includes("live") && stateDiag.message.includes("lost"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a concept without a why map loads clean", async () => {
  const root = await makeBundle({
    "decisions/plain.md": ["---", "type: decision", "title: Plain", "---", "", "# Plain"].join("\n"),
  });
  try {
    const bundle = await loadBundle(root);
    const concept = bundle.concepts.get("decisions/plain")!;
    assert.deepEqual(concept.why.anchors, []);
    assert.deepEqual(bundle.diagnostics, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
