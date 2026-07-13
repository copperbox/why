// Extension-host integration run (issue 503): downloads VS Code via
// @vscode/test-electron and boots the extension against a throwaway workspace
// carrying a minimal .why/ bundle. Requires a display server (xvfb in CI) and
// network access — deliberately NOT part of `npm run verify`; run it with
// `npm run test:integration`.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const workspace = await mkdtemp(path.join(tmpdir(), "vscode-why-it-"));
  await mkdir(path.join(workspace, ".why"), { recursive: true });
  await writeFile(path.join(workspace, ".why", "index.md"), "# why\n", "utf8");

  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "suite");
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust"],
  });
}

main().catch((e) => {
  console.error("integration tests failed:", e);
  process.exitCode = 1;
});
