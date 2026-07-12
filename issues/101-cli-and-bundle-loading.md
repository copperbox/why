# CLI foundation: subcommand dispatch, bundle discovery, and schema-aware loading
Labels: Sandcastle, phase:1

## Context

`src/cli.ts` is a stub that knows the command names and nothing else. Everything in Phase 1 (DESIGN.md §8 "Implementation shape") builds on a real CLI foundation and a typed in-memory view of a `.why/` bundle. Bundle *parsing* must come from `@copperbox/okf-mcp` (add it as a dependency) — do not hand-roll frontmatter or link parsing.

## Scope

- Subcommand dispatch with per-command flag parsing (node's `util.parseArgs` is enough; no CLI framework).
- Bundle discovery: walk up from cwd to the nearest `.why/` directory; `--bundle <path>` overrides. A missing bundle is a clear error naming `why init`.
- `src/bundle.ts`: load a bundle via okf-mcp's library surface into typed structures — for each concept: id, OKF frontmatter, the parsed `why:` extension map (see DESIGN.md §2 for every field, including per-type `status` vocab, `confidence`, `anchors[]`, `verify`), body sections, and outgoing links tagged with the section they appear in (DESIGN.md §3 table).
- Malformed `why:` data must load permissively (OKF spirit): collect per-concept problems into a diagnostics list instead of throwing; `why lint` (separate issue) will render them.

## Acceptance criteria

- [ ] `npx tsx src/cli.ts blame --bundle examples/harbor` reaches the blame handler (which may still be unimplemented) instead of erroring on flags.
- [ ] `loadBundle("examples/harbor")` returns 6 concepts; `decisions/queue-based-locking` has 2 anchors, confidence `recorded`, and a `# Because of` link set of exactly `{incidents/2024-03-lock-stall, attempts/striped-rwlock}`.
- [ ] A concept with `confidence: banana` loads with a diagnostic, not an exception; the diagnostic names the file, the field, and the allowed values.
- [ ] Tests cover: discovery walking up from a nested cwd, `--bundle` override, missing-bundle error text, and the harbor assertions above.

## Out of scope

Rendering, linting rules, anchor resolution — later issues. Do not modify `examples/harbor/`.
