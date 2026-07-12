import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, main, usage } from "../src/cli.ts";

test("usage names every command", () => {
  const text = usage();
  for (const cmd of COMMANDS) {
    assert.ok(text.includes(`  ${cmd}`), `usage is missing "${cmd}"`);
  }
});

test("help exits 0, unknown command exits 2", () => {
  assert.equal(main(["--help"]), 0);
  assert.equal(main(["not-a-command"]), 2);
});

test("known-but-unimplemented commands exit 2", () => {
  assert.equal(main(["blame"]), 2);
});
