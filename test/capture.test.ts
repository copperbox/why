// `why capture` (DESIGN.md open problem #5): merge-time capture into
// `.why/.drafts/`. All gh traffic goes through the injectable runner seam
// (canned JSON fixtures) or a PATH-shimmed fixture `gh` for the CLI e2e —
// no test hits the network. Also pins the served-bundle guarantee: drafts
// never appear in bundle loads or `why blame` results.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { splitFrontmatter } from "../src/okf.ts";
import { parseLineRange } from "../src/anchors.ts";
import { loadBundle } from "../src/bundle.ts";
import {
  anchorsFromPatch,
  CaptureError,
  captureCommit,
  capturePr,
  DRAFTS_DIRNAME,
  EVIDENCE_SUFFIX,
  MAX_HUNK_ANCHORS_PER_FILE,
  promoteDraft,
  RATIONALE_TELL_RE,
  slugify,
} from "../src/capture.ts";
import { main } from "../src/cli.ts";
import { runCommand, type CommandRunner } from "../src/evidence.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeRepo, write } from "./helpers.ts";

// --- Fixtures ----------------------------------------------------------------

const BASE_LOCK = Array.from({ length: 8 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
// Replaces lines 3-4 with three new lines: the -U0 hunk is `+3,3` → span 3-5.
const NEW_LOCK = ["line1", "line2", "new3", "new4", "new5", "line5", "line6", "line7", "line8"].join("\n") + "\n";

/** A repo whose second commit is "the merged PR": edits lock.rs, adds queue.rs. */
async function seedRepo(): Promise<{ repo: string; whyRoot: string; shas: string[] }> {
  const repo = await makeRepo("why-capture-");
  await write(repo, "src/lock.rs", BASE_LOCK);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "add striped lock");
  await write(repo, "src/lock.rs", NEW_LOCK);
  await write(repo, "src/queue.rs", "struct Queue;\nimpl Queue {}\n");
  git(repo, "add", "-A");
  git(
    repo,
    "commit",
    "-qm",
    "replace striped locks with queue (#7)\n\nBecause the striped RwLock deadlocked under load.",
  );
  const whyRoot = await scaffoldBundle(repo);
  const shas = git(repo, "rev-list", "--reverse", "HEAD").split("\n");
  return { repo, whyRoot, shas };
}

function prFixture(mergeSha: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: "MERGED",
    title: "Replace striped locks with queue",
    body: "Serializes shard access through a queue.\n\nAny scheme where correctness depends on lock ordering fails eventually.",
    author: { login: "jane" },
    url: "https://github.com/acme/harbor/pull/7",
    mergedAt: "2026-07-02T09:00:00Z",
    closedAt: "2026-07-02T09:00:00Z",
    mergeCommit: { oid: mergeSha },
    headRefOid: mergeSha,
    comments: [
      { author: { login: "alice" }, body: "Screenshot looks good.", createdAt: "2026-07-01T10:00:00Z" },
      {
        author: { login: "bob" },
        body: "We chose the queue because ordering discipline never survives contributors.",
        createdAt: "2026-07-01T11:00:00Z",
      },
    ],
    reviews: [
      { author: { login: "eve" }, body: "Approving — the tradeoff is worth it.", state: "APPROVED", submittedAt: "2026-07-02T08:00:00Z" },
    ],
    files: [{ path: "src/lock.rs" }, { path: "src/queue.rs" }],
    ...overrides,
  };
}

/** Answers gh from the fixture and `git remote` with a GitHub origin; git is real. */
function fixtureRunner(pr: Record<string, unknown> | undefined): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: CommandRunner = (cmd, args, cwd) => {
    calls.push([cmd, ...args]);
    if (cmd === "git" && args[0] === "remote") {
      return { status: 0, stdout: "git@github.com:acme/harbor.git\n", stderr: "" };
    }
    if (cmd === "gh") {
      if (pr === undefined) return { status: 127, stdout: "", stderr: "gh: command not found" };
      return { status: 0, stdout: JSON.stringify(pr), stderr: "" };
    }
    return runCommand(cmd, args, cwd);
  };
  return { runner, calls };
}

async function readDraft(path: string): Promise<{ data: Record<string, unknown>; body: string }> {
  const split = splitFrontmatter(await readFile(path, "utf8"));
  assert.ok(split.data !== null, `draft at ${path} has unparseable frontmatter`);
  return { data: split.data, body: split.body };
}

function whyOf(data: Record<string, unknown>): Record<string, unknown> {
  assert.ok(typeof data.why === "object" && data.why !== null, "draft has no why map");
  return data.why as Record<string, unknown>;
}

// --- Units ---------------------------------------------------------------------

test("anchorsFromPatch: per-hunk spans, deletions anchor a line, deleted files skip, hunk floods collapse", () => {
  const patch = [
    "diff --git a/a.ts b/a.ts",
    "index 111..222 100644",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -3,2 +3,3 @@",
    "-old",
    "+new",
    "@@ -10,2 +11,0 @@",
    "-gone",
    "-gone",
    "diff --git a/gone.ts b/gone.ts",
    "deleted file mode 100644",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1,4 +0,0 @@",
    "diff --git a/many.ts b/many.ts",
    ...Array.from({ length: MAX_HUNK_ANCHORS_PER_FILE + 1 }, (_, i) => `@@ -${i * 10 + 1},1 +${i * 10 + 1},1 @@`),
    "diff --git a/bin.png b/bin.png",
    "Binary files a/bin.png and b/bin.png differ",
  ].join("\n");
  const { anchors, files, notes } = anchorsFromPatch(patch, "abc123");
  assert.deepEqual(files, ["a.ts", "bin.png", "gone.ts", "many.ts"]);
  assert.deepEqual(anchors, [
    { path: "a.ts", lines: "3-5", as_of: "abc123", state: "live" },
    { path: "a.ts", lines: "11", as_of: "abc123", state: "live" },
    { path: "bin.png", as_of: "abc123", state: "live" }, // no hunks: whole-file
    { path: "many.ts", as_of: "abc123", state: "live" }, // collapsed, with a note
  ]);
  assert.ok(notes.some((n) => n.includes("gone.ts") && n.includes("deleted")), notes.join("; "));
  assert.ok(notes.some((n) => n.includes("many.ts") && n.includes("whole-file")), notes.join("; "));
  for (const anchor of anchors) {
    if (anchor.lines !== undefined) assert.ok(parseLineRange(anchor.lines), `unparseable span ${anchor.lines}`);
  }
});

test("rationale tells and slugs behave", () => {
  assert.ok(RATIONALE_TELL_RE.test("We chose this because it works"));
  assert.ok(!RATIONALE_TELL_RE.test("Screenshot looks good."));
  assert.equal(slugify("Replace striped locks with queue (#7)"), "replace-striped-locks-with-queue-7");
  assert.equal(slugify("!!!"), "");
});

// --- Draft generation: merged PR -----------------------------------------------

test("merged PR → decision draft: verbatim quotes, PR + merge-commit citations, hunk anchors", async () => {
  const { whyRoot, shas } = await seedRepo();
  const mergeSha = shas[1]!;
  const bundle = await loadBundle(whyRoot);
  const { runner } = fixtureRunner(prFixture(mergeSha));
  const result = await capturePr(bundle, 7, { runner, now: new Date("2026-07-04T12:00:00Z") });

  assert.equal(result.type, "decision");
  assert.equal(basename(result.draftPath), "pr-7-replace-striped-locks-with-queue.md");
  assert.ok(result.draftPath.includes(`/${DRAFTS_DIRNAME}/`), result.draftPath);

  const { data, body } = await readDraft(result.draftPath);
  assert.equal(data.type, "decision");
  assert.equal(data.title, "Replace striped locks with queue");
  const why = whyOf(data);
  assert.equal(why.status, "active");
  assert.equal(why.happened_on, "2026-07-02");
  assert.equal(why.owner, "@jane");
  assert.equal(why.captured_on, "2026-07-04");
  assert.equal(why.review_by, "2026-07-18");
  assert.equal(why.confidence, "recorded");
  assert.deepEqual(why.anchors, [
    { path: "src/lock.rs", lines: "3-5", as_of: mergeSha, state: "live" },
    { path: "src/queue.rs", lines: "1-2", as_of: mergeSha, state: "live" },
  ]);

  // Rationale candidates quoted verbatim, with attribution; non-tell comment excluded.
  assert.ok(body.includes("> Serializes shard access through a queue."), body);
  assert.ok(body.includes("— PR #7 description by @jane"), body);
  assert.ok(body.includes("> We chose the queue because ordering discipline never survives contributors."), body);
  assert.ok(body.includes("— PR #7 comment by @bob (2026-07-01)"), body);
  assert.ok(body.includes("the tradeoff is worth it"), body);
  assert.ok(body.includes("— PR #7 review by @eve (2026-07-02)"), body);
  assert.ok(!body.includes("Screenshot looks good."), body);

  // Citations to the PR and the merge commit (origin normalized to https).
  assert.ok(body.includes("[1] [PR #7: Replace striped locks with queue](https://github.com/acme/harbor/pull/7)"), body);
  assert.ok(
    body.includes(`[2] [merge commit ${mergeSha.slice(0, 7)}](https://github.com/acme/harbor/commit/${mergeSha})`),
    body,
  );

  // The evidence pack sits beside the draft and holds the full thread.
  assert.equal(basename(result.evidencePath), `pr-7-replace-striped-locks-with-queue${EVIDENCE_SUFFIX}`);
  const pack = await readFile(result.evidencePath, "utf8");
  assert.ok(pack.includes("# Evidence pack: pr-7"), pack.slice(0, 200));
  assert.ok(pack.includes("Screenshot looks good."), "the pack keeps what the draft filtered out");
});

test("re-capturing an existing draft is refused, never an overwrite", async () => {
  const { whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  const { runner } = fixtureRunner(prFixture(shas[1]!));
  await capturePr(bundle, 7, { runner });
  await assert.rejects(() => capturePr(bundle, 7, { runner }), /already exists — promote or remove/);
});

// --- Draft generation: close-unmerged and refusals ------------------------------

test("close-unmerged PR → attempt draft: no anchors, abandonment noted, PR still cited", async () => {
  const { whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  const { runner } = fixtureRunner(
    prFixture(shas[1]!, {
      state: "CLOSED",
      mergeCommit: null,
      closedAt: "2026-07-03T12:00:00Z",
      headRefOid: "0000000000000000000000000000000000000000",
    }),
  );
  const result = await capturePr(bundle, 7, { runner });
  assert.equal(result.type, "attempt");
  assert.equal(result.anchorCount, 0);
  assert.ok(result.notes.some((n) => n.includes("closed without merging")), result.notes.join("; "));

  const { data, body } = await readDraft(result.draftPath);
  assert.equal(data.type, "attempt");
  const why = whyOf(data);
  assert.equal(why.status, "abandoned");
  assert.equal(why.happened_on, "2026-07-03");
  assert.equal(why.anchors, undefined);
  assert.ok(body.includes("[1] [PR #7: Replace striped locks with queue](https://github.com/acme/harbor/pull/7)"), body);
  // The unreachable head commit degrades explicitly inside the evidence pack.
  const pack = await readFile(result.evidencePath, "utf8");
  assert.ok(pack.includes("[unavailable: commit 0000000"), pack);
});

test("an open PR and a missing gh are refused with actionable errors", async () => {
  const { whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  await assert.rejects(
    () => capturePr(bundle, 7, { runner: fixtureRunner(prFixture(shas[1]!, { state: "OPEN" })).runner }),
    /still open/,
  );
  await assert.rejects(
    () => capturePr(bundle, 7, { runner: fixtureRunner(undefined).runner }),
    (e: unknown) => e instanceof CaptureError && /--commit <sha>/.test(e.message),
  );
});

// --- Draft generation: --commit fallback ----------------------------------------

test("--commit fallback: message quoted, anchors derived, gh never invoked, no-remote said out loud", async () => {
  const { whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  const calls: string[][] = [];
  const runner: CommandRunner = (cmd, args, cwd) => {
    calls.push([cmd, ...args]);
    return runCommand(cmd, args, cwd); // real git, real (absent) remote
  };
  const result = await captureCommit(bundle, shas[1]!, { runner });
  assert.equal(result.type, "decision");
  assert.ok(!calls.some((c) => c[0] === "gh"), JSON.stringify(calls));

  const { data, body } = await readDraft(result.draftPath);
  assert.equal(data.title, "replace striped locks with queue (#7)");
  const why = whyOf(data);
  assert.equal(why.confidence, "recorded");
  assert.equal(why.happened_on, git(bundle.root, "log", "-1", "--format=%as", shas[1]!));
  assert.deepEqual(why.anchors, [
    { path: "src/lock.rs", lines: "3-5", as_of: shas[1], state: "live" },
    { path: "src/queue.rs", lines: "1-2", as_of: shas[1], state: "live" },
  ]);
  assert.ok(body.includes("> Because the striped RwLock deadlocked under load."), body);
  assert.ok(body.includes(`— commit ${shas[1]!.slice(0, 7)} message`), body);
  assert.ok(!body.includes("# Citations"), "no remote → no fabricated citation links");
  assert.ok(result.notes.some((n) => n.includes("no git remote")), result.notes.join("; "));

  const bad = await assert.rejects(() => captureCommit(bundle, "not-a-sha", { runner }), CaptureError);
  void bad;
});

// --- Served-bundle guarantee -----------------------------------------------------

test("drafts never serve: bundle loads skip .drafts/, blame finds nothing, lint counts zero", async () => {
  const { repo, whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  await captureCommit(bundle, shas[1]!, { runner: runCommand });

  const reloaded = await loadBundle(whyRoot);
  assert.equal(reloaded.concepts.size, 0, [...reloaded.concepts.keys()].join(", "));

  const blame = capture();
  assert.equal(await main(["blame", "src/lock.rs:3", "--bundle", whyRoot], repo, blame.io), 0);
  assert.ok(blame.out.join("\n").includes("No concepts anchor"), blame.out.join("\n"));

  const lint = capture();
  assert.equal(await main(["lint", whyRoot], repo, lint.io), 0);
  assert.ok(lint.out.join("\n").includes("0 concepts, no findings"), lint.out.join("\n"));
});

// --- Promotion --------------------------------------------------------------------

test("promotion: lint-clean draft moves into its type dir, gets v0.2 provenance, and starts serving", async () => {
  const { repo, whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  const result = await captureCommit(bundle, shas[1]!, { runner: runCommand });
  const draftName = basename(result.draftPath);

  const { io, out } = capture();
  assert.equal(await main(["capture", "--promote", draftName, "--bundle", whyRoot], repo, io), 0, out.join("\n"));
  const target = join(whyRoot, "decisions", draftName);
  assert.ok(existsSync(target), out.join("\n"));
  assert.ok(!existsSync(result.draftPath), "draft removed after promote");
  assert.ok(!existsSync(result.evidencePath), "evidence sidecar removed after promote");

  const { data } = await readDraft(target);
  assert.ok(typeof data.generated === "object" && data.generated !== null, "writeConcept stamps generated provenance");
  assert.equal(data.timestamp, undefined, "a v0.2 bundle never receives legacy timestamp provenance");

  const lint = capture();
  assert.equal(await main(["lint", whyRoot], repo, lint.io), 0, lint.err.join("\n"));
  assert.ok(lint.out.join("\n").includes("1 concept, no findings"), lint.out.join("\n"));

  const blame = capture();
  assert.equal(await main(["blame", "src/lock.rs:3", "--bundle", whyRoot], repo, blame.io), 0);
  assert.ok(blame.out.join("\n").includes("replace striped locks with queue"), blame.out.join("\n"));
});

test("promotion refuses a lint-failing draft: target rolled back, draft kept, findings named", async () => {
  const { repo, whyRoot } = await seedRepo();
  const draftsDir = join(whyRoot, DRAFTS_DIRNAME);
  await mkdir(draftsDir, { recursive: true });
  // A decision with no `# Why` section — W200, an error.
  await writeFile(
    join(draftsDir, "bad.md"),
    "---\ntype: decision\ntitle: Bad draft\nwhy:\n  status: active\n---\n\n# Bad draft\n\nNo why section here.\n",
    "utf8",
  );
  const { io, err } = capture();
  assert.equal(await main(["capture", "--promote", "bad.md", "--bundle", whyRoot], repo, io), 1);
  const text = err.join("\n");
  assert.ok(text.includes("promotion refused"), text);
  assert.ok(text.includes("W200"), text);
  assert.ok(!existsSync(join(whyRoot, "decisions", "bad.md")), "refused promote must roll back");
  assert.ok(existsSync(join(draftsDir, "bad.md")), "refused promote must keep the draft");
});

test("promotion guardrails: evidence packs, unknown types, and outside paths are refused", async () => {
  const { whyRoot, shas } = await seedRepo();
  const bundle = await loadBundle(whyRoot);
  const result = await captureCommit(bundle, shas[1]!, { runner: runCommand });
  await assert.rejects(
    () => promoteDraft(bundle, basename(result.evidencePath), whyRoot),
    /evidence pack, not a draft/,
  );
  const draftsDir = join(whyRoot, DRAFTS_DIRNAME);
  await writeFile(join(draftsDir, "untyped.md"), "---\ntitle: no type\n---\n\nBody.\n", "utf8");
  await assert.rejects(() => promoteDraft(bundle, "untyped.md", whyRoot), /not a concept type/);
  await assert.rejects(() => promoteDraft(bundle, join(whyRoot, "index.md"), whyRoot), /not in/);
  await assert.rejects(() => promoteDraft(bundle, "no-such-draft.md", whyRoot), CaptureError);
});

// --- CLI ---------------------------------------------------------------------------

test("why capture --pr end to end through a PATH-fixture gh", async () => {
  const { repo, whyRoot, shas } = await seedRepo();
  const shimDir = await mkdtemp(join(tmpdir(), "why-gh-shim-"));
  const gh = join(shimDir, "gh");
  await writeFile(gh, `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(prFixture(shas[1]!))}\nEOF\n`, "utf8");
  await chmod(gh, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${shimDir}:${oldPath}`;
  try {
    const { io, out } = capture();
    const code = await main(["capture", "--pr", "7", "--bundle", whyRoot], repo, io);
    assert.equal(code, 0, out.join("\n"));
    const text = out.join("\n");
    assert.ok(text.includes("drafted decision:"), text);
    assert.ok(text.includes("--promote pr-7-replace-striped-locks-with-queue.md"), text);
    const drafts = await readdir(join(whyRoot, DRAFTS_DIRNAME));
    assert.ok(drafts.includes("pr-7-replace-striped-locks-with-queue.md"), drafts.join(", "));
  } finally {
    process.env.PATH = oldPath;
  }
});

test("why capture usage errors: no mode, two modes, non-numeric --pr", async () => {
  const { repo, whyRoot, shas } = await seedRepo();
  const none = capture();
  assert.equal(await main(["capture", "--bundle", whyRoot], repo, none.io), 2);
  assert.ok(none.err.join("\n").includes("exactly one mode"), none.err.join("\n"));

  const both = capture();
  assert.equal(await main(["capture", "--pr", "7", "--commit", shas[1]!, "--bundle", whyRoot], repo, both.io), 2);
  assert.ok(both.err.join("\n").includes("exactly one mode"), both.err.join("\n"));

  const bad = capture();
  assert.equal(await main(["capture", "--pr", "seven", "--bundle", whyRoot], repo, bad.io), 2);
  assert.ok(bad.err.join("\n").includes("--pr must be a PR number"), bad.err.join("\n"));
});
