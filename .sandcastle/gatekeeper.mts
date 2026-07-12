// Autonomous gatekeeper: the stage that replaces the human PR gate.
//
// Each run:
//   1. Finds ready (non-draft) sandcastle feature PRs and takes the OLDEST one
//      — at most one PR is gated per run, so the build side can refresh the
//      others against the new target branch between gate runs.
//   2. In a throwaway worktree of the PR branch: runs the verify command
//      itself (a hard gate — no agent verdict can override a red verify),
//      then spawns a reviewer agent with the linked issues' acceptance
//      criteria, DESIGN.md, and CODING_STANDARDS.md.
//   3. verdict "merge"  -> posts the review report, squash-merges, deletes the
//      branch. `Closes #…` lines in the PR body close the member issues.
//      verdict "request-changes" -> posts findings, spawns a fixer agent on
//      the branch, pushes, and re-reviews (a fresh round). The gate CANNOT
//      route findings through the workflow's responder: that agent ignores
//      feedback from its own gh login, and the gate runs on the same token.
//   4. After MAX_ROUNDS failed rounds the PR is closed unmerged (escalation):
//      findings are posted to each member issue so the next implementation
//      attempt inherits them, and the workflow's normal close-unmerged
//      behavior requeues the issues.
//   5. CIRCUIT BREAKER: an issue's escalations are counted from marker
//      comments on the issue itself. Reaching CHAT_THRESHOLD (default 2)
//      trips the breaker: the queue label is removed (so the issue cannot
//      requeue), `needs-chat` is added, and a chat-agenda comment is posted.
//      Repeated failure means the SPEC is wrong, and rewriting an issue is a
//      human+chat decision, not another attempt.
//   6. When nothing is queued and no feature PRs are open: if any open issue
//      carries `needs-chat`, HALT (exit 5) listing them — never promote past
//      a hole. Otherwise promote the next phase: add the queue label to the
//      lowest open `phase:N` issues. Nothing left anywhere -> exit 4.
//
// Round state is durable in GitHub, not local: rounds are counted from
// `<!-- gatekeeper … -->` markers in the PR's comments, so a killed process
// resumes where it left off (same philosophy as the workflow package).
//
// Exit codes (contract with scripts/autonomous-loop.sh):
//   0 - did work (merged, remediated, escalated, or promoted a phase)
//   1 - crash
//   3 - idle (nothing ready to gate, nothing to promote yet)
//   4 - all phases complete: no queue, no PRs, no backlog
//   5 - HALTED: one or more issues need a human chat (label: needs-chat)

import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const FEATURE_PREFIX = "sandcastle/feature-";
const TARGET_BRANCH = "main";
const QUEUE_LABEL = "Sandcastle";
const PHASE_LABEL = /^phase:(\d+)$/;
const VERIFY_COMMAND = "npm run verify";
const MAX_ROUNDS = Number(process.env.GATE_MAX_ROUNDS ?? "3");
const CHAT_THRESHOLD = Number(process.env.GATE_CHAT_THRESHOLD ?? "2");
const GATE_MODEL = process.env.GATE_MODEL ?? "claude-fable-5";
const MARKER = "<!-- gatekeeper";
const ESC_MARKER = "<!-- gatekeeper:escalation -->";
const NEEDS_CHAT_LABEL = "needs-chat";
const IDLE_EXIT = 3;
const COMPLETE_EXIT = 4;
const HALT_EXIT = 5;

// --- plumbing ---------------------------------------------------------------

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd: opts.cwd ?? REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
        timeout: opts.timeoutMs ?? 0,
        env: process.env,
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number"
            ? ((err as unknown as { code: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.write(opts.input);
      child.stdin?.end();
    }
  });
}

async function must(cmd: string, args: string[], opts?: { cwd?: string; input?: string }): Promise<string> {
  const res = await run(cmd, args, opts);
  if (res.code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.code}): ${res.stderr.trim() || res.stdout.trim()}`);
  }
  return res.stdout;
}

const gh = (args: string[], opts?: { input?: string }) => must("gh", args, { ...opts, cwd: REPO_ROOT });

// Load .sandcastle/.env so the claude CLI sees the same tokens the build side
// uses; existing process env wins.
function loadEnv(): void {
  const envPath = path.join(HERE, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined && m[2] !== "") {
      process.env[m[1]] = m[2];
    }
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… [clipped ${text.length - max} chars]`;
}

// --- agents -----------------------------------------------------------------

interface Verdict {
  verdict: "merge" | "request-changes";
  summary: string;
  findings: string[];
}

function loadPrompt(name: string, vars: Record<string, string>): string {
  let text = readFileSync(path.join(HERE, name), "utf8");
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}

// Runs `claude -p` and returns the agent's final text. The gate agents run on
// the HOST (unlike the build agents' docker sandboxes) with tool allowlists
// scoped to reading, git inspection, and npm scripts in the worktree.
async function runAgent(opts: {
  prompt: string;
  cwd: string;
  allowedTools: string;
  permissionMode?: string;
  label: string;
}): Promise<string> {
  console.log(`  · agent: ${opts.label} (${GATE_MODEL})`);
  const args = [
    "-p",
    opts.prompt,
    "--model",
    GATE_MODEL,
    "--output-format",
    "json",
    "--allowedTools",
    opts.allowedTools,
  ];
  if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
  const res = await run("claude", args, { cwd: opts.cwd, timeoutMs: 45 * 60 * 1000 });
  if (res.code !== 0) {
    throw new Error(`${opts.label} agent failed (${res.code}): ${clip(res.stderr || res.stdout, 2000)}`);
  }
  const parsed = JSON.parse(res.stdout) as { result?: string };
  if (typeof parsed.result !== "string") {
    throw new Error(`${opts.label} agent returned no result field`);
  }
  return parsed.result;
}

// The reviewer must end with a JSON verdict; tolerate prose/fences around it.
function parseVerdict(text: string): Verdict {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as Partial<Verdict>;
      if (obj.verdict === "merge" || obj.verdict === "request-changes") {
        return {
          verdict: obj.verdict,
          summary: typeof obj.summary === "string" ? obj.summary : "(no summary)",
          findings: Array.isArray(obj.findings) ? obj.findings.map(String) : [],
        };
      }
    } catch {
      // fall through to the conservative default
    }
  }
  return {
    verdict: "request-changes",
    summary: "Reviewer output was not a parseable verdict; treating as request-changes.",
    findings: [clip(text, 4000)],
  };
}

// --- github state -----------------------------------------------------------

interface PR {
  number: number;
  headRefName: string;
  isDraft: boolean;
  title: string;
  body: string;
}

async function openFeaturePRs(): Promise<PR[]> {
  const out = await gh(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName,isDraft,title,body"]);
  return (JSON.parse(out) as PR[]).filter((pr) => pr.headRefName.startsWith(FEATURE_PREFIX));
}

function linkedIssues(prBody: string): number[] {
  return [...prBody.matchAll(/closes #(\d+)/gi)].map((m) => Number(m[1]));
}

async function priorRounds(prNumber: number): Promise<number> {
  const out = await gh(["pr", "view", String(prNumber), "--json", "comments"]);
  const comments = (JSON.parse(out) as { comments: { body: string }[] }).comments ?? [];
  return comments.filter((c) => c.body.startsWith(MARKER)).length;
}

// Escalations already recorded on an issue — the circuit breaker's counter,
// durable in the issue's own comments like all other gate state.
async function escalationCount(issueNumber: number): Promise<number> {
  const out = await gh(["issue", "view", String(issueNumber), "--json", "comments"]);
  const comments = (JSON.parse(out) as { comments: { body: string }[] }).comments ?? [];
  return comments.filter((c) => c.body.startsWith(ESC_MARKER)).length;
}

// Trip the breaker: pull the issue out of the queue permanently and leave the
// agenda a chat session needs. Label removals tolerate absence (the workflow
// may have already shuffled its own labels on close).
async function tripBreaker(
  issueNumber: number,
  pr: PR,
  attempts: number,
  findingsMd: string,
): Promise<void> {
  await run("gh", ["issue", "edit", String(issueNumber), "--remove-label", QUEUE_LABEL]);
  await run("gh", ["issue", "edit", String(issueNumber), "--remove-label", "sandcastle:in-review"]);
  await gh(["issue", "edit", String(issueNumber), "--add-label", NEEDS_CHAT_LABEL]);
  const agenda = [
    "<!-- gatekeeper:agenda -->",
    "## Chat agenda — this spec needs a human conversation",
    "",
    `${attempts} independent autonomous attempts have now failed the gate (most recently PR #${pr.number}; its gatekeeper comments hold the full round-by-round history). Per the circuit-breaker policy this issue is out of the queue: repeated failure across fresh implementations points at the spec, not the implementer.`,
    "",
    "**Findings that survived every remediation round of the final attempt:**",
    "",
    findingsMd,
    "",
    "**What the next chat session must decide:** for each finding, is it an implementation defect (then the acceptance criteria let it through — tighten them) or a symptom that the issue asks for something ambiguous, contradictory, or infeasible as written (then rewrite the scope)? Update this issue's text accordingly.",
    "",
    `**Re-arm after editing:** \`gh issue edit ${issueNumber} --remove-label ${NEEDS_CHAT_LABEL} --add-label ${QUEUE_LABEL}\``,
  ].join("\n");
  await gh(["issue", "comment", String(issueNumber), "--body-file", "-"], { input: agenda });
  console.log(`  ⛔ breaker tripped on issue #${issueNumber} (${attempts} escalations) — labeled ${NEEDS_CHAT_LABEL}`);
}

async function postGateComment(prNumber: number, round: number, verdictLabel: string, body: string): Promise<void> {
  const full = `${MARKER} round:${round} verdict:${verdictLabel} -->\n## Gatekeeper — round ${round}: ${verdictLabel}\n\n${body}`;
  await gh(["pr", "comment", String(prNumber), "--body-file", "-"], { input: full });
}

// --- the gate ---------------------------------------------------------------

async function withWorktree<T>(branch: string, fn: (dir: string) => Promise<T>): Promise<T> {
  await must("git", ["fetch", "origin", branch, TARGET_BRANCH]);
  const dir = mkdtempSync(path.join(tmpdir(), "why-gate-"));
  await must("git", ["worktree", "add", "--detach", dir, `origin/${branch}`]);
  try {
    return await fn(dir);
  } finally {
    await run("git", ["worktree", "remove", "--force", dir]);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function issueContext(numbers: number[]): Promise<string> {
  const parts: string[] = [];
  for (const n of numbers) {
    const out = await gh(["issue", "view", String(n), "--json", "number,title,body"]);
    const issue = JSON.parse(out) as { number: number; title: string; body: string };
    parts.push(`### Issue #${issue.number}: ${issue.title}\n\n${clip(issue.body, 6000)}`);
  }
  return parts.join("\n\n---\n\n") || "(no linked issues found — that alone is a finding)";
}

async function gateOne(pr: PR): Promise<"merged" | "escalated" | "remediated"> {
  console.log(`\n=== gating PR #${pr.number} (${pr.headRefName}) ===`);
  const issues = linkedIssues(pr.body);
  const issueCtx = await issueContext(issues);
  const startRound = (await priorRounds(pr.number)) + 1;

  return withWorktree(pr.headRefName, async (dir) => {
    let lastVerdict: Verdict | null = null;
    for (let round = startRound; round <= MAX_ROUNDS; round++) {
      console.log(`  round ${round}/${MAX_ROUNDS}`);
      await must("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir });

      const verify = await run("bash", ["-lc", VERIFY_COMMAND], { cwd: dir, timeoutMs: 20 * 60 * 1000 });
      const verifyPassed = verify.code === 0;
      const verifyOutput = clip(`${verify.stdout}\n${verify.stderr}`.trim(), 12000);
      console.log(`  · verify: ${verifyPassed ? "PASS" : `FAIL (${verify.code})`}`);

      let verdict: Verdict;
      if (!verifyPassed) {
        // Hard gate: a red verify is a verdict by itself; no reviewer needed.
        verdict = {
          verdict: "request-changes",
          summary: `\`${VERIFY_COMMAND}\` fails on the merge candidate.`,
          findings: [`Verify output:\n\n\`\`\`\n${verifyOutput}\n\`\`\``],
        };
      } else {
        const reviewText = await runAgent({
          label: `review PR #${pr.number} r${round}`,
          cwd: dir,
          allowedTools: "Read,Grep,Glob,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(npm run:*),Bash(npm test:*),Bash(node:*)",
          prompt: loadPrompt("gate-review-prompt.md", {
            PR_NUMBER: String(pr.number),
            PR_TITLE: pr.title,
            TARGET_BRANCH: TARGET_BRANCH,
            ISSUES: issueCtx,
            VERIFY_COMMAND,
            VERIFY_OUTPUT: verifyOutput,
          }),
        });
        verdict = parseVerdict(reviewText);
      }
      lastVerdict = verdict;

      if (verdict.verdict === "merge") {
        await postGateComment(pr.number, round, "merge", `${verdict.summary}\n\nVerified with \`${VERIFY_COMMAND}\` on the branch before merging.`);
        await gh(["pr", "merge", String(pr.number), "--squash", "--delete-branch"]);
        console.log(`  ✔ merged PR #${pr.number}`);
        return "merged";
      }

      const findingsMd = verdict.findings.map((f, i) => `${i + 1}. ${f}`).join("\n") || "(no itemized findings)";
      await postGateComment(pr.number, round, "request-changes", `${verdict.summary}\n\n${findingsMd}`);

      if (round === MAX_ROUNDS) break;

      // Remediate in place and push, then loop into a fresh review round.
      await runAgent({
        label: `fix PR #${pr.number} r${round}`,
        cwd: dir,
        permissionMode: "acceptEdits",
        allowedTools: "Read,Edit,Write,Grep,Glob,Bash(npm:*),Bash(git add:*),Bash(git commit:*),Bash(git diff:*),Bash(git log:*),Bash(node:*)",
        prompt: loadPrompt("gate-fix-prompt.md", {
          PR_NUMBER: String(pr.number),
          ROUND: String(round),
          ISSUES: issueCtx,
          FINDINGS: `${verdict.summary}\n\n${findingsMd}`,
          VERIFY_COMMAND,
        }),
      });
      const dirty = (await run("git", ["status", "--porcelain"], { cwd: dir })).stdout.trim();
      if (dirty) {
        await must("git", ["add", "-A"], { cwd: dir });
        await must("git", ["commit", "-m", `gatekeeper: address round ${round} review findings`], { cwd: dir });
      }
      const ahead = (await run("git", ["rev-list", "--count", `origin/${pr.headRefName}..HEAD`], { cwd: dir })).stdout.trim();
      if (ahead !== "0") {
        await must("git", ["push", "origin", `HEAD:refs/heads/${pr.headRefName}`], { cwd: dir });
        console.log(`  · pushed fixes (${ahead} commit(s))`);
      } else {
        console.log("  · fixer produced no commits; next round reviews unchanged code");
      }
    }

    // Escalation: close unmerged (the workflow requeues the issues) and leave
    // the findings on each issue so the next attempt starts smarter. Issues
    // that reach CHAT_THRESHOLD escalations trip the circuit breaker instead
    // of requeueing — see tripBreaker.
    const survivingFindings = lastVerdict
      ? `${lastVerdict.summary}\n\n${lastVerdict.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
      : "(no verdict captured — see the PR's gatekeeper comments)";
    const escalation = [
      `${ESC_MARKER}`,
      `**Gatekeeper escalation** — PR #${pr.number} closed after ${MAX_ROUNDS} failed review round(s).`,
      "",
      "Findings from the final round (requirements for the next attempt, not suggestions):",
      "",
      survivingFindings,
    ].join("\n");
    for (const n of issues) {
      const prior = await escalationCount(n);
      await gh(["issue", "comment", String(n), "--body-file", "-"], { input: escalation });
      if (prior + 1 >= CHAT_THRESHOLD) {
        await tripBreaker(n, pr, prior + 1, survivingFindings);
      }
    }
    await gh(["pr", "close", String(pr.number), "--comment", `Gatekeeper: escalating after ${MAX_ROUNDS} failed rounds; member issues get the findings attached (or the circuit breaker, on repeat offenders).`, "--delete-branch"]);
    console.log(`  ✘ escalated: closed PR #${pr.number}`);
    return "escalated";
  });
}

// --- phase promotion ---------------------------------------------------------

interface IssueLite {
  number: number;
  labels: { name: string }[];
}

interface ChatIssue {
  number: number;
  title: string;
  url: string;
}

type Promotion =
  | { kind: "promoted" }
  | { kind: "complete" }
  | { kind: "waiting" }
  | { kind: "halted"; chat: ChatIssue[] };

async function promoteNextPhase(): Promise<Promotion> {
  const queued = JSON.parse(
    await gh(["issue", "list", "--state", "open", "--label", QUEUE_LABEL, "--limit", "1", "--json", "number"]),
  ) as IssueLite[];
  if (queued.length > 0) return { kind: "waiting" };
  if ((await openFeaturePRs()).length > 0) return { kind: "waiting" };

  // Never promote past a hole: a tripped breaker halts the pipeline at the
  // phase boundary, after sibling work has finished flowing.
  const chat = JSON.parse(
    await gh(["issue", "list", "--state", "open", "--label", NEEDS_CHAT_LABEL, "--limit", "50", "--json", "number,title,url"]),
  ) as ChatIssue[];
  if (chat.length > 0) return { kind: "halted", chat };

  const open = JSON.parse(
    await gh(["issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels"]),
  ) as IssueLite[];
  let lowest = Infinity;
  for (const issue of open) {
    for (const label of issue.labels) {
      const m = label.name.match(PHASE_LABEL);
      if (m) lowest = Math.min(lowest, Number(m[1]));
    }
  }
  if (!Number.isFinite(lowest)) return { kind: "complete" };

  const phase = open.filter((i) => i.labels.some((l) => l.name === `phase:${lowest}`));
  console.log(`\n=== promoting phase ${lowest}: queueing ${phase.length} issue(s) ===`);
  for (const issue of phase) {
    await gh(["issue", "edit", String(issue.number), "--add-label", QUEUE_LABEL]);
    console.log(`  · queued #${issue.number}`);
  }
  return { kind: "promoted" };
}

// --- main ---------------------------------------------------------------------

loadEnv();

const prs = (await openFeaturePRs()).filter((pr) => !pr.isDraft).sort((a, b) => a.number - b.number);
if (prs.length > 0) {
  await gateOne(prs[0]!);
  process.exit(0);
}

console.log("no ready feature PRs to gate");
const promotion = await promoteNextPhase();
if (promotion.kind === "promoted") process.exit(0);
if (promotion.kind === "complete") {
  console.log("ALL PHASES COMPLETE — no queue, no PRs, no backlog.");
  process.exit(COMPLETE_EXIT);
}
if (promotion.kind === "halted") {
  console.log("\n=== HALTED: human chat needed ===");
  for (const issue of promotion.chat) {
    console.log(`#${issue.number}  ${issue.title}`);
    console.log(`    → ${issue.url}  (see the gatekeeper agenda comment)`);
  }
  console.log(`\nRe-arm after editing a spec: gh issue edit <n> --remove-label ${NEEDS_CHAT_LABEL} --add-label ${QUEUE_LABEL}`);
  process.exit(HALT_EXIT);
}
process.exit(IDLE_EXIT);
