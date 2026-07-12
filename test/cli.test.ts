import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const { io, err } = capture();
    const code = await main(["lint"], join(root, "src/deep"), io);
    assert.equal(code, 2);
    assert.ok(err.join("\n").includes("why lint: not implemented"), err.join("\n"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("acceptance: npx tsx src/cli.ts lint --bundle examples/harbor reaches the stub", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "lint", "--bundle", "examples/harbor"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2, result.stderr);
  assert.ok(result.stderr.includes("why lint: not implemented"), result.stderr);
  assert.ok(result.stderr.includes("6 concepts"), `stub should see the loaded bundle: ${result.stderr}`);
});
