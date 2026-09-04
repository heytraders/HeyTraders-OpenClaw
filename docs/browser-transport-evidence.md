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
  definition as orphans. The new Compose definition neither starts nor depends
  on them; they were not deleted as part of this source-only change.

The previous Vault-specific runtime proof is intentionally superseded and
removed so it cannot be mistaken for a supported installation path.

## Publication boundary

No npm publish, ClawHub publish, GitHub release, push, production deployment, or `main`-branch commit is authorized by this evidence.
