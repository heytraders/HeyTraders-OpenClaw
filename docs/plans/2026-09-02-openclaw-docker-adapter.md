# OpenClaw Docker Adapter Implementation Plan

> **For Claude:** Execute this plan sequentially in the current `develop` working tree. Project rules prohibit worktrees, so preserve unrelated changes and keep commits scoped.

**Goal:** Run OpenClaw `2026.8.2` in a local Docker environment and deliver the smallest verified HeyTraders tool plugin that can safely reach the live browser command facade, without exposing credentials or duplicating the command catalog.

**Architecture:** The official OpenClaw Gateway and CLI run from a pinned prebuilt Docker image with persistent state in ignored local directories. The plugin exposes one optional `heytraders_cli` tool and delegates browser access only through a documented, public OpenClaw SDK or Gateway contract. If no supported contract can invoke page-defined WebMCP tools, implementation stops at a tested transport boundary and records the missing upstream capability instead of adding generic JavaScript evaluation or private imports.

**Tech Stack:** Docker Compose v2, OpenClaw `2026.8.2`, Node.js/TypeScript ESM, TypeBox, Node test runner, npm package artifacts.

---

### Task 1: Pin and prove the Docker runtime

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Modify: `.gitignore`
- Modify: `README.md`

**Step 1: Inspect the official release and image manifest**

Run:

```bash
gh api repos/openclaw/openclaw/releases/latest --jq .tag_name
docker buildx imagetools inspect ghcr.io/openclaw/openclaw:2026.8.2-browser
```

Expected: release `v2026.8.2` and a Linux ARM64 image manifest.

**Step 2: Add a loopback-only Compose harness**

Use the official image for both Gateway and CLI, mount ignored state directories, mount this repository read-only for initial inspection, and bind Gateway/bridge ports to `127.0.0.1` only. Do not mount the Docker socket or host browser credentials.

**Step 3: Pull and inspect the runtime**

Run:

```bash
docker compose pull
docker compose run --rm --no-deps openclaw-cli --version
docker compose run --rm --no-deps openclaw-cli plugins --help
```

Expected: OpenClaw `2026.8.2` and plugin build/validate commands.

### Task 2: Scaffold the official tool-plugin shape

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Generate: `openclaw.plugin.json`

**Step 1: Generate a reference scaffold in a temporary mounted directory**

Run the pinned container's `openclaw plugins init` command outside the repository and inspect every generated file. Do not copy undocumented imports.

**Step 2: Add one optional tool contract**

The public shape is:

```ts
type HeyTradersRequest = {
  command: string;
  args?: Record<string, unknown>;
};
```

The plugin must register only `heytraders_cli`. It must not enumerate HeyTraders commands.

**Step 3: Build and validate the empty transport path**

Run:

```bash
npm ci
npm run plugin:build
npm run plugin:validate
```

Expected: the official manifest and package metadata agree.

### Task 3: Add fail-closed request validation

**Files:**
- Create: `src/request-contract.ts`
- Create: `test/request-contract.test.ts`

**Step 1: Write failing tests**

Cover empty commands, non-object args, prototype-polluting keys, credential-like fields, and valid UTF-8 structured arguments.

**Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- test/request-contract.test.ts
```

Expected: tests fail because validation is not implemented.

**Step 3: Implement the narrow request validator**

Reject credentials and browser-storage material at the adapter boundary. Preserve application arguments without inventing command policy.

**Step 4: Run tests and confirm success**

Expected: all contract tests pass.

### Task 4: Resolve and implement the browser transport

**Files:**
- Create: `docs/browser-transport-evidence.md`
- Create: `src/browser-transport.ts` only if a supported public contract exists
- Create: `test/browser-transport.test.ts` only if transport is implementable
- Modify: `src/index.ts`

**Step 1: Inspect the pinned SDK and browser plugin runtime**

Search only public `openclaw/plugin-sdk/*` exports and documented authenticated Gateway methods. Record exact version, source paths, and runtime probes.

**Step 2: Apply the transport decision gate**

An acceptable transport must:

- address a user-authorized tab;
- enforce `https://hey-traders.com` before invocation;
- invoke the page-defined `heytraders_cli`/generic facade without arbitrary script evaluation;
- avoid cookies, tokens, local storage, and session storage;
- return structured errors and user-action handoffs.

If the public SDK cannot do this, document the verified gap and do not import OpenClaw internals, use raw CDP evaluation, or ship a pretend implementation.

**Step 3: If supported, test origin and lifecycle behavior first**

Cover wrong origin, no eligible tab, stale tab, unsupported facade, timeout, structured error pass-through, and one successful read-only `help` request.

**Step 4: Implement only the tested transport**

Keep tab selection and transport ownership in `browser-transport.ts`; keep tool registration in `index.ts`.

### Task 5: Verify in the Docker Gateway

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`

**Step 1: Create ignored persistent state**

Generate a Gateway token locally and write only to ignored `.env`. Do not add model-provider credentials unless required for an explicit agent run.

**Step 2: Start the Gateway and run read-only health checks**

Run:

```bash
docker compose up -d openclaw-gateway
curl --fail http://127.0.0.1:18789/healthz
docker compose run --rm openclaw-cli doctor --json
```

Expected: healthy Gateway with no public network bind.

**Step 3: Install the packed plugin artifact**

Run `npm pack`, install using `npm-pack:`, and inspect the loaded runtime with `openclaw plugins inspect heytraders --runtime --json`.

**Step 4: Exercise the browser boundary**

If Task 4 passed, open an authenticated HeyTraders tab in the supported browser profile and invoke `help`, `status`, and `describe` through the registered tool. Stop before any stateful mutation or visible confirmation.

### Task 6: Add the thin bundled skill only after runtime proof

**Files:**
- Create: `skills/heytraders-browser/SKILL.md` only after Task 5 succeeds end-to-end
- Modify: `package.json`
- Modify: `openclaw.plugin.json`

**Step 1: Write discovery-first guidance**

The skill must begin with `help`/`describe`, re-read state after mutations, and return `userActionRequired` to the user. It must not contain copied command lists or secrets.

**Step 2: Rebuild and validate package metadata**

Expected: the packed artifact contains the built plugin and skill, and no `.env`, logs, state, or dependencies outside the declared package.

### Task 7: Final verification and scoped commit

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `.codex/orchestration/plan.md` (ignored local ledger)

**Step 1: Run verification**

Run unit tests, type checking, plugin build/validate, `npm pack --dry-run`, archive inspection, Docker health checks, and `git diff --check`.

**Step 2: Record verified and unverified claims**

Clearly separate package proof, Docker runtime proof, browser transport proof, authenticated HeyTraders proof, and publication state.

**Step 3: Commit on `develop`**

Stage only this repository's scoped files and commit after all implemented gates pass. Do not publish to npm or ClawHub and do not create a GitHub release.
