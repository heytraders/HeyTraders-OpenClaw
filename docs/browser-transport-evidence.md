# Browser Transport Evidence

This evidence describes the guide-only exchange architecture introduced on 2026-09-05. It is local-only; no production deployment, package publication, wallet connection, credential entry, funding, or trading action was performed.

## Active boundary

- One model-facing optional tool: `heytraders_cli`.
- One adapter-only page tool: `heytraders_agent_auth`, used only for Agent account proof-of-possession.
- All normal requests, including `exchange list`, `exchange guide`, and `exchange connect`, are forwarded unchanged to the page-owned `heytraders_cli` tool.
- The OpenClaw package contains no Wallet Vault client, exchange wallet generator, signer, operator form, or `walletAction` contract.
- The local Compose harness contains no wallet/Vault service or persistent wallet volume.

## Exchange contract

The live Frontend catalog is the only exchange-command owner. The OpenClaw skill requires a fresh `exchange list` identifier and `exchange guide` document before connection. Wallets, exchange accounts, API keys, and signing keys are created outside HeyTraders through the venue/operator's chosen tooling. HeyTraders receives secrets or wallet approvals only through its existing secure browser surface; model-visible command arguments remain selector-only.

## Verification record

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

## Publication boundary

No npm publish, ClawHub publish, GitHub release, push, production deployment, or `main`-branch commit is authorized by this evidence.
