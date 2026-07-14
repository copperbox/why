# VS Code extension: toggle for coverage decorations

Labels: phase:6

> Implemented directly on the `decoration-toggle` branch (not via the
> Sandcastle queue) — this file is the spec of record.

## Context

The gutter stripe + overview-ruler mark (the "green line" in the number column
and scrollbar) is painted on every covered span whenever the extension is
active. It's the right default for discovery, but it's persistent and some
find it intrusive during regular editing — the scrollbar mark especially,
since it stays visible even when scrolled away. There was no way to quiet it
short of disabling the whole extension. Add per-lane settings plus a
one-keystroke command to mute/unmute, with the scrollbar mark off by default.
Hovers and `why: Show Story` are on-demand, not passive, so they stay
available regardless — only the always-on paint is gated.

## What shipped

- Three nested settings under `contributes.configuration`:
  - `why.decorations.enabled` (boolean, default `true`) — master toggle.
  - `why.decorations.gutter` (boolean, default `true`) — the number-column stripe.
  - `why.decorations.overviewRuler` (boolean, default `false`) — the scrollbar mark.
- `why: Toggle Annotations` command (palette, `why` category) flips
  `why.decorations.enabled`, writing to the workspace scope when the setting is
  already set there, else global.
- The single per-token decoration type was split into two lanes (gutter-only
  border, ruler-only overview mark) so the lanes toggle independently. `paint`
  reads the settings via the pure `visibleLanes` helper in
  `src/core/decorations.ts` (master overrides both lanes); a hidden lane is
  cleared, not skipped, so no mark lingers after a toggle-off.
- `onDidChangeConfiguration` repaints visible editors on any `why.decorations`
  change — no CLI re-run (coverage is already cached).

## Acceptance criteria

- [x] Defaults paint the gutter stripe only; the scrollbar/overview-ruler mark
      is off until `why.decorations.overviewRuler` is enabled.
- [x] `why.decorations.enabled` = `false` (Settings UI or command) clears all
      marks within a repaint — no reload, no CLI re-run; hovers still work.
- [x] `why: Toggle Annotations` flips the setting at the right scope and the
      marks appear/disappear each invocation.
- [x] Unit test (plain `node:test`, no electron) covers `visibleLanes`:
      defaults, master override, and each lane on its own.
- [x] `docs/vscode.md` documents the settings + command; `package.json`
      `contributes` declares the command and the three config properties.

## Out of scope

A default keybinding (users bind `why.toggleAnnotations` themselves), a
status-bar affordance, and gating hovers.
