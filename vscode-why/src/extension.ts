// The VS Code layer: wiring only. Every semantic decision — hedging, glyphs,
// staleness, treatment precedence — lives in src/core/ (unit-tested without
// electron) or upstream in the `why` engine. This file shells out to the CLI
// (`why export ui-index`, `why blame --json`) with the workspace root as cwd
// and paints/renders what comes back.

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { locateWhyCli, type CliLocation } from "./core/cli-locate.js";
import { parseCoverage, parseStory, type Coverage, type CoverageSpan, type Story } from "./core/contract.js";
import { ALL_TOKENS, coveringSpans, decorationRanges, type ThemeToken } from "./core/decorations.js";
import { hoverMarkdown, stalenessNote } from "./core/hover.js";
import { renderStoryHtml } from "./core/story-html.js";

const REFRESH_DEBOUNCE_MS = 300;

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      // .cmd shims on Windows only execute through a shell.
      { cwd, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${path.basename(command)} ${args.join(" ")}: ${stderr || error.message}`));
        else resolve(stdout);
      },
    );
  });
}

class WhyExtension implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly decorationTypes = new Map<ThemeToken, vscode.TextEditorDecorationType>();
  private readonly output = vscode.window.createOutputChannel("why");
  private readonly storyCache = new Map<string, Story>();
  private coverage: Coverage | undefined;
  private currentHead: string | undefined;
  private cliMissingNotified = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly root: string) {
    for (const token of ALL_TOKENS) {
      // A subtle gutter-side stripe per covered span; ThemeColor keeps every
      // color a theme token (issue 503: no hardcoded hex).
      this.decorationTypes.set(
        token,
        vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          borderWidth: "0 0 0 2px",
          borderStyle: "solid",
          borderColor: new vscode.ThemeColor(token),
          overviewRulerColor: new vscode.ThemeColor(token),
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        }),
      );
    }
  }

  private locateCli(): CliLocation | undefined {
    const setting = vscode.workspace.getConfiguration("why").get<string>("cliPath");
    const located = locateWhyCli({
      workspaceRoot: this.root,
      pathEnv: process.env.PATH,
      settingPath: setting,
      platform: process.platform,
      isFile,
    });
    if (located === undefined && !this.cliMissingNotified) {
      // One non-modal message per session, then silence (issue 503).
      this.cliMissingNotified = true;
      void vscode.window.showInformationMessage(
        "why: CLI not found (looked in node_modules/.bin, PATH, and the why.cliPath setting) — annotations disabled until it is installed.",
      );
    }
    return located;
  }

  private async why(args: string[]): Promise<string | undefined> {
    const cli = this.locateCli();
    if (cli === undefined) return undefined;
    return run(cli.command, args, this.root);
  }

  /** Repo-relative forward-slash path for a document, or undefined when the
   * document lives outside this workspace root. */
  private relPath(document: vscode.TextDocument): string | undefined {
    if (document.uri.scheme !== "file") return undefined;
    const rel = path.relative(this.root, document.uri.fsPath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep).join("/");
  }

  private spansFor(document: vscode.TextDocument): CoverageSpan[] {
    const rel = this.relPath(document);
    if (rel === undefined || this.coverage === undefined) return [];
    return this.coverage.files.find((f) => f.path === rel)?.spans ?? [];
  }

  private paint(editor: vscode.TextEditor): void {
    const ranges = decorationRanges(this.spansFor(editor.document), editor.document.lineCount);
    for (const [token, type] of this.decorationTypes) {
      const lineRanges = ranges.get(token) ?? [];
      editor.setDecorations(
        type,
        lineRanges.map((r) => new vscode.Range(r.start - 1, 0, r.end - 1, 0)),
      );
    }
  }

  async refresh(): Promise<void> {
    this.storyCache.clear();
    try {
      const raw = await this.why(["export", "ui-index"]);
      if (raw === undefined) return; // CLI missing — already notified once
      this.coverage = parseCoverage(raw);
    } catch (e) {
      // An unexportable bundle (no HEAD, contract mismatch) must not paint
      // stale marks as if they were current.
      this.coverage = undefined;
      this.output.appendLine(`refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      this.currentHead = (await run("git", ["rev-parse", "HEAD"], this.root)).trim();
    } catch {
      this.currentHead = undefined; // unverifiable — stalenessNote treats it as never fresh
    }
    for (const editor of vscode.window.visibleTextEditors) this.paint(editor);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
  }

  private async storyFor(rel: string, line: number): Promise<Story | undefined> {
    const key = `${rel}:${line}`;
    const cached = this.storyCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const raw = await this.why(["blame", `${rel}:${line}`, "--json"]);
      if (raw === undefined) return undefined;
      const story = parseStory(raw);
      this.storyCache.set(key, story);
      return story;
    } catch (e) {
      this.output.appendLine(`blame ${rel}:${line} failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  private staleNote(): string | undefined {
    if (this.coverage === undefined) return undefined;
    return stalenessNote(this.coverage.head, this.currentHead);
  }

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const rel = this.relPath(document);
    if (rel === undefined) return undefined;
    const line = position.line + 1;
    if (coveringSpans(this.spansFor(document), line).length === 0) return undefined;
    const story = await this.storyFor(rel, line);
    if (story === undefined) return undefined;
    const markdownText = hoverMarkdown(story, { staleNote: this.staleNote() });
    if (markdownText === undefined) return undefined;
    return new vscode.Hover(new vscode.MarkdownString(markdownText));
  }

  async showStory(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return;
    const rel = this.relPath(editor.document);
    if (rel === undefined) return;
    const line = editor.selection.active.line + 1;
    const story = await this.storyFor(rel, line);
    if (story === undefined) return;
    const panel = vscode.window.createWebviewPanel(
      "whyStory",
      `why: ${rel}:${line}`,
      vscode.ViewColumn.Beside,
      { enableScripts: false },
    );
    panel.webview.html = renderStoryHtml(story, { staleNote: this.staleNote() });
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this,
      vscode.commands.registerCommand("why.refresh", () => this.refresh()),
      vscode.commands.registerCommand("why.showStory", () => this.showStory()),
      vscode.languages.registerHoverProvider({ scheme: "file" }, {
        provideHover: (document, position) => this.provideHover(document, position),
      }),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) this.paint(editor);
      }),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
    );
    // Refresh whenever the archive or the checkout moves (debounced).
    for (const pattern of [".why/**", ".git/HEAD"]) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(this.root), pattern),
      );
      watcher.onDidChange(() => this.scheduleRefresh());
      watcher.onDidCreate(() => this.scheduleRefresh());
      watcher.onDidDelete(() => this.scheduleRefresh());
      context.subscriptions.push(watcher);
    }
  }

  dispose(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    for (const type of this.decorationTypes.values()) type.dispose();
    this.output.dispose();
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.find((f) =>
    existsSync(path.join(f.uri.fsPath, ".why")),
  );
  if (folder === undefined) return; // activated by workspaceContains, but the bundle is gone
  const extension = new WhyExtension(folder.uri.fsPath);
  extension.register(context);
  await extension.refresh();
}

export function deactivate(): void {}
