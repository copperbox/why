// Incremental dig state (DESIGN.md §6, issues/304-dig-incremental.md): the
// high-water mark under <bundle>/.dig-state.json that lets routine
// `why dig --episodes` runs process only new history. The contract, in
// priority order:
//
//   - The mark advances only after a successful episode emission, atomically
//     (write-temp-rename), so a killed or failed run never moves it.
//   - Deleting the file is always safe: extraction is deterministic and the
//     dig skills update rather than duplicate, so absent state just means
//     "re-dig everything".
//   - A file this build cannot read (corrupt, or a newer schema version) is
//     an explicit error and is never overwritten — even under `--full`.
//   - A mark the repository cannot verify (unresolvable, or orphaned by a
//     history rewrite) never yields a range; the error names the ways out.

import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPlainMap } from "./bundle.js";
import { git, gitOrThrow } from "./git.js";

export const DIG_STATE_FILENAME = ".dig-state.json";
export const DIG_STATE_VERSION = 1;

export class DigStateError extends Error {}

/** Last commit a successful emission fully processed on a branch (full sha). */
export interface BranchMark {
  lastProcessed: string;
}

export interface DigState {
  version: number;
  branches: Record<string, BranchMark>;
}

export function digStatePath(bundleRoot: string): string {
  return join(bundleRoot, DIG_STATE_FILENAME);
}

const DELETE_HINT = "delete it to re-dig everything (extraction is deterministic; synthesis dedupes)";

/** Parse the state file; absent → undefined, unreadable → DigStateError. */
export async function readDigState(bundleRoot: string): Promise<DigState | undefined> {
  const path = digStatePath(bundleRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DigStateError(`dig state ${path} is not valid JSON — inspect it, or ${DELETE_HINT}`);
  }
  if (!isPlainMap(parsed)) {
    throw new DigStateError(`dig state ${path} is not a JSON object — inspect it, or ${DELETE_HINT}`);
  }
  if (parsed.version !== DIG_STATE_VERSION) {
    throw new DigStateError(
      `dig state ${path} has schema version ${JSON.stringify(parsed.version)}; this build reads version ` +
        `${DIG_STATE_VERSION} — a newer why may have written it. Inspect it, or ${DELETE_HINT}`,
    );
  }
  if (!isPlainMap(parsed.branches)) {
    throw new DigStateError(`dig state ${path} has no branches map — inspect it, or ${DELETE_HINT}`);
  }
  const branches: Record<string, BranchMark> = {};
  for (const [branch, mark] of Object.entries(parsed.branches)) {
    if (!isPlainMap(mark) || typeof mark.lastProcessed !== "string") {
      throw new DigStateError(
        `dig state ${path} entry for branch "${branch}" has no lastProcessed sha — inspect it, or ${DELETE_HINT}`,
      );
    }
    branches[branch] = { lastProcessed: mark.lastProcessed };
  }
  return { version: DIG_STATE_VERSION, branches };
}

/** Write the state atomically (temp + same-directory rename), branches sorted. */
export async function writeDigState(bundleRoot: string, state: DigState): Promise<void> {
  const path = digStatePath(bundleRoot);
  const branches: Record<string, BranchMark> = {};
  for (const branch of Object.keys(state.branches).sort()) {
    branches[branch] = state.branches[branch]!;
  }
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ version: state.version, branches }, null, 2)}\n`, "utf8");
  await rename(tmp, path); // atomic: readers see the old file or the new, never a partial write
}

export interface DigRangeOverrides {
  /** `--from <rev>`: dig from this commit (exclusive), ignoring the mark. */
  from?: string;
  /** `--full`: re-dig all history, ignoring the mark. */
  full?: boolean;
}

export interface DigRange {
  branch: string;
  /** Full sha of HEAD — where the mark lands after a successful emission. */
  head: string;
  /** Full sha of the exclusive range start; absent means full history. */
  from?: string;
  /** Commits in from..head, oldest first, full shas. */
  commits: string[];
}

/** Resolve the range a dig run should process: mark → HEAD unless overridden. */
export function resolveDigRange(
  repo: string,
  state: DigState | undefined,
  overrides: DigRangeOverrides = {},
): DigRange {
  if (overrides.from !== undefined && overrides.full === true) {
    throw new DigStateError("pass --from <rev> or --full, not both");
  }
  if (git(repo, ["rev-parse", "--show-toplevel"]).status !== 0) {
    throw new DigStateError(`${repo} is not inside a git work tree — nothing to dig`);
  }
  const headResult = git(repo, ["rev-parse", "HEAD"]);
  if (headResult.status !== 0) {
    throw new DigStateError(`${repo} has no commits yet — nothing to dig`);
  }
  const head = headResult.stdout.trim();
  const branch = gitOrThrow(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();

  let from: string | undefined;
  if (overrides.from !== undefined) {
    const r = git(repo, ["rev-parse", "--verify", "--quiet", `${overrides.from}^{commit}`]);
    if (r.status !== 0) {
      throw new DigStateError(`--from "${overrides.from}" does not resolve to a commit`);
    }
    from = r.stdout.trim();
  } else if (overrides.full !== true) {
    const mark = state?.branches[branch]?.lastProcessed;
    if (mark !== undefined) {
      const recovery =
        `pass --full or --from <rev>, or delete ${DIG_STATE_FILENAME} to re-dig everything (synthesis dedupes)`;
      const r = git(repo, ["rev-parse", "--verify", "--quiet", `${mark}^{commit}`]);
      if (r.status !== 0) {
        throw new DigStateError(
          `dig state records last processed commit ${mark} on branch ${branch}, which does not resolve ` +
            `in this repository — ${recovery}`,
        );
      }
      from = r.stdout.trim();
      if (git(repo, ["merge-base", "--is-ancestor", from, head]).status !== 0) {
        throw new DigStateError(
          `dig state records last processed commit ${mark} on branch ${branch}, which is not an ancestor ` +
            `of HEAD (history rewritten?) — ${recovery}`,
        );
      }
    }
  }

  const commits = gitOrThrow(repo, [
    "rev-list",
    "--reverse",
    from === undefined ? head : `${from}..${head}`,
  ])
    .split("\n")
    .filter((line) => line.length > 0);
  const range: DigRange = { branch, head, commits };
  if (from !== undefined) range.from = from;
  return range;
}

export type EmitEpisodes = (range: DigRange) => void | Promise<void>;

export interface DigRunResult extends DigRange {
  /** False when there was nothing new: emit was not called, state untouched. */
  emitted: boolean;
}

/**
 * The only-on-success wrapper around an episode emission (the seam
 * `why dig --episodes` extraction plugs into): resolve the range, call `emit`
 * if there is anything in it, and advance the mark to HEAD only after `emit`
 * returns. A throwing `emit` propagates with the state file untouched.
 */
export async function withDigState(
  repo: string,
  bundleRoot: string,
  overrides: DigRangeOverrides,
  emit: EmitEpisodes,
): Promise<DigRunResult> {
  // Read up front even when --full/--from ignore the mark: a state file this
  // build cannot read must fail the run before any work, or the success path
  // below would overwrite it.
  const state = await readDigState(bundleRoot);
  const range = resolveDigRange(repo, state, overrides);
  if (range.commits.length === 0) return { ...range, emitted: false };
  await emit(range);
  await writeDigState(bundleRoot, {
    version: DIG_STATE_VERSION,
    branches: { ...state?.branches, [range.branch]: { lastProcessed: range.head } },
  });
  return { ...range, emitted: true };
}
