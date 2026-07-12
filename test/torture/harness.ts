// Anchor torture harness (PLAN.md Phase 2 gate): clone a repo, seed a `.why/`
// bundle with anchor claims at a start ref, then replay history to HEAD
// first-parent commit by commit, running the real `why anchor` command at
// every step — exactly what a CI hook would do. At the end each anchor's
// final claim is judged against ground truth: correct, honestly lost, or
// WRONG. WRONG means the resolver emitted a live anchor pointing at the
// wrong code — the one outcome the project promises never happens.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { normalizePath } from "../../src/blame.ts";
import { loadBundle, type Anchor } from "../../src/bundle.ts";
import { main } from "../../src/cli.ts";
import { scaffoldBundle } from "../../src/init.ts";

/** An anchor claim planted at the start ref. `id` names it in the report. */
export interface SeededAnchor {
  id: string;
  path: string;
  symbol?: string;
  /** Line span as written in frontmatter (`"41-58"` or `"41"`); absent = whole file. */
  lines?: string;
}

/** Ground truth at HEAD, when known exactly (the synthetic scenario knows). */
export type Expectation =
  | { kind: "span"; path: string; lines?: string }
  | { kind: "lost" };

/**
 * - `correct`: the final claim matches ground truth — including a lost claim
 *   on code that is truly gone (reporting lost *is* the right resolution).
 * - `honestly-lost`: the code still exists somewhere but the resolver gave
 *   up and said lost. A recall gap, never a lie.
 * - `WRONG`: the final claim is live and points at the wrong code. Silently
 *   wrong — any count above zero fails the harness run.
 */
export type Verdict = "correct" | "honestly-lost" | "WRONG";

export interface JourneyStep {
  /** Short sha of the replayed commit. */
  commit: string;
  subject: string;
  path: string;
  lines?: string;
  state: "live" | "lost";
  /** Whether `why anchor` rewrote this anchor at this step. */
  changed: boolean;
}

export interface AnchorJourney {
  seed: SeededAnchor;
  steps: JourneyStep[];
  /** The claim as the bundle records it after the last replayed commit. */
  final: Anchor;
  expected?: Expectation;
  verdict?: Verdict;
}

export interface TortureStats {
  correct: number;
  /** Honestly lost (code survives, resolver said lost). */
  lost: number;
  wrong: number;
  /** Anchors judged — equals the anchor count when full ground truth was given. */
  total: number;
}

export interface TortureResult {
  repo: string;
  startRef: string;
  /** Short sha the replay ended on. */
  head: string;
  /** Number of replayed commits. */
  steps: number;
  journeys: AnchorJourney[];
  /** Present only when at least one expectation was supplied. */
  stats?: TortureStats;
}

export interface TortureOptions {
  /** Path or URL git can clone. The original is never touched. */
  repo: string;
  startRef: string;
  anchors: SeededAnchor[];
  /** Ground truth by anchor id; anchors without one are reported unjudged. */
  expectations?: Record<string, Expectation>;
  /** Progress callback for long real-repo replays. */
  onStep?: (done: number, total: number, commit: string) => void;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} (in ${cwd}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

function slug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "anchor";
}

/** A minimal valid concept carrying exactly one seeded anchor claim. */
function conceptSource(seed: SeededAnchor, asOf: string): string {
  const lines = [
    "---",
    "type: decision",
    `title: Torture anchor ${seed.id}`,
    `description: Seeded claim for the "${seed.id}" torture anchor.`,
    "timestamp: 2026-01-01",
    "why:",
    "  status: active",
    "  confidence: recorded",
    "  anchors:",
    `    - path: ${seed.path}`,
  ];
  if (seed.symbol !== undefined) lines.push(`      symbol: ${seed.symbol}`);
  if (seed.lines !== undefined) lines.push(`      lines: ${seed.lines}`);
  lines.push(
    `      as_of: ${asOf}`,
    "      state: live",
    "---",
    "",
    `# Torture anchor ${seed.id}`,
    "",
    "Planted by the torture harness; only `why.anchors` should ever change.",
    "",
  );
  return lines.join("\n");
}

/** Judge one final claim against ground truth. Exported for unit tests. */
export function judge(final: Pick<Anchor, "path" | "lines" | "state">, expected: Expectation): Verdict {
  const live = (final.state ?? "live") === "live";
  if (!live) return expected.kind === "lost" ? "correct" : "honestly-lost";
  if (expected.kind === "lost") return "WRONG";
  const samePath = normalizePath(final.path) === normalizePath(expected.path);
  const sameLines = (final.lines ?? "") === (expected.lines ?? "");
  return samePath && sameLines ? "correct" : "WRONG";
}

function sameClaim(a: Anchor, b: Anchor): boolean {
  return (
    a.path === b.path &&
    a.lines === b.lines &&
    a.as_of === b.as_of &&
    (a.state ?? "live") === (b.state ?? "live")
  );
}

/**
 * Run the replay. Costs one clone plus one `why anchor` run per replayed
 * commit — deliberately the slow, end-to-end path (bundle load, resolution,
 * frontmatter write), because compounding across steps is what CI would see.
 */
export async function runTorture(options: TortureOptions): Promise<TortureResult> {
  const work = await mkdtemp(join(tmpdir(), "why-torture-"));
  // The clone runs from the temp dir, so a repo given as a relative local
  // path must be resolved against the caller's cwd first; URLs pass through.
  const source = existsSync(options.repo) ? resolve(options.repo) : options.repo;
  git(work, "clone", "-q", source, "clone");
  const clone = join(work, "clone");

  const startSha = git(clone, "rev-parse", "--verify", `${options.startRef}^{commit}`);
  const commits = git(clone, "rev-list", "--reverse", "--first-parent", `${startSha}..HEAD`)
    .split("\n")
    .filter(Boolean);
  if (commits.length === 0) {
    throw new Error(`nothing to replay: no first-parent commits between ${options.startRef} and HEAD`);
  }

  git(clone, "checkout", "-qf", startSha);
  const startShort = git(clone, "rev-parse", "--short", "HEAD");

  // `.why/` stays untracked in the clone, so checkouts leave it alone.
  const whyRoot = await scaffoldBundle(clone);
  const conceptIds = new Map<string, string>();
  for (const seed of options.anchors) {
    const conceptId = `decisions/torture-${slug(seed.id)}`;
    if ([...conceptIds.values()].includes(conceptId)) {
      throw new Error(`anchor ids must be unique after slugging: "${seed.id}" collides`);
    }
    conceptIds.set(seed.id, conceptId);
    await writeFile(join(whyRoot, `${conceptId}.md`), conceptSource(seed, startShort), "utf8");
  }

  const journeys = new Map<string, AnchorJourney>(
    options.anchors.map((seed) => [
      seed.id,
      { seed, steps: [], final: { path: seed.path }, expected: options.expectations?.[seed.id] },
    ]),
  );
  const previous = new Map<string, Anchor>(
    options.anchors.map((seed) => [
      seed.id,
      { path: seed.path, symbol: seed.symbol, lines: seed.lines, as_of: startShort, state: "live" },
    ]),
  );

  let headShort = startShort;
  for (const [i, sha] of commits.entries()) {
    git(clone, "checkout", "-qf", sha);
    headShort = git(clone, "rev-parse", "--short", "HEAD");
    const subject = git(clone, "log", "-1", "--format=%s", sha);

    const err: string[] = [];
    const code = await main(["anchor", "--bundle", whyRoot], clone, {
      out: () => {},
      err: (line) => err.push(line),
    });
    if (code !== 0) {
      throw new Error(`why anchor exited ${code} at ${headShort} ("${subject}"): ${err.join("\n")}`);
    }

    const bundle = await loadBundle(whyRoot);
    for (const seed of options.anchors) {
      const concept = bundle.concepts.get(conceptIds.get(seed.id)!);
      const anchor = concept?.why.anchors[0];
      if (anchor === undefined) {
        throw new Error(`anchor "${seed.id}" vanished from the bundle at ${headShort}`);
      }
      const journey = journeys.get(seed.id)!;
      journey.steps.push({
        commit: headShort,
        subject,
        path: anchor.path,
        lines: anchor.lines,
        state: anchor.state ?? "live",
        changed: !sameClaim(anchor, previous.get(seed.id)!),
      });
      journey.final = anchor;
      previous.set(seed.id, anchor);
    }
    options.onStep?.(i + 1, commits.length, headShort);
  }

  const ordered = options.anchors.map((seed) => journeys.get(seed.id)!);
  let judged = 0;
  const stats: TortureStats = { correct: 0, lost: 0, wrong: 0, total: 0 };
  for (const journey of ordered) {
    if (journey.expected === undefined) continue;
    journey.verdict = judge(journey.final, journey.expected);
    judged++;
    if (journey.verdict === "correct") stats.correct++;
    else if (journey.verdict === "honestly-lost") stats.lost++;
    else stats.wrong++;
  }
  stats.total = judged;

  return {
    repo: options.repo,
    startRef: startShort,
    head: headShort,
    steps: commits.length,
    journeys: ordered,
    stats: judged > 0 ? stats : undefined,
  };
}

// --- Report ----------------------------------------------------------------

function spanText(path: string, lines?: string): string {
  return lines === undefined ? path : `${path}:${lines}`;
}

function expectationText(expected: Expectation): string {
  return expected.kind === "lost" ? "lost (the code is truly gone)" : spanText(expected.path, expected.lines);
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** Markdown spot-audit report: survival stats, failures, every anchor's journey. */
export function renderReport(result: TortureResult): string {
  const lines: string[] = [];
  lines.push("# Anchor torture report", "");
  lines.push(`- repo: ${result.repo}`);
  lines.push(
    `- replayed: ${result.startRef}..${result.head} — ${result.steps} first-parent commit${result.steps === 1 ? "" : "s"}`,
  );
  lines.push(`- anchors: ${result.journeys.length}`, "");

  lines.push("## Survival", "");
  const finalLost = result.journeys.filter((j) => (j.final.state ?? "live") === "lost").length;
  if (result.stats) {
    const s = result.stats;
    lines.push(`**${s.correct} correct · ${s.lost} honestly lost · ${s.wrong} WRONG**`);
    const unjudged = result.journeys.length - s.total;
    if (unjudged > 0) {
      lines.push("", `${unjudged} anchor${unjudged === 1 ? "" : "s"} had no ground truth and went unjudged.`);
    }
    const honest = s.total === 0 ? 0 : ((s.correct + s.lost) / s.total) * 100;
    lines.push("", `Gate: ${honest.toFixed(1)}% resolved correctly or honestly lost (target >90%, zero WRONG).`, "");
    lines.push("## Failures", "");
    if (s.wrong === 0) {
      lines.push("None — zero silently-wrong anchors.", "");
    } else {
      for (const j of result.journeys) {
        if (j.verdict !== "WRONG") continue;
        lines.push(
          `- **${j.seed.id}**: ends live at ${spanText(j.final.path, j.final.lines)} but the truth is ${expectationText(j.expected!)} — journey below.`,
        );
      }
      lines.push("");
    }
  } else {
    lines.push(
      `**${result.journeys.length - finalLost} live · ${finalLost} lost** — no ground truth was supplied; ` +
        "spot-audit each journey below against what actually happened to the code.",
      "",
    );
  }

  lines.push("## Journeys", "");
  lines.push("`*` next to a commit means `why anchor` rewrote the claim at that step.", "");
  for (const j of result.journeys) {
    lines.push(`### ${j.seed.id}${j.verdict === undefined ? "" : ` — ${j.verdict}`}`, "");
    const symbol = j.seed.symbol === undefined ? "" : ` · symbol \`${j.seed.symbol}\``;
    lines.push(`- seeded: ${spanText(j.seed.path, j.seed.lines)}${symbol} (as_of ${result.startRef})`);
    if (j.expected !== undefined) lines.push(`- expected: ${expectationText(j.expected)}`);
    lines.push(
      `- final: ${spanText(j.final.path, j.final.lines)} · ${j.final.state ?? "live"}` +
        (j.final.as_of === undefined ? "" : ` (as_of ${j.final.as_of})`),
    );
    lines.push("", "| commit | subject | anchor | state |", "|---|---|---|---|");
    for (const step of j.steps) {
      lines.push(
        `| \`${step.commit}\`${step.changed ? " *" : ""} | ${cell(step.subject)} | ${cell(spanText(step.path, step.lines))} | ${step.state} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
