# UI data contract: versioned JSON schemas for story, coverage, and graph
Labels: phase:5

## Context

Two UIs are coming (`why serve`, a VS Code extension) and both must be *dumb renderers* over one contract — anchor resolution and confidence semantics stay in the engine, presentation layers contain no logic that could drift. This issue formalizes what `why blame --json` started (issue "why blame — static") into a stable, versioned surface. DESIGN.md §7 governs semantics.

## Scope

- `schemas/` — JSON Schema documents, each with a top-level `schemaVersion`:
  - **story** (`why blame --json` output): target span; hits[] with concept id, type, title, description, status, `happened_on`, confidence, anchor spans, edges grouped by relation (`becauseOf`, `insteadOf`, `supersededBy`), citations (label + url), and warnings (e.g. expired upstream constraint with its blast-radius note); plus the nearest-concepts fallback shape for uncovered targets.
  - **coverage** (`why export ui-index [--out <file>]`, new subcommand): per file, ordered non-overlapping-where-possible spans → {concept id, type, status, confidence, glyph}, computed from the anchor index at HEAD; carries the resolved commit sha so consumers can detect staleness.
  - **graph**: the bundle as nodes/typed-edges (relation names from DESIGN.md §3), suitable for direct rendering.
- **Hedging lives in the data, not the renderer**: story hits carry a precomputed `renderedRationale` where sub-`corroborated` confidence already includes its hedge prefix, and a boolean `hedged`. A renderer that ignores confidence still cannot display unhedged speculation — this is the §2 invariant made structural.
- `docs/ui-contract.md`: each schema annotated with an example, the compatibility policy (additive = minor, breaking = major bump in `schemaVersion`), and renderer guidance (glyph vocabulary, status→treatment table).
- `why blame --json` and `why export ui-index` outputs validated against the schemas in tests (ajv or hand-rolled — justify in PR body).

## Acceptance criteria

- [ ] Schemas validate real outputs over `examples/harbor` (story for `src/lock.rs:47` including its expired-constraint warning; ui-index over a temp repo whose files match the harbor anchors).
- [ ] A story hit with `confidence: inferred` has `hedged: true` and a `renderedRationale` starting with the hedge prefix — asserted in tests.
- [ ] Invalid/hand-mutated payloads fail schema validation in tests (prove the schemas actually constrain).
- [ ] `docs/ui-contract.md` exists with all three schemas exampled and the versioning policy stated.

## Out of scope

Any UI. Serving over HTTP (next issue). Changing blame's human-readable output.
