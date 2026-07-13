// CLI discovery order (issue 503): workspace node_modules/.bin, then PATH,
// then the why.cliPath setting — pinned with an injected existence probe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { delimiter, join, sep } from "node:path";
import { locateWhyCli, type LocateOptions } from "../src/core/cli-locate.ts";

const WS = sep === "/" ? "/repo" : "C:\\repo";
const BIN = join(WS, "node_modules", ".bin", "why");
const PATH_DIRS = [join(WS, "irrelevant"), sep === "/" ? "/usr/local/bin" : "C:\\tools"];
const ON_PATH = join(PATH_DIRS[1]!, "why");
const SETTING = sep === "/" ? "/opt/why/bin/why" : "C:\\opt\\why.exe";

function options(existing: string[], overrides: Partial<LocateOptions> = {}): LocateOptions {
  const files = new Set(existing);
  return {
    workspaceRoot: WS,
    pathEnv: PATH_DIRS.join(delimiter),
    settingPath: SETTING,
    platform: process.platform,
    isFile: (candidate) => files.has(candidate),
    ...overrides,
  };
}

test("workspace node_modules/.bin wins over PATH and the setting", () => {
  const located = locateWhyCli(options([BIN, ON_PATH, SETTING]));
  assert.deepEqual(located, { command: BIN, source: "workspace" });
});

test("PATH is second: consulted only when node_modules/.bin has no why", () => {
  const located = locateWhyCli(options([ON_PATH, SETTING]));
  assert.deepEqual(located, { command: ON_PATH, source: "path" });
});

test("the why.cliPath setting is the last resort", () => {
  const located = locateWhyCli(options([SETTING]));
  assert.deepEqual(located, { command: SETTING, source: "setting" });
});

test("nothing found → undefined (the caller notifies once, then goes silent)", () => {
  assert.equal(locateWhyCli(options([])), undefined);
  assert.equal(locateWhyCli(options([], { pathEnv: undefined, settingPath: undefined })), undefined);
});

test("an empty cliPath setting is skipped, not probed as a file", () => {
  let probedEmpty = false;
  const opts = options([], { settingPath: "" });
  const probe = opts.isFile;
  opts.isFile = (candidate) => {
    if (candidate === "") probedEmpty = true;
    return probe(candidate);
  };
  assert.equal(locateWhyCli(opts), undefined);
  assert.equal(probedEmpty, false);
});

test("on win32 the .cmd shim in node_modules/.bin is found", () => {
  const cmd = join(WS, "node_modules", ".bin", "why.cmd");
  const located = locateWhyCli(options([cmd], { platform: "win32" }));
  assert.deepEqual(located, { command: cmd, source: "workspace" });
});
