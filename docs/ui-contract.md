# The UI data contract

Every `why` UI — the local web UI (issue 502) and the VS Code extension
(issue 503) — is a *dumb renderer* over the three versioned JSON payloads
documented here. Anchor resolution, confidence semantics, and hedging stay in
the engine; a presentation layer contains no logic that could drift from
DESIGN.md. The schemas are JSON Schema (draft 2020-12) documents in
[schemas/](../schemas/), and [test/ui-contract.test.ts](../test/ui-contract.test.ts)
validates the engine's real outputs (and this document's examples) against
them on every run.

| Payload | Produced by | Schema |
|---|---|---|
| story | `why blame <target> --json` | [schemas/story.schema.json](../schemas/story.schema.json) |
| coverage | `why export ui-index [--out <file>]` | [schemas/coverage.schema.json](../schemas/coverage.schema.json) |
| graph | `why export graph [--out <file>]` | [schemas/graph.schema.json](../schemas/graph.schema.json) |

## Versioning policy

Each schema document and each payload carry a `schemaVersion` — an integer
naming the **major** version of that payload's shape.

- **Additive changes are minor**: a new optional field updates the schema
  document in place without bumping `schemaVersion`. A renderer must ignore
  fields it does not recognize (the schemas here are strict —
  `additionalProperties: false` — so *producer* tests catch accidental
  fields; consumers should not re-validate payloads at runtime).
- **Breaking changes are major**: renaming, removing, or retyping a field, or
  changing its semantics, bumps the `schemaVersion` const in the schema and
  the value the engine emits. A renderer that sees a `schemaVersion` above
  the one it was built for must say so rather than guess.

## Renderer guidance

**Hedging lives in the data, not the renderer.** Every story hit carries
`renderedRationale` — the one-line rationale with its mandatory hedge prefix
already baked in (`likely — ` for `inferred`; `speculation, thin evidence — `
for `speculative` *and* for an unstated confidence, which never hedges less
than the evidence supports) — plus a boolean `hedged`. Display
`renderedRationale` verbatim; never reconstruct it from `description` +
`confidence`. A renderer that ignores confidence entirely still cannot show
unhedged speculation, and the story schema enforces the invariant
structurally: a payload claiming `hedged: false` on an `inferred` hit fails
validation.

```jsonc
// a hedged hit, abbreviated
{
  "confidence": "inferred",
  "hedged": true,
  "description": "The cache is sized to fit one shard.",
  "renderedRationale": "likely — The cache is sized to fit one shard."
}
```

**Glyph vocabulary** (precomputed into coverage spans; stories derive the same
way from `type` + `status`):

| Glyph | Meaning |
|---|---|
| `●` | live concept — a decision, constraint, attempt, or incident in a non-warning status |
| `⚠` | warning — an `expired` constraint or a `superseded` decision |
| `?` | question — an honest gap; there is no rationale to render |

**Status → treatment** (statuses are per-type, DESIGN.md §2):

| Status | On | Treatment |
|---|---|---|
| `active` | decision, constraint | normal emphasis — this is why the code is shaped this way |
| `superseded` | decision | de-emphasize; link onward via the `supersededBy` edges |
| `reversed` | decision | de-emphasize; historical |
| `expired` | constraint | loud warning treatment; always show the `downstream` blast radius ("may now be scar tissue") |
| `unknown` | constraint | uncertainty badge; suggest `why audit` |
| `failed` / `abandoned` / `partial` | attempt | muted, historical — the road not taken |
| `resolved` | incident | normal, historical |
| `recurring` | incident | warning-adjacent — it will happen again |
| `open` | question | prominent — an unanswered gap invites the reader |
| `answered` | question | muted |

## Story — `why blame --json`

The decision story behind a file or line range: the resolved `target`, the
narrowest covering anchor `span`, `hits` (concepts anchored on the target,
newest first), `warnings` (every expired constraint not already among the
hits — the DESIGN.md §5 payoff is never invisible, each with its `downstream`
blast radius), and `nearby` — the fallback list of the nearest anchored
concepts when nothing covers the target, so output is never empty. Each hit
carries its anchors as written, outgoing edges grouped by relation
(`becauseOf`, `insteadOf`, `supersededBy`), citations as label + url, and the
precomputed `hedged` / `renderedRationale` pair described above.

Example (`why blame src/lock.rs:47 --json` over [examples/harbor](../examples/harbor/), abbreviated to one hit):

```json
{
  "schemaVersion": 1,
  "target": { "path": "src/lock.rs", "lines": { "start": 47, "end": 47 } },
  "span": "src/lock.rs:41-58 · acquire_shared",
  "hits": [
    {
      "id": "decisions/queue-based-locking",
      "title": "Queue-based locking",
      "type": "decision",
      "status": "active",
      "happened_on": "2024-03-14",
      "confidence": "recorded",
      "description": "Serialize all shard mutations through a single ordered command queue instead of striped RwLocks.",
      "hedged": false,
      "renderedRationale": "Serialize all shard mutations through a single ordered command queue instead of striped RwLocks.",
      "anchors": [
        { "path": "src/lock.rs", "symbol": "acquire_shared", "lines": "41-58", "as_of": "a3f9c2e", "state": "live" }
      ],
      "edges": {
        "becauseOf": [
          { "title": "2024-03 lock stall", "id": "incidents/2024-03-lock-stall", "type": "incident", "status": "resolved" }
        ],
        "insteadOf": [
          { "title": "Striped RwLock", "id": "attempts/striped-rwlock", "type": "attempt", "status": "failed" }
        ],
        "supersededBy": []
      },
      "citations": [
        { "label": "PR #212: replace striped locks with command queue", "url": "https://github.com/acme/harbor/pull/212" }
      ],
      "evidence": ["PR #212"],
      "downstream": []
    }
  ],
  "warnings": [
    {
      "id": "constraints/acme-45s-timeout",
      "title": "Acme 45s gateway timeout",
      "type": "constraint",
      "status": "expired",
      "happened_on": "2024-01-08",
      "expired_on": "2025-06-30",
      "confidence": "recorded",
      "description": "AcmeCorp's API gateway killed any request exceeding 45 seconds — contractual latency ceiling on job submission.",
      "hedged": false,
      "renderedRationale": "AcmeCorp's API gateway killed any request exceeding 45 seconds — contractual latency ceiling on job submission.",
      "anchors": [],
      "edges": { "becauseOf": [], "insteadOf": [], "supersededBy": [] },
      "citations": [
        { "label": "Issue #612: remove Acme-specific rate tier", "url": "https://github.com/acme/harbor/issues/612" }
      ],
      "evidence": ["Issue #612"],
      "downstream": [
        { "title": "47s request deadline", "id": "decisions/47s-request-deadline", "type": "decision", "status": "active" }
      ]
    }
  ],
  "nearby": []
}
```

Notes:

- `warnings` entries share the hit shape; their `anchors` list is empty when
  no anchor of theirs covers the target, and `downstream` lists the still-
  `active` decisions reachable via their led-to edges — render each as
  "may now be scar tissue".
- On an uncovered target, `hits` and `warnings` behave as above and `nearby`
  lists up to five anchored concepts ranked by directory distance, each with
  the anchor that placed it — never empty output for a bundle with anchors.
- `evidence` is derived convenience (citation labels clipped at the first
  colon, deduplicated) for one-line rendering; `citations` is the full
  label + url list.

## Coverage — `why export ui-index`

The per-file coverage map a gutter/decoration UI paints from: for every file
carrying at least one live anchor claim, its spans in order — whole-file
claims first (no `lines`), then ranged spans by start. Spans are
non-overlapping where possible, but two concepts may honestly claim
overlapping ranges; renderers stack or merge as they see fit. Each span
resolves the claiming concept's `type`, `status`, `confidence`, and
precomputed `glyph`. The payload is computed from the anchor index at HEAD
and carries that resolved commit sha as `head`, so a consumer can detect that
its checkout has moved on (re-run `why anchor`, then re-export). Exporting
without a resolvable HEAD is an error, not an unstamped payload.

Two kinds of anchor never paint spans: a `state: lost` anchor is a last-known
location, not a live claim, and an anchor whose `lines` value does not parse
cannot verifiably cover any span (`why lint` reports it as W103) — silently
painting either would be a silently-wrong anchor.

Example (the harbor bundle dropped into a repo whose files match its anchors, abbreviated):

```json
{
  "schemaVersion": 1,
  "head": "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c",
  "files": [
    {
      "path": "config/defaults.toml",
      "spans": [
        {
          "conceptId": "decisions/47s-request-deadline",
          "type": "decision",
          "glyph": "●",
          "status": "active",
          "confidence": "corroborated",
          "lines": { "start": 22, "end": 24 }
        },
        {
          "conceptId": "questions/why-retry-jitter-disabled",
          "type": "question",
          "glyph": "?",
          "status": "open",
          "lines": { "start": 31, "end": 31 }
        }
      ]
    },
    {
      "path": "src/lock.rs",
      "spans": [
        {
          "conceptId": "incidents/2024-03-lock-stall",
          "type": "incident",
          "glyph": "●",
          "status": "resolved",
          "confidence": "recorded"
        },
        {
          "conceptId": "decisions/queue-based-locking",
          "type": "decision",
          "glyph": "●",
          "status": "active",
          "confidence": "recorded",
          "lines": { "start": 41, "end": 58 }
        }
      ]
    }
  ]
}
```

## Graph — `why export graph`

The bundle as nodes and typed edges, suitable for direct rendering: every
concept becomes a node (ordered by id), and every resolved link in one of the
four DESIGN.md §3 edge sections becomes an edge with its relation name —
`becauseOf`, `insteadOf`, `supersededBy`, `ledTo` — ordered by
(from, relation, to). Links outside edge sections (narrative, citations) and
edge links that do not resolve to a concept in the bundle are not edges; the
latter are `why lint`'s broken-link findings.

Example ([examples/harbor](../examples/harbor/), abbreviated):

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "constraints/acme-45s-timeout",
      "type": "constraint",
      "title": "Acme 45s gateway timeout",
      "status": "expired",
      "confidence": "recorded",
      "happened_on": "2024-01-08"
    },
    {
      "id": "decisions/47s-request-deadline",
      "type": "decision",
      "title": "47s request deadline",
      "status": "active",
      "confidence": "corroborated",
      "happened_on": "2024-01-15"
    }
  ],
  "edges": [
    { "from": "constraints/acme-45s-timeout", "to": "decisions/47s-request-deadline", "relation": "ledTo" },
    { "from": "decisions/47s-request-deadline", "to": "constraints/acme-45s-timeout", "relation": "becauseOf" }
  ]
}
```
