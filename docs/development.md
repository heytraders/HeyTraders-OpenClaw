# Development and release

This document is for repository contributors. It is not part of the published plugin package. The root README is exclusively for customers installing and using the public plugin.

## Optional local development harness

The Compose file uses the official OpenClaw `2026.8.2-browser` image pinned by digest. Gateway ports bind only to `127.0.0.1`; no Docker socket, host browser profile, exchange secret, or repository-wide host path is mounted into the Gateway.

Create the ignored local environment file and add a locally generated Gateway token:

```bash
cp .env.example .env
openssl rand -hex 32
```

Run from the repository root to verify and install the exact local package:

```bash
docker compose --profile dev pull openclaw-gateway openclaw-cli plugin-dev
docker compose --profile dev run --rm plugin-dev ci
docker compose --profile dev run --rm plugin-dev run verify
docker compose --profile dev run --rm plugin-dev pack --silent
docker compose up -d openclaw-gateway
docker compose run --rm openclaw-cli plugins install \
  npm-pack:/workspace/HeyTraders-OpenClaw/heytraders-openclaw-plugin-0.1.1.tgz \
  --force --accept-capabilities
```

Enable the browser plugin, this plugin and its optional tool through normal OpenClaw configuration. `browser.noSandbox=true` applies only to Chromium in this development container; it is not an external installation requirement.

The pinned image's `/home/node/.cache` is root-owned. The Compose harness supplies a writable `XDG_CACHE_HOME`; isolated image tests must likewise use a writable temporary cache instead of mounting the operator's state.

The browser transport defaults to the exact production origin. Explicit local testing can use a loopback or `host.docker.internal` HTTP origin through `appOrigin`; do not suggest that override in customer installation instructions.

## Transport architecture

```text
OpenClaw Agent
  -> optional heytraders_cli tool
    -> origin-pinned browser adapter
      -> create/resume the local Agent login identity
      -> resolve the existing managed browser profile
      -> reuse the bound work tab
      -> verify its Agent session; visit /agent only when signing is necessary
      -> forward commands through the page-owned request facade
```

The first invocation adopts one unambiguous HeyTraders tab or opens `/agent` if none exists. Subsequent calls retain the same target across registered routes. After Gateway restart, multiple eligible tabs are ambiguous until the operator chooses the intended work tab.

Session status is checked on every app route. Cookie refresh does not trigger signing. An unauthenticated session temporarily visits `/agent` in the same tab for proof-of-possession, then returns to its previous registered route. Human sessions and changes from the initially bound Agent account stop dispatch. Initial session adoption is not installation attestation or a comparison against the local key after Gateway restart.

Calls are serialized per browser context. Caller cancellation does not release a dispatched operation ahead of its terminal response. If dispatch becomes uncertain, subsequent commands stop; inspect the action before restarting the adapter and never automatically replay it.

There is no exchange-specific interceptor, wallet runtime, second transport, arbitrary page evaluation, browser storage reader, direct HeyTraders HTTP client, or shell fallback. The plugin's Ed25519 login identity is never used as an exchange wallet.

## Responsibility boundaries

| Concern | Owner |
| --- | --- |
| Commands, schemas, readiness, venue guides, navigation and workflow policy | Live Frontend catalogs and gateways |
| Agent login identity and exact-origin browser transport | This plugin and OpenClaw state |
| Wallet, venue account and trading credential creation/custody | Venue and operator-selected external tooling |
| Secure credential entry and wallet approval | The browser/venue surface named by the live guide |
| Encrypted exchange credentials, subscription limits and connection status | HeyTraders backend and brokers |

## Release checks

- Deploy a compatible Frontend with session status on all app routes and the `auth.agent` navigation route before publishing a transport that requires those capabilities. Never add an alternate transport to compensate for an older Frontend.
- Keep README, bundled SKILL and public configuration descriptions customer-facing. `src/package-release.test.ts` rejects known internal setup content and mismatched version/install references.
- Align package.json, package-lock.json, openclaw.plugin.json, README/SKILL install pins and the Compose artifact mount when changing versions.
- `npm pack` must include only compiled `dist/`, `skills/`, openclaw.plugin.json, package metadata and README. Do not add this document, plans, tests, environment files, runtime state or Compose files to the archive.
- Validate the exact fourteen-file packed artifact and its source metadata before publication; compare the public download with that artifact afterward.
- Verify the published README, Configuration and bundled skill in the browser, not only local source files. Keep previous release history intact.

Local verification commands do not authorize publication, product deployment, wallet connection, credential entry, funding, orders, strategy execution, or outgoing messages.
