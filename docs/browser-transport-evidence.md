# Browser Transport Evidence

This evidence began with the guide-only exchange architecture introduced on
2026-09-05. The active transport boundary was updated on 2026-09-14. It is
local-only; no production deployment, package publication, wallet connection,
credential entry, funding, or trading action was performed.

## Active boundary

- One model-facing optional tool: `heytraders_cli`.
- Two fixed facade-v6 members: `window.__bridge.request` for the live command
  catalog and `window.__bridge.agentAuth` for Agent account
  proof-of-possession.
- OpenClaw calls those members through its managed tab's loopback CDP endpoint
  and a bundled constant evaluation program. It does not use the CDP WebMCP
  domain, accept model-authored JavaScript, or expose member selection to the
  model.
- All normal requests, including `exchange list`, `exchange guide`, and
  `exchange connect`, are forwarded unchanged to the page-owned request member.
- The OpenClaw package contains no Wallet Vault client, exchange wallet generator, signer, operator form, or `walletAction` contract.
- The local Compose harness contains no wallet/Vault service or persistent wallet volume.

## Exchange contract

The live Frontend catalog is the only exchange-command owner. The OpenClaw skill requires a fresh `exchange list` identifier and `exchange guide` document before connection. Wallets, exchange accounts, API keys, and signing keys are created outside HeyTraders through the venue/operator's chosen tooling. HeyTraders receives secrets or wallet approvals only through its existing secure browser surface; model-visible command arguments remain selector-only.

## 2026-09-05 verification record

- Pinned OpenClaw Docker runtime: 4 test files and 56 tests passed.
- TypeScript compilation and `openclaw plugins build --check` passed.
- `openclaw plugins validate` returned `valid: true` with no errors.
- `npm pack --dry-run` contained 14 files: the compiled adapter, login support,
  request contract, plugin metadata, README, and one skill. It contained no
  exchange connector, signer, wallet generator, Vault client, or Vault service.
- The existing local Compose project reported two Vault containers from the old
  definition as orphans. Those exact containers were stopped and removed after
  verification. Their named key/data volumes were preserved; the new Compose
  definition neither starts nor depends on them.
- A fresh read-only OpenClaw agent turn using the installed plugin and the
  logged-in `openai/gpt-5.6-luna` profile completed `status`, `exchange list`,
  and `exchange guide` for `hyperliquid`. The agent received guide revision
  `sha256:e0703c18a28b8a4c671ba8c6b8caad2608de15413385ccea47766e2ca90664ee`
  and correctly reported that wallet/account preparation happens outside
  HeyTraders through Hyperliquid's official guidance. No connect, wallet,
  signing, funding, or trading action was run.

The previous Vault-specific runtime proof is intentionally superseded and
removed so it cannot be mistaken for a supported installation path.

## 2026-09-14 direct-bridge verification

- The host Frontend served `/agent` from `http://localhost:5173`. Through the
  Compose TCP proxy, the managed Chromium page used the exact container-local
  origin `http://127.0.0.1:5173` and exposed frozen facade version 6 with only
  `agentAuth`, `request`, and `version`.
- The local package was built and installed into the existing OpenClaw
  `2026.8.2` Docker runtime. The installed `dist/browser-transport.js` matched
  the built file at SHA-256
  `f0e0f11e52d3677b37bc1fa7c90fbdc1a381ece03845f6863257b5be32327462`.
  It contains one fixed `Runtime.evaluate` command and no `WebMCP.*` command.
- Real model run `acb64478-9dc1-4288-9d89-52606239a215` used only
  `heytraders_cli` and completed `status`, `help auth`, and `auth status` in
  order: three tool calls, zero failures, authenticated and session verified.
  This was a Gateway/model/plugin/browser round trip, not a mocked transport
  test.
- A completely empty temporary managed-browser profile exposed a cold-page
  race: the first direct evaluation could arrive before the Frontend installed
  `window.__bridge`. A regression test reproduced the failure before the fix.
  The fixed evaluator now waits within the existing bounded timeout for the
  exact-origin page to install facade v6, without replaying a dispatched
  request.
- After that fix, fresh-profile run
  `e879c65d-1997-4c37-bc61-33f6cbed2b64` used only `heytraders_cli` and
  completed `auth status`, `status`, and `help auth`: three calls and zero
  failures. Independent API logs recorded the expected unauthenticated session
  check followed by successful Agent challenge and completion requests, then
  authenticated session checks. The temporary profile was stopped and removed.
- The original `openclaw` profile was restored and remained the only managed
  profile running. Final run `8657cca3-a93f-438c-b431-414b4b188706` used the
  actual `gpt-5.6-luna` model and only `heytraders_cli`; `status`, `help auth`,
  and `auth status` all returned `ok: true`, with the final result reporting an
  authenticated, verified Agent session.
- The first bounded run reached the new direct bridge but returned
  `AGENT_AUTH_FAILED` three times while the host Vite proxy returned HTTP 502:
  its configured local API was restart-looping because the local Supabase DB
  was absent. Starting the existing standard local Supabase stack restored API
  readiness and the same browser page and signing identity passed without a
  product-code fallback.
- The existing Agent identity remained byte-identical and retained the same
  mode, size, modification time, and inode. No identity, provider, browser
  profile, Telegram configuration, exchange setting, or credential was
  replaced.
- Fresh package verification passed 80 tests, TypeScript compilation, metadata
  checks, and OpenClaw plugin validation. The final fourteen-file archive
  SHA-256 was
  `c33afa3e1a9897e29d2aecdb01169ea3d0177546bc55b6eb0a6001e0c2a4cdc9`.

## Publication boundary

No npm publish, ClawHub publish, GitHub release, push, or production deployment
is authorized by this evidence.
