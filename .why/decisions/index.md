# decisions

# Concepts

* [as_of is provenance, so doctor does not flag clean-ancestor anchors](as-of-is-provenance.md) - A live anchor whose as_of is a clean ancestor of HEAD is stable, not stale; why doctor only flags unresolved or diverged as_ofs.
* [Autonomous build via Sandcastle + gatekeeper](autonomous-build-via-sandcastle.md) - Phases 1–4 are implemented by an issue→PR pipeline with an agent gatekeeper replacing the human merge gate.
* [`why blame` warns on every expired constraint](blame-warns-on-every-expired-constraint.md) - Expired-constraint warnings render on every blame query, not only when an edge connects the constraint to the matched code.
* [The CLI direct-run guard resolves symlinks](cli-entry-guard-resolves-symlinks.md) - why's entry-point guard realpath-resolves argv[1] before comparing to import.meta.url, so a symlinked launch still runs main() — the VS Code extension shells out through .bin symlinks.
* [Consumption before archaeology](consumption-before-archaeology.md) - Build the read side (Phase 1 CLI over hand-written bundles) before the dig pipeline (Phase 3).
* [`why doctor` reports expired constraints as their own yellow section](doctor-expired-constraints-section.md) - Doctor carries an expiredConstraints section, and a live anchor whose as_of doesn't resolve reports stale rather than being skipped.
* [Capture drafts live in a dot-dir so they never serve](drafts-dot-dir-never-serves.md) - why capture writes drafts to .why/.drafts/ (a dot-dir, not drafts/) so okf-mcp's bundle walk skips them — nothing unpromoted reaches why blame, the served bundle, or the anchor cache.
* [Edge types by section convention, not new syntax](edge-types-by-section-convention.md) - A link's meaning comes from the section it appears in (# Because of,
* [Circuit breaker: repeated escalation halts the loop for a chat](escalation-circuit-breaker.md) - An issue's second gate escalation removes it from the queue, labels it needs-chat, and the gate exits HALTED instead of promoting past the hole.
* [Issues are the spec surface](issues-are-the-spec-surface.md) - Each Phase 1–4 task is a self-contained issue with testable acceptance criteria; implementers and the gate judge against issue text.
* [Extension keys namespaced under one `why:` map](namespaced-why-frontmatter.md) - All why-specific frontmatter lives under a single `why:` key instead of flat top-level keys.
* [OKF/okf-mcp as the substrate](okf-as-substrate.md) - Bundles are plain OKF markdown served by okf-mcp, not a bespoke store.
* [Planning docs retired once the build completed](planning-docs-retired.md) - Remove PLAN.md and NOTES.md now the build is done; HOWTO.md is the operator guide and the .why/ bundle is the decision memory.
* [why serve is a scoped exception to the no-daemon rule](serve-no-daemon-exception.md) - why serve is the only foreground, blocking subcommand — an optional, localhost-only, read-only viewer; DESIGN §8's 'no daemon, run-to-completion' bullet was amended to carve the exception rather than dropped.
* [The serve UI ships zero external assets](serve-ui-ships-zero-external-assets.md) - why serve bundles all assets in-repo via esbuild and pulls nothing from a CDN — a no-external-URL test enforces it, and the hand-rolled highlighter and canvas graph exist so no third-party runtime is fetched.
* [The UI contract enforces the confidence ladder in-schema](ui-contract-enforces-ladder-in-schema.md) - story.schema.json rejects a forged hedged:false on a sub-corroborated hit via an if/then, validated by an independent ajv — so the §2 ladder holds structurally even if an upstream renderer lies.
