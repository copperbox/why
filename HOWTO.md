# HOWTO — adopting `why` on your project

A getting-started guide for a team that wants to run `why` on its own
codebase and get the full payoff: a trustworthy *why*-archive that stays
anchored to living code, re-verifies its own constraints, and grows itself at
merge time.

This is the operator's guide. For the schema and the reasoning behind it, read
[DESIGN.md](DESIGN.md); for the tool's philosophy, [README.md](README.md).

---

## 0. The one-paragraph model

`why` keeps a `.why/` folder in your repo — one markdown file per
**decision / constraint / attempt / incident / question**, linked into a
causal graph, each anchored to a span of code. Humans browse it in any editor;
agents query it over MCP during normal work. Three things keep it honest, and
your adoption plan is really just "make each of these happen on a schedule":

1. **Anchoring** — `why anchor` re-points concepts at code as it moves; a span
   it can't re-resolve is marked `lost`, never silently wrong.
2. **Auditing** — `why audit` re-checks every constraint and flags the ones
   that stopped being true, plus the decisions downstream of them (scar tissue).
3. **Capture** — new rationale gets written down *at merge time*, while it's
   fresh, instead of being reconstructed years later.

Everything below is how a team wires those three into its habits and CI.

---

## 1. Prerequisites

- **Node 22+** and **git** (with full history — not a shallow clone).
- **`gh`**, installed and authenticated, for anything that reads PR/issue
  threads (`why dig`, `why capture`). Without it those steps still run but
  degrade to explicit `[unavailable: …]` markers.
- **An agent that speaks MCP** (Claude Code, or any okf-mcp client) for the
  judgment-heavy steps — digging, synthesis, capture promotion, `ask`-audits.
  The deterministic commands need no LLM.
- Decide **where the bundle lives**. Default is `.why/` at the repo root
  (recommended — the archive shares the code's history, review, and blame). A
  sibling repo is supported if the archive needs separate permissioning.

Install it however you like:

```bash
# zero-install, per-command
npx -y @copperbox/why <command>

# or pin it as a dev dependency and add an npm script
npm i -D @copperbox/why
# package.json → "scripts": { "why": "why" }  →  npm run why -- <command>
```

The examples below use `npx -y @copperbox/why`; substitute your installed form.

---

## 2. Day one — scaffold and cold-start

### 2.1 Scaffold the bundle

```bash
npx -y @copperbox/why init --capture-snippet
```

This creates an empty `.why/` bundle at the repo root **and** drops a
knowledge-capture block into your `CLAUDE.md` (idempotently, between markers)
teaching every resident agent two habits: *consult the archive before
non-trivial work* and *record durable decisions while the context is fresh*.
That snippet is the single highest-leverage behavior change — it makes the
archive self-maintaining once agents are in the loop.

Commit the empty bundle. You now have a valid OKF bundle; everything else adds
content and keeps it honest.

### 2.2 Cold-start bootstrap — recover the *why* that already exists

Nobody hand-writes retroactive ADRs, so `why bootstrap` prepares the complete
deterministic cold-start workspace and an ordered agent handoff. It is an
agent-driven, judgment-heavy pass — **run it deliberately, not in CI**:

```bash
npx -y @copperbox/why bootstrap --evidence-dir ./exports
```

Follow the generated `HANDOFF.md`: per episode, run an agent on the **`skills/dig`** skill with the pack as
input (reconstruct concepts, cite everything, confidence never above the
evidence, prefer a `question` over a guess), and once per batch run
**`skills/dig-synthesize`** (merge duplicates, connect supersede chains,
promote recurring themes to constraints). Finish with the composed maintenance
loop and inspect its queue:

```bash
npx -y @copperbox/why maintain
npx -y @copperbox/why review
```

The lower-level `why dig --episodes` and `why dig --evidence` commands remain
available when you need to control the stages independently; see
[docs/digging.md](docs/digging.md).

**Priority order for the first dig — usefulness per token:** the *tells* first
(reverts, fix-after-fix chains, sudden churn on long-quiet files, `HACK` /
`workaround` / `for now` comments), then your most-blamed hot files, then
breadth. A first dig that nails the 20 weirdest places in the repo beats a
shallow sweep of everything. On a big repo, chunk it era-by-era, oldest first,
so synthesis sees history in causal order. Digs are incremental — a high-water
mark in `.why/.dig-state.json` means later runs only process new history.

The `--evidence-dir` is your escape hatch for rationale that lives *outside*
git — postmortems, exported Slack/Discord threads, design docs. Drop them in a
folder and the packs embed the ones matching each episode's PRs/issues/files.
This is where a lot of your best "why" actually lives; feeding it in is worth
the effort.

Open the dig as a series of PRs so the reconstructed rationale gets reviewed
by the people who lived it — that review is itself high-quality evidence.

---

## 3. Wire up CI — four jobs, then you can forget about it

The whole point is that no human has to *remember* to keep the archive honest.
Four GitHub Actions jobs do it. This repo runs all four on its own `.why/`
bundle as the live demo — copy them from
[`.github/workflows/`](.github/workflows) and read [docs/ci.md](docs/ci.md) for
the annotated versions. In a consuming repo, replace `npm ci` + `npm run why --`
with `npx -y @copperbox/why`.

Every job needs **`fetch-depth: 0`** — anchor tracing and capture read history
from the `as_of`/merge commit forward; a shallow clone makes honest anchors
unresolvable.

One rule explains the shape: **anchors are written from `main`, never from a
branch.** An `as_of` records the commit a span was verified at, and if you
squash-merge (most repos do), a branch's commits are rewritten into one new
commit — so an `as_of` stamped on a branch names something `main` never had.
Only `main` hands out commits `main` keeps.

| Job | Trigger | Command | Why |
|---|---|---|---|
| **PR gate** | every PR | `why lint` + `why anchor --check --allow-drift` | the archive may not merge in a state it can't back |
| **Re-anchor** | push to `main` | `why anchor` | spans that moved get re-stamped at a commit that survives |
| **Weekly audit** | cron (e.g. Mon) | `why audit` | constraints get re-verified; expiry becomes a visible event |
| **Post-merge capture** | PR closed | `why capture --pr <n>` | new decisions get drafted while rationale is fresh |

### 3.1 PR gate — `why lint` + `why anchor --check --allow-drift`

Fails on schema errors (missing sections, bad edge targets, uncited confidence
claims), and on an anchor the PR **destroyed** — code a concept claimed, now
gone. That is the author's to resolve, because no re-anchoring brings it back:
update the concept or file a `question`.

It does *not* fail on drift (a span that merely moved). Drift is reported and
left to the re-anchor job. This is deliberate: the only way a contributor could
"fix" drift on their branch is `why anchor`, which stamps an `as_of` at a branch
HEAD the squash then discards — the gate would be demanding the one thing that
cannot be done right from a branch. An anchor already committed as
`state: lost` does not fail either (that's `doctor`'s job to surface, not a
merge blocker).

Drop `--allow-drift` for the strict question — "is this bundle fully current
with this commit?" — which is the right check on `main`, not on a PR.

### 3.2 Re-anchor — `why anchor` on `main`

Triggers on every push to `main`, re-resolves every anchor against the commit
that actually landed, and PRs the frontmatter-only result back. Running from
`main` is what makes every `as_of` durable — including for a file *born* on the
squashed branch, which has no earlier commit to point at and which a
contributor could never have anchored correctly. It also repairs the orphans a
squash leaves behind: an `as_of` naming a discarded branch commit is re-stamped
to the landed commit whenever the claim re-verifies at HEAD without it (a
present whole-file path, a re-found symbol). A bare `path + lines` claim is the
exception — nothing can verify the lines without readable history, so it stays
`unverified as_of` rather than guessed at (DESIGN.md §4).

It PRs back rather than pushing, so branch protection stays on. Squashing that
PR is harmless: the `as_of` values inside name `main` commits, and content
survives a squash unchanged. Exclude the branch it opens from your capture job,
or capture will draft a concept about the anchor bot.

The trade: anchors on `main` are briefly stale between a merge and the
re-anchor PR landing. The bundle is eventually consistent — during that window
`why blame` may report an old span, and it reports an honest `lost`, never a
wrong one. Together these two jobs are what make "anchors are live or lost,
never silently wrong" a mechanical guarantee instead of a hope.

### 3.3 Weekly audit — `why audit`

Sweeps every active constraint: runs `verify.method: check` commands directly,
flags overdue `review_by` dates, and lists `method: ask` constraints for an
agent. **Exit 1 means something newly expired** — the constraint's status was
flipped in place, evidence appended to its `# Still true?` section, and a
`question` filed for every active decision downstream ("this code may now be
scar tissue"). That's the archive *learning something*, so the workflow turns
the report into a GitHub issue **and the flipped bundle into a PR**. Ship both:
without the write-back PR the flip evaporates with the runner and the same
constraint re-expires every week.

The `ask`-constraints the job merely *reports* — answering them is an agent
session: `why audit --questions-out questions.json`, an agent fills it in,
`why audit --answers answers.json` applies it. The CLI never calls an LLM.

### 3.4 Post-merge capture — `why capture --pr <n>`

When a PR closes, drafts a concept from its description and review thread into
`.why/.drafts/` — merged → `decision`, closed-unmerged → `attempt`, anchors
from the merge commit's diff, rationale quoted verbatim with attribution.
Drafts are **never served** (the dot-directory sees to that); they leave the
queue only through the lint-gated editorial step `why capture --promote
<draft>`. So the job PRs the draft back onto a `why-drafts` branch for that
promotion pass rather than pushing to main. It's idempotent per PR.

This is the job that eventually makes cold-start digging rare — steady-state
capture is the cheapest, best data because it's recorded while context is hot.

---

## 4. Team habits — the behaviors that make it pay off

CI keeps the archive *honest*; these habits keep it *alive*. Adopt them
explicitly — put them in your contributing guide and your `CLAUDE.md`.

**For everyone (and every agent):**

- **Consult before you change.** Before touching load-bearing weirdness, ask
  the archive. `why blame src/lock.rs:47` renders the story of that code —
  the decision, what it was chosen instead of, the incident that forced it,
  and any expired constraint whose blast radius reaches it. Agents get the same
  via the mounted bundle. This is what kills re-litigating settled decisions.
- **Record durable decisions while the context is fresh.** Chose an approach,
  ruled one out, hit an external constraint? That's a `decision` / `attempt` /
  `constraint`. The capture job drafts it from the PR, but a two-line note in
  the PR description ("we tried X, it deadlocked, so Y") is what makes the
  draft good. Write for the engineer who runs `why blame` on this line in two
  years.
- **When you don't know the why, file a `question`, never a confident guess.**
  This is the core promise: a wrong "why" stated confidently is worse than no
  why. Honesty about gaps is a feature.

**For constraint authors specifically:**

- **Make every constraint falsifiable.** A constraint is only useful if you can
  later discover it stopped being true. Give each one a `verify` block:
  `method: check` (a machine-checkable command — best), `method: ask` (a hint
  an agent re-verifies, with an owner named), or `method: review-by` (a date
  that forces a human look). A constraint with no way to expire is scar tissue
  waiting to happen — the audit can't help you.

**For reviewers:**

- **Review `.why/` diffs like code.** The archive has git history and blame;
  use it. A capture draft or dig PR is where reconstructed rationale gets
  corrected by the people who lived it.

---

## 5. Ongoing rhythm

Once bootstrapped, the cadence is light:

- **Per PR** — the gate runs automatically. Contributors do nothing about
  drift; they act only when the gate says an anchor was *destroyed*, which
  means a concept lost the code it described.
- **Per merge** — re-anchoring re-stamps drift from `main` onto `why-anchors`,
  and capture drafts onto `why-drafts`. Both arrive as PRs.
- **Weekly** — the audit runs. Pair a weekly look at the `why-drafts` branch
  (promote or discard accumulated capture drafts via `skills/capture` or by
  hand) with triaging any audit issue and its write-back PR. This is the one
  standing ~30-minute ritual. The `why-anchors` PRs are mechanical and
  frontmatter-only — merge them promptly (or enable auto-merge); every hour one
  sits is an hour `main`'s anchors are stale.
- **On big refactors** — a wave of `lost` anchors in `why doctor` is the
  signal to **re-dig that area**: the code is genuinely new, so let the
  archaeology catch up rather than forcing stale anchors forward.
- **Occasionally** — a fresh `why dig` run over history the cold-start pass
  skipped (breadth after depth), as time allows.

`why doctor` is your at-a-glance health check any time — a read-only report:
lost anchors and lint errors in red (exit 1), stale `as_of`s, overdue
`review-by`s, expired constraints, and open questions in yellow (exit 0), and
a dig-freshness line (commits since the last dig). Wire it into a dashboard or
just run it before planning work in an area.

---

## 6. Reading the archive

Same data, four surfaces — pick per moment:

- **`why blame <path>[:line]`** — the terminal story format. Add `--json` for
  the structured payload.
- **`why serve`** — a read-only, localhost-only web UI (`127.0.0.1`): git
  blame and the `why` gutter side by side, a story panel of hedged rationale
  cards with loud expired-constraint warnings, a graph of the bundle, doctor
  chips. Start and stop it by hand; nothing depends on it.
- **VS Code extension** ([`vscode-why/`](vscode-why/)) — gutter stripes on
  covered spans, hover cards with pre-hedged rationale and expired-upstream
  warnings, and a `why: Show Story` webview. `vsce package` builds the `.vsix`;
  see [docs/vscode.md](docs/vscode.md).
- **Obsidian / any markdown editor / MCP** — it's just linked markdown. Agents
  mount it with okf-mcp:

  ```bash
  npx -y @copperbox/okf-mcp@^1.3.0 inspect
  ```

---

## 7. Command quick reference

| Command | What it does | Runs as |
|---|---|---|
| `why init [--capture-snippet]` | scaffold `.why/`, teach `CLAUDE.md` | once |
| `why bootstrap [--full]` | prepare episodes, evidence packs, and agent handoff | deliberate |
| `why maintain` | lint, re-anchor, audit, health-check, summarize inbox | integration branch / scheduled |
| `why review [--promote <draft>]` | consolidated editorial queue and promotion | weekly / editorial |
| `why impact [<git-range>]` | decisions and expired upstream constraints affected by a diff | before review |
| `why dig --episodes` / `--evidence` | deterministic archaeology inputs | deliberate |
| `why anchor [--check] [--concept <id>]` | re-resolve anchors to HEAD (`--check` = CI, writes nothing) | pre-commit / PR gate |
| `why lint [--json]` | schema conformance, exit 1 on error | PR gate |
| `why audit [--json] [--questions-out/--answers]` | re-verify constraints, flag expiry + downstream | weekly |
| `why capture --pr <n> [--promote <draft>]` | draft rationale from a PR; promote a draft | post-merge / editorial |
| `why blame <path>[:line] [--json]` | render the story of a span | on demand |
| `why doctor [--json]` | read-only health report | on demand / dashboard |
| `why export ui-index\|graph` | versioned UI data contract | consumed by viewers |
| `why serve [--port <n>]` | localhost read-only UI | on demand |

The judgment steps ship as Claude Code skills, not code: **`skills/dig`**,
**`skills/dig-synthesize`**, **`skills/capture`**. Install them as project
skills for the agent sessions that run the archaeology and promotion passes.

---

## 8. Adoption checklist

- [ ] `why init --capture-snippet`, commit the empty bundle
- [ ] Cold-start dig over tells + hot files; open as reviewed PRs
- [ ] `why anchor && why lint && why doctor` all clean
- [ ] PR gate workflow (`lint` + `anchor --check --allow-drift`, `fetch-depth: 0`)
- [ ] Re-anchor workflow on push to `main` (`why-anchors` branch), excluded from capture
- [ ] Weekly audit workflow (issue + write-back PR on exit 1)
- [ ] Post-merge capture workflow (`why-drafts` branch)
- [ ] Contributing guide + `CLAUDE.md`: consult-before-change, record-while-fresh, file-a-question-not-a-guess
- [ ] Every constraint carries a `verify` block
- [ ] A weekly ritual to promote drafts and triage audit findings
- [ ] `skills/dig`, `skills/dig-synthesize`, `skills/capture` installed for agents
