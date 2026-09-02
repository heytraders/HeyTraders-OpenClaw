# HeyTraders OpenClaw

OpenClaw integration for operating [HeyTraders](https://hey-traders.com/) through the application's live browser command catalog.

> Status: the plugin and its bundled skill are implemented and verified in a local Docker runtime. They have not been published to npm, ClawHub, or a GitHub release.

## What ships here

- One optional OpenClaw tool, `heytraders_cli`, with a structured `{ command, args }` request envelope.
- One bundled, model-visible skill that teaches discovery-first command use without copying the live catalog.
- A loopback-only Docker Compose environment pinned to the official OpenClaw `2026.8.2-browser` image digest.

Command names, schemas, readiness, identifiers, and application policy remain owned by the live HeyTraders page. The adapter starts from `help`, `help <domain>`, and `describe <command>` rather than maintaining a second catalog.

## Runtime flow

```text
OpenClaw agent
  -> optional heytraders_cli tool
    -> HeyTraders OpenClaw plugin
      -> public OpenClaw browser-profile resolver
        -> loopback CDP for the managed openclaw profile
          -> WebMCP.invokeTool("heytraders_cli")
            -> https://hey-traders.com
              -> live HeyTraders command gateways
```

The transport does not evaluate arbitrary page JavaScript, read cookies or browser storage, accept credentials, call a HeyTraders HTTP API, or fall back to a shell command. It requires exactly one page whose origin is `https://hey-traders.com`, revalidates the current top-level frame before every invocation, and rejects same-name tools registered by child frames. It also fails closed for remote, extension-attached, navigated, or ambiguous browser targets.

## Ownership boundaries

| Concern | Authoritative owner |
| --- | --- |
| Command names, schemas, readiness, identifiers, and workflow policy | Live HeyTraders frontend catalogs and domain gateways |
| OpenClaw tool registration and origin-pinned WebMCP transport | This repository |
| Login, credentials, wallets, and visible confirmations | The user in the HeyTraders browser session |
| Public HTTP API documentation and the legacy API skill | The HeyTraders backend/documentation repositories |

## Local Docker setup

The Compose file uses the official OpenClaw `2026.8.2-browser` image pinned by digest. Gateway ports bind only to `127.0.0.1`; the Docker socket and host browser profiles are not mounted.

Create an ignored local environment file:

```bash
cp .env.example .env
```

Generate a gateway token with `openssl rand -hex 32` and place it in `OPENCLAW_GATEWAY_TOKEN` inside `.env`. Do not commit that file or put model-provider credentials, exchange credentials, cookies, or browser data in this repository.

Pull the runtime, install dependencies, and verify the plugin inside the pinned container:

```bash
docker compose pull
docker compose --profile dev run --rm plugin-dev ci
docker compose --profile dev run --rm plugin-dev run verify
docker compose --profile dev run --rm plugin-dev pack --silent
```

Start the Gateway and install the exact packed artifact:

```bash
docker compose up -d openclaw-gateway
docker compose run --rm openclaw-cli plugins install \
  npm-pack:/workspace/HeyTraders-OpenClaw/heytraders-openclaw-plugin-0.1.0.tgz \
  --force --accept-capabilities
```

Enable only the browser plugin, this plugin, and its optional tool:

```bash
docker compose run --rm openclaw-cli config set plugins.allow \
  '["browser","heytraders"]' --strict-json
docker compose run --rm openclaw-cli config set plugins.entries.heytraders \
  '{"enabled":true,"config":{"browserProfile":"openclaw","timeoutMs":30000}}' \
  --strict-json
docker compose run --rm openclaw-cli config set tools.alsoAllow \
  '["heytraders_cli"]' --strict-json
docker compose run --rm openclaw-cli config set browser \
  '{"enabled":true,"headless":true,"noSandbox":true}' --strict-json
docker compose restart openclaw-gateway
```

`browser.noSandbox=true` is required by Chromium in this non-root Docker runtime. Container isolation remains enforced with dropped network capabilities, `no-new-privileges`, no Docker socket, no host browser data, a read-only source mount for the Gateway and CLI, and loopback-only host ports. Only the opt-in `plugin-dev` service mounts the checkout read-write.

Confirm the installed plugin and skill:

```bash
docker compose run --rm openclaw-cli plugins inspect heytraders --runtime --json
docker compose run --rm openclaw-cli skills info heytraders-browser --json
```

Start the managed Chromium profile and open one HeyTraders tab:

```bash
docker compose run --rm openclaw-cli browser \
  --browser-profile openclaw --json start
docker compose run --rm openclaw-cli browser \
  --browser-profile openclaw --json open https://hey-traders.com --label heytraders
docker compose run --rm openclaw-cli browser \
  --browser-profile openclaw --json tabs
```

Keep exactly one eligible HeyTraders tab open. Authentication and any credential or confirmation step must be completed by the user through the browser-facing OpenClaw workflow; never pass those values to `heytraders_cli`.

Persistent state and writable runtime caches live under the ignored `.openclaw-docker/` directory. The cache mount targets only OpenClaw's writable subdirectory, so it does not hide the Chromium executable baked into the pinned browser image.

## Verified local evidence

On 2026-09-02, the packed `0.1.0` artifact was installed into OpenClaw `2026.8.2` and the loaded runtime reported:

- plugin status `loaded` with only the optional `heytraders_cli` tool;
- bundled skill `heytraders-browser` as eligible and model-visible;
- managed Chromium ready on loopback CDP;
- live `help`, `status`, and `describe status` responses from `https://hey-traders.com` through the installed tool;
- zero npm audit findings in both runtime-only and full dependency scopes.

The test page was the unauthenticated public landing page, so no private account data or mutation was exercised. See [docs/browser-transport-evidence.md](docs/browser-transport-evidence.md) for the proof boundary.

## Non-goals

- Replacing or deleting the existing HeyTraders public HTTP API skill.
- Maintaining a second command catalog.
- Importing host-browser credentials into the container.
- Accepting API keys, exchange credentials, wallet secrets, cookies, tokens, or browser storage.
- Calling undocumented bridge members or adding a generic JavaScript-evaluation fallback.
- Publishing to npm, ClawHub, or GitHub without an explicit release decision.

## References

- [OpenClaw: Docker](https://docs.openclaw.ai/install/docker)
- [OpenClaw: Building plugins](https://docs.openclaw.ai/plugins/building-plugins)
- [OpenClaw: Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins)
- [OpenClaw: Skills](https://docs.openclaw.ai/tools/skills)
- [OpenClaw: Gateway tool invocation](https://docs.openclaw.ai/gateway/tools-invoke-http-api)
- [ClawHub: Publishing](https://docs.openclaw.ai/clawhub/publishing)
