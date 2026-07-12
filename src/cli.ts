#!/usr/bin/env node
// `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
// DESIGN.md is the source of truth for what each subcommand must do.

import { basename } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  BlameTargetError,
  buildBlameReport,
  parseBlameTarget,
  renderBlameReport,
} from "./blame.js";
import { isOneOf, loadBundle, type WhyBundle } from "./bundle.js";
import { BundleNotFoundError, resolveBundleRoot } from "./discover.js";
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
    "  --json              (blame, lint) emit the results as JSON",
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
function runBlame({ values, positionals, bundle, io }: CommandContext): number {
  if (positionals.length !== 1) {
    io.err("why blame: expected exactly one target — usage: why blame <path>[:line[-line]]");
    return 2;
  }
  try {
    const report = buildBlameReport(bundle!, parseBlameTarget(positionals[0]!));
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
  anchor: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("anchor") },
  doctor: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("doctor") },
  dig: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("dig") },
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
