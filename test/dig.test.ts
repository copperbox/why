// `why dig --episodes` (DESIGN.md §6 step 1): deterministic episode
// extraction + tells. Temp repos script each clustering rule and each tell;
// the emitted JSON is validated against the schema block in
// docs/dig-episodes.md (doc and test share one source, so they cannot drift);
// and a slow/optional test runs the real CLI against this repo's own history.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import {
  extractEpisodes,
  renderEpisodesReport,
  type Episode,
  type EpisodesReport,
} from "../src/dig.ts";
import {
  DIG_STATE_FILENAME,
  DIG_STATE_VERSION,
  readDigState,
  writeDigState,
} from "../src/dig-state.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeRepo, write } from "./helpers.ts";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2024-01-01T10:00:00Z");

interface Author {
  name: string;
  email: string;
}
const ALICE: Author = { name: "Alice", email: "alice@example.com" };
const BOB: Author = { name: "Bob", email: "bob@example.com" };

/** Stage everything and commit with a controlled author date + identity. */
function commitAll(repo: string, message: string, atMs: number, author: Author = ALICE): string {
  const date = new Date(atMs).toISOString();
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
  for (const args of [["add", "-A"], ["commit", "-q", "--allow-empty", "-m", message]]) {
    const r = spawnSync("git", args, { cwd: repo, encoding: "utf8", env });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  }
  return git(repo, "rev-parse", "HEAD");
}

function episodeOf(report: EpisodesReport, sha: string): Episode {
  const found = report.episodes.find((e) => e.commits.some((c) => c.sha === sha));
  assert.ok(found, `no episode contains ${sha}`);
  return found;
}

// --- Clustering --------------------------------------------------------------

test("PR-merge history clusters by merge boundary", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "main.txt", "base\n");
  const base = commitAll(repo, "base", T0);
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "feature.txt", "one\n");
  const f1 = commitAll(repo, "start feature", T0 + DAY);
  await write(repo, "feature.txt", "one\ntwo\n");
  const f2 = commitAll(repo, "finish feature\n\nCloses #12", T0 + 2 * DAY);
  git(repo, "checkout", "-q", "-");
  git(repo, "merge", "--no-ff", "-m", "Merge pull request #7 from acme/feature", "feature");
  const merge = git(repo, "rev-parse", "HEAD");

  const report = extractEpisodes(repo);
  assert.equal(report.episodes.length, 2);
  const [first, second] = report.episodes as [Episode, Episode];
  // Oldest first: the direct base commit, then the whole PR as one episode.
  assert.deepEqual(first.commits.map((c) => c.sha), [base]);
  assert.equal(second.kind, "merge");
  assert.equal(second.pr, 7);
  assert.deepEqual(second.commits.map((c) => c.sha), [f1, f2, merge]);
  assert.equal(second.id, merge.slice(0, 12));
  // Churn sums the side commits (the merge commit itself has no diff).
  assert.deepEqual(second.files, [{ path: "feature.txt", additions: 2, deletions: 0 }]);
  // Refs pick up both the merge's PR number and the message's issue number.
  assert.deepEqual(second.refs, [7, 12]);
  assert.equal(second.dates.start, second.commits[0]!.date);
  assert.equal(second.dates.end, second.commits[2]!.date);
});

test("a squash-merge (#N) subject is its own episode with the PR number", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  commitAll(repo, "base", T0);
  await write(repo, "b.txt", "b\n");
  const squash = commitAll(repo, "add caching (#9)", T0 + 10 * DAY);

  const report = extractEpisodes(repo);
  const ep = episodeOf(report, squash);
  assert.equal(ep.kind, "squash");
  assert.equal(ep.pr, 9);
  assert.deepEqual(ep.commits.map((c) => c.sha), [squash]);
});

test("direct commits cluster by same author, <48h, overlapping paths", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "app.js", "v1\n");
  const c1 = commitAll(repo, "add app", T0);
  await write(repo, "app.js", "v2\n");
  const c2 = commitAll(repo, "tweak app", T0 + DAY); // same author, 24h, same file → joins
  await write(repo, "app.js", "v3\n");
  const c3 = commitAll(repo, "tweak again", T0 + 4 * DAY); // >48h after cluster → splits
  await write(repo, "app.js", "v4\n");
  const c4 = commitAll(repo, "someone else", T0 + 4 * DAY + 1000, BOB); // author → splits
  await write(repo, "other.txt", "hi\n");
  const c5 = commitAll(repo, "unrelated file", T0 + 4 * DAY + 2000, BOB); // no overlap → splits

  const report = extractEpisodes(repo);
  assert.deepEqual(
    report.episodes.map((e) => e.commits.map((c) => c.sha)),
    [[c1, c2], [c3], [c4], [c5]],
  );
  for (const e of report.episodes) assert.equal(e.kind, "direct");
  assert.equal(report.episodes[0]!.pr, null);
});

test("non-monotonic author dates (rebases) never leak a stale timestamp across clusters", async () => {
  // Walk order is topological; author dates are scripted out of order. cC is
  // 9.5 days from cB (its own cluster's tip) but only 0.5 days from cA's —
  // a stale lastMs would wrongly join cC to cB's cluster.
  const repo = await makeRepo("why-dig-");
  await write(repo, "x.txt", "x\n");
  const cA = commitAll(repo, "late-dated", T0 + 10 * DAY);
  await write(repo, "y.txt", "y\n");
  const cB = commitAll(repo, "early-dated", T0);
  await write(repo, "y.txt", "y2\n");
  const cC = commitAll(repo, "far from its cluster", T0 + 9.5 * DAY);

  const report = extractEpisodes(repo);
  assert.deepEqual(
    report.episodes.map((e) => e.commits.map((c) => c.sha)),
    [[cA], [cB], [cC]],
  );
});

// --- Tells -------------------------------------------------------------------

test("a scripted revert is flagged on the episode containing it", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  commitAll(repo, "base", T0);
  await write(repo, "risky.txt", "risky\n");
  commitAll(repo, "risky change", T0 + 5 * DAY);
  const r = spawnSync("git", ["revert", "--no-edit", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: ALICE.name,
      GIT_AUTHOR_EMAIL: ALICE.email,
      GIT_COMMITTER_NAME: ALICE.name,
      GIT_COMMITTER_EMAIL: ALICE.email,
      GIT_AUTHOR_DATE: new Date(T0 + 5 * DAY + 3600_000).toISOString(),
      GIT_COMMITTER_DATE: new Date(T0 + 5 * DAY + 3600_000).toISOString(),
    },
  });
  assert.equal(r.status, 0, r.stderr);
  const revert = git(repo, "rev-parse", "HEAD");

  const report = extractEpisodes(repo);
  const ep = episodeOf(report, revert);
  assert.equal(ep.tells.reverts.length, 1);
  assert.equal(ep.tells.reverts[0]!.sha, revert);
  assert.match(ep.tells.reverts[0]!.subject, /^Revert "/);
  assert.deepEqual(report.tells.reverts, { count: 1, episodes: [ep.id] });
});

test("a fix-chain (two fix commits on one file in an episode) is flagged", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "app.js", "v1\n");
  commitAll(repo, "add app", T0);
  await write(repo, "app.js", "v2\n");
  const fix1 = commitAll(repo, "fix: null check", T0 + 3600_000);
  await write(repo, "app.js", "v3\n");
  const fix2 = commitAll(repo, "Fix off-by-one", T0 + 2 * 3600_000);

  const report = extractEpisodes(repo);
  assert.equal(report.episodes.length, 1);
  const ep = report.episodes[0]!;
  assert.deepEqual(ep.tells.fixChains, [{ path: "app.js", shas: [fix1, fix2] }]);
  assert.deepEqual(report.tells.fixChains, { count: 1, episodes: [ep.id] });
});

test("sudden churn on an old-quiet file is flagged; new files never are", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "quiet.txt", "one\ntwo\nthree\n");
  commitAll(repo, "add quiet file", T0);
  // Five separate episodes (>48h apart) that never touch quiet.txt.
  for (let i = 1; i <= 5; i++) {
    await write(repo, `other-${i}.txt`, "x\n");
    commitAll(repo, `episode ${i}`, T0 + i * 3 * DAY);
  }
  await write(repo, "quiet.txt", Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n") + "\n");
  const burst = commitAll(repo, "rewrite quiet file", T0 + 18 * DAY);

  const report = extractEpisodes(repo);
  assert.equal(report.episodes.length, 7);
  const ep = episodeOf(report, burst);
  assert.equal(ep.tells.suddenChurn.length, 1);
  const tell = ep.tells.suddenChurn[0]!;
  assert.equal(tell.path, "quiet.txt");
  assert.equal(tell.churn, 63); // 60 added + 3 deleted
  assert.ok(tell.zScore >= 3, `zScore ${tell.zScore}`);
  // No other episode is flagged — file creations are not "sudden churn".
  assert.deepEqual(report.tells.suddenChurn, { count: 1, episodes: [ep.id] });
});

test("added lines matching the comment-tell pattern are flagged with path and sha", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "join the hackathon\n");
  commitAll(repo, "base", T0);
  await write(repo, "src/api.js", "// HACK: retry twice, workaround for flaky upstream\nconst x = 1;\n");
  const sha = commitAll(repo, "add api client", T0 + 5 * DAY);

  const report = extractEpisodes(repo);
  const ep = episodeOf(report, sha);
  assert.equal(ep.tells.commentTells.count, 1);
  assert.deepEqual(ep.tells.commentTells.sample, [
    { sha, path: "src/api.js", line: "// HACK: retry twice, workaround for flaky upstream" },
  ]);
  assert.deepEqual(report.tells.commentTells, { count: 1, episodes: [ep.id] });
  // "hackathon" must not match — the pattern is word-bounded.
  assert.equal(episodeOf(report, report.episodes[0]!.commits[0]!.sha).tells.commentTells.count, 0);
});

test("ref ranges: from..to walks only new history", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  const first = commitAll(repo, "old history", T0);
  await write(repo, "b.txt", "b\n");
  const next = commitAll(repo, "new history", T0 + 10 * DAY);

  const report = extractEpisodes(repo, { from: first });
  assert.equal(report.range.from, first);
  assert.deepEqual(report.episodes.map((e) => e.commits.map((c) => c.sha)), [[next]]);
});

// --- Schema ------------------------------------------------------------------

// Minimal JSON Schema (draft-07 subset) validator — enough for the documented
// schema: type (incl. arrays of types), const, enum, properties/required/
// additionalProperties, items, $ref into definitions.
function validateSchema(schema: any, value: any, root: any, path: string, errors: string[]): void {
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace("#/definitions/", "");
    assert.ok(root.definitions?.[name], `unresolvable $ref ${schema.$ref}`);
    validateSchema(root.definitions[name], value, root, path, errors);
    return;
  }
  if ("const" in schema && value !== schema.const) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type !== undefined) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = (t: string): boolean =>
      t === "null" ? value === null
      : t === "array" ? Array.isArray(value)
      : t === "object" ? typeof value === "object" && value !== null && !Array.isArray(value)
      : t === "integer" ? Number.isInteger(value)
      : t === "number" ? typeof value === "number"
      : typeof value === t;
    if (!types.some(matches)) {
      errors.push(`${path}: expected ${types.join("|")}, got ${JSON.stringify(value)}`);
      return;
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value) && schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required key "${key}"`);
    }
    for (const [key, sub] of Object.entries(value)) {
      if (key in schema.properties) {
        validateSchema(schema.properties[key], sub, root, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected key "${key}"`);
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validateSchema(schema.items, item, root, `${path}[${i}]`, errors));
  }
}

async function documentedSchema(): Promise<any> {
  const doc = await readFile(join(process.cwd(), "docs/dig-episodes.md"), "utf8");
  const block = /```json\n([\s\S]*?)```/.exec(doc);
  assert.ok(block, "docs/dig-episodes.md has no ```json schema block");
  return JSON.parse(block[1]!);
}

test("emitted JSON validates against the schema documented in docs/dig-episodes.md", async () => {
  // A history exercising every branch of the schema: merge episode with PR,
  // squash, direct cluster, revert, fix-chain, comment tell.
  const repo = await makeRepo("why-dig-");
  await write(repo, "app.js", "v1\n");
  commitAll(repo, "add app", T0);
  git(repo, "checkout", "-q", "-b", "feature");
  await write(repo, "lib.js", "// workaround for upstream bug\n");
  commitAll(repo, "fix: first try", T0 + DAY);
  await write(repo, "lib.js", "// workaround for upstream bug\nmore\n");
  commitAll(repo, "fix: second try", T0 + DAY + 3600_000);
  git(repo, "checkout", "-q", "-");
  git(repo, "merge", "--no-ff", "-m", "Merge pull request #3 from acme/feature", "feature");
  await write(repo, "app.js", "v2\n");
  commitAll(repo, "polish (#4)", T0 + 5 * DAY);
  spawnSync("git", ["revert", "--no-edit", "HEAD"], { cwd: repo, encoding: "utf8" });

  const report = extractEpisodes(repo);
  const roundTripped = JSON.parse(JSON.stringify(report));
  const schema = await documentedSchema();
  const errors: string[] = [];
  validateSchema(schema, roundTripped, schema, "$", errors);
  assert.deepEqual(errors, []);
  // The fixture really exercised the shapes the schema promises.
  assert.deepEqual(
    report.episodes.map((e) => e.kind),
    ["direct", "merge", "squash", "direct"],
  );
  assert.ok(report.tells.reverts.count >= 1);
  assert.ok(report.tells.fixChains.count >= 1);
  assert.ok(report.tells.commentTells.count >= 1);
});

// --- CLI ---------------------------------------------------------------------

test("why dig without --episodes says what is implemented and exits 2", async () => {
  const { io, err } = capture();
  const code = await main(["dig", "--bundle", "examples/harbor"], process.cwd(), io);
  assert.equal(code, 2);
  assert.ok(err.join("\n").includes("--episodes"), err.join("\n"));
});

test("why dig --episodes: --out writes the JSON report; default renders a summary", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  commitAll(repo, "base", T0);
  await scaffoldBundle(repo);
  const outFile = join(repo, "episodes.json");

  const { io, out } = capture();
  assert.equal(await main(["dig", "--episodes", "--out", outFile], repo, io), 0);
  assert.ok(out.join("\n").includes(`wrote 1 episodes to ${outFile}`), out.join("\n"));
  const report = JSON.parse(await readFile(outFile, "utf8")) as EpisodesReport;
  assert.equal(report.schema, "why-dig-episodes");
  assert.equal(report.episodes.length, 1);

  // The first run advanced the mark to HEAD, so the default render re-digs
  // under --full.
  const human = capture();
  assert.equal(await main(["dig", "--episodes", "--full"], repo, human.io), 0);
  assert.ok(human.out.join("\n").includes("1 episode"), human.out.join("\n"));
});

test("high-water mark: dig state bounds the default range and advances on success", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  const first = commitAll(repo, "old", T0);
  await write(repo, "b.txt", "b\n");
  const head = commitAll(repo, "new", T0 + 10 * DAY);
  const whyRoot = await scaffoldBundle(repo);
  const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD");

  await writeDigState(whyRoot, {
    version: DIG_STATE_VERSION,
    branches: { [branch]: { lastProcessed: first } },
  });
  let run = capture();
  assert.equal(await main(["dig", "--episodes", "--json"], repo, run.io), 0);
  let report = JSON.parse(run.out.join("\n")) as EpisodesReport;
  assert.equal(report.range.from, first);
  assert.equal(report.episodes.length, 1);
  assert.equal(report.episodes[0]!.commits[0]!.subject, "new");
  // A successful emission advanced the mark to HEAD (docs/digging.md).
  assert.deepEqual((await readDigState(whyRoot))!.branches[branch], { lastProcessed: head });

  // Nothing new since the mark: an empty report, state untouched.
  run = capture();
  assert.equal(await main(["dig", "--episodes", "--json"], repo, run.io), 0);
  report = JSON.parse(run.out.join("\n")) as EpisodesReport;
  assert.equal(report.episodes.length, 0);
  assert.deepEqual((await readDigState(whyRoot))!.branches[branch], { lastProcessed: head });

  // --full re-digs everything, ignoring the mark.
  run = capture();
  assert.equal(await main(["dig", "--episodes", "--json", "--full"], repo, run.io), 0);
  report = JSON.parse(run.out.join("\n")) as EpisodesReport;
  assert.equal(report.range.from, null);
  assert.equal(report.episodes.length, 2);
});

test("high-water mark: unreadable state is an explicit error, never overwritten", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  commitAll(repo, "base", T0);
  const whyRoot = await scaffoldBundle(repo);

  await writeFile(join(whyRoot, DIG_STATE_FILENAME), "not json");
  let run = capture();
  assert.equal(await main(["dig", "--episodes", "--json"], repo, run.io), 1);
  assert.ok(run.err.join("\n").includes("not valid JSON"), run.err.join("\n"));

  // ... even under --full, whose success path would otherwise overwrite it.
  run = capture();
  assert.equal(await main(["dig", "--episodes", "--json", "--full"], repo, run.io), 1);
  assert.equal(await readFile(join(whyRoot, DIG_STATE_FILENAME), "utf8"), "not json");

  // A mark the repository cannot verify never yields a range either.
  const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD");
  await writeDigState(whyRoot, {
    version: DIG_STATE_VERSION,
    branches: { [branch]: { lastProcessed: "f".repeat(40) } },
  });
  run = capture();
  assert.equal(await main(["dig", "--episodes", "--json"], repo, run.io), 1);
  assert.ok(run.err.join("\n").includes("does not resolve"), run.err.join("\n"));
});

test("rendered summary names episodes and tells", async () => {
  const repo = await makeRepo("why-dig-");
  await write(repo, "a.txt", "a\n");
  commitAll(repo, "base", T0);
  await write(repo, "a.txt", "a\n// HACK\n");
  commitAll(repo, "fix: patch it", T0 + 3600_000);

  const lines = renderEpisodesReport(extractEpisodes(repo));
  const text = lines.join("\n");
  assert.ok(text.includes("1 episode"), text);
  assert.ok(text.includes("comment×1"), text);
});

// Slow/optional (skip with WHY_DIG_SKIP_SLOW=1): the acceptance run against a
// real history — this repo's own — must not crash and must emit parseable,
// schema-valid JSON.
test(
  "slow: runs against this repo's own history and emits schema-valid JSON",
  { skip: process.env.WHY_DIG_SKIP_SLOW !== undefined },
  async () => {
    // A successful run advances the harbor bundle's dig state; drop it so the
    // fixture stays clean and re-runs still see the full history.
    const state = join(process.cwd(), "examples", "harbor", DIG_STATE_FILENAME);
    try {
      const { io, out } = capture();
      const code = await main(
        ["dig", "--episodes", "--json", "--full", "--bundle", "examples/harbor"],
        process.cwd(),
        io,
      );
      assert.equal(code, 0);
      const report = JSON.parse(out.join("\n")) as EpisodesReport;
      assert.ok(report.episodes.length >= 1, "this repo has history");
      const schema = await documentedSchema();
      const errors: string[] = [];
      validateSchema(schema, report, schema, "$", errors);
      assert.deepEqual(errors, []);
    } finally {
      await rm(state, { force: true });
    }
  },
);
