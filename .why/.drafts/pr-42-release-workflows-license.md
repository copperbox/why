---
type: decision
title: Release workflows license
description: "Draft captured from PR #42 — replace with the one-line truth this
  decision created."
why:
  status: active
  happened_on: 2026-07-17
  confidence: recorded
  anchors:
    - path: .github/workflows/release.yml
      lines: 1-85
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: .github/workflows/tag.yml
      lines: 1-41
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: .github/workflows/test.yml
      lines: 1-27
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: .gitignore
      lines: 7-8
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: docs/ci.md
      lines: 316-500
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: LICENSE
      lines: 1-21
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: package-lock.json
      lines: "3"
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: package-lock.json
      lines: "9"
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: package.json
      lines: "3"
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: package.json
      lines: 14-17
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: test/skills.test.ts
      lines: "46"
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
    - path: test/skills.test.ts
      lines: "48"
      as_of: 8f81f3e91964bd4bf6f5e01b9a98157876f7af02
      state: live
---

# Release workflows license

<!-- capture draft from PR #42 (merged 2026-07-17). Replace this comment with a
one-paragraph summary: what is true now because of this decision. -->

# Why

<!-- Rationale candidates quoted verbatim by `why capture` — keep what states
the why, rewrite it into narrative, and delete the rest. Never keep a claim
the quotes below do not support (DESIGN.md §2). Full evidence pack:
.drafts/pr-42-release-workflows-license.evidence.md (removed on promote) -->

> Setting up release workflows for tagging and npm publish with provenance, as well as adding missing LICENSE

— PR #42 description by @dantheuber

# Citations

[1] [PR #42: Release workflows license](https://github.com/copperbox/why/pull/42)
[2] [merge commit 8f81f3e](https://github.com/copperbox/why/commit/8f81f3e91964bd4bf6f5e01b9a98157876f7af02)
