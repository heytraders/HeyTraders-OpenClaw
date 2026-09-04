# HeyTraders OpenClaw Repository Guide

## Scope

This repository owns the OpenClaw-specific browser adapter, plugin packaging, Agent login identity, and discovery-first guidance for the live HeyTraders command catalog.

## Architectural rules

- Treat the live HeyTraders Frontend catalogs, Docs registry, and domain gateways as authoritative.
- Keep `help`, `help <domain>`, and `describe <command>` as discovery primitives; do not copy the live catalog into plugin code.
- Register one structured `heytraders_cli` tool. Do not create one OpenClaw tool per command or an exchange-specific hidden tool.
- Keep the adapter restricted to the exact production origin `https://hey-traders.com` by default.
- Use only the generic request facade. Do not call individual bridge members or add a page-evaluation, direct HTTP API, shell CLI, or legacy fallback.
- Never read, accept, log, or persist exchange credentials, wallet secrets, cookies, tokens, local storage, or session storage in model-facing code.
- Agent login is automatic proof-of-possession and is independent of exchange wallet custody.
- HeyTraders does not create wallets or venue credentials for OpenClaw. Exchange onboarding must read `exchange list` and the revisioned `exchange guide`, then use the existing secure browser connection surface.
- Do not require Docker, a Vault process, a wallet storage convention, or machine-specific software for plugin installation. Repository Compose is optional development infrastructure only.
- Treat orders, strategy execution, settings changes, exchange connection, and chart mutations as stateful operations governed by the live contract.

## Packaging rules

- Use the official OpenClaw Plugin SDK and TypeScript ESM package shape.
- Keep the tool optional so operators explicitly allow it.
- Keep `package.json`, the built entry point, and `openclaw.plugin.json` aligned.
- Ship built JavaScript and validate the packed artifact, not only source files.
- Keep the Gateway free of exchange-secret environment files, wallet services, repository mounts, and Docker socket access.

## Verification and release

- Test origin rejection, facade compatibility, UTF-8 payloads, timeouts, structured errors, automatic Agent authentication, and user-action handoffs.
- Prove that `exchange connect` is forwarded unchanged to the canonical browser tool and that no `walletAction` or Vault module ships.
- Run the OpenClaw build, plugin check/validation, tests, `npm pack`, and archive inspection before release.
- Never perform a real wallet approval, credential entry, funding action, order, deployment, ClawHub update, npm publish, or GitHub release without explicit user authorization.
