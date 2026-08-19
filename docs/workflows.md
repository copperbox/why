# Outcome-oriented workflows

The low-level commands remain available for CI and debugging, but routine use
starts with four outcome-oriented interfaces. They keep the deterministic work
inside `why` and expose the human/agent judgment seam explicitly.

## `why bootstrap`

```bash
why bootstrap [--full] [--evidence-dir <exports>] [--max-chars <n>]
```

Prepares the cold-start archaeology workspace in one run: resolves the
incremental Git range, extracts episodes, assembles every evidence pack, writes
an ordered `HANDOFF.md`, and advances the dig high-water mark only after all
outputs succeed. The workspace lives under `.why/.cache/bootstrap/<head>/` and
is derived, ignored state.

The handoff is deliberate. Reconstructing rationale is judgment, so the CLI
does not call an unspecified model or silently invent prose. Run `skills/dig`
once per checked item and `skills/dig-synthesize` once for the batch, then run
`why maintain`.

`why dig --episodes` and `why dig --evidence` remain the lower-level interfaces
when a caller needs to control those stages independently.

## `why maintain`

```bash
why maintain [--json]
```

Runs the safe routine loop in order: lint gate, anchor resolution and writes,
constraint audit, fresh lint/doctor checks, and editorial-inbox summary. It
refuses to write on a feature branch when `origin/HEAD` identifies a different
integration branch; use the read-only PR-gate commands there.

The separate CI workflows remain useful because they have different triggers
and permissions. `maintain` is the operator interface for a local or scheduled
integration-branch run.

## `why review`

```bash
why review
why review --promote <draft.md>
```

Shows one queue containing capture drafts, open questions, and archive-health
maintenance. Capture-generated drafts carry `why.owner`, `why.captured_on`, and
`why.review_by`; the default review window is fourteen days. Audit-generated
questions carry capture and review dates but remain unassigned until someone
takes them.

The command reports age, overdue state, and ownership. Promotion remains
lint-gated and editorial: listing a draft never serves it, and promotion never
repairs unsupported rationale automatically.

## `why impact`

```bash
why impact                         # HEAD versus the working tree
why impact origin/main...HEAD      # a PR-sized diff
why impact <base>..<head> --json
```

Reports every concept anchored to a changed path, distinguishing exact hunk
overlap from conservative same-file relevance. It then walks `# Because of`
edges and shows expired constraints upstream of those affected concepts. It
does not broadcast unrelated expired constraints; global health remains the
job of `why doctor` and `why review`.

This interface is intended for code review and agent session-start checks: it
pushes relevant rationale into the path of a change before the engineer has to
remember a specific `why blame` query.
