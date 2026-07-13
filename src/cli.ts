#!/usr/bin/env node
// `why` CLI entry point. DESIGN.md is the source of truth for what each
// subcommand must do.

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { AnchorError, renderAnchorReport, resolveAnchors, writeAnchorUpdates } from "./anchor.js";
import { CACHE_DIRNAME, ensureSelfIgnoringDir, loadAnchorIndex } from "./anchors.js";
import { AuditError, auditBundle, parseAnswers, renderAuditReport, type AnswerEntry } from "./audit.js";
import {
  BlameTargetError,
  buildBlameReport,
  parseBlameTarget,
  renderBlameReport,
} from "./blame.js";
import { isOneOf, loadBundle, type WhyBundle } from "./bundle.js";
import { CaptureError, captureCommit, capturePr, promoteDraft, type CaptureResult } from "./capture.js";
import { BundleNotFoundError, resolveBundleRoot } from "./discover.js";
import { DigError, extractEpisodes, plural, renderEpisodesReport } from "./dig.js";
import { DigStateError, withDigState, type DigRange, type DigRangeOverrides } from "./dig-state.js";
import { buildDoctorReport, renderDoctorReport } from "./doctor.js";
import { buildEvidencePack, EvidenceError, readEpisodes } from "./evidence.js";
import { buildGraph, buildUiIndex, EXPORT_TARGETS, ExportError } from "./export.js";
import { findRepoRoot, InitError, scaffoldBundle, writeCaptureSnippet } from "./init.js";
import { lintBundle, renderFindings } from "./lint.js";
import { ServeError, startWhyServer } from "./serve.js";
import { AssetError } from "./serve-assets.js";

export const COMMANDS = ["init", "lint", "blame", "anchor", "doctor", "dig", "audit", "capture", "export", "serve"] as const;
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
    "Commands:",
    "  init     scaffold a .why/ bundle in the current repo",
    "  lint     check the bundle against the why schema (DESIGN.md §3)",
    "  blame    show the decision story behind a file or line range",
    "  anchor   re-resolve code anchors against HEAD",
    "  doctor   report lost anchors and stale constraints",
    "  dig      reconstruct decisions from git/PR history",
    "  audit    re-verify constraints; flag expired ones",
    "  capture  draft a concept from a merged PR while the why is fresh",
    "  export   emit versioned UI-contract JSON (docs/ui-contract.md)",
    "  serve    browse blame gutter, stories, and graph in a local read-only UI",
    "",
    "Options:",
    "  --bundle <path>     bundle root to use instead of the nearest .why/",
    "                      (lint also takes the path as a positional: why lint <path>)",
    "  --capture-snippet   (init) add the knowledge-capture block to CLAUDE.md",
    "  --json              (blame, lint, doctor, dig, audit) emit the results as JSON",
    "  --check             (anchor) CI mode — resolve, write nothing, exit 1 on drift",
    "  --concept <id>      (anchor) re-anchor a single concept",
    "  --episodes          (dig) extract commit episodes + tells from git history",
    "  --from <rev>        (dig --episodes) dig from <rev> instead of the recorded high-water mark",
    "  --full              (dig --episodes) re-dig all history, ignoring the high-water mark",
    "  --evidence <file>   (dig) assemble evidence packs from an --episodes JSON file",
    "  --evidence-dir <dir>  (dig) merge in local exported context (postmortems, chats)",
    "  --max-chars <n>     (dig) total size budget per evidence pack",
    "  --out <file|dir>    (dig) write the JSON report to a file (--episodes) or pack output dir (--evidence, default <bundle>/.cache/evidence)",
    "  --questions-out <file>  (audit) export method:ask constraints as an agent questionnaire",
    "  --answers <file>    (audit) apply a filled-in questionnaire; no-longer-true expires the constraint",
    "  --pr <n>            (capture) draft from a merged/closed PR via gh into .why/.drafts/",
    "  --commit <sha>      (capture) gh-free fallback — draft from a local commit",
    "  --promote <draft>   (capture) lint-gate a draft and move it into its type directory",
    "  --out <file>        (export) write the payload to a file instead of stdout",
    "  --port <n>          (serve) port to bind on 127.0.0.1 (default: a random free port)",
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
    io.out("  - recover the backstory: why dig  (see docs/digging.md)");
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

const DIG_USAGE =
  "usage: why dig --episodes [--json] [--from <rev>|--full] [--out <file>] | " +
  "--evidence <episodes.json> [--evidence-dir <dir>] [--max-chars <n>] [--out <dir>]";

/**
 * `why dig` — either `--episodes` (deterministic episode extraction + tells,
 * DESIGN.md §6 step 1) or `--evidence <episodes.json>` (assemble one evidence
 * pack per episode, DESIGN.md §6 step 2).
 */
async function runDigEpisodes({ values, bundle, cwd, io }: CommandContext): Promise<number> {
  if (values.from !== undefined && values.full === true) {
    io.err("why dig: pass --from <rev> or --full, not both");
    return 2;
  }
  const repo = dirname(bundle!.root);
  const emitReport = async (range: DigRange): Promise<void> => {
    const report = extractEpisodes(
      repo,
      range.from === undefined ? { to: range.head } : { from: range.from, to: range.head },
    );
    const json = JSON.stringify(report, null, 2);
    const out = values.out === undefined ? undefined : resolve(cwd, values.out as string);
    if (out !== undefined) await writeFile(out, json + "\n", "utf8");
    if (values.json === true) {
      io.out(json);
    } else if (out !== undefined) {
      io.out(`wrote ${plural(report.episodes.length, "episode")} to ${out}`);
    } else {
      for (const line of renderEpisodesReport(report)) io.out(line);
    }
  };
  try {
    // Range and high-water mark live in dig-state.ts (docs/digging.md): mark →
    // HEAD unless --from/--full override, mark advanced only after emitReport
    // succeeds, unreadable state or an unverifiable mark an explicit error.
    const overrides: DigRangeOverrides = {};
    if (values.from !== undefined) overrides.from = values.from as string;
    if (values.full === true) overrides.full = true;
    const result = await withDigState(repo, bundle!.root, overrides, emitReport);
    // Nothing new since the mark: still emit the (empty) report so --json and
    // --out consumers always get one. The state file is untouched.
    if (!result.emitted) await emitReport(result);
    return 0;
  } catch (e) {
    if (e instanceof DigError || e instanceof DigStateError) {
      io.err(`why dig: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

async function runDig({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err(`why dig: takes no positional arguments — ${DIG_USAGE}`);
    return 2;
  }
  if (values.episodes !== true && (values.from !== undefined || values.full === true)) {
    io.err("why dig: --from/--full set the --episodes range — pass --episodes too");
    return 2;
  }
  if (values.episodes === true && values.evidence !== undefined) {
    io.err(`why dig: --episodes and --evidence are separate modes, pass one — ${DIG_USAGE}`);
    return 2;
  }
  if (values.episodes === true) {
    return runDigEpisodes({ values, positionals, bundle, cwd, io });
  }
  const episodesFile = values.evidence as string | undefined;
  if (episodesFile === undefined) {
    io.err(`why dig: pass a mode — ${DIG_USAGE}`);
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

/**
 * `why audit` — re-verify active constraints; expiry propagates downstream
 * (DESIGN.md §5). Exit 1 when anything newly expired: the CI signal for
 * "the archive learned something".
 */
async function runAudit({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err("why audit: takes no positional arguments — usage: why audit [--json] [--questions-out <file>] [--answers <file>]");
    return 2;
  }
  try {
    let answers: Map<string, AnswerEntry> | undefined;
    if (values.answers !== undefined) {
      const answersPath = resolve(cwd, values.answers as string);
      let text: string;
      try {
        text = await readFile(answersPath, "utf8");
      } catch {
        io.err(`why audit: cannot read answers file ${answersPath}`);
        return 1;
      }
      answers = parseAnswers(text);
    }
    const options: Parameters<typeof auditBundle>[1] = {};
    if (answers !== undefined) options.answers = answers;
    if (values["questions-out"] !== undefined) {
      options.questionsOut = resolve(cwd, values["questions-out"] as string);
    }
    const report = await auditBundle(bundle!, options);
    if (values.json === true) {
      io.out(JSON.stringify(report, null, 2));
    } else {
      for (const line of renderAuditReport(report)) io.out(line);
    }
    return report.expired.length > 0 ? 1 : 0;
  } catch (e) {
    if (e instanceof AuditError) {
      io.err(`why audit: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

const CAPTURE_USAGE = "usage: why capture --pr <n> | --commit <sha> | --promote <draft>";

/**
 * `why capture` — merge-time capture (DESIGN.md open problem #5): draft a
 * concept from a PR (or a commit, gh-free) into `.why/.drafts/`, and promote
 * drafts out editorially, gated on lint. Drafts are never served.
 */
async function runCapture({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err(`why capture: takes no positional arguments — ${CAPTURE_USAGE}`);
    return 2;
  }
  const modes = (["pr", "commit", "promote"] as const).filter((mode) => values[mode] !== undefined);
  if (modes.length !== 1) {
    io.err(`why capture: pass exactly one mode — ${CAPTURE_USAGE}`);
    return 2;
  }
  try {
    if (values.pr !== undefined) {
      const n = Number(values.pr);
      if (!Number.isInteger(n) || n <= 0) {
        io.err(`why capture: --pr must be a PR number, got "${values.pr}"`);
        return 2;
      }
      return renderCapture(await capturePr(bundle!, n), io);
    }
    if (values.commit !== undefined) {
      return renderCapture(await captureCommit(bundle!, values.commit as string), io);
    }
    const result = await promoteDraft(bundle!, values.promote as string, cwd);
    if (!result.promoted) {
      io.err(`why capture: promotion refused — ${result.path} fails lint, draft kept:`);
      for (const f of result.findings) io.err(`  ${f.severity.padEnd(7)} ${f.rule}  ${f.message}`);
      return 1;
    }
    io.out(`promoted → ${result.path}`);
    for (const f of result.findings) io.out(`  ${f.severity.padEnd(7)} ${f.rule}  ${f.message}`);
    return 0;
  } catch (e) {
    if (e instanceof CaptureError) {
      io.err(`why capture: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

const EXPORT_USAGE = "usage: why export <ui-index|graph> [--out <file>]";

/**
 * `why export` — the UI data contract payloads (docs/ui-contract.md):
 * `ui-index` (per-file coverage map from the anchor index at HEAD) and
 * `graph` (the bundle as nodes/typed edges). The story payload is
 * `why blame --json`.
 */
async function runExport({ values, positionals, bundle, cwd, io }: CommandContext): Promise<number> {
  const target = positionals.length === 1 ? positionals[0] : undefined;
  if (!isOneOf(EXPORT_TARGETS, target)) {
    io.err(`why export: pass what to export — ${EXPORT_USAGE}`);
    return 2;
  }
  try {
    let payload: unknown;
    if (target === "ui-index") {
      const { index } = await loadAnchorIndex(bundle!);
      payload = buildUiIndex(bundle!, index);
    } else {
      payload = buildGraph(bundle!);
    }
    const json = JSON.stringify(payload, null, 2);
    if (values.out === undefined) {
      io.out(json);
    } else {
      const out = resolve(cwd, values.out as string);
      await writeFile(out, json + "\n", "utf8");
      io.out(`wrote ${target} to ${out}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ExportError) {
      io.err(`why export: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

/**
 * `why serve` — the standalone local UI (DESIGN.md §8, issue 502). Localhost
 * only, read-only, self-contained assets; blocks until the server closes
 * (Ctrl-C). Endpoints are thin wrappers over the same library calls the other
 * subcommands make.
 */
async function runServe({ values, positionals, bundle, io }: CommandContext): Promise<number> {
  if (positionals.length > 0) {
    io.err("why serve: takes no positional arguments — usage: why serve [--port <n>]");
    return 2;
  }
  let port = 0;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      io.err(`why serve: --port must be a port number (1-65535), got "${values.port}"`);
      return 2;
    }
  }
  try {
    const running = await startWhyServer(bundle!.root, { port });
    io.out(`why serve: ${running.url}`);
    io.out(`  bundle ${bundle!.root} — read-only, 127.0.0.1 only; Ctrl-C to stop`);
    await new Promise<void>((resolve) => running.server.once("close", resolve));
    return 0;
  } catch (e) {
    if (e instanceof ServeError || e instanceof AssetError) {
      io.err(`why serve: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

function renderCapture(result: CaptureResult, io: CliIo): number {
  io.out(`drafted ${result.type}: ${result.draftPath}`);
  io.out(`  evidence pack: ${result.evidencePath}`);
  io.out(`  ${plural(result.candidateCount, "rationale candidate")}, ${plural(result.anchorCount, "anchor")}`);
  for (const note of result.notes) io.out(`  note: ${note}`);
  io.out(`drafts are not served — edit, then: why capture --promote ${basename(result.draftPath)}`);
  return 0;
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
      json: { type: "boolean" },
      from: { type: "string" },
      full: { type: "boolean" },
      evidence: { type: "string" },
      "evidence-dir": { type: "string" },
      "max-chars": { type: "string" },
      out: { type: "string" },
    },
    needsBundle: true,
    run: runDig,
  },
  audit: {
    options: {
      ...BUNDLE_OPTIONS,
      json: { type: "boolean" },
      "questions-out": { type: "string" },
      answers: { type: "string" },
    },
    needsBundle: true,
    run: runAudit,
  },
  capture: {
    options: {
      ...BUNDLE_OPTIONS,
      pr: { type: "string" },
      commit: { type: "string" },
      promote: { type: "string" },
    },
    needsBundle: true,
    run: runCapture,
  },
  export: {
    options: { ...BUNDLE_OPTIONS, out: { type: "string" } },
    needsBundle: true,
    run: runExport,
  },
  serve: {
    options: { ...BUNDLE_OPTIONS, port: { type: "string" } },
    needsBundle: true,
    run: runServe,
  },
};

/** Exit codes: 0 ok, 1 operational error (e.g. no bundle), 2 usage error. */
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

// Are we the entry point, or imported (e.g. by tests)? `import.meta.url` is
// realpath-resolved, but `process.argv[1]` keeps the invoked path verbatim —
// so a symlinked launch (npm's local installs and every `node_modules/.bin`
// shim are symlinks) would never match a naive string compare, and `main()`
// would silently never run. Resolve argv[1]'s symlinks to the same realpath,
// and build the URL with pathToFileURL so odd characters compare correctly.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  process.exit(await main(process.argv.slice(2)));
}
