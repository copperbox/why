# Evidence pack: pr-42

- commits: 8f81f3e
- files touched: .github/workflows/release.yml, .github/workflows/tag.yml, .github/workflows/test.yml, .gitignore, docs/ci.md, LICENSE, package-lock.json, package.json, test/skills.test.ts
- references: PR #42

## Commits

### commit 8f81f3e

- author: Dan Essig <dantheuber@users.noreply.github.com>
- date: 2026-07-16

Release workflows license (#42)

* workflows + license

* 1.0.1

* docs ci

## Pull requests

### PR #42 — Release workflows license

by @dantheuber

Setting up release workflows for tagging and npm publish with provenance, as well as adding missing LICENSE


## Diffs

### diff of commit 8f81f3e

````diff
diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
new file mode 100644
index 0000000..9d97cbb
--- /dev/null
+++ b/.github/workflows/release.yml
@@ -0,0 +1,85 @@
+name: Release
+
+on:
+  push:
+    tags:
+      - "v*"
+  # Dispatched by tag.yml on the new tag ref, since tags pushed with
+  # GITHUB_TOKEN don't trigger `on: push: tags` workflows.
+  workflow_dispatch:
+
+permissions:
+  contents: read
+  id-token: write # npm trusted publishing (OIDC) + provenance
+
+jobs:
+  publish:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          registry-url: https://registry.npmjs.org
+
+      # Trusted publishing (OIDC) needs npm >= 11.5.1; Node 22 bundles npm 10.
+      # Pinned to a major so a new npm major can't change behavior mid-release.
+      # npm 12.0.0 is broken twice over: `pack --json` changed shape, and
+      # `publish --provenance` crashes (sigstore missing from bundled deps).
+      - run: npm install -g npm@11
+
+      - run: npm ci
+
+      - run: npm run typecheck
+
+      - run: npm test
+
+      - run: npm run build
+
+      - name: Verify tag matches package version
+        run: |
+          node -e "
+            const v = require('./package.json').version;
+            if (process.env.GITHUB_REF_NAME !== 'v' + v) {
+              console.error('Tag ' + process.env.GITHUB_REF_NAME + ' does not match package.json version ' + v);
+              process.exit(1);
+            }
+          "
+
+      - name: Verify CLI shebang and executable bit
+        run: |
+          head -n 1 dist/cli.js | grep -qx '#!/usr/bin/env node'
+          test -x dist/cli.js
+
+      - name: Verify pack contents
+        run: |
+          node -e "
+            const { execFileSync } = require('child_process');
+            const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
+            // npm <= 11 prints an array of results; npm 12 prints an object
+            // keyed by package name.
+            const parsed = JSON.parse(out);
+            const result = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
+            const files = result.files.map((f) => f.path);
+            const allowed = (p) => p === 'package.json' || p === 'README.md' || p === 'LICENSE' || p.startsWith('dist/') || p.startsWith('ui/');
+            const unexpected = files.filter((p) => !allowed(p));
+            if (unexpected.length > 0) {
+              console.error('Unexpected files in npm pack:', unexpected);
+              process.exit(1);
+            }
+            if (!files.includes('dist/cli.js')) {
+              console.error('dist/cli.js missing from npm pack');
+              process.exit(1);
+            }
+            if (!files.includes('ui/app.js')) {
+              console.error('ui/app.js missing from npm pack');
+              process.exit(1);
+            }
+            console.log('Pack contents OK (' + files.length + ' files)');
+          "
+
+      # Authenticates via the npm trusted publisher (OIDC) for this repo +
+      # workflow file — no NPM_TOKEN secret involved.
+      - name: Publish to npm
+        run: npm publish --provenance --access public
````

````diff
diff --git a/.github/workflows/tag.yml b/.github/workflows/tag.yml
new file mode 100644
index 0000000..694944f
--- /dev/null
+++ b/.github/workflows/tag.yml
@@ -0,0 +1,41 @@
+name: Tag Release
+
+on:
+  push:
+    branches:
+      - main
+
+permissions:
+  contents: write # push the version tag
+  actions: write # dispatch the release workflow
+
+jobs:
+  tag:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - name: Create tag for package version
+        id: tag
+        run: |
+          VERSION=$(node -p "require('./package.json').version")
+          TAG="v$VERSION"
+          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
+          if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
+            echo "Tag $TAG already exists; skipping"
+            echo "created=false" >> "$GITHUB_OUTPUT"
+          else
+            git config user.name "github-actions[bot]"
+            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
+            git tag -a "$TAG" -m "Release $TAG"
+            git push origin "$TAG"
+            echo "created=true" >> "$GITHUB_OUTPUT"
+          fi
+
+      # Tags pushed with GITHUB_TOKEN don't trigger `on: push: tags` workflows,
+      # so kick off the release explicitly on the new tag.
+      - name: Dispatch release workflow
+        if: steps.tag.outputs.created == 'true'
+        run: gh workflow run release.yml --ref "${{ steps.tag.outputs.tag }}"
+        env:
+          GH_TOKEN: ${{ github.token }}
````

````diff
diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
new file mode 100644
index 0000000..1ff7700
--- /dev/null
+++ b/.github/workflows/test.yml
@@ -0,0 +1,27 @@
+name: Test
+
+on:
+  pull_request:
+    branches:
+      - main
+
+permissions:
+  contents: read
+
+jobs:
+  test:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+
+      - run: npm ci
+
+      - run: npm run typecheck
+
+      - run: npm run verify
+
+      - run: npm run build
````

````diff
diff --git a/.gitignore b/.gitignore
index dbab563..27b06ae 100644
--- a/.gitignore
+++ b/.gitignore
@@ -4,4 +4,5 @@ dist/
 *.vsix
 vscode-why/out/
 vscode-why/.vscode-test/
-.sandcastle/.env
\ No newline at end of file
+.sandcastle/.env
+.why/.obsidian/
\ No newline at end of file
````

````diff
diff --git a/LICENSE b/LICENSE
new file mode 100644
index 0000000..9fe64e7
--- /dev/null
+++ b/LICENSE
@@ -0,0 +1,21 @@
+MIT License
+
+Copyright (c) 2026 Dan Essig
+
+Permission is hereby granted, free of charge, to any person obtaining a copy
+of this software and associated documentation files (the "Software"), to deal
+in the Software without restriction, including without limitation the rights
+to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
+copies of the Software, and to permit persons to whom the Software is
+furnished to do so, subject to the following conditions:
+
+The above copyright notice and this permission notice shall be included in all
+copies or substantial portions of the Software.
+
+THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
+IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
+FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
+AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
+LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
+OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
+SOFTWARE.
````

````diff
diff --git a/docs/ci.md b/docs/ci.md
index 3b898ed..7b08e6c 100644
--- a/docs/ci.md
+++ b/docs/ci.md
@@ -313,3 +313,188 @@ Digging (docs/digging.md) is an agent-driven, judgment-heavy pass — run it
 deliberately, not on a schedule. The `method: ask` questionnaire loop is the
 same kind of work: the audit job *reports* ask-constraints; answering them is
 an agent session with `why audit --questions-out` / `--answers`.
+
+## Appendix: this repository's package plumbing
+
+The remaining three workflows are not `why` recipes — they are this repo's own
+test/release pipeline for the `@copperbox/why` npm package. Consumers have no
+reason to copy them; they live here so the doc carries every workflow that is
+actually running.
+
+PRs run the typecheck/test/build gate:
+
+`.github/workflows/test.yml`:
+
+```yaml
+name: Test
+
+on:
+  pull_request:
+    branches:
+      - main
+
+permissions:
+  contents: read
+
+jobs:
+  test:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+
+      - run: npm ci
+
+      - run: npm run typecheck
+
+      - run: npm run verify
+
+      - run: npm run build
+```
+
+Every push to `main` tags `v<package.json version>` if that tag doesn't exist
+yet, then dispatches the release — explicitly, because tags pushed with
+`GITHUB_TOKEN` never trigger other workflows:
+
+`.github/workflows/tag.yml`:
+
+```yaml
+name: Tag Release
+
+on:
+  push:
+    branches:
+      - main
+
+permissions:
+  contents: write # push the version tag
+  actions: write # dispatch the release workflow
+
+jobs:
+  tag:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - name: Create tag for package version
+        id: tag
+        run: |
+          VERSION=$(node -p "require('./package.json').version")
+          TAG="v$VERSION"
+          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
+          if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
+            echo "Tag $TAG already exists; skipping"
+            echo "created=false" >> "$GITHUB_OUTPUT"
+          else
+            git config user.name "github-actions[bot]"
+            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
+            git tag -a "$TAG" -m "Release $TAG"
+            git push origin "$TAG"
+            echo "created=true" >> "$GITHUB_OUTPUT"
+          fi
+
+      # Tags pushed with GITHUB_TOKEN don't trigger `on: push: tags` workflows,
+      # so kick off the release explicitly on the new tag.
+      - name: Dispatch release workflow
+        if: steps.tag.outputs.created == 'true'
+        run: gh workflow run release.yml --ref "${{ steps.tag.outputs.tag }}"
+        env:
+          GH_TOKEN: ${{ github.token }}
+```
+
+The release re-runs the full gate on the tag, verifies the tag matches the
+package version and the tarball contains exactly what it should, then publishes
+to npm via trusted publishing (OIDC) — no token secret:
+
+`.github/workflows/release.yml`:
+
+```yaml
+name: Release
+
+on:
+  push:
+    tags:
+      - "v*"
+  # Dispatched by tag.yml on the new tag ref, since tags pushed with
+  # GITHUB_TOKEN don't trigger `on: push: tags` workflows.
+  workflow_dispatch:
+
+permissions:
+  contents: read
+  id-token: write # npm trusted publishing (OIDC) + provenance
+
+jobs:
+  publish:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v4
+
+      - uses: actions/setup-node@v4
+        with:
+          node-version: 22
+          registry-url: https://registry.npmjs.org
+
+      # Trusted publishing (OIDC) needs npm >= 11.5.1; Node 22 bundles npm 10.
+      # Pinned to a major so a new npm major can't change behavior mid-release.
+      # npm 12.0.0 is broken twice over: `pack --json` changed shape, and
+      # `publish --provenance` crashes (sigstore missing from bundled deps).
+      - run: npm install -g npm@11
+
+      - run: npm ci
+
+      - run: npm run typecheck
+
+      - run: npm test
+
+      - run: npm run build
+
+      - name: Verify tag matches package version
+        run: |
+          node -e "
+            const v = require('./package.json').version;
+            if (process.env.GITHUB_REF_NAME !== 'v' + v) {
+              console.error('Tag ' + process.env.GITHUB_REF_NAME + ' does not match package.json version ' + v);
+              process.exit(1);
+            }
+          "
+
+      - name: Verify CLI shebang and executable bit
+        run: |
+          head -n 1 dist/cli.js | grep -qx '#!/usr/bin/env node'
+          test -x dist/cli.js
+
+      - name: Verify pack contents
+        run: |
+          node -e "
+            const { execFileSync } = require('child_process');
+            const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
+            // npm <= 11 prints an array of results; npm 12 prints an object
+            // keyed by package name.
+            const parsed = JSON.parse(out);
+            const result = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
+            const files = result.files.map((f) => f.path);
+            const allowed = (p) => p === 'package.json' || p === 'README.md' || p === 'LICENSE' || p.startsWith('dist/') || p.startsWith('ui/');
+            const unexpected = files.filter((p) => !allowed(p));
+            if (unexpected.length > 0) {
+              console.error('Unexpected files in npm pack:', unexpected);
+              process.exit(1);
+            }
+            if (!files.includes('dist/cli.js')) {
+              console.error('dist/cli.js missing from npm pack');
+              process.exit(1);
+            }
+            if (!files.includes('ui/app.js')) {
+              console.error('ui/app.js missing from npm pack');
+              process.exit(1);
+            }
+            console.log('Pack contents OK (' + files.length + ' files)');
+          "
+
+      # Authenticates via the npm trusted publisher (OIDC) for this repo +
+      # workflow file — no NPM_TOKEN secret involved.
+      - name: Publish to npm
+        run: npm publish --provenance --access public
+```
````

````diff
diff --git a/package-lock.json b/package-lock.json
index 6e0b210..d6b2a32 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "@copperbox/why",
-  "version": "1.0.0",
+  "version": "1.0.1",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "@copperbox/why",
-      "version": "1.0.0",
+      "version": "1.0.1",
       "license": "MIT",
       "dependencies": {
         "@copperbox/okf-mcp": "^0.19.1",
````

````diff
diff --git a/package.json b/package.json
index 35a7536..0311596 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@copperbox/why",
-  "version": "1.0.0",
+  "version": "1.0.1",
   "description": "Decision archaeology for codebases — recover, anchor, and audit the why behind code.",
   "type": "module",
   "license": "MIT",
@@ -11,6 +11,10 @@
     "dist",
     "ui"
   ],
+  "repository": {
+    "type": "git",
+    "url": "git+https://github.com/copperbox/why.git"
+  },
   "scripts": {
     "why": "tsx src/cli.ts",
     "typecheck": "tsc --noEmit",
````

````diff
diff --git a/test/skills.test.ts b/test/skills.test.ts
index 114d857..051b0d4 100644
--- a/test/skills.test.ts
+++ b/test/skills.test.ts
@@ -43,8 +43,9 @@ const IMPLEMENTED_SUBCOMMANDS = new Set([
 ]);
 
 /** snake_case tokens in the docs that are schema fields, example symbols, or
- * GitHub Actions vocabulary, not okf-mcp tool names. */
+ * GitHub Actions / Node vocabulary, not okf-mcp tool names. */
 const NON_TOOL_TOKENS = new Set([
+  "child_process",
   "happened_on",
   "expired_on",
   "as_of",
````
