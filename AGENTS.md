# HeyTraders OpenClaw Repository Guide

## Scope

This repository owns the OpenClaw-specific adapter, plugin packaging, provider guidance for HeyTraders browser commands, and Docker orchestration for the isolated Agent Wallet Vault implemented in the HeyTraders backend repository.

## Architectural rules

- Treat the live HeyTraders frontend command catalogs and domain gateways as authoritative.
- Keep `help` and `describe` as discovery primitives; do not copy the live catalog into source or prompt guidance.
- Register a single structured `heytraders_cli` tool. Do not create one OpenClaw tool per HeyTraders command.
- Keep the adapter restricted to the exact production origin `https://hey-traders.com` by default.
- Use only the generic request facade. Do not inspect or call individual bridge members.
- Do not add a generic page-evaluation, direct HTTP API, shell CLI, or legacy bridge fallback.
- The model-facing adapter must never read, accept, log, or persist credentials, cookies, tokens, local storage, or session storage. Hyperliquid wallet custody belongs only to the separately mounted, non-model Wallet Vault.
- Agent login is automatic proof-of-possession. Hyperliquid mainnet connection may automatically approve and deliver a Vault-owned API signer after the user funds the public Agent treasury address; other venue handoffs remain owned by the live application.
- Hyperliquid is mainnet-only. Reject testnet and arbitrary network overrides before wallet creation or venue approval.
- Treat orders, strategy execution, settings changes, and chart mutations as stateful operations. Preserve request identity and ordered execution according to the live contract.

## OpenClaw packaging rules

- Use the official OpenClaw Plugin SDK and TypeScript ESM package shape.
- Keep the tool optional so operators explicitly allow it.
- Keep `package.json`, the built entry point, and `openclaw.plugin.json` capability declarations aligned.
- Ship built JavaScript, not a TypeScript-only runtime entry.
- Validate the packed artifact, not only the source checkout.
- Keep the model-capable Gateway free of exchange-secret environment files and repository mounts; it may reach only the Vault's public prepare/connect surface over the fixed internal network origin.
- Do not add `SKILL.md` until the required runtime tool is functional and verified.

## Verification and release

- Test origin rejection, facade compatibility, UTF-8 payloads, timeouts, structured errors, and user-action handoffs.
- Run the OpenClaw plugin build and validation commands supported by the pinned SDK version.
- Run `npm pack` and inspect the archive before any release.
- Use fake venue/backend adapters for automated Wallet Vault tests. Real Hyperliquid wallet creation, funding, approval, and credential verification require the explicit operator-assisted mainnet checkpoint.
- Run ClawHub publishing with `--dry-run` first.
- Never publish to ClawHub, change repository visibility, or create a public release without explicit user approval.
