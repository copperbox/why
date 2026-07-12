#!/usr/bin/env node
// `why` CLI entry point. Subcommands land phase by phase — see PLAN.md.
// DESIGN.md is the source of truth for what each subcommand must do.

export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit"] as const;
export type Command = (typeof COMMANDS)[number];

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
  ].join("\n");
}

export function main(argv: string[]): number {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(usage());
    return 0;
  }
  if ((COMMANDS as readonly string[]).includes(cmd)) {
    console.error(`why ${cmd}: not implemented yet (see PLAN.md for the phase that delivers it)`);
    return 2;
  }
  console.error(`why: unknown command "${cmd}"\n\n${usage()}`);
  return 2;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}
