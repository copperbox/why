import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COMMANDS, main, usage } from "../src/cli.ts";
import { capture } from "./helpers.ts";

test("usage names every command", () => {
  const text = usage();
  for (const cmd of COMMANDS) {
    assert.ok(text.includes(`  ${cmd}`), `usage is missing "${cmd}"`);
  }
});

test("help exits 0, unknown command exits 2", async () => {
  const { io } = capture();
  assert.equal(await main(["--help"], process.cwd(), io), 0);
  assert.equal(await main(["not-a-command"], process.cwd(), io), 2);
});

test("an unknown flag is a usage error, not a crash", async () => {
  const { io, err } = capture();
  assert.equal(await main(["blame", "--no-such-flag"], process.cwd(), io), 2);
  assert.ok(err.join("\n").includes("--no-such-flag"), err.join("\n"));
});

test("blame without a target is a usage error, not a crash", async () => {
  const { io, err } = capture();
  const code = await main(["blame", "--bundle", "examples/harbor"], process.cwd(), io);
  assert.equal(code, 2);
  assert.ok(err.join("\n").includes("why blame <path>[:line[-line]]"), err.join("\n"));
});

test("a bundle command without a discoverable bundle errors naming why init", async () => {
  const root = await mkdtemp(join(tmpdir(), "why-cli-"));
  await mkdir(join(root, "nested"), { recursive: true });
  try {
    const { io, err } = capture();
    const code = await main(["blame"], join(root, "nested"), io);
    assert.equal(code, 1);
    assert.ok(err.join("\n").includes("why init"), err.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery finds a .why/ above a nested cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "why-cli-"));
  await mkdir(join(root, ".why/decisions"), { recursive: true });
  await mkdir(join(root, "src/deep"), { recursive: true });
  try {
    const { io, out } = capture();
    const code = await main(["audit"], join(root, "src/deep"), io);
    assert.equal(code, 0);
    assert.ok(out.join("\n").includes("0 active constraints"), out.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("acceptance: npx tsx src/cli.ts lint examples/harbor is clean", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "lint", "examples/harbor"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("6 concepts"), result.stdout);
  assert.ok(result.stdout.includes("no findings"), result.stdout);
});

test("regression: main() runs when launched through a symlink", async () => {
  // npm's local installs and every node_modules/.bin shim are symlinks, and
  // that is exactly how the VS Code extension shells out to the CLI. The
  // direct-run guard must resolve argv[1]'s symlinks (import.meta.url is
  // already realpath-resolved); a naive string compare left main() silently
  // un-run — empty stdout, exit 0 — and the extension rendered nothing.
  const dir = await mkdtemp(join(tmpdir(), "why-cli-link-"));
  try {
    const link = join(dir, "why-link.ts");
    await symlink(resolve("src/cli.ts"), link);
    const result = spawnSync(process.execPath, ["--import", "tsx", link, "--help"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("why — decision archaeology"),
      `guard skipped main(): ${JSON.stringify(result.stdout)}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
