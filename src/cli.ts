#!/usr/bin/env node
// `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
// DESIGN.md is the source of truth for what each subcommand must do.

import { parseArgs, type ParseArgsConfig } from "node:util";
import { loadBundle, type WhyBundle } from "./bundle.js";
import { BundleNotFoundError, resolveBundleRoot } from "./discover.js";

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
    "  --bundle <path>  bundle root to use instead of the nearest .why/",
  ].join("\n");
}

interface CommandContext {
  values: Record<string, unknown>;
  positionals: string[];
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
  run: CommandHandler;
}

// `init` creates the bundle, so it takes no --bundle and skips discovery.
const COMMAND_SPECS: Record<Command, CommandSpec> = {
  init: { options: {}, needsBundle: false, run: notImplemented("init") },
  lint: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("lint") },
  blame: { options: BUNDLE_OPTIONS, needsBundle: true, run: notImplemented("blame") },
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
  if (!(COMMANDS as readonly string[]).includes(cmd)) {
    io.err(`why: unknown command "${cmd}"\n\n${usage()}`);
    return 2;
  }
  const command = cmd as Command;
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

  const ctx: CommandContext = { values, positionals, io };
  if (spec.needsBundle) {
    try {
      const root = resolveBundleRoot(cwd, values.bundle as string | undefined);
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
