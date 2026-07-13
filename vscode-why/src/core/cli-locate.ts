// Locate the `why` CLI. Discovery order is part of the issue's contract:
// the workspace's own node_modules/.bin first (a repo pinning its why wins),
// then PATH, then the explicit `why.cliPath` setting as the escape hatch.
// Pure function over an injectable existence probe so the order is unit-
// testable without a filesystem.

import { delimiter, join } from "node:path";

export type CliSource = "workspace" | "path" | "setting";

export interface CliLocation {
  command: string;
  source: CliSource;
}

export interface LocateOptions {
  workspaceRoot: string;
  /** The PATH environment value; undefined skips the PATH step. */
  pathEnv: string | undefined;
  /** The `why.cliPath` setting; empty/undefined skips the setting step. */
  settingPath: string | undefined;
  platform: NodeJS.Platform;
  isFile: (candidate: string) => boolean;
}

function binNames(platform: NodeJS.Platform): string[] {
  return platform === "win32" ? ["why.cmd", "why.exe", "why"] : ["why"];
}

export function locateWhyCli(options: LocateOptions): CliLocation | undefined {
  const names = binNames(options.platform);

  for (const name of names) {
    const candidate = join(options.workspaceRoot, "node_modules", ".bin", name);
    if (options.isFile(candidate)) return { command: candidate, source: "workspace" };
  }

  if (options.pathEnv !== undefined && options.pathEnv !== "") {
    for (const dir of options.pathEnv.split(delimiter)) {
      if (dir === "") continue;
      for (const name of names) {
        const candidate = join(dir, name);
        if (options.isFile(candidate)) return { command: candidate, source: "path" };
      }
    }
  }

  if (options.settingPath !== undefined && options.settingPath !== "" && options.isFile(options.settingPath)) {
    return { command: options.settingPath, source: "setting" };
  }

  return undefined;
}
