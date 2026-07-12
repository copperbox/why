# Anchor index: span→concept map with cache
Labels: phase:2

## Context

DESIGN.md §4 and §7 step 1. Phase 2 makes anchors live; this issue is the shared lookup layer `blame`, `anchor`, and `doctor` all sit on.

## Scope

- Build an in-memory index from every concept's `why.anchors`: path → ordered interval list → concept ids, distinguishing `live`/`lost` state and whole-file anchors.
- Disk cache keyed by (bundle content hash, repo HEAD): stale key → rebuild. Cache lives under `.why/.cache/` (add to the init scaffold's generated `.gitignore` handling if needed — decide and document in the PR).
- `why blame` switches to the index; behavior from the Phase 1 issue must not regress.
- Lookup API returns, per hit: concept id, the anchor entry, and whether the anchor's `as_of` matches current HEAD (staleness flag — resolution itself is the next issue).

## Acceptance criteria

- [ ] All Phase 1 blame tests still pass unchanged.
- [ ] Overlap semantics tested: point query inside range, range query straddling two anchors, whole-file anchor, `lost` anchors excluded from normal lookup but retrievable via an explicit flag.
- [ ] Cache test: build, mutate a concept file, prove rebuild; mutate nothing, prove reuse (observable via injected build counter or similar — not timing).

## Out of scope

Re-resolving stale anchors (next issue). Symbol parsing.
