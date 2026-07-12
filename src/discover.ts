// Bundle discovery: find the `.why/` directory a command should operate on.

import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const BUNDLE_DIRNAME = ".why";

/** A command needed a bundle and none could be found. Rendered, not a crash. */
export class BundleNotFoundError extends Error {}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Walk up from startDir to the filesystem root; nearest `.why/` wins. */
export function findBundleRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, BUNDLE_DIRNAME);
    if (isDirectory(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * The bundle root a command should use: an explicit `--bundle` path (resolved
 * against cwd, must exist) or the nearest `.why/` above cwd.
 */
export function resolveBundleRoot(cwd: string, override?: string): string {
  if (override !== undefined) {
    const root = resolve(cwd, override);
    if (!isDirectory(root)) {
      throw new BundleNotFoundError(`why: --bundle points at ${root}, which is not a directory`);
    }
    return root;
  }
  const found = findBundleRoot(cwd);
  if (found === undefined) {
    throw new BundleNotFoundError(
      `why: no ${BUNDLE_DIRNAME}/ bundle found searching up from ${resolve(cwd)} — ` +
        "run `why init` to create one, or point at a bundle with --bundle <path>",
    );
  }
  return found;
}
