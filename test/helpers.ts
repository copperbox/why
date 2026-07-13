// Shared test scaffolding: capture CLI output, build throwaway bundles on
// disk, drive git in temp repos.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliIo } from "../src/cli.ts";

export function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

/** Write `files` (bundle-relative path → source) into a fresh temp bundle root. */
export async function makeBundle(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "why-test-"));
  for (const [rel, source] of Object.entries(files)) {
    await mkdir(join(root, rel, ".."), { recursive: true });
    await writeFile(join(root, rel), source);
  }
  return root;
}

export function git(repo: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

export async function write(repo: string, rel: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, rel)), { recursive: true });
  await writeFile(join(repo, rel), content, "utf8");
}

/** A fresh temp git repo with committer identity configured. */
export async function makeRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), prefix));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "why tests");
  return repo;
}

const HARBOR = fileURLToPath(new URL("../examples/harbor", import.meta.url));

/** A temp repo whose fabricated sources match the harbor anchors, with
 * examples/harbor committed as its .why — the serve tests' fixture. */
export async function makeHarborRepo(prefix: string): Promise<string> {
  const repo = await makeRepo(prefix);
  const body = (n: number) => Array.from({ length: n }, (_, i) => `// line ${i + 1}\n`).join("");
  await write(repo, "src/lock.rs", body(80));
  await write(repo, "src/dispatch/queue.rs", body(30));
  await write(repo, "src/server/deadline.rs", body(20));
  await write(repo, "config/defaults.toml", body(40));
  // Copy the bundle without derived state (a local .cache/ from earlier CLI
  // runs would make read-only no-cache-written assertions meaningless).
  await cp(HARBOR, join(repo, ".why"), {
    recursive: true,
    filter: (src) => !src.includes(`${join(HARBOR, ".cache")}`),
  });
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "files matching the harbor anchors");
  return repo;
}
