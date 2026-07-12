#!/usr/bin/env node
// `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
// DESIGN.md is the source of truth for what each subcommand must do.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { AnchorError, renderAnchorReport, resolveAnchors, writeAnchorUpdates } from "./anchor.js";
import { CACHE_DIRNAME, ensureSelfIgnoringDir, loadAnchorIndex } from "./anchors.js";
import {
  BlameTargetError,
  buildBlameReport,
  parseBlameTarget,
  renderBlameReport,
} from "./blame.js";
import { isOneOf, loadBundle, type WhyBundle } from "./bundle.js";
import { BundleNotFoundError, resolveBundleRoot } from "./discover.js";
import { buildDoctorReport, renderDoctorReport } from "./doctor.js";
import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
import { lintBundle, renderFindings } from "./lint.js";

export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit"] as const;
export type Command = (typeof COMMANDS)[number];

/** Where a command's output goes; injectable so tests can capture it. */
export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const CONSOLE_IO: CliIo = { out: console.log, err: console.error };

type CommandOptions = NonNullable<ParseArgsConfig["options"]>;

const BUNDLE_OPTIONS = {
  bundle: { type: "string" },
} as const satisfies CommandOptions;

export function usage(): string {
  return [
    "why — decision archaeology for codebases",
    "",
    "Usage: why <command> [options]",
    "",
    "Commands (unimplemented commands say so and exit 2):",
    "  init     scaffold a .why/ bundle in the current repo",
    "  lint     check the bundle against the why schema (DESIGN.md §3)",
    "  blame    show the decision story behind a file or line range",
    "  anchor   re-resolve code anchors against HEAD",
    "  doctor   report lost anchors and stale constraints",
    "  dig      reconstruct decisions from git/PR history",
    "  audit    re-verify constraints; flag expired ones",
    "",
    "Options:",
    "  --bundle <path>     bundle root to use instead of the nearest .why/",
    "                      (lint also takes the path as a positional: why lint <path>)",
    "  --capture-snippet   (init) add the knowledge-capture block to CLAUDE.md",
    "  --json              (blame, lint, doctor) emit the results as JSON",
    "  --check             (anchor) CI mode — resolve, write nothing, exit 1 on drift",
    "  --concept <id>      (anchor) re-anchor a single concept",
    "  --evidence <file>   (dig) assemble evidence packs from an --episodes JSON file",
    "  --evidence-dir <dir>  (dig) merge in local exported context (postmortems, chats)",
    "  --max-chars <n>     (dig) total size budget per evidence pack",
    "  --out <dir>         (dig) pack output dir (default <bundle>/.cache/evidence)",
  ].join("\n");
}

interface CommandContext {
  values: Record<string, unknown>;
  positionals: string[];
  /** Directory the command was invoked from. */
  cwd: string;
  /** Loaded for every command that operates on a bundle. */
  bundle?: WhyBundle;
  io: CliIo;
}

type CommandHandler = (ctx: CommandContext) => Promise<number> | number;

function notImplemented(cmd: Command): CommandHandler {
  return ({ bundle, io }) => {
    const loaded = bundle
      ? ` — bundle at ${bundle.root} loaded: ${bundle.concepts.size} concepts, ${bundle.diagnostics.length} schema diagnostics`
      : "";
    io.err(`why ${cmd}: not implemented yet (see PLAN.md for the phase that delivers it)${loaded}`);
    return 2;
  };
}

interface CommandSpec {
  /** Flags parsed strictly: an unknown flag is a usage error. */
  options: CommandOptions;
  /** Whether to discover and load a bundle before running the handler. */
  needsBundle: boolean;
  /** The command takes the bundle root as its (only) positional too. */
  positionalBundle?: boolean;
  run: CommandHandler;
}

/** `why init` — scaffold `.why/` at the repo root (DESIGN.md §1, §8). */
async function runInit({ values, cwd, io }: CommandContext): Promise<number> {
  try {
    const repoRoot = findRepoRoot(cwd);
    const root = await scaffoldBundle(repoRoot);
    const name = basename(repoRoot);
    io.out(`Initialized empty why bundle at ${root}`);
    if (values["capture-snippet"] === true) {
      io.out(`CLAUDE.md: capture snippet ${await writeCaptureSnippet(repoRoot)}`);
    }
    io.out("");
    io.out("Next steps:");
    io.out(`  - serve it to agents:   npx -y @copperbox/okf-mcp --bundle ${name}=.why --writable`);
    io.out("  - recover the backstory: why dig  (coming later — see PLAN.md)");
    return 0;
  } catch (e) {
    if (e instanceof InitError) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}

/** `why lint` — schema checks on top of OKF validation (DESIGN.md §3). */
async function runLint({ values, bundle, io }: CommandContext): Promise<number> {
  const findings = await lintBundle(bundle!);
  if (values.json === true) {
    io.out(JSON.stringify({ root: bundle!.root, findings }, null, 2));
  } else {
    for (const line of renderFindings(bundle!, findings)) io.out(line);
  }
  return findings.some((f) => f.severity === "error") ? 1 : 0;
}

/** `why blame` — the story behind a file or line range (DESIGN.md §7, static). */
async function runBlame({ values, positionals, bundle, io }: CommandContext): Promise<number> {
  if (positionals.length !== 1) {
    io.err("why blame: expected exactly one target — usage: why blame <path>[:line[-line]]");
    return 2;
  }
  try {
    const target = parseBlameTarget(positionals[0]!);
    const { index } = await loadAnchorIndex(bundle!);
    const report = buildBlameReport(bundle!, target, index);
    if (values.json === true) {
      io.out(JSON.stringify(report, null, 2));
    } else {
      for (const line of renderBlameReport(report)) io.out(line);
    }
    return 0;
  } catch (e) {
    if (e instanceof BlameTargetError) {
      io.err(`why blame: ${e.message} — usage: why blame <path>[:line[-line]]`);
      return 2;
    }
    throw e;
  }
}

/** `why anchor` — re-resolve every anchor claim against HEAD (DESIGN.md §4). */
async function runAnchor({ values, positionals, bundle, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err("why anchor: takes no positional arguments — usage: why anchor [--check] [--concept <id>]");
    return 2;
  }
  const check = values.check === true;
  try {
    const report = await resolveAnchors(bundle!, { concept: values.concept as string | undefined });
    const written = check ? [] : await writeAnchorUpdates(bundle!, report);
    for (const line of renderAnchorReport(report, { check, written })) io.out(line);
    return check && report.results.some((r) => r.changed) ? 1 : 0;
  } catch (e) {
    if (e instanceof AnchorError) {
      io.err(`why anchor: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

/** `why doctor` — bundle health report (DESIGN.md §4, §8). Read-only. */
async function runDoctor({ values, positionals, bundle, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err("why doctor: takes no positional arguments — usage: why doctor [--json]");
    return 2;
  }
  const report = await buildDoctorReport(bundle!);
  if (values.json === true) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    for (const line of renderDoctorReport(report)) io.out(line);
  }
  return report.healthy ? 0 : 1;
}

/**
 * `why dig --evidence <episodes.json>` — assemble one evidence pack per
 * episode (DESIGN.md §6 step 2). `--episodes` extraction is a later issue;
 * until it lands the episodes JSON comes from wherever the caller got it.
 */
async function runDig({ values, positionals, bundle, io }: CommandContext): Promise<number> {
  const usageLine =
    "usage: why dig --evidence <episodes.json> [--evidence-dir <dir>] [--max-chars <n>] [--out <dir>]";
  if (positionals.length > 0) {
    io.err(`why dig: takes no positional arguments — ${usageLine}`);
    return 2;
  }
  if (values.episodes === true) {
    io.err("why dig --episodes: not implemented yet (see PLAN.md for the phase that delivers it)");
    return 2;
  }
  const episodesFile = values.evidence as string | undefined;
  if (episodesFile === undefined) {
    io.err(`why dig: pass a mode — ${usageLine}`);
    return 2;
  }
  let maxChars: number | undefined;
  if (values["max-chars"] !== undefined) {
    maxChars = Number(values["max-chars"]);
    if (!Number.isInteger(maxChars) || maxChars <= 0) {
      io.err(`why dig: --max-chars must be a positive integer, got "${values["max-chars"]}"`);
      return 2;
    }
  }

  let raw: string;
  try {
    raw = await readFile(episodesFile, "utf8");
  } catch {
    io.err(`why dig: cannot read episodes file ${episodesFile}`);
    return 1;
  }
  try {
    const episodes = readEpisodes(raw, episodesFile);
    const bundleRoot = bundle!.root;
    const repo = dirname(bundleRoot);
    const outOverride = values.out as string | undefined;
    const outDir = outOverride ?? join(bundleRoot, CACHE_DIRNAME, "evidence");
    // Packs are derived state; the default location self-ignores like the
    // anchor-index cache. An explicit --out is the user's directory to manage.
    if (outOverride === undefined) await ensureSelfIgnoringDir(join(bundleRoot, CACHE_DIRNAME));
    await mkdir(outDir, { recursive: true });
    for (const episode of episodes) {
      const pack = await buildEvidencePack(episode, {
        repo,
        maxChars,
        evidenceDir: values["evidence-dir"] as string | undefined,
      });
      const file = join(outDir, `${pack.episodeId.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`);
      await writeFile(file, pack.markdown, "utf8");
      io.out(`wrote ${file} (${pack.markdown.length} chars)`);
      for (const note of pack.unavailable) io.out(`  unavailable: ${note}`);
      for (const note of pack.clipped) io.out(`  clipped: ${note}`);
    }
    io.out(`${episodes.length} evidence pack(s) in ${outDir}`);
    return 0;
  } catch (e) {
    if (e instanceof EvidenceError) {
      io.err(`why dig: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

// `init` creates the bundle, so it takes no --bundle and skips discovery.
const COMMAND_SPECS: Record<Command, CommandSpec> = {
  init: {
    options: { "capture-snippet": { type: "boolean" } },
    needsBundle: false,
    run: runInit,
  },
  lint: {
    options: { ...BUNDLE_OPTIONS, json: { type: "boolean" } },
    needsBundle: true,
    positionalBundle: true,
    run: runLint,
  },
  blame: {
    options: { ...BUNDLE_OPTIONS, json: { type: "boolean" } },
    needsBundle: true,
    run: runBlame,
  },
  anchor: {
    options: { ...BUNDLE_OPTIONS, check: { type: "boolean" }, concept: { type: "string" } },
    needsBundle: true,
    run: runAnchor,
  },
  doctor: {
    options: { ...BUNDLE_OPTIONS, json: { type: "boolean" } },
    needsBundle: true,
    run: runDoctor,
  },
  dig: {
    options: {
      ...BUNDLE_OPTIONS,
      episodes: { type: "boolean" },
      evidence: { type: "string" },
      "evidence-dir": { type: "string" },
      "max-chars": { type: "string" },
      out: { type: "string" },
    },
    needsBundle: true,
    run: runDig,
  },
  audit: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("audit") },
};

/** Exit codes: 0 ok, 1 operational error (e.g. no bundle), 2 usage/unimplemented. */
export async function main(
  argv: string[],
  cwd: string = process.cwd(),
  io: CliIo = CONSOLE_IO,
): Promise<number> {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    io.out(usage());
    return 0;
  }
  if (!isOneOf(COMMANDS, cmd)) {
    io.err(`why: unknown command "${cmd}"\n\n${usage()}`);
    return 2;
  }
  const command = cmd;
  const spec = COMMAND_SPECS[command];

  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv.slice(1),
      options: spec.options,
      allowPositionals: true,
    }));
  } catch (e) {
    io.err(`why ${command}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }

  const ctx: CommandContext = { values, positionals, cwd, io };
  if (spec.needsBundle) {
    let override = values.bundle as string | undefined;
    if (spec.positionalBundle === true && positionals.length > 0) {
      if (positionals.length > 1) {
        io.err(`why ${command}: expected at most one bundle path`);
        return 2;
      }
      if (override !== undefined) {
        io.err(`why ${command}: pass the bundle as a positional path or with --bundle, not both`);
        return 2;
      }
      override = positionals[0];
    }
    try {
      const root = resolveBundleRoot(cwd, override);
      ctx.bundle = await loadBundle(root);
    } catch (e) {
      if (e instanceof BundleNotFoundError) {
        io.err(e.message);
        return 1;
      }
      throw e;
    }
  }
  return spec.run(ctx);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  process.exit(await main(process.argv.slice(2)));
}
