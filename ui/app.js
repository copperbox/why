// The `why serve` SPA shell: hash-routed views (file tree + blame gutter,
// graph, doctor list) over the UI data contract payloads. Dumb renderer by
// design — confidence, hedging, and health semantics all arrive precomputed
// from the JSON API; nothing here re-derives them (docs/ui-contract.md).

import { renderGraph, TYPE_COLORS } from "./graph.js";
import { renderStoryPanel } from "./story-panel.js";

const doc = document;

const state = {
  files: [],
  /** path → coverage spans (schemas/coverage.schema.json). */
  coverage: new Map(),
  coverageHead: "",
  doctor: null,
  stopGraph: null,
};

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} on ${path}`);
  }
  return res.json();
}

function h(tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

async function refreshCoverage() {
  const coverage = await api("/api/coverage");
  state.coverage = new Map(coverage.files.map((file) => [file.path, file.spans]));
  state.coverageHead = coverage.head;
}

// --- Header ------------------------------------------------------------------

const CHIP_SPECS = [
  ["lostAnchors", "lost anchors"],
  ["reviewByPastDue", "overdue reviews"],
  ["openQuestions", "open questions"],
];

function renderChips(container) {
  clear(container);
  if (!state.doctor) return;
  const sections = new Map(state.doctor.sections.map((section) => [section.key, section]));
  for (const [key, label] of CHIP_SPECS) {
    const section = sections.get(key);
    if (!section) continue;
    const tone = section.count === 0 ? "ok" : section.severity;
    const chip = h("a", `chip chip-${tone}`, `${section.count} ${label}`);
    chip.href = "#/doctor";
    container.append(chip);
  }
}

// --- File tree -----------------------------------------------------------------

function buildTree(paths) {
  const root = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push({ name: parts[parts.length - 1], path });
  }
  return root;
}

function renderTree(node, openDepth) {
  const list = h("ul", "tree");
  for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const item = h("li");
    const details = h("details");
    if (openDepth > 0) details.open = true;
    details.append(h("summary", "dir", name));
    details.append(renderTree(child, openDepth - 1));
    item.append(details);
    list.append(item);
  }
  for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
    const item = h("li");
    const link = h("a", "file", file.name);
    link.href = `#/file/${encodeURIComponent(file.path)}`;
    if (state.coverage.has(file.path)) link.append(h("span", "covered-dot", "●"));
    item.append(link);
    list.append(item);
  }
  return list;
}

// --- File view ------------------------------------------------------------------

/** Rough age for the git column: newest-commit recency at a glance. */
function age(dateStr) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(dateStr)) / 86400000));
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function covering(spans, line) {
  return spans.filter(
    (span) => span.lines === undefined || (span.lines.start <= line && line <= span.lines.end),
  );
}

/** The gutter treatment for one line: scar tissue and open questions stand
 * apart; everything else colors by confidence (docs/ui-contract.md). */
function stripeClass(spans) {
  if (spans.length === 0) return "";
  if (spans.some((span) => span.type === "constraint" && span.status === "expired")) return "why-expired";
  if (spans.some((span) => span.type === "question")) return "why-question";
  return `why-conf-${spans[0].confidence ?? "none"}`;
}

async function showFile(path, fileView, storyPanel) {
  clear(fileView);
  fileView.append(h("h2", "file-path", path));
  let blame;
  try {
    blame = await api(`/api/blame?path=${encodeURIComponent(path)}`);
  } catch (e) {
    fileView.append(h("p", "error", e.message));
    return;
  }
  // HEAD moved since the coverage snapshot — refresh rather than paint stale spans.
  if (blame.head !== state.coverageHead) await refreshCoverage();
  const spans = state.coverage.get(path) ?? [];

  const table = h("table", "code");
  let prevSha = "";
  blame.lines.forEach((line, i) => {
    const n = i + 1;
    const row = h("tr");
    row.append(h("td", "num", String(n)));
    const gitCell = h("td", "git");
    if (line.sha !== prevSha) {
      gitCell.textContent = `${line.author} · ${age(line.date)}`;
      gitCell.title = `${line.sha.slice(0, 10)} ${line.date} — ${line.summary}`;
      row.classList.add("group-start");
    }
    prevSha = line.sha;
    row.append(gitCell);
    const here = covering(spans, n);
    const why = h("td", `why ${stripeClass(here)}`);
    if (here.length > 0) {
      why.textContent = here[0].glyph;
      why.title = here.map((span) => span.conceptId).join("\n");
      row.classList.add("covered");
    }
    row.append(why);
    row.append(h("td", "text", line.text));
    row.onclick = () => showStory(path, n, storyPanel);
    table.append(row);
  });
  fileView.append(table);
}

async function showStory(path, line, storyPanel) {
  clear(storyPanel);
  try {
    const story = await api(`/api/story?path=${encodeURIComponent(path)}&start=${line}&end=${line}`);
    storyPanel.append(renderStoryPanel(doc, story));
  } catch (e) {
    storyPanel.append(h("p", "error", e.message));
  }
}

// --- Views -----------------------------------------------------------------------

function filesView(main, filePath) {
  const layout = h("div", "layout");
  const sidebar = h("aside", "sidebar");
  sidebar.append(renderTree(buildTree(state.files), 2));
  const fileView = h("section", "file-view");
  const storyPanel = h("aside", "story-panel");
  storyPanel.append(h("p", "hint", "Click a line to see the story behind it."));
  layout.append(sidebar, fileView, storyPanel);
  main.append(layout);
  if (filePath) void showFile(filePath, fileView, storyPanel);
  else fileView.append(h("p", "hint", "Pick a file — ● marks files with a recorded why."));
}

async function graphView(main) {
  const wrap = h("section", "graph-view");
  const legend = h("div", "legend");
  for (const [type, color] of Object.entries(TYPE_COLORS)) {
    const entry = h("span", "legend-entry", type);
    const dot = h("span", "legend-dot", "●");
    dot.style.color = color;
    entry.prepend(dot);
    legend.append(entry);
  }
  wrap.append(legend);
  const canvas = doc.createElement("canvas");
  wrap.append(canvas);
  main.append(wrap);
  canvas.width = Math.max(wrap.clientWidth - 16, 480);
  canvas.height = Math.max(doc.documentElement.clientHeight - 180, 420);
  try {
    const graph = await api("/api/graph");
    state.stopGraph = renderGraph(canvas, graph);
  } catch (e) {
    wrap.append(h("p", "error", e.message));
  }
}

async function doctorView(main) {
  const wrap = h("section", "doctor-view");
  main.append(wrap);
  try {
    const doctor = await api("/api/doctor");
    state.doctor = doctor;
    renderChips(doc.getElementById("chips"));
    const headline = doctor.healthy ? "healthy" : "unhealthy";
    wrap.append(
      h(
        "h2",
        `doctor-headline ${doctor.healthy ? "ok" : "red"}`,
        `why doctor: ${doctor.concepts} concepts — ${doctor.red} red, ${doctor.yellow} yellow (${headline})`,
      ),
    );
    for (const section of doctor.sections) {
      const block = h("section", "doctor-section");
      const tone = section.count === 0 ? "ok" : section.severity;
      block.append(h("h3", `doctor-title tone-${tone}`, `${section.title} — ${section.count}`));
      if (section.skipped) block.append(h("p", "hint", `not checked: ${section.skipped}`));
      if (section.items.length > 0) {
        const list = h("ul", "doctor-items");
        for (const item of section.items) list.append(h("li", "doctor-item", item));
        block.append(list);
      }
      wrap.append(block);
    }
  } catch (e) {
    wrap.append(h("p", "error", e.message));
  }
}

// --- Shell + routing ---------------------------------------------------------------

function route() {
  const main = doc.getElementById("main");
  clear(main);
  if (state.stopGraph) {
    state.stopGraph();
    state.stopGraph = null;
  }
  const hash = decodeURIComponent(location.hash);
  const segment = hash.split("/")[1] ?? "";
  const activeTab = segment === "file" ? "" : segment; // a file view is the Files tab
  for (const link of doc.querySelectorAll("nav a")) {
    link.classList.toggle("active", link.dataset.route === activeTab);
  }
  if (hash.startsWith("#/file/")) filesView(main, hash.slice("#/file/".length));
  else if (hash === "#/graph") void graphView(main);
  else if (hash === "#/doctor") void doctorView(main);
  else filesView(main, null);
}

async function boot() {
  const app = doc.getElementById("app");
  const header = h("header", "topbar");
  header.append(h("span", "brand", "why"));
  const nav = h("nav");
  for (const [label, href, route] of [
    ["Files", "#/", ""],
    ["Graph", "#/graph", "graph"],
    ["Doctor", "#/doctor", "doctor"],
  ]) {
    const link = h("a", "tab", label);
    link.href = href;
    link.dataset.route = route;
    nav.append(link);
  }
  header.append(nav);
  const chips = h("span", "chips");
  chips.id = "chips";
  header.append(chips);
  const main = h("main");
  main.id = "main";
  app.append(header, main);

  try {
    const [files, , doctor] = await Promise.all([
      api("/api/files"),
      refreshCoverage(),
      api("/api/doctor"),
    ]);
    state.files = files.files;
    state.doctor = doctor;
  } catch (e) {
    main.append(h("p", "error", e.message));
    return;
  }
  renderChips(chips);
  window.addEventListener("hashchange", route);
  route();
}

void boot();
