// Sandcastle configuration for the `why` autonomous build.
// See AUTOBUILD.md for how this composes with the gatekeeper into a
// zero-human-gate pipeline.

import { defineConfig } from "@copperbox/sandcastle-workflow";

export default defineConfig({
  verifyCommand: "npm run verify",
  targetBranch: "main",

  // npm-shaped repo: version-bump each feature PR.
  release: { enabled: true },

  // Private repo, single trusted owner; the defaults are fine but explicit
  // here because the gatekeeper relies on its own comments being trusted.
  security: { trustedCommentsOnly: true, lockOnQueue: false },

  // The gatekeeper does its own remediation (it cannot route feedback through
  // the responder: responder ignores reviews from its own gh login, and the
  // gate runs on the same token). Leaving feedback enabled is harmless — it
  // reacts only to OTHER trusted humans, if any ever comment.
  feedback: { enabled: true, maxAttempts: 2 },

  implementNotes: [
    "DESIGN.md at the repo root is the source of truth for the `why` schema and",
    "architecture; PLAN.md maps phases to issues. Read the DESIGN.md sections an",
    "issue cites before writing code. examples/harbor/ is the fixture bundle —",
    "tests should run against it rather than inventing new fixtures. Never let a",
    "code path emit a silently-wrong anchor, and never assert rationale above its",
    "evidence — these two rules override convenience every time.",
  ].join(" "),
});
