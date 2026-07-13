// Incremental dig state (DESIGN.md §6, issues/304): the high-water mark under
// .why/.dig-state.json. The contract under test: the mark advances only after
// a successful emission (atomically), an empty range emits nothing and touches
// nothing, deleting the file just means "re-dig everything", and a state file
// this build cannot read is an explicit error, never overwritten.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import {
  DIG_STATE_FILENAME,
  DIG_STATE_VERSION,
  DigStateError,
  digStatePath,
  readDigState,
  withDigState,
  writeDigState,
  type DigRange,
} from "../src/dig-state.ts";
import { scaffoldBundle } from "../src/init.ts";
import { capture, git, makeRepo, write } from "./helpers.ts";

/** One commit with unique content; returns the full sha. */
async function addCommit(repo: string, msg: string): Promise<string> {
  await write(repo, "notes.txt", `${msg}\n`);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", msg);
  return git(repo, "rev-parse", "HEAD");
}

async function makeDigRepo(
  messages: string[],
): Promise<{ repo: string; whyRoot: string; branch: string; shas: string[] }> {
  const repo = await makeRepo("why-dig-state-");
  const shas: string[] = [];
  for (const msg of messages) shas.push(await addCommit(repo, msg));
  const whyRoot = join(repo, ".why");
  await mkdir(whyRoot);
  const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD");
  return { repo, whyRoot, branch, shas };
}

/** An emit that records what it was given. */
function recorder(): { calls: DigRange[]; emit: (r: DigRange) => Promise<void> } {
  const calls: DigRange[] = [];
  return {
    calls,
    emit: async (r) => {
      calls.push(r);
    },
  };
}

test("acceptance: first run full history, second run empty, third run exactly the delta", async () => {
  const { repo, whyRoot, branch, shas } = await makeDigRepo(["c1", "c2", "c3"]);
  try {
    // First run: no state — full history, oldest first.
    const first = recorder();
    const r1 = await withDigState(repo, whyRoot, {}, first.emit);
    assert.equal(r1.emitted, true);
    assert.equal(first.calls.length, 1);
    const call1 = first.calls[0]!;
    assert.equal(call1.branch, branch);
    assert.equal(call1.head, shas[2]);
    assert.equal(call1.from, undefined, "first run digs full history");
    assert.deepEqual(call1.commits, shas, "full history, oldest first");
    assert.deepEqual(await readDigState(whyRoot), {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: shas[2] } },
    });
    const listing = await readdir(whyRoot);
    assert.ok(listing.every((f) => !f.includes(".tmp")), `temp litter left behind: ${listing}`);
    const bytes = await readFile(digStatePath(whyRoot), "utf8");

    // Second run: no new commits — emit never called, file untouched.
    const second = recorder();
    const r2 = await withDigState(repo, whyRoot, {}, second.emit);
    assert.equal(r2.emitted, false);
    assert.deepEqual(r2.commits, []);
    assert.equal(second.calls.length, 0, "an empty range must not emit");
    assert.equal(await readFile(digStatePath(whyRoot), "utf8"), bytes, "state file untouched");

    // Third run after two new commits: exactly the delta, mark advances.
    const c4 = await addCommit(repo, "c4");
    const c5 = await addCommit(repo, "c5");
    const third = recorder();
    const r3 = await withDigState(repo, whyRoot, {}, third.emit);
    assert.equal(r3.emitted, true);
    assert.equal(third.calls[0]!.from, shas[2], "range starts at the mark");
    assert.deepEqual(third.calls[0]!.commits, [c4, c5], "exactly the new delta");
    assert.deepEqual((await readDigState(whyRoot))!.branches[branch], { lastProcessed: c5 });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("killed mid-run: a failed emission leaves the state file untouched", async () => {
  const { repo, whyRoot, branch, shas } = await makeDigRepo(["c1", "c2"]);
  try {
    // First-run failure: no state file may appear at all.
    const boom = async () => {
      throw new Error("killed mid-run");
    };
    await assert.rejects(withDigState(repo, whyRoot, {}, boom), /killed mid-run/);
    assert.equal(await readDigState(whyRoot), undefined, "failed first run must not create state");

    // Later failure: the previous mark survives byte-for-byte.
    await withDigState(repo, whyRoot, {}, recorder().emit);
    const bytes = await readFile(digStatePath(whyRoot), "utf8");
    await addCommit(repo, "c3");
    await assert.rejects(withDigState(repo, whyRoot, {}, boom), /killed mid-run/);
    assert.equal(await readFile(digStatePath(whyRoot), "utf8"), bytes, "mark must not move");
    assert.deepEqual((await readDigState(whyRoot))!.branches[branch], { lastProcessed: shas[1] });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("--from starts anywhere; the mark still advances to HEAD on success", async () => {
  const { repo, whyRoot, branch, shas } = await makeDigRepo(["c1", "c2", "c3", "c4"]);
  try {
    const short = git(repo, "rev-parse", "--short", shas[1]!);
    const { calls, emit } = recorder();
    const result = await withDigState(repo, whyRoot, { from: short }, emit);
    assert.equal(result.emitted, true);
    assert.equal(calls[0]!.from, shas[1], "--from resolves to the full sha");
    assert.deepEqual(calls[0]!.commits, [shas[2], shas[3]]);
    assert.deepEqual((await readDigState(whyRoot))!.branches[branch], { lastProcessed: shas[3] });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("--full re-digs everything despite an up-to-date mark", async () => {
  const { repo, whyRoot, shas } = await makeDigRepo(["c1", "c2"]);
  try {
    await withDigState(repo, whyRoot, {}, recorder().emit);
    const { calls, emit } = recorder();
    const result = await withDigState(repo, whyRoot, { full: true }, emit);
    assert.equal(result.emitted, true);
    assert.equal(calls[0]!.from, undefined);
    assert.deepEqual(calls[0]!.commits, shas);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("override misuse is explicit: --from with --full, or a --from that does not resolve", async () => {
  const { repo, whyRoot, shas } = await makeDigRepo(["c1"]);
  try {
    await assert.rejects(
      withDigState(repo, whyRoot, { from: shas[0], full: true }, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /not both/.test((e as Error).message),
    );
    await assert.rejects(
      withDigState(repo, whyRoot, { from: "no-such-rev" }, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /does not resolve/.test((e as Error).message),
    );
    assert.equal(await readDigState(whyRoot), undefined, "no state written by failed runs");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("an unreadable state file is an explicit error and is never overwritten — even with --full", async () => {
  const { repo, whyRoot } = await makeDigRepo(["c1"]);
  try {
    await writeFile(digStatePath(whyRoot), "not json {", "utf8");
    await assert.rejects(
      withDigState(repo, whyRoot, {}, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /delete/.test((e as Error).message),
    );
    await assert.rejects(
      withDigState(repo, whyRoot, { full: true }, recorder().emit),
      DigStateError,
      "--full must not bulldoze a state file this build cannot read",
    );
    assert.equal(await readFile(digStatePath(whyRoot), "utf8"), "not json {", "file preserved");

    // A newer schema version is equally untouchable.
    await writeFile(digStatePath(whyRoot), JSON.stringify({ version: 99, branches: {} }), "utf8");
    await assert.rejects(
      withDigState(repo, whyRoot, {}, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /version/.test((e as Error).message),
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("a mark orphaned by history rewrite errors with recovery options, never a wrong range", async () => {
  const { repo, whyRoot, branch } = await makeDigRepo(["c1", "c2"]);
  try {
    await withDigState(repo, whyRoot, {}, recorder().emit);
    git(repo, "commit", "-q", "--amend", "-m", "c2 rewritten");
    await assert.rejects(
      withDigState(repo, whyRoot, {}, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /not an ancestor/.test((e as Error).message)
        && /--full/.test((e as Error).message),
    );

    // A mark that does not resolve at all (e.g. after a gc'd rewrite).
    await writeDigState(whyRoot, {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: "0123456789abcdef0123456789abcdef01234567" } },
    });
    await assert.rejects(
      withDigState(repo, whyRoot, {}, recorder().emit),
      (e: unknown) => e instanceof DigStateError && /does not resolve/.test((e as Error).message),
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("marks for other branches survive a run on the current branch", async () => {
  const { repo, whyRoot, branch, shas } = await makeDigRepo(["c1", "c2"]);
  try {
    await writeDigState(whyRoot, {
      version: DIG_STATE_VERSION,
      branches: { "some-other-branch": { lastProcessed: shas[0]! } },
    });
    await withDigState(repo, whyRoot, {}, recorder().emit);
    assert.deepEqual((await readDigState(whyRoot))!.branches, {
      "some-other-branch": { lastProcessed: shas[0] },
      [branch]: { lastProcessed: shas[1] },
    });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test(`state file is inspectable: pretty JSON named ${DIG_STATE_FILENAME}, absent reads as undefined`, async () => {
  const { repo, whyRoot, branch, shas } = await makeDigRepo(["c1"]);
  try {
    assert.equal(await readDigState(whyRoot), undefined);
    await withDigState(repo, whyRoot, {}, recorder().emit);
    const raw = await readFile(join(whyRoot, DIG_STATE_FILENAME), "utf8");
    assert.ok(raw.endsWith("\n"), "trailing newline");
    assert.deepEqual(JSON.parse(raw), {
      version: DIG_STATE_VERSION,
      branches: { [branch]: { lastProcessed: shas[0] } },
    });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("cli: --from/--full belong to --episodes; without it they are usage errors", async () => {
  // A throwaway repo, not examples/harbor: a real run would write a
  // .dig-state.json into the committed fixture.
  const repo = await makeRepo("why-dig-state-cli-");
  try {
    await addCommit(repo, "base");
    await scaffoldBundle(repo);
    for (const flags of [["--full"], ["--from", "abc123"]]) {
      const { io, err } = capture();
      assert.equal(await main(["dig", ...flags], repo, io), 2);
      assert.ok(err.join("\n").includes("--episodes"), err.join("\n"));
    }
    // With --episodes they parse and run the real extraction.
    const { io } = capture();
    assert.equal(await main(["dig", "--episodes", "--full"], repo, io), 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
