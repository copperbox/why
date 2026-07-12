# CI recipes and the self-hosting switch
Labels: phase:4

## Context

PLAN.md Phase 4 final task: the operational story, plus the moment `why` starts running on its own repository.

## Scope

- `docs/ci.md`: copy-pasteable GitHub Actions workflows — PR gate (`why lint` + `why anchor --check`), weekly `why audit` (opening a GitHub issue from the report when something expires), post-merge `why capture`.
- Add exactly those workflows to THIS repo under `.github/workflows/`, active.
- Run `why init` on this repo and seed `.why/` by converting PLAN.md's Decision log entries into proper concepts (correct types, confidence `recorded`, citations to the relevant commits/PRs of this repo), then delete the Decision log section from PLAN.md in favor of a pointer to the bundle.
- README gains a short "self-hosted" section pointing at `.why/` as the living demo.

## Acceptance criteria

- [ ] `why lint` and `why doctor` pass on the new `.why/` bundle.
- [ ] Workflows are syntactically valid (actionlint or equivalent check in tests) and reference only npm scripts that exist.
- [ ] PLAN.md decision entries all have a corresponding concept (spot-assert two of them in tests by slug).

## Out of scope

Publishing to npm; multi-repo/org bundles.
