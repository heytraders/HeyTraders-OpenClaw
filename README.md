# HeyTraders OpenClaw

OpenClaw integration for operating [HeyTraders](https://hey-traders.com/) through the application's live browser command catalog.

> Status: the plugin and its bundled skill are implemented and verified in a local Docker runtime. The command-based `heytraders` skill is published on ClawHub as [`@heytraders/heytraders`](https://clawhub.ai/heytraders/skills/heytraders) at v2.0.0; the plugin has not been published to npm or as a GitHub release.

## What ships here

- One optional OpenClaw tool, `heytraders_cli`, with a structured `{ command, args }` request envelope.
- One bundled, model-visible skill that teaches discovery-first command use without copying the live catalog.
- A persistent local Ed25519 Agent identity that automatically creates or resumes one first-class HeyTraders `user_id`.
- Optional CEX and DEX credential bindings that resolve secret values from the Gateway environment, outside model arguments.
- A loopback-only Docker Compose environment pinned to the official OpenClaw `2026.8.2-browser` image digest.

Command names, schemas, readiness, identifiers, and application policy remain owned by the live HeyTraders page. The adapter starts from `help`, `help <domain>`, and `describe <command>` rather than maintaining a second catalog.

## Runtime flow

```text
OpenClaw agent
  -> optional heytraders_cli tool
    -> HeyTraders OpenClaw plugin
      -> create/resume local Agent identity
      -> public OpenClaw browser-profile resolver
        -> loopback CDP for the managed openclaw profile
          -> exact https://hey-traders.com/agent page
            -> private proof-of-possession login WebMCP tool
            -> public heytraders_cli WebMCP tool for normal commands
            -> private exchange WebMCP tool only for configured bindings
              -> live HeyTraders application and existing account services
```

The transport does not evaluate arbitrary page JavaScript, read cookies or browser storage, call a public HeyTraders Agent API, or fall back to a shell command. It opens the exact `/agent` page, proves possession of its locally persisted private key, and receives only HttpOnly browser-session cookies. The private key never leaves the OpenClaw state directory.

Model-facing arguments never accept credentials. For the exact `exchange connect` command, the plugin accepts only `exchange` and an optional safe `connectionRef`, resolves the selected binding's values from the Gateway process environment, and sends them directly to an origin-pinned private page tool after Agent authentication. It revalidates the current top-level frame for every private or public invocation and rejects wrong-origin, child-frame, remote, extension-attached, navigated, or ambiguous targets.

## Ownership boundaries

| Concern | Authoritative owner |
| --- | --- |
| Command names, schemas, readiness, identifiers, and workflow policy | Live HeyTraders frontend catalogs and domain gateways |
| Persistent Agent private key and origin-pinned WebMCP transport | This repository and the local OpenClaw state directory |
| Agent `user_id`, sessions, plan tier, usage, and account ownership | HeyTraders backend using the existing `Users.id` boundary |
| Safe binding references and environment-variable-name mappings | This repository's plugin configuration contract |
| Secret values | The operator-provided Gateway environment; never the model or plugin config |
| Venue credential schema, encrypted storage, and runtime validation | Live HeyTraders application and broker services |

## Local Docker setup

The Compose file uses the official OpenClaw `2026.8.2-browser` image pinned by digest. Gateway ports bind only to `127.0.0.1`; the Docker socket and host browser profiles are not mounted.

Create an ignored local environment file:

```bash
cp .env.example .env
cp .env.agent.example .env.agent
```

Generate a gateway token with `openssl rand -hex 32` and place it in `OPENCLAW_GATEWAY_TOKEN` inside `.env`. Put only the venue secrets named by `credentialBindings` in `.env.agent`. Both runtime files are ignored; never put secret values in OpenClaw JSON config, model arguments, logs, URLs, or committed files.

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
  '{"enabled":true,"config":{"agentDisplayName":"OpenClaw Agent","browserProfile":"openclaw","timeoutMs":30000}}' \
  --strict-json
docker compose run --rm openclaw-cli config set tools.alsoAllow \
  '["heytraders_cli"]' --strict-json
docker compose run --rm openclaw-cli config set browser \
  '{"enabled":true,"headless":true,"noSandbox":true}' --strict-json
docker compose restart openclaw-gateway
```

`browser.noSandbox=true` is required by Chromium in this non-root Docker runtime. Container isolation remains enforced with dropped network capabilities, `no-new-privileges`, no Docker socket, no host browser data, a read-only source mount for the Gateway and CLI, and loopback-only host ports. Only the opt-in `plugin-dev` service mounts the checkout read-write.

## Optional exchange credential bindings

`credentialBindings` is a HeyTraders plugin contract, not an OpenClaw-wide convention. Configuration stores environment-variable names only. For example:

```json
{
  "enabled": true,
  "config": {
    "agentDisplayName": "OpenClaw Agent",
    "browserProfile": "openclaw",
    "credentialBindings": [
      {
        "ref": "binance-main",
        "exchange": "binance",
        "kind": "cex_api_key",
        "apiKeyEnv": "BINANCE_API_KEY",
        "secretEnv": "BINANCE_API_SECRET"
      },
      {
        "ref": "hyperliquid-main",
        "exchange": "hyperliquid",
        "kind": "hyperliquid_agent_wallet",
        "agentPrivateKeyEnv": "HYPERLIQUID_AGENT_PRIVATE_KEY",
        "masterAddressEnv": "HYPERLIQUID_MASTER_ADDRESS"
      }
    ]
  }
}
```

The CEX shape is fixed to an API key and secret. Hyperliquid has a dedicated contract matching the existing HeyTraders wallet flow: `HYPERLIQUID_AGENT_PRIVATE_KEY` is an Agent/API-wallet key that has already been approved by the Hyperliquid master account, and `HYPERLIQUID_MASTER_ADDRESS` is the account it may trade for. Never place the master wallet private key in either variable. If the approval has a known expiry, add `agentExpiresAtMsEnv: "HYPERLIQUID_AGENT_EXPIRES_AT_MS"`; HeyTraders validates and records that timestamp.

`dex_extended` remains available for other DEX venues whose current HeyTraders credential metadata defines different fields. It is deliberately rejected for Hyperliquid so a generic map cannot blur the Agent key and master-account roles. A missing, ambiguous, or invalid binding fails before any account mutation.

The model invokes only a safe selector:

```json
{"command":"exchange connect","args":{"exchange":"hyperliquid","connectionRef":"hyperliquid-main"}}
```

No secret value appears in that request. A successful connect result means the encrypted credential was stored; the skill then checks credential and exchange status before claiming venue readiness. Real Binance and Hyperliquid connection verification is intentionally left for an operator-assisted checkpoint because it changes account state and exercises live venue credentials.

Confirm the installed plugin and skill:

```bash
docker compose run --rm openclaw-cli plugins inspect heytraders --runtime --json
docker compose run --rm openclaw-cli skills info heytraders --json
```

Start the managed Chromium profile. The first `heytraders_cli` invocation opens
the exact Agent bootstrap tab automatically:

```bash
docker compose run --rm openclaw-cli browser \
  --browser-profile openclaw --json start
docker compose run --rm openclaw-cli browser \
  --browser-profile openclaw --json tabs
```

Keep exactly one eligible `/agent` tab open. Agent login is automatic and does not use Google login, a Link Agent code, or Codex OAuth. The configured AI provider is independent of HeyTraders identity. Visible confirmation remains relevant only when a live application or venue workflow explicitly requires it.

Persistent state and writable runtime caches live under the ignored `.openclaw-docker/` directory. The cache mount targets only OpenClaw's writable subdirectory, so it does not hide the Chromium executable baked into the pinned browser image.
`XDG_CACHE_HOME` points at that mounted cache root so OpenClaw's private SQLite
snapshot directory is created beneath it instead of falling back to an unsafe
or read-only parent owned by the image.

## Verified local evidence

On 2026-09-04, the packed `0.1.0` artifact was installed into OpenClaw `2026.8.2` and the loaded runtime reported:

- plugin status `loaded` with only the optional `heytraders_cli` tool;
- bundled skill `heytraders` as eligible and model-visible;
- managed Chromium ready on loopback CDP;
- automatic first registration and authenticated `status` from the `/agent` page;
- explicit session revocation followed by Gateway/browser restart and re-login as the same Agent `user_id` using the persisted key;
- an actual `openai/gpt-5.6-luna` Agent turn at `max` reasoning completing the authenticated `status` command;
- zero npm audit findings in cached runtime-only and full dependency checks;
  the final online advisory refresh returned a transient npm registry `503`.

No real exchange credential or account mutation was exercised. See [docs/browser-transport-evidence.md](docs/browser-transport-evidence.md) for the proof boundary.

## ClawHub publishing

The canonical ClawHub skill is `heytraders`, displayed as **HeyTraders Quant Trading Skills**. The repository includes a manually triggered GitHub Actions workflow at `.github/workflows/clawhub-skill-publish.yml`. It defaults to a dry run; a real release requires an explicit workflow input and the repository's `CLAWHUB_TOKEN` secret.

The workflow checks out this repository, publishes `skills/heytraders` under the `@heytraders` publisher, and submits the GitHub repository, commit, ref, and source path with each release. ClawHub's server-verified web import currently accepts only public repositories directly owned by the signed-in personal GitHub account, so the organization-owned `heytraders/HeyTraders-OpenClaw` repository does not appear in that picker. The GitHub Actions workflow is therefore the release connection for this repository; ClawHub currently reports its native server-resolved import provenance as unavailable.

## Non-goals

- Deleting the archived 1.x HTTP API releases from ClawHub version history.
- Maintaining a second command catalog.
- Importing host-browser credentials into the container.
- Accepting API keys, exchange credentials, wallet secrets, cookies, or tokens in model arguments or plugin config.
- Calling undocumented bridge members or adding a generic JavaScript-evaluation fallback.
- Publishing to npm, ClawHub, or GitHub without an explicit release decision.

## References

- [OpenClaw: Docker](https://docs.openclaw.ai/install/docker)
- [OpenClaw: Building plugins](https://docs.openclaw.ai/plugins/building-plugins)
- [OpenClaw: Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins)
- [OpenClaw: Skills](https://docs.openclaw.ai/tools/skills)
- [OpenClaw: Gateway tool invocation](https://docs.openclaw.ai/gateway/tools-invoke-http-api)
- [ClawHub: Publishing](https://docs.openclaw.ai/clawhub/publishing)
