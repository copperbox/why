// The `why serve` SPA assets: ui/ sources bundled by esbuild into one JS and
// one CSS artifact, held in memory and served from there — the okf-mcp
// `graph html` philosophy (embedded assets, zero CDN/network). Building when
// the server starts (rather than at package build) keeps the assets exactly
// in sync with ui/ whether the CLI runs from src/ via tsx or from dist/, and
// test/serve.test.ts pins the self-containment guarantee: no http(s)://
// reference may appear in any built asset.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** The UI could not be bundled — operational, not a bug in the bundle. */
export class AssetError extends Error {}

export interface UiAssets {
  html: string;
  js: string;
  css: string;
}

// src/ and dist/ both sit one level below the package root, so this resolves
// from either layout.
const UI_DIR = fileURLToPath(new URL("../ui/", import.meta.url));

/** The page shell; app.js builds the whole UI into #app. */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>why</title>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="app"></div>
<script src="app.js" defer></script>
</body>
</html>
`;

/** Bundle ui/ into self-contained in-memory assets. */
export async function buildUiAssets(): Promise<UiAssets> {
  const result = await build({
    entryPoints: [join(UI_DIR, "app.js"), join(UI_DIR, "style.css")],
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    outdir: UI_DIR, // never written — write: false; only names the outputs
    logLevel: "silent",
  });
  let js = "";
  let css = "";
  for (const file of result.outputFiles) {
    if (file.path.endsWith(".js")) js = file.text;
    else if (file.path.endsWith(".css")) css = file.text;
  }
  if (js === "" || css === "") {
    throw new AssetError("esbuild produced no JS/CSS output for ui/ — the package's ui/ directory is missing or empty");
  }
  return { html: PAGE, js, css };
}
