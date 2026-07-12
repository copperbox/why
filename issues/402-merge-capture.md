# Merge-time capture: record decisions while they're fresh
Labels: phase:4

## Context

DESIGN.md open problem #5: digging is the cold start; the steady state is capture at decision time, confidence `recorded`, because the PR discussion still holds the why.

## Scope

- `why capture --pr <n>` (and `--commit <sha>` fallback): assemble the PR's evidence (reuse the dig evidence module), then emit a *draft* concept file into `.why/drafts/` — frontmatter pre-filled (type guessed decision/attempt by merge-vs-close, `happened_on`, anchors from the diff's hunks via the anchor machinery, citations to the PR), body sections stubbed with the extracted rationale candidates quoted verbatim.
- Drafts are explicitly not part of the served bundle (okf-mcp excludes dot-dirs only, so name it `.why/drafts/`... verify; if drafts would serve, prefix filenames or use a dot-dir and document). Promotion out of drafts is an editorial act: `why capture --promote <draft>` moves it into the type directory after lint passes.
- A `docs/capture.md` recipe for wiring it as a post-merge CI job plus a capture skill (`skills/capture/SKILL.md`) that turns drafts into finished concepts (the judgment step, mirroring the dig skill's rules).

## Acceptance criteria

- [ ] Fixture-`gh` tests: draft generation from a merged PR (rationale candidates quoted, citations present, anchors derived), close-unmerged → `attempt` draft, promotion refuses lint-failing drafts.
- [ ] Served-bundle test: drafts never appear in bundle loads or `why blame` results.

## Out of scope

Running the capture skill in this PR; org-wide/webhook plumbing.
