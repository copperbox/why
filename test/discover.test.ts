import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BundleNotFoundError, findBundleRoot, resolveBundleRoot } from "../src/discover.ts";

async function makeTree(dirs: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "why-discover-"));
  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true });
  }
  return root;
}

test("discovery walks up from a nested cwd to the nearest .why/", async () => {
  const root = await makeTree([".why", "src/deeply/nested"]);
  try {
    assert.equal(findBundleRoot(join(root, "src/deeply/nested")), join(root, ".why"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the nearest .why/ wins over an ancestor's", async () => {
  const root = await makeTree([".why", "pkg/.why", "pkg/src"]);
  try {
    assert.equal(findBundleRoot(join(root, "pkg/src")), join(root, "pkg/.why"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--bundle override wins over discovery", async () => {
  const root = await makeTree([".why", "elsewhere/bundle"]);
  try {
    assert.equal(
      resolveBundleRoot(root, join(root, "elsewhere/bundle")),
      join(root, "elsewhere/bundle"),
    );
    assert.equal(resolveBundleRoot(root, "elsewhere/bundle"), join(root, "elsewhere/bundle"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing bundle is an error naming why init", async () => {
  const root = await makeTree(["just/a/dir"]);
  try {
    assert.throws(
      () => resolveBundleRoot(join(root, "just/a/dir")),
      (e: unknown) =>
        e instanceof BundleNotFoundError && e.message.includes("why init"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a --bundle path that is not a directory is an error naming the path", async () => {
  const root = await makeTree([".why"]);
  try {
    assert.throws(
      () => resolveBundleRoot(root, "no/such/bundle"),
      (e: unknown) =>
        e instanceof BundleNotFoundError &&
        e.message.includes(resolve(root, "no/such/bundle")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
