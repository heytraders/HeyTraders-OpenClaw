# Initial Architecture Boundary

Status: proposed foundation; adapter implementation has not started.

## Problem

HeyTraders already owns a live, capability-driven command system. An OpenClaw integration should expose that system without duplicating its commands or moving application policy into a provider-specific repository.

The integration therefore needs one generic OpenClaw tool and a safe transport to the authenticated HeyTraders browser page. A prompt-only skill cannot create that transport.

## Target responsibilities

### HeyTraders frontend

- Registers and executes the live command catalog.
- Owns command schemas, readiness, identifiers, policy, idempotency, and presentation.
- Returns structured success, error, and user-action-required results.

### OpenClaw adapter

- Registers one optional `heytraders_cli` agent tool.
- Accepts only a selector command and structured argument object.
- Selects a user-authorized browser target on the canonical HeyTraders origin.
- Calls only the generic HeyTraders request facade through a reviewed OpenClaw browser integration.
- Preserves structured responses without inventing application policy.

### Bundled skill

- Explains when to use the tool.
- Uses live discovery instead of copied command contracts.
- Requires state re-reading after mutations and user handoffs.
- Keeps credentials and visible confirmations with the user.

## Required invariants

1. **One ingress:** every provider request reaches the same generic application command boundary.
2. **One command authority:** runtime `help` and `describe` output outrank remembered or durable guidance.
3. **Exact origin:** production defaults to `https://hey-traders.com`; alternate origins require an explicit trusted development configuration.
4. **No credential transport:** tool parameters and results never carry login, exchange, wallet, cookie, token, or browser-storage secrets.
5. **No policy duplication:** confirmation, authorization, quotas, and application state remain owned by HeyTraders.
6. **Fail closed:** missing browser capability, wrong origin, unsupported facade, stale target, or invalid schema returns a structured error without a legacy fallback.
7. **Publication follows proof:** the ClawHub skill and plugin package are added only after the adapter passes runtime and artifact validation.

## Questions to resolve during implementation

- Which supported OpenClaw Plugin SDK API provides the narrowest reviewed access to a selected browser tab?
- How is a user-authorized HeyTraders tab selected and kept stable across navigation without reading browser storage?
- How should tool-level optional exposure combine with OpenClaw permission requests for stateful commands?
- Which OpenClaw versions provide the required browser and plugin runtime contracts?
- Should the skill ship only inside the plugin, or also as a separately installable ClawHub skill after dependency metadata can express the plugin requirement?

These questions must be resolved from the current OpenClaw SDK and verified runtime behavior rather than guessed from documentation examples.
