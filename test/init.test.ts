import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { loadBundle, validateBundle } from "@copperbox/okf-mcp";
import { main } from "../src/cli.ts";
import {
  InitError,
  SNIPPET_BEGIN,
  SNIPPET_END,
  writeCaptureSnippet,
} from "../src/init.ts";
import { capture } from "./helpers.ts";

async function makeGitRepo(): Promise<string> {
  const root = realpathSync(await mkdtemp(join(tmpdir(), "why-init-")));
  const result = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return root;
}

/** Every file under dir (recursive), as sorted relative-path → content. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const rel = join(entry.parentPath.slice(dir.length + 1) || "", entry.name);
    files.set(rel, await readFile(join(dir, rel), "utf8"));
  }
  return new Map([...files].sort());
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("init scaffolds a bundle that okf-mcp validates with zero errors", async () => {
  const repo = await makeGitRepo();
  try {
    const { io, out } = capture();
    assert.equal(await main(["init"], repo, io), 0);

    const root = join(repo, ".why");
    const dirs = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    assert.deepEqual(dirs, ["attempts", "constraints", "decisions", "incidents", "questions"]);

    const index = await readFile(join(root, "index.md"), "utf8");
    assert.ok(index.includes('okf_version: "0.1"'), index);
    assert.ok(index.includes("generated: false"), index);
    assert.ok(index.includes(`description: Decision archive for ${basename(repo)}`), index);

    const log = await readFile(join(root, "log.md"), "utf8");
    assert.ok(log.includes("why init"), log);

    const bundle = await loadBundle({ id: basename(repo), root });
    const report = await validateBundle(bundle);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);

    const text = out.join("\n");
    assert.ok(text.includes("okf-mcp"), `next steps should show the mount command: ${text}`);
    assert.ok(text.includes("why dig"), `next steps should point at why dig: ${text}`);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("init run twice exits 1 the second time and changes nothing", async () => {
  const repo = await makeGitRepo();
  try {
    const first = capture();
    assert.equal(await main(["init"], repo, first.io), 0);
    const before = await snapshot(join(repo, ".why"));

    const second = capture();
    assert.equal(await main(["init"], repo, second.io), 1);
    assert.ok(second.err.join("\n").includes(".why"), second.err.join("\n"));
    assert.deepEqual(await snapshot(join(repo, ".why")), before);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("init does not offer --force", async () => {
  const repo = await makeGitRepo();
  try {
    const { io } = capture();
    assert.equal(await main(["init", "--force"], repo, io), 2);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("init from a nested directory scaffolds at the repo root", async () => {
  const repo = await makeGitRepo();
  try {
    await mkdir(join(repo, "src/deep"), { recursive: true });
    const { io } = capture();
    assert.equal(await main(["init"], join(repo, "src/deep"), io), 0);
    await readFile(join(repo, ".why/index.md"), "utf8");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("init outside a git repository exits 1 with a clear message", async () => {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "why-nogit-")));
  try {
    const { io, err } = capture();
    assert.equal(await main(["init"], dir, io), 1);
    assert.ok(err.join("\n").includes("git"), err.join("\n"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--capture-snippet creates CLAUDE.md with one marked block", async () => {
  const repo = await makeGitRepo();
  try {
    const { io } = capture();
    assert.equal(await main(["init", "--capture-snippet"], repo, io), 0);
    const claude = await readFile(join(repo, "CLAUDE.md"), "utf8");
    assert.equal(countOccurrences(claude, SNIPPET_BEGIN), 1);
    assert.equal(countOccurrences(claude, SNIPPET_END), 1);
    assert.ok(/consult/i.test(claude), claude);
    assert.ok(/record/i.test(claude), claude);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("--capture-snippet appends to an existing CLAUDE.md without clobbering it", async () => {
  const repo = await makeGitRepo();
  try {
    await writeFile(join(repo, "CLAUDE.md"), "# my project\n\nHouse rules.\n");
    const { io } = capture();
    assert.equal(await main(["init", "--capture-snippet"], repo, io), 0);
    const claude = await readFile(join(repo, "CLAUDE.md"), "utf8");
    assert.ok(claude.startsWith("# my project"), claude);
    assert.ok(claude.includes("House rules."), claude);
    assert.equal(countOccurrences(claude, SNIPPET_BEGIN), 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("capture snippet run twice produces exactly one snippet block", async () => {
  const repo = await makeGitRepo();
  try {
    assert.equal(await writeCaptureSnippet(repo), "created");
    assert.equal(await writeCaptureSnippet(repo), "replaced");
    const claude = await readFile(join(repo, "CLAUDE.md"), "utf8");
    assert.equal(countOccurrences(claude, SNIPPET_BEGIN), 1);
    assert.equal(countOccurrences(claude, SNIPPET_END), 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("capture snippet refreshes a stale block between markers, keeping the rest", async () => {
  const repo = await makeGitRepo();
  try {
    await writeFile(
      join(repo, "CLAUDE.md"),
      `# my project\n\n${SNIPPET_BEGIN}\nstale instructions\n${SNIPPET_END}\n\nMore rules.\n`,
    );
    assert.equal(await writeCaptureSnippet(repo), "replaced");
    const claude = await readFile(join(repo, "CLAUDE.md"), "utf8");
    assert.ok(!claude.includes("stale instructions"), claude);
    assert.ok(claude.startsWith("# my project"), claude);
    assert.ok(claude.includes("More rules."), claude);
    assert.equal(countOccurrences(claude, SNIPPET_BEGIN), 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("capture snippet refuses an unbalanced marker pair instead of corrupting", async () => {
  const repo = await makeGitRepo();
  try {
    await writeFile(join(repo, "CLAUDE.md"), `# my project\n\n${SNIPPET_BEGIN}\nno end marker\n`);
    await assert.rejects(
      () => writeCaptureSnippet(repo),
      (e: unknown) => e instanceof InitError && e.message.includes("marker"),
    );
    const claude = await readFile(join(repo, "CLAUDE.md"), "utf8");
    assert.equal(countOccurrences(claude, SNIPPET_BEGIN), 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("init --capture-snippet on an already-initialized repo exits 1 touching nothing", async () => {
  const repo = await makeGitRepo();
  try {
    const first = capture();
    assert.equal(await main(["init", "--capture-snippet"], repo, first.io), 0);
    const before = await readFile(join(repo, "CLAUDE.md"), "utf8");

    const second = capture();
    assert.equal(await main(["init", "--capture-snippet"], repo, second.io), 1);
    assert.equal(await readFile(join(repo, "CLAUDE.md"), "utf8"), before);
    assert.equal(countOccurrences(before, SNIPPET_BEGIN), 1);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
