# `why serve` — standalone local UI: blame gutter + story panel + graph
Labels: phase:6

## Context

The flagship visual: `git blame` and `why blame` side by side in a browser, for the local checkout. Localhost-only, read-only, self-contained — the okf-mcp `graph html` export proved the pattern (embedded assets, hand-rolled canvas force sim, zero CDN/network); this UI follows the same philosophy. Consumes ONLY the UI data contract (previous issue) — if the UI needs data the contract lacks, extend the contract first.

## Scope

- `why serve [--port <n>]`: local HTTP server bound to 127.0.0.1 (random free port by default, printed with the URL). Read-only — no endpoint mutates the bundle or the repo.
- JSON endpoints wrapping the engine: file tree (`git ls-files`), per-file blame (`git blame --porcelain`: commit, author, date per line), coverage (ui-index), story (blame --json for a span), graph, and doctor summary — every payload schema-valid per the contract.
- SPA (single self-contained JS/CSS bundle via esbuild at build time; no external URLs at runtime):
  - File tree sidebar → file view: line numbers, git-blame column (author/age), and a `why` gutter stripe per covered span — color by confidence, distinct treatment for expired-constraint scar tissue and open questions (glyph vocabulary from `docs/ui-contract.md`).
  - Click a covered line → story panel: cards rendering the story schema — status glyph, title, type, date, confidence badge, `renderedRationale` (already hedged), edge lists, citation links, expired-upstream warnings visually loud.
  - Graph tab: the bundle graph with type-colored nodes and relation-labeled edges (adapt the okf-mcp `visualize.ts` approach; do not fetch it at runtime).
  - Header: doctor summary chips (lost anchors, overdue reviews, open questions) linking to a plain list view.
- Keep server logic thin: endpoints call the same library functions the CLI uses; no reimplementation of blame/coverage/story assembly.

## Acceptance criteria

- [ ] Endpoint tests against a temp repo (fabricated source files matching a harbor-derived bundle's anchors): every endpoint returns schema-valid JSON; story for the lock.rs span includes the expired-constraint warning.
- [ ] Self-containment test: built assets contain no `http(s)://` references (same guarantee okf-mcp's html export makes).
- [ ] A DOM-level smoke test (jsdom or equivalent — no real browser in default verify) renders the story panel from fixture JSON and asserts the hedge prefix and expired warning are present in the DOM.
- [ ] Optional slow-tier browser test (behind `npm run test:e2e`, excluded from default verify) documented in the PR; CI-required tests must pass in the sandbox without a display.
- [ ] `why serve` on this repo itself (once `.why/` exists from the self-hosting issue) starts and serves without error — manual check noted in PR body.

## Out of scope

Editing concepts from the UI, auth, remote access, multi-repo. The VS Code extension (next issue).
