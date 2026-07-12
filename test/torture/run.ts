// Manual torture runs against an arbitrary repo — see README.md here.
//
//   npx tsx test/torture/run.ts                 # built-in synthetic scenario
//   npx tsx test/torture/run.ts --repo <path|url> --start <ref> --anchors <file.json> [--report out.md]
//
// Exit codes: 0 clean, 1 WRONG > 0 (only judgeable with ground truth), 2 usage.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  renderReport,
  runTorture,
  type Expectation,
  type SeededAnchor,
  type TortureOptions,
} from "./harness.ts";
import { buildSyntheticScenario } from "./synthetic.ts";

const USAGE =
  "usage: npx tsx test/torture/run.ts [--repo <path|url> --start <ref> --anchors <file.json>] [--report <out.md>]";

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(2);
}

/** The anchors file: a bare array of anchors, or `{ anchors, expectations? }`. */
async function readAnchorsFile(path: string): Promise<{
  anchors: SeededAnchor[];
  expectations?: Record<string, Expectation>;
}> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  const anchors = Array.isArray(raw) ? raw : (raw as { anchors?: unknown }).anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) {
    fail(`${path}: expected a non-empty anchors array (bare, or under an "anchors" key)`);
  }
  for (const entry of anchors) {
    if (typeof entry?.id !== "string" || typeof entry?.path !== "string") {
      fail(`${path}: every anchor needs at least string "id" and "path": ${JSON.stringify(entry)}`);
    }
  }
  const expectations = Array.isArray(raw)
    ? undefined
    : ((raw as { expectations?: Record<string, Expectation> }).expectations);
  return { anchors: anchors as SeededAnchor[], expectations };
}

let values: Record<string, string | undefined>;
try {
  ({ values } = parseArgs({
    options: {
      repo: { type: "string" },
      start: { type: "string" },
      anchors: { type: "string" },
      report: { type: "string" },
    },
  }));
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

let options: TortureOptions;
if (values.repo === undefined) {
  console.error("no --repo given — running the built-in synthetic scenario");
  options = await buildSyntheticScenario();
} else {
  if (values.start === undefined || values.anchors === undefined) {
    fail("--repo needs --start <ref> and --anchors <file.json>");
  }
  const { anchors, expectations } = await readAnchorsFile(values.anchors);
  options = { repo: values.repo, startRef: values.start, anchors, expectations };
}

options.onStep = (done, total, commit) => {
  process.stderr.write(`\rreplayed ${done}/${total} (${commit})`);
  if (done === total) process.stderr.write("\n");
};

const result = await runTorture(options);
const report = renderReport(result);
if (values.report === undefined) {
  console.log(report);
} else {
  const out = resolve(values.report);
  await writeFile(out, report, "utf8");
  console.error(`report written to ${out}`);
}

if (result.stats) {
  const { correct, lost, wrong, total } = result.stats;
  console.error(`${correct} correct · ${lost} honestly lost · ${wrong} WRONG (of ${total} judged)`);
  process.exit(wrong > 0 ? 1 : 0);
}
const finalLost = result.journeys.filter((j) => (j.final.state ?? "live") === "lost").length;
console.error(
  `${result.journeys.length - finalLost} live · ${finalLost} lost — no ground truth; spot-audit the report`,
);
