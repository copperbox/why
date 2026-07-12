# `why init` — scaffold a .why/ bundle
Labels: Sandcastle, phase:1

## Context

DESIGN.md §1 (bundle layout) and §8 (`why init` scaffolds `.why/`, root `index.md` frontmatter, and a CLAUDE.md capture snippet).

## Scope

- `why init` in the current git repo: create `.why/` with the five type directories, a root `index.md` whose frontmatter declares `okf_version: "0.1"`, `generated: false`, and a one-line `description` naming the repo, and a `log.md` seeded with an init entry.
- Print a short next-steps message (mount command for okf-mcp, pointer to `why dig` as "coming later" if unimplemented).
- `--capture-snippet` writes (or appends, idempotently, between `<!-- why:begin -->`/`<!-- why:end -->` markers) a short knowledge-capture instruction block into the repo's `CLAUDE.md` telling resident agents to consult the bundle before non-trivial work and record durable decisions after.
- Refuse to clobber: an existing `.why/` exits 1 with a clear message; `--force` is NOT offered (deleting an archive should never be one flag away).

## Acceptance criteria

- [ ] In a temp git repo, `why init` creates the layout above and running okf-mcp's validate over the new bundle yields zero errors.
- [ ] Running `why init` twice exits 1 the second time and changes nothing (directory mtime-level check not required; content equality is).
- [ ] `--capture-snippet` run twice produces exactly one snippet block.
- [ ] Tests build their own temp repos (per CODING_STANDARDS.md) and cover all three behaviors.

## Out of scope

Any digging or anchoring. No network, no gh calls.
