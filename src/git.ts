// Thin wrappers over read-only git plumbing, shared by the anchor resolvers
// (trace-range, find-symbol). Nothing here mutates a repository.

import { spawnSync } from "node:child_process";

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function git(repo: string, args: string[]): GitResult {
  const r = spawnSync("git", ["-C", repo, "-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) {
    throw new Error(`failed to run git ${args[0]}: ${r.error.message}`);
  }
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

export function gitOrThrow(repo: string, args: string[]): string {
  const r = git(repo, args);
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  }
  return r.stdout;
}

/** Raw file content at rev, or null if the path is absent. */
export function showFile(repo: string, rev: string, path: string): string | null {
  const r = git(repo, ["show", `${rev}:${path}`]);
  return r.status === 0 ? r.stdout : null;
}

/** File content at rev as an array of lines, or null if the path is absent. */
export function showLines(repo: string, rev: string, path: string): string[] | null {
  const content = showFile(repo, rev, path);
  if (content === null) return null;
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
