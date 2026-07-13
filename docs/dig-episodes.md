# `why dig --episodes` — the episode report

The deterministic half of archaeology (DESIGN.md §6 step 1). `why dig
--episodes` walks the enclosing repository's git history over a ref range and
emits **episodes** — clusters of commits that plausibly belong to one unit of
work — plus **tells**, mechanical signals that mark high-value dig sites. No
judgment happens here: agents interpret episodes later; this report is their
raw material.

## Invocation

```bash
why dig --episodes            # human-readable summary
why dig --episodes --json     # the JSON report to stdout
why dig --episodes --out episodes.json   # the JSON report to a file
```

The range defaults to *high-water mark → HEAD* on the current branch:
`<bundle>/.dig-state.json` — the per-branch, schema-versioned state file whose
contract lives in [digging.md](digging.md) — records the last commit a
successful run processed, and only history after it is walked. `--from <rev>`
starts anywhere; `--full` re-digs all history; absent state (a first run) also
means full history. The mark advances to HEAD only after a successful episode
emission. A state file this build cannot read, or a mark the repository cannot
verify (orphaned by a history rewrite), is an explicit error naming the ways
out — never a silently wrong range and never overwritten; deleting the state
file is always safe (extraction is deterministic, synthesis dedupes).

The report is **deterministic** for a given repository state and range: no
wall-clock timestamps, stable ordering everywhere. Reports can be cached and
diffed.

## Clustering rules

1. **Merge/PR boundaries first.** The first-parent chain is walked oldest →
   newest. Every merge commit closes an episode of kind `merge` containing its
   side-branch commits (oldest first) plus the merge commit itself (last);
   `Merge pull request #N` subjects set `pr`. A non-merge commit whose subject
   ends in `(#N)` (squash merge) is a single-commit episode of kind `squash`
   with `pr: N`.
2. **Direct commits** (contiguous runs between boundaries) cluster
   sequentially into `direct` episodes: a commit joins the open cluster iff it
   has the same author email, its author date is **< 48 hours** after the
   cluster's latest commit, and it touches at least one path the cluster
   already touched. Otherwise it starts a new cluster.

Episodes are emitted **oldest first** (first-parent order) — synthesis wants
causal order.

## Tells

Flagged per episode under `tells`, and summarized globally under the report's
top-level `tells` (counts plus the ids of flagged episodes).

| Tell | Rule |
|---|---|
| `reverts` | commit subject starts with `Revert "` |
| `fixChains` | ≥ 2 commits in the episode with a `fix`-prefixed subject (case-insensitive) touching the same file |
| `suddenChurn` | churn (additions + deletions) on a file whose z-score against that file's churn over the trailing 20 episodes (0 when untouched) is ≥ 3, computed with a stddev floor of 1 — and only for files first seen ≥ 5 episodes earlier (a brand-new file is always "sudden" and never interesting) |
| `commentTells` | added diff lines matching `\b(hack\|workaround\|do not\|don't\|because\|temporarily)\b` case-insensitively; `count` is always exact, `sample` is capped at 20 items per episode |

Churn counts come from `git log --numstat --no-renames`: a rename counts as a
delete plus an add, and binary files contribute a churn of 0 (the path is
still listed).

`refs` collects every `#N` / `issues/N` / `pull/N` number mentioned in the
episode's commit messages — GitHub does not distinguish the two namespaces
without a network call, so neither does this report (evidence gathering, the
next pipeline step, resolves them).

## Schema

The JSON below is a JSON Schema (draft-07 subset) for the emitted report. It
is a **stable, versioned surface**: the test suite validates emitted reports
against this exact block, so changing it means bumping `version` and having
the conversation, not editing quietly.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "version", "repo", "range", "episodes", "tells"],
  "properties": {
    "schema": { "const": "why-dig-episodes" },
    "version": { "const": 1 },
    "repo": { "type": "string" },
    "range": {
      "type": "object",
      "additionalProperties": false,
      "required": ["from", "to"],
      "properties": {
        "from": { "type": ["string", "null"] },
        "to": { "type": "string" }
      }
    },
    "episodes": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "kind", "pr", "commits", "files", "refs", "dates", "tells"],
        "properties": {
          "id": { "type": "string" },
          "kind": { "enum": ["merge", "squash", "direct"] },
          "pr": { "type": ["integer", "null"] },
          "commits": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["sha", "subject", "message", "author", "date"],
              "properties": {
                "sha": { "type": "string" },
                "subject": { "type": "string" },
                "message": { "type": "string" },
                "author": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["name", "email"],
                  "properties": {
                    "name": { "type": "string" },
                    "email": { "type": "string" }
                  }
                },
                "date": { "type": "string" }
              }
            }
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["path", "additions", "deletions"],
              "properties": {
                "path": { "type": "string" },
                "additions": { "type": "integer" },
                "deletions": { "type": "integer" }
              }
            }
          },
          "refs": { "type": "array", "items": { "type": "integer" } },
          "dates": {
            "type": "object",
            "additionalProperties": false,
            "required": ["start", "end"],
            "properties": {
              "start": { "type": "string" },
              "end": { "type": "string" }
            }
          },
          "tells": {
            "type": "object",
            "additionalProperties": false,
            "required": ["reverts", "fixChains", "suddenChurn", "commentTells"],
            "properties": {
              "reverts": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["sha", "subject"],
                  "properties": {
                    "sha": { "type": "string" },
                    "subject": { "type": "string" }
                  }
                }
              },
              "fixChains": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["path", "shas"],
                  "properties": {
                    "path": { "type": "string" },
                    "shas": { "type": "array", "items": { "type": "string" } }
                  }
                }
              },
              "suddenChurn": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["path", "churn", "zScore"],
                  "properties": {
                    "path": { "type": "string" },
                    "churn": { "type": "integer" },
                    "zScore": { "type": "number" }
                  }
                }
              },
              "commentTells": {
                "type": "object",
                "additionalProperties": false,
                "required": ["count", "sample"],
                "properties": {
                  "count": { "type": "integer" },
                  "sample": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["sha", "path", "line"],
                      "properties": {
                        "sha": { "type": "string" },
                        "path": { "type": "string" },
                        "line": { "type": "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "tells": {
      "type": "object",
      "additionalProperties": false,
      "required": ["reverts", "fixChains", "suddenChurn", "commentTells"],
      "properties": {
        "reverts": { "$ref": "#/definitions/tellCounts" },
        "fixChains": { "$ref": "#/definitions/tellCounts" },
        "suddenChurn": { "$ref": "#/definitions/tellCounts" },
        "commentTells": { "$ref": "#/definitions/tellCounts" }
      }
    }
  },
  "definitions": {
    "tellCounts": {
      "type": "object",
      "additionalProperties": false,
      "required": ["count", "episodes"],
      "properties": {
        "count": { "type": "integer" },
        "episodes": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

Field notes:

- `range.from` / `range.to` — resolved full shas of the walked range
  (`from..to`); `from: null` means full history.
- `episode.id` — the episode's newest commit sha abbreviated to 12 chars;
  unique and stable (PR numbers are *not* unique: a revert-and-reland merges
  the same `#N` twice).
- `episode.commits[].date` — author date, strict ISO 8601 with offset.
- `episode.files` — per-path churn summed over the episode's commits, sorted
  by path. For `merge` episodes this sums the side-branch commits (the merge
  commit itself contributes no diff).
- `episode.dates` — min/max author date across the episode's commits.
