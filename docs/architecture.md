# Architecture

## Purpose

This repository is a thin OpenClaw adapter for the live HeyTraders browser command facade. It owns transport and Agent authentication, not the application's command catalog or exchange onboarding logic.

## Components

### `heytraders_cli` plugin tool

- Accepts one bounded `{ command, args }` request.
- Rejects credential-shaped argument names and unsafe JSON structures.
- Resolves only a local OpenClaw-managed browser profile.
- Pins the configured HeyTraders origin and work-tab target ID, independent of its current route.
- Establishes the Agent-owned HeyTraders browser session.
- Uses the managed tab's loopback CDP endpoint to call only facade-v6
  `window.__bridge.request` and `window.__bridge.agentAuth` through a bundled,
  constant `Runtime.evaluate` program.
- Forwards every normalized command unchanged to `window.__bridge.request`;
  the model never supplies JavaScript or selects a bridge member.

### Agent authentication

The plugin persists a local Ed25519 identity under the OpenClaw state directory. The page returns an origin- and client-bound challenge; the plugin signs it and receives an HttpOnly Agent browser session. This key represents the Agent's HeyTraders login only. It is never an exchange wallet, API key, or trading signer.

The private `window.__bridge.agentAuth` capability exposes status on all routes;
challenge and completion remain restricted to `/agent`. The existing page
WebMCP auth tool reuses the same Frontend function for other consumers, but
OpenClaw does not enable or invoke WebMCP. Status uses AuthService to revalidate
shared cookies and updates the page-local authStore only when identity/expiry
changes. Local state alone can miss a cross-tab account switch. Normal refresh
remains owned by AuthService.

Only an unauthenticated status triggers canonical `nav` to `/agent`, signing, and restoration of the prior registered path/query/fragment in the same tab. Failed navigation stops dispatch. The original command is forwarded once. Human sessions and changes from the Agent ID initially observed in the running context are rejected; initial adoption after Gateway restart is not a local-key ownership check.

Browser operations are serialized. Caller cancellation after dispatch keeps the
queue occupied until the terminal CDP evaluation response. An unknown outcome
blocks further dispatch until the operator reconciles the last action and
restarts the adapter. No automatic replay is inferred from an error.

### Live HeyTraders application

The Frontend remains authoritative for command discovery, exchange identifiers, documentation revisions, Trusted IP metadata, secure connection UI, navigation remediation, and state projection. The backend remains authoritative for the Agent `user_id`, subscription tier, quotas, encrypted exchange credentials, and connection status.

## Exchange boundary

The plugin has no exchange-specific browser capability, Wallet Vault client,
`walletAction`, wallet generator, signer, operator form, or direct
credential-delivery path.

Agents must:

1. read `exchange list`;
2. read `exchange guide` for the chosen live identifier;
3. create or prepare the venue-owned wallet/account/credential using external tooling chosen by the operator;
4. call the canonical `exchange connect` command with only that identifier;
5. complete secret entry or wallet approval in the application/venue-owned secure surface;
6. verify the resulting connection through live status commands.

This design neither scans an Agent's machine for wallets nor dictates how external wallet software stores keys. If compatible external tooling is unavailable, HeyTraders returns guidance; it does not install or emulate that tooling.

## Security properties

- One model-facing tool, one generic page command member, and one fixed private
  Agent-auth member.
- Exact-origin and exact-top-frame binding.
- Facade version 6 or newer and a closed `request | agentAuth` member allowlist.
- No cookies, browser storage, login tokens, wallet keys, API credentials, or signatures in model-visible requests/results.
- No model-controlled/arbitrary page expression, direct HeyTraders HTTP API,
  shell fallback, dynamic member selection, or undocumented bridge access.
- No hidden local service or container requirement.
- State-changing results remain subject to live application policy and explicit user/venue handoffs.

## Development runtime

`docker-compose.yml` is an optional, pinned OpenClaw test harness. It runs only the OpenClaw Gateway, operator CLI, and opt-in package-development service. It is not part of the plugin installation contract and does not run an exchange wallet or credential service.
