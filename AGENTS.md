# HeyTraders OpenClaw Repository Guide

## Scope

This repository owns only the OpenClaw-specific adapter, plugin packaging, and provider guidance for HeyTraders browser commands.

## Architectural rules

- Treat the live HeyTraders frontend command catalogs and domain gateways as authoritative.
- Keep `help` and `describe` as discovery primitives; do not copy the live catalog into source or prompt guidance.
- Register a single structured `heytraders_cli` tool. Do not create one OpenClaw tool per HeyTraders command.
- Keep the adapter restricted to the exact production origin `https://hey-traders.com` by default.
- Use only the generic request facade. Do not inspect or call individual bridge members.
- Do not add a generic page-evaluation, direct HTTP API, shell CLI, or legacy bridge fallback.
- Never read, accept, log, or persist credentials, cookies, tokens, local storage, or session storage.
- Login, exchange connection, wallet approval, and any returned user-action-required state remain visible user handoffs.
- Treat orders, strategy execution, settings changes, and chart mutations as stateful operations. Preserve request identity and ordered execution according to the live contract.

## OpenClaw packaging rules

- Use the official OpenClaw Plugin SDK and TypeScript ESM package shape.
- Keep the tool optional so operators explicitly allow it.
- Keep `package.json`, the built entry point, and `openclaw.plugin.json` capability declarations aligned.
- Ship built JavaScript, not a TypeScript-only runtime entry.
- Validate the packed artifact, not only the source checkout.
- Do not add `SKILL.md` until the required runtime tool is functional and verified.

## Verification and release

- Test origin rejection, facade compatibility, UTF-8 payloads, timeouts, structured errors, and user-action handoffs.
- Run the OpenClaw plugin build and validation commands supported by the pinned SDK version.
- Run `npm pack` and inspect the archive before any release.
- Run ClawHub publishing with `--dry-run` first.
- Never publish to ClawHub, change repository visibility, or create a public release without explicit user approval.
