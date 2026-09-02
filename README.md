# HeyTraders OpenClaw

OpenClaw integration boundary for operating [HeyTraders](https://hey-traders.com/) through the application's live command catalog.

> Status: repository bootstrap. No installable OpenClaw plugin or ClawHub skill has been published from this repository yet.

## Goal

This repository will provide:

1. an OpenClaw tool plugin that exposes one optional `heytraders_cli` tool through an origin-pinned browser adapter; and
2. a thin, plugin-bundled skill that teaches OpenClaw to discover and follow the live command contract.

The skill will contain workflow and safety guidance only. It will not copy command names, schemas, route IDs, chart capabilities, venue metadata, or application policy.

## Target runtime flow

```text
OpenClaw agent
  -> optional heytraders_cli tool
    -> HeyTraders OpenClaw adapter
      -> approved OpenClaw browser integration
        -> https://hey-traders.com/
          -> generic HeyTraders request facade
            -> AppCommandGateway
              -> live domain gateways
```

The exact plugin-to-browser transport must be implemented and verified before the tool or skill is published. A generic JavaScript-evaluation fallback is not an acceptable transport.

## Ownership boundaries

| Concern | Authoritative owner |
| --- | --- |
| Command names, input/output schemas, readiness, and workflow hints | Live HeyTraders frontend catalogs and domain gateways |
| OpenClaw tool registration and origin-pinned transport | This repository |
| Login, credentials, wallets, and visible confirmations | The user in the authenticated HeyTraders browser session |
| Public HTTP API documentation | The HeyTraders backend documentation system |

## Non-goals

- Replacing the HeyTraders public HTTP API skill.
- Maintaining a second command catalog.
- Accepting API keys, exchange credentials, wallet secrets, cookies, or browser storage.
- Calling undocumented bridge members or bypassing the generic request facade.
- Publishing a non-functional ClawHub skill before its required OpenClaw tool exists.

## Planned implementation gates

1. Select and pin a supported OpenClaw Plugin SDK compatibility range.
2. Prove a safe browser-tab transport that targets only `https://hey-traders.com` and the generic request facade.
3. Register `heytraders_cli` as an optional tool with one structured `{ command, args }` envelope.
4. Add contract, origin, encoding, timeout, error, and credential-boundary tests.
5. Add a thin bundled skill that starts from live discovery and respects user-action handoffs.
6. Build and validate the exact package artifact.
7. Run a ClawHub code-plugin dry run.
8. Publish only after explicit approval.

See [docs/architecture.md](docs/architecture.md) for the initial architectural constraints.

## References

- [OpenClaw: Building plugins](https://docs.openclaw.ai/plugins/building-plugins)
- [OpenClaw: Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins)
- [ClawHub: Publishing](https://docs.openclaw.ai/clawhub/publishing)
