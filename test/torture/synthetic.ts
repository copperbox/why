// The built-in torture scenario: a scripted repo where every refactor class
// happens in its own commit, so ground truth at HEAD is known exactly.
// Classes (issue acceptance asks for ≥8): rename, move, split file, inline,
// shift, rewrite, delete, revert — plus an untouched control.

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Expectation, SeededAnchor } from "./harness.ts";

export interface SyntheticScenario {
  repo: string;
  startRef: string;
  anchors: SeededAnchor[];
  expectations: Record<string, Expectation>;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

async function write(repo: string, rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, rel)), { recursive: true });
  await writeFile(join(repo, rel), content, "utf8");
}

function commit(repo: string, message: string): void {
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", message);
}

// --- Seed files (line numbers below are load-bearing: they are the anchors
// --- and the ground truth; change a file and re-count) ----------------------

const CONTROL = `// control module

pub fn untouched() {
    steady();
}
`;

const RENAME = `// rename module

pub fn renamed_fn() {
    body_one();
    body_two();
}
`;

const MOVE = `// move module

pub fn mover() {
    relocate();
}
`;

const SPLIT = `// split module

pub fn split_a() {
    alpha();
}

pub fn split_b() {
    beta();
    gamma();
}
`;

const SPLIT_KEPT = `// split module

pub fn split_a() {
    alpha();
}
`;

const SPLIT_B = `// split module, part two

pub fn split_b() {
    beta();
    gamma();
}
`;

const INLINE = `// inline module

fn helper_bits() {
    let x = seed();
    let y = x + 1;
    finish(y);
}

pub fn caller() {
    helper_bits();
}
`;

// The inline renames locals, as real inlining does — no anchored line
// survives textually, so the abstraction is truly gone.
const INLINE_FOLDED = `// inline module

pub fn caller() {
    let seeded = seed();
    let bumped = seeded + 1;
    finish(bumped);
}
`;

const SHIFT = `[server]
request_deadline = 47
retry_jitter = false
`;

const SHIFT_SHIFTED = `# tuned in production
# do not touch without reading the why bundle

${SHIFT}`;

const REWRITE = `// rewrite module

pub fn engine() {
    old_pipeline();
    old_cleanup();
}
`;

const REWRITE_V2 = `// rewrite module — v2

pub fn engine() {
    let stages = build_stages();
    for stage in stages {
        stage.run();
    }
    teardown();
}
`;

const DELETE = `// delete module

pub fn doomed() {
    goner();
}
`;

const REVERT = `// revert module

pub fn stable_api() {
    contract();
}

pub fn other_api() {
    unrelated();
}
`;

const REVERT_BROKEN = `// revert module

pub fn other_api() {
    unrelated();
}
`;

export const SYNTHETIC_ANCHORS: SeededAnchor[] = [
  { id: "control", path: "src/control.rs", symbol: "untouched", lines: "3-5" },
  { id: "rename", path: "src/rename.rs", symbol: "renamed_fn", lines: "3-6" },
  { id: "move", path: "src/move.rs", symbol: "mover", lines: "3-5" },
  { id: "split-file", path: "src/split.rs", symbol: "split_b", lines: "7-10" },
  { id: "inline", path: "src/inline.rs", symbol: "helper_bits", lines: "3-7" },
  { id: "shift", path: "config/shift.toml", lines: "2-3" }, // no symbol: exercises blame-trace
  { id: "rewrite", path: "src/rewrite.rs", symbol: "engine", lines: "3-6" },
  { id: "delete", path: "src/delete.rs", symbol: "doomed", lines: "3-5" },
  { id: "revert", path: "src/revert.rs", symbol: "stable_api", lines: "3-5" },
];

export const SYNTHETIC_EXPECTATIONS: Record<string, Expectation> = {
  control: { kind: "span", path: "src/control.rs", lines: "3-5" },
  rename: { kind: "span", path: "src/renamed.rs", lines: "3-6" },
  move: { kind: "span", path: "src/deep/nested/move.rs", lines: "3-5" },
  // The symbol truly lives here at HEAD; a resolver that can't connect the
  // split honestly loses it, which the verdict logic scores as honest.
  "split-file": { kind: "span", path: "src/split_b.rs", lines: "3-6" },
  inline: { kind: "lost" },
  shift: { kind: "span", path: "config/shift.toml", lines: "5-6" },
  rewrite: { kind: "span", path: "src/rewrite.rs", lines: "3-9" },
  delete: { kind: "lost" },
  revert: { kind: "span", path: "src/revert.rs", lines: "3-5" },
};

/** Build the scripted repo in a temp dir; one refactor class per commit. */
export async function buildSyntheticScenario(): Promise<SyntheticScenario> {
  const repo = await mkdtemp(join(tmpdir(), "why-torture-synthetic-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "torture@example.com");
  git(repo, "config", "user.name", "why torture");

  await write(repo, "src/control.rs", CONTROL);
  await write(repo, "src/rename.rs", RENAME);
  await write(repo, "src/move.rs", MOVE);
  await write(repo, "src/split.rs", SPLIT);
  await write(repo, "src/inline.rs", INLINE);
  await write(repo, "config/shift.toml", SHIFT);
  await write(repo, "src/rewrite.rs", REWRITE);
  await write(repo, "src/delete.rs", DELETE);
  await write(repo, "src/revert.rs", REVERT);
  commit(repo, "seed: torture scenario baseline");
  const startRef = git(repo, "rev-parse", "HEAD");

  git(repo, "mv", "src/rename.rs", "src/renamed.rs");
  commit(repo, "rename: rename.rs -> renamed.rs");

  await mkdir(join(repo, "src/deep/nested"), { recursive: true });
  git(repo, "mv", "src/move.rs", "src/deep/nested/move.rs");
  commit(repo, "move: move.rs into src/deep/nested/");

  await write(repo, "src/split.rs", SPLIT_KEPT);
  await write(repo, "src/split_b.rs", SPLIT_B);
  commit(repo, "split: extract split_b into its own file");

  await write(repo, "src/inline.rs", INLINE_FOLDED);
  commit(repo, "inline: fold helper_bits into caller");

  await write(repo, "config/shift.toml", SHIFT_SHIFTED);
  commit(repo, "shift: comment header above the server block");

  await write(repo, "src/rewrite.rs", REWRITE_V2);
  commit(repo, "rewrite: engine v2, staged pipeline");

  git(repo, "rm", "-q", "src/delete.rs");
  commit(repo, "delete: remove the doomed module");

  await write(repo, "src/revert.rs", REVERT_BROKEN);
  commit(repo, "break: drop stable_api");

  git(repo, "revert", "--no-edit", "HEAD");

  return {
    repo,
    startRef,
    anchors: SYNTHETIC_ANCHORS,
    expectations: SYNTHETIC_EXPECTATIONS,
  };
}
