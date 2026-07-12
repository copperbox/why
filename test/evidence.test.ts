// `why dig --evidence` (DESIGN.md §6 step 2): evidence-pack assembly. All
// external commands go through the injectable runner seam — a fixture `gh`
// answers PR/issue fetches from canned JSON, and no test hits the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import {
  buildEvidencePack,
  DEFAULT_MAX_CHARS,
  EvidenceError,
  matchEvidenceFile,
  readEpisodes,
  runCommand,
  type CommandRunner,
  type Episode,
} from "../src/evidence.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeBundle, makeRepo, write } from "./helpers.ts";

// --- Fixtures ----------------------------------------------------------------

/** A two-commit repo whose second commit has a long, multi-paragraph message. */
async function seedRepo(): Promise<{ repo: string; shas: string[] }> {
  const repo = await makeRepo("why-evidence-");
  await write(repo, "src/lock.rs", "fn acquire() {}\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "add striped lock");
  await write(repo, "src/lock.rs", "fn acquire_shared() {}\nfn release() {}\n");
  await write(repo, "src/queue.rs", "struct Queue;\n");
  git(repo, "add", "-A");
  git(
    repo,
    "commit",
    "-qm",
    "replace striped locks with queue (#7)\n\nThe striped RwLock deadlocked under load.\n\nSee the incident thread for the stall analysis.",
  );
  const shas = git(repo, "rev-list", "--reverse", "HEAD").split("\n");
  return { repo, shas };
}

function episodeFor(shas: string[]): Episode {
  return {
    id: "queue-locking",
    commits: shas.map((sha) => ({ sha })),
    files: ["src/lock.rs", "src/queue.rs"],
    prs: [7],
    issues: [3],
  };
}

const PR_7 = {
  title: "Replace striped locks with queue",
  body: "Serializes shard access through a queue.",
  author: { login: "jane" },
  comments: [
    { author: { login: "alice" }, body: "What about deadlocks?", createdAt: "2026-07-01T10:00:00Z" },
  ],
  reviews: [
    { author: { login: "bob" }, body: "LGTM after the fix.", state: "APPROVED", submittedAt: "2026-07-02T09:00:00Z" },
    { author: { login: "eve" }, body: "", state: "COMMENTED" },
  ],
};

const ISSUE_3 = {
  title: "Lock stall under load",
  body: "Prod stalled for 45s.",
  author: { login: "carol" },
  comments: [{ author: { login: "carol" }, body: "Seen again today.", createdAt: "2026-06-30T08:00:00Z" }],
};

/** A runner that answers git from the real repo and gh from canned fixtures. */
function fixtureRunner(opts: {
  remote?: boolean;
  gh?: (kind: string, n: string) => { status: number; stdout?: string; stderr?: string };
}): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: CommandRunner = (cmd, args, cwd) => {
    calls.push([cmd, ...args]);
    if (cmd === "git" && args[0] === "remote") {
      return opts.remote === false
        ? { status: 2, stdout: "", stderr: "error: No such remote 'origin'" }
        : { status: 0, stdout: "https://github.com/acme/harbor.git\n", stderr: "" };
    }
    if (cmd === "gh") {
      const answer = opts.gh?.(args[0]!, args[2]!) ?? { status: 1, stderr: "no fixture" };
      return { status: answer.status, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "" };
    }
    return runCommand(cmd, args, cwd);
  };
  return { runner, calls };
}

const GH_OK = (kind: string, n: string) => {
  if (kind === "pr" && n === "7") return { status: 0, stdout: JSON.stringify(PR_7) };
  if (kind === "issue" && n === "3") return { status: 0, stdout: JSON.stringify(ISSUE_3) };
  return { status: 1, stderr: "no fixture for that number" };
};

// --- Episode input -----------------------------------------------------------

test("readEpisodes accepts a bare array, a wrapper object, and tolerant field shapes", () => {
  const wrapped = readEpisodes(
    JSON.stringify({
      episodes: [
        {
          commits: ["abc1234def", { sha: "9876543fed", message: "recorded msg" }],
          files: ["b.ts", { path: "a.ts", additions: 3, deletions: 1 }, "b.ts"],
          prs: [12, "7", 7],
          issues: ["3"],
        },
      ],
    }),
    "t",
  );
  assert.equal(wrapped.length, 1);
  const ep = wrapped[0]!;
  assert.equal(ep.id, "abc1234"); // derived from the first sha
  assert.deepEqual(ep.commits, [{ sha: "abc1234def" }, { sha: "9876543fed", message: "recorded msg" }]);
  assert.deepEqual(ep.files, ["a.ts", "b.ts"]); // deduped, sorted
  assert.deepEqual(ep.prs, [7, 12]); // deduped, numeric, sorted
  assert.deepEqual(ep.issues, [3]);

  const bare = readEpisodes(JSON.stringify([{ id: "x", commits: ["deadbeef"] }]), "t");
  assert.equal(bare[0]!.id, "x");
  assert.deepEqual(bare[0]!.files, []);
});

test("readEpisodes rejects malformed input with a located error, never an empty pack", () => {
  assert.throws(() => readEpisodes("not json", "eps.json"), EvidenceError);
  assert.throws(() => readEpisodes('{"nope": true}', "eps.json"), EvidenceError);
  assert.throws(() => readEpisodes('[{"commits": []}]', "eps.json"), /episode 0/);
  assert.throws(() => readEpisodes('[{"commits": [{"msg": "no sha"}]}]', "eps.json"), /no sha/);
});

// --- Full pack ---------------------------------------------------------------

test("full pack: commit messages in full, PR/issue threads, per-file diffs — deterministic", async () => {
  const { repo, shas } = await seedRepo();
  const episode = episodeFor(shas);
  const { runner } = fixtureRunner({ gh: GH_OK });
  const pack = await buildEvidencePack(episode, { repo, runner });

  const md = pack.markdown;
  assert.ok(md.startsWith("# Evidence pack: queue-locking"), md.slice(0, 200));
  assert.ok(md.includes("- references: PR #7, issue #3"), md);
  // Commit messages in full — subject and both body paragraphs.
  assert.ok(md.includes("replace striped locks with queue (#7)"), md);
  assert.ok(md.includes("The striped RwLock deadlocked under load."), md);
  assert.ok(md.includes("See the incident thread for the stall analysis."), md);
  // PR: title, body, discussion comment, review verdict; bodyless COMMENTED review dropped.
  assert.ok(md.includes("### PR #7 — Replace striped locks with queue"), md);
  assert.ok(md.includes("Serializes shard access through a queue."), md);
  assert.ok(md.includes("**alice** (2026-07-01):"), md);
  assert.ok(md.includes("What about deadlocks?"), md);
  assert.ok(md.includes("**bob** [approved] (2026-07-02):"), md);
  assert.ok(!md.includes("**eve**"), md);
  // Issue thread.
  assert.ok(md.includes("### Issue #3 — Lock stall under load"), md);
  assert.ok(md.includes("Seen again today."), md);
  // Diffs, one fenced block per file.
  assert.ok(md.includes("## Diffs"), md);
  assert.ok(md.includes("diff --git a/src/lock.rs b/src/lock.rs"), md);
  assert.ok(md.includes("diff --git a/src/queue.rs b/src/queue.rs"), md);
  assert.equal(pack.unavailable.length, 0);
  assert.equal(pack.clipped.length, 0);

  // Packs get cached and diffed: two builds must be byte-identical.
  const again = await buildEvidencePack(episode, { repo, runner: fixtureRunner({ gh: GH_OK }).runner });
  assert.equal(again.markdown, md);
});

// --- Degradation -------------------------------------------------------------

test("no remote: every PR/issue degrades to an [unavailable] marker and gh is never invoked", async () => {
  const { repo, shas } = await seedRepo();
  const { runner, calls } = fixtureRunner({ remote: false });
  const pack = await buildEvidencePack(episodeFor(shas), { repo, runner });

  assert.ok(pack.markdown.includes("[unavailable: PR #7 — no git remote configured]"), pack.markdown);
  assert.ok(pack.markdown.includes("[unavailable: issue #3 — no git remote configured]"), pack.markdown);
  assert.equal(pack.unavailable.length, 2);
  assert.ok(!calls.some((c) => c[0] === "gh"), JSON.stringify(calls));
  // Everything local still works: full commit message and diffs present.
  assert.ok(pack.markdown.includes("The striped RwLock deadlocked under load."));
  assert.ok(pack.markdown.includes("## Diffs"));
});

test("gh missing or failing: explicit markers say which fetch degraded and why", async () => {
  const { repo, shas } = await seedRepo();
  const notInstalled = fixtureRunner({ gh: () => ({ status: 127, stderr: "gh: command not found" }) });
  const missing = await buildEvidencePack(episodeFor(shas), { repo, runner: notInstalled.runner });
  assert.ok(
    missing.markdown.includes("[unavailable: PR #7 — gh is not installed or not on PATH]"),
    missing.markdown,
  );

  // e.g. no auth, or a PR that predates the remote: gh's own reason surfaces.
  const failing = fixtureRunner({
    gh: (kind) =>
      kind === "pr"
        ? { status: 1, stderr: "GraphQL: Could not resolve to a PullRequest with the number of 7. (repository.pullRequest)" }
        : { status: 0, stdout: JSON.stringify(ISSUE_3) },
  });
  const failed = await buildEvidencePack(episodeFor(shas), { repo, runner: failing.runner });
  assert.ok(
    failed.markdown.includes("[unavailable: PR #7 — gh pr view failed: GraphQL: Could not resolve"),
    failed.markdown,
  );
  assert.ok(failed.markdown.includes("### Issue #3"), failed.markdown); // partial degradation only
});

test("a commit missing from the clone gets a marker and falls back to the recorded message", async () => {
  const { repo, shas } = await seedRepo();
  const episode: Episode = {
    id: "gone",
    commits: [{ sha: shas[0]! }, { sha: "0000000000000000000000000000000000000000", message: "recorded subject" }],
    files: [],
    prs: [],
    issues: [],
  };
  const pack = await buildEvidencePack(episode, { repo, runner: fixtureRunner({}).runner });
  assert.ok(pack.markdown.includes("[unavailable: commit 0000000000000000000000000000000000000000 — not found in this repository]"), pack.markdown);
  assert.ok(pack.markdown.includes("recorded subject"), pack.markdown);
});

// --- Local evidence ----------------------------------------------------------

test("matchEvidenceFile: digit-bounded numbers and touched-path names, nothing fuzzier", () => {
  const episode: Episode = {
    id: "e",
    commits: [{ sha: "a" }],
    files: ["src/lock.rs"],
    prs: [7],
    issues: [3],
  };
  assert.deepEqual(matchEvidenceFile("postmortem-7.md", episode), ["PR #7"]);
  assert.deepEqual(matchEvidenceFile("issue-3-notes.txt", episode), ["issue #3"]);
  assert.deepEqual(matchEvidenceFile("notes-30.md", episode), []); // 3 is digit-bounded
  assert.deepEqual(matchEvidenceFile("chat-about-lock.rs.md", episode), ["path src/lock.rs"]);
  assert.deepEqual(matchEvidenceFile("LOCK-redesign.md", episode), ["path src/lock.rs"]); // stem, case-blind
  assert.deepEqual(matchEvidenceFile("unrelated.md", episode), []);
});

test("--evidence-dir: matches by number and by path, with provenance headers", async () => {
  const { repo, shas } = await seedRepo();
  const dir = await makeBundle({
    "postmortem-7.md": "We hit the deadlock in staging first.",
    "nested/lock-redesign-chat.txt": "Chat export: queue won over striping.",
    "unrelated-9.md": "Nothing to do with this episode.",
  });
  const pack = await buildEvidencePack(episodeFor(shas), {
    repo,
    runner: fixtureRunner({ remote: false }).runner,
    evidenceDir: dir,
  });
  const md = pack.markdown;
  assert.ok(md.includes("## Local evidence"), md);
  assert.ok(md.includes(`[source: ${join(dir, "postmortem-7.md")} — matched PR #7]`), md);
  assert.ok(md.includes("We hit the deadlock in staging first."), md);
  assert.ok(md.includes(`[source: ${join(dir, "nested/lock-redesign-chat.txt")} — matched path src/lock.rs]`), md);
  assert.ok(md.includes("Chat export: queue won over striping."), md);
  assert.ok(!md.includes("unrelated-9"), md);
});

test("--evidence-dir with no matches says so instead of omitting the section", async () => {
  const { repo, shas } = await seedRepo();
  const dir = await makeBundle({ "unrelated.md": "nope" });
  const pack = await buildEvidencePack(episodeFor(shas), {
    repo,
    runner: fixtureRunner({ remote: false }).runner,
    evidenceDir: dir,
  });
  assert.ok(pack.markdown.includes("No files in "), pack.markdown);
});

// --- Budgets -----------------------------------------------------------------

test("per-file diff budget: an oversized file diff is clipped with a marker naming the file", async () => {
  const repo = await makeRepo("why-evidence-big-");
  await write(repo, "big.txt", "start\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "seed");
  await write(repo, "big.txt", Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n"));
  await write(repo, "small.txt", "tiny\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "grow");
  const sha = git(repo, "rev-parse", "HEAD");

  const pack = await buildEvidencePack(
    { id: "big", commits: [{ sha }], files: [], prs: [], issues: [] },
    { repo, runner: fixtureRunner({}).runner, perFileChars: 400 },
  );
  assert.ok(pack.markdown.includes(`[clipped: diff of big.txt in ${sha.slice(0, 7)} — showing 400 of `), pack.markdown);
  assert.ok(pack.markdown.includes("diff --git a/small.txt b/small.txt"), pack.markdown); // untouched neighbor survives whole
  assert.equal(pack.clipped.length, 1);
});

test("--max-chars: the overflowing block is truncated in place, the rest collapse into one omission marker", async () => {
  const { repo, shas } = await seedRepo();
  const budget = 900;
  const pack = await buildEvidencePack(episodeFor(shas), {
    repo,
    runner: fixtureRunner({ gh: GH_OK }).runner,
    maxChars: budget,
  });
  const md = pack.markdown;
  assert.ok(md.includes(`[clipped: --max-chars ${budget} reached`), md);
  assert.ok(/\[clipped: --max-chars 900 reached — omitted: .*\]/.test(md), md);
  assert.ok(pack.clipped.length >= 1, JSON.stringify(pack.clipped));
  // Only the clip markers themselves may exceed the budget.
  assert.ok(md.length <= budget + 400, `${md.length} chars against a ${budget} budget`);
  // Prose survives before diffs: the header and first commit are intact.
  assert.ok(md.includes("# Evidence pack: queue-locking"), md);
});

test("default budget is sane and exported", () => {
  assert.equal(DEFAULT_MAX_CHARS, 200_000);
});

// --- CLI ---------------------------------------------------------------------

test("why dig --evidence writes one pack per episode into the self-ignoring cache dir", async () => {
  const { repo, shas } = await seedRepo(); // no remote → degradation markers, no gh, no network
  const whyRoot = await scaffoldBundle(repo);
  const episodesFile = join(repo, "episodes.json");
  await writeFile(
    episodesFile,
    JSON.stringify([
      { id: "queue-locking", commits: shas.map((sha) => ({ sha })), files: ["src/lock.rs"], prs: [7], issues: [] },
      { id: "second/one", commits: [{ sha: shas[0] }], files: [], prs: [], issues: [] },
    ]),
  );

  const { io, out } = capture();
  const code = await main(["dig", "--evidence", episodesFile, "--bundle", whyRoot], repo, io);
  assert.equal(code, 0, out.join("\n"));

  const outDir = join(whyRoot, ".cache", "evidence");
  assert.deepEqual((await readdir(outDir)).sort(), ["queue-locking.md", "second-one.md"]);
  const md = await readFile(join(outDir, "queue-locking.md"), "utf8");
  assert.ok(md.includes("[unavailable: PR #7 — no git remote configured]"), md);
  assert.ok(md.includes("replace striped locks with queue (#7)"), md);
  assert.equal(await readFile(join(whyRoot, ".cache", ".gitignore"), "utf8"), "*\n");
  const text = out.join("\n");
  assert.ok(text.includes("2 evidence pack(s)"), text);
  assert.ok(text.includes("unavailable: PR #7"), text);
});

test("why dig usage errors: no mode, --episodes stub, bad --max-chars, unreadable file", async () => {
  const { repo } = await seedRepo();
  const whyRoot = await scaffoldBundle(repo);

  const bare = capture();
  assert.equal(await main(["dig", "--bundle", whyRoot], repo, bare.io), 2);
  assert.ok(bare.err.join("\n").includes("--evidence <episodes.json>"), bare.err.join("\n"));

  const episodes = capture();
  assert.equal(await main(["dig", "--episodes", "--bundle", whyRoot], repo, episodes.io), 2);
  assert.ok(episodes.err.join("\n").includes("not implemented yet"), episodes.err.join("\n"));

  const eps = join(repo, "eps.json");
  await writeFile(eps, "[]");
  const bad = capture();
  assert.equal(
    await main(["dig", "--evidence", eps, "--max-chars", "zero", "--bundle", whyRoot], repo, bad.io),
    2,
  );
  assert.ok(bad.err.join("\n").includes("--max-chars"), bad.err.join("\n"));

  const gone = capture();
  assert.equal(await main(["dig", "--evidence", join(repo, "nope.json"), "--bundle", whyRoot], repo, gone.io), 1);
  assert.ok(gone.err.join("\n").includes("cannot read episodes file"), gone.err.join("\n"));
});
