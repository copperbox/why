// `why init`: scaffold a fresh `.why/` bundle at the repo root (DESIGN.md §1,
// §8). Everything written here must load through okf-mcp with zero validation
// problems — the bundle is plain OKF from its very first byte.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { appendLogEntry, OKF_VERSION, serializeDocument } from "@copperbox/okf-mcp";
import { CONCEPT_TYPES } from "./bundle.js";
import { BUNDLE_DIRNAME } from "./discover.js";

/** An init step that must stop the command cleanly (exit 1), not crash. */
export class InitError extends Error {}

/** One directory per concept type (DESIGN.md §1). */
export const TYPE_DIRECTORIES = CONCEPT_TYPES.map((type) => `${type}s`);

export const SNIPPET_BEGIN = "<!-- why:begin -->";
export const SNIPPET_END = "<!-- why:end -->";

/** Root of the git repo enclosing `cwd`; the bundle always lives at its top. */
export function findRepoRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  const root = result.status === 0 ? result.stdout.trim() : "";
  if (root === "") {
    throw new InitError(
      `why init: ${cwd} is not inside a git repository — init scaffolds ${BUNDLE_DIRNAME}/ at the repo root`,
    );
  }
  return root;
}

/**
 * Create `.why/` with the five type directories, a curated root index, and a
 * log seeded with an init entry. Refuses to touch an existing `.why/` — an
 * archive is history, so there is deliberately no --force.
 */
export async function scaffoldBundle(repoRoot: string): Promise<string> {
  const root = join(repoRoot, BUNDLE_DIRNAME);
  if (existsSync(root)) {
    throw new InitError(
      `why init: ${root} already exists — refusing to touch an existing archive. ` +
        "There is no --force; if you truly want to start over, remove the directory yourself.",
    );
  }
  for (const dir of TYPE_DIRECTORIES) {
    await mkdir(join(root, dir), { recursive: true });
  }
  const name = basename(repoRoot);
  const index = serializeDocument(
    {
      okf_version: OKF_VERSION,
      generated: false,
      description: `Decision archive for ${name} — the recovered why behind its code.`,
    },
    `# ${name} — decision archive\n`,
  );
  await writeFile(join(root, "index.md"), index, "utf8");
  await appendLogEntry(root, `why init: scaffolded the empty bundle (${TYPE_DIRECTORIES.join(", ")})`);
  return root;
}

/** The knowledge-capture block dropped into CLAUDE.md (DESIGN.md §8). */
export function captureSnippet(repoName: string): string {
  return [
    SNIPPET_BEGIN,
    "## Decision archive (`.why/`)",
    "",
    "This repo keeps the *why* behind its code in `.why/`, an OKF bundle of",
    "decisions, constraints, attempts, incidents, and open questions.",
    "",
    "- Before non-trivial work, consult the archive for the decisions and",
    "  constraints shaping the code you are about to change (mount it:",
    `  \`npx -y @copperbox/okf-mcp --bundle ${repoName}=.why --writable\`).`,
    "- After making a durable decision — choosing an approach, ruling one out,",
    "  hitting a constraint — record it in `.why/` while the context is fresh.",
    SNIPPET_END,
  ].join("\n");
}

/**
 * Write the capture snippet into the repo's CLAUDE.md, idempotently: create
 * the file, append the block, or replace whatever sits between the existing
 * markers. Unbalanced markers are refused — rewriting around them could
 * silently mangle a hand-edited file.
 */
export async function writeCaptureSnippet(
  repoRoot: string,
): Promise<"created" | "appended" | "replaced"> {
  const path = join(repoRoot, "CLAUDE.md");
  const block = captureSnippet(basename(repoRoot));
  let existing: string;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    await writeFile(path, `${block}\n`, "utf8");
    return "created";
  }
  const begin = existing.indexOf(SNIPPET_BEGIN);
  const end = existing.indexOf(SNIPPET_END);
  if (begin !== -1 && end !== -1 && end >= begin) {
    const updated =
      existing.slice(0, begin) + block + existing.slice(end + SNIPPET_END.length);
    await writeFile(path, updated, "utf8");
    return "replaced";
  }
  if (begin !== -1 || end !== -1) {
    throw new InitError(
      `why init: ${path} has an unbalanced ${SNIPPET_BEGIN}/${SNIPPET_END} marker pair — fix it by hand before re-running --capture-snippet`,
    );
  }
  await writeFile(path, `${existing.trimEnd()}\n\n${block}\n`, "utf8");
  return "appended";
}
