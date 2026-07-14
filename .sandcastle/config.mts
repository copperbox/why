// Sandcastle configuration for the optional agent pipeline.
// See README.md in this directory for how this composes with the gatekeeper.

import { defineConfig } from "@copperbox/sandcastle-workflow";

export default defineConfig({
  verifyCommand: "npm run verify",
  targetBranch: "main",

  // npm-shaped repo: version-bump each feature PR.
  release: { enabled: true },

  // Explicit because the gatekeeper relies on its own comments being trusted.
  // These were chosen when the repo was private with a single trusted owner;
  // the repo is now public, so only ever queue issues written by a maintainer.
  security: { trustedCommentsOnly: true, lockOnQueue: false },

  // The gatekeeper does its own remediation (it cannot route feedback through
  // the responder: responder ignores reviews from its own gh login, and the
  // gate runs on the same token). Leaving feedback enabled is harmless — it
  // reacts only to OTHER trusted humans, if any ever comment.
  feedback: { enabled: true, maxAttempts: 2 },

  implementNotes: [
    "DESIGN.md at the repo root is the source of truth for the `why` schema and",
    "architecture; the issue body carries the per-task spec. Read the DESIGN.md",
    "sections an issue cites before writing code. examples/harbor/ is the fixture bundle —",
    "tests should run against it rather than inventing new fixtures. Never let a",
    "code path emit a silently-wrong anchor, and never assert rationale above its",
    "evidence — these two rules override convenience every time.",
  ].join(" "),
});
