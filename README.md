# HeyTraders OpenClaw

OpenClaw integration for operating [HeyTraders](https://hey-traders.com/) through the application's live browser command catalog.

> Status: the plugin and its bundled skill are implemented and verified in a local Docker runtime. The command-based `heytraders` skill is published on ClawHub as [`@heytraders/heytraders`](https://clawhub.ai/heytraders/skills/heytraders) at v2.0.0; the plugin has not been published to npm or as a GitHub release.

## What ships here

- One optional OpenClaw tool, `heytraders_cli`, with a structured `{ command, args }` request envelope.
- One bundled, model-visible skill that teaches discovery-first command use without copying the live catalog.
- A persistent local Ed25519 Agent identity that automatically creates or resumes one first-class HeyTraders `user_id`.
- Existing-wallet-first onboarding for compatible DEX wallets, explicit venue-scoped wallet creation through an encrypted Vault, server-side Polymarket provisioning, and a loopback-only Binance credential handoff.
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
            -> private exchange WebMCP tool
              -> try an existing injected EVM browser wallet for a compatible DEX
                -> existing HeyTraders wallet connection path
              -> otherwise return creation guidance without calling the Vault
      -> only for explicit walletAction=create
        -> fixed internal Wallet Vault client
          -> create/resume an encrypted venue-scoped mainnet wallet
          -> sign the exact backend-issued onboarding request
          -> signed Vault-to-backend credential delivery
            -> existing encrypted account credential installer
      -> for Binance/Binance Futures
        -> Agent-bound signed intent
        -> loopback-only operator form on 127.0.0.1
        -> direct Vault-to-backend key delivery
```

The transport does not evaluate arbitrary page JavaScript, read cookies or browser storage, call a public HeyTraders Agent API, or fall back to a shell command. It opens the exact `/agent` page, proves possession of its locally persisted private key, and receives only HttpOnly browser-session cookies. The private key never leaves the OpenClaw state directory.

Model-facing arguments never accept credentials. `exchange connect` for Hyperliquid, Extended, Lighter, Polymarket Perps, and Polymarket accepts the optional `walletAction` enum `existing | create`; omission means `existing`. The default path checks only for a compatible EIP-1193 provider already injected into the exact Agent page. It does not inspect OpenClaw files, environment variables, secret stores, wallet references, or arbitrary wallet formats. If that source is unsupported, the result offers an explicit creation command without contacting the Vault. Polymarket prediction currently has no compatible existing-wallet adapter, so it returns the same explicit choice instead of guessing how an external wallet is stored.

Only `walletAction: "create"` lets the Vault create or resume a venue-scoped wallet. Extended, Lighter, and Polymarket Perps sign the exact short-lived broker registration messages issued for that wallet. Polymarket prediction sends its signer only through the direct Vault-to-backend channel, where the official SDK creates the Deposit Wallet, derives trading credentials, and applies trading approvals using server-held Builder credentials. Hyperliquid retains its funding-first treasury and stable named API-wallet flow. No private key enters the Gateway, model environment, browser DOM, command arguments, or command results.

Binance and Binance Futures do not accept `walletAction`. Their command creates a ten-minute Agent-bound intent and returns a `http://127.0.0.1` setup URL. The human enters a read/trade API key there with withdrawals disabled. The form is host/origin checked, one-time-CSRF protected, and served only through a loopback Docker port; the Vault signs credential digests and posts the values directly to the existing encrypted HeyTraders account installer without writing them to its database.

## Ownership boundaries

| Concern | Authoritative owner |
| --- | --- |
| Command names, schemas, readiness, identifiers, and workflow policy | Live HeyTraders frontend catalogs and domain gateways |
| Persistent Agent private key and origin-pinned WebMCP transport | This repository and the local OpenClaw state directory |
| Agent `user_id`, sessions, plan tier, usage, and account ownership | HeyTraders backend using the existing `Users.id` boundary |
| Compatible existing DEX wallet detection and connection | The exact Agent page and the existing HeyTraders browser-wallet connection services |
| Agent-created mainnet wallets and direct credential delivery | The isolated Wallet Vault and its separate key/data volumes |
| Polymarket Builder credentials and Deposit Wallet provisioning | HeyTraders API server; never OpenClaw or the Vault |
| Binance operator input | Loopback-only Vault form; never command arguments or results |
| One-time Agent wallet intent and Vault proof verification | HeyTraders backend, bound to the existing Agent `user_id` |
| Venue credential schema, encrypted storage, and runtime validation | Live HeyTraders application and broker services |

## Local Docker setup

The Compose file uses the official OpenClaw `2026.8.2-browser` image pinned by digest. Gateway ports bind only to `127.0.0.1`; the Docker socket and host browser profiles are not mounted. The local development proxy targets the Frontend on host port `5173` by default.

Create an ignored local environment file:

```bash
cp .env.example .env
```

Generate a gateway token with `openssl rand -hex 32` and place it in `OPENCLAW_GATEWAY_TOKEN` inside `.env`. No exchange or wallet secret belongs in this file, an `.env.agent` file, OpenClaw JSON config, model arguments, logs, URLs, or committed files. The Compose runtime stores Wallet Vault ciphertext and its AES root key in separate named volumes mounted only into the non-root Vault container.

Pull the runtime, install dependencies, and verify the plugin inside the pinned container:

```bash
docker compose --profile dev pull openclaw-gateway openclaw-cli plugin-dev
docker compose --profile dev run --rm plugin-dev ci
docker compose --profile dev run --rm plugin-dev run verify
docker compose --profile dev run --rm plugin-dev pack --silent
```

Build the Wallet Vault, start the Gateway, and install the exact packed artifact:

```bash
docker compose build agent-wallet-vault
docker compose up -d agent-wallet-vault agent-wallet-operator openclaw-gateway
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

`browser.noSandbox=true` is required by Chromium in this non-root Docker runtime. Container isolation remains enforced with dropped network capabilities, `no-new-privileges`, no Docker socket, no host browser data, and loopback-only host ports. The model-capable Gateway mounts only its persistent OpenClaw directories and the single read-only launcher script; the operator CLI mounts only the packed plugin artifact. Neither mounts the repository or an `.env.agent` file. Only the opt-in `plugin-dev` service mounts the checkout read-write.

## Exchange onboarding flows

For a wallet venue, the model first invokes the canonical selector, for example:

```json
{"command":"exchange connect","args":{"exchange":"hyperliquid"}}
```

The same existing-first selector applies to `extended`, `lighter`, `polymarketperp`, and `polymarket`. It uses a compatible EIP-1193 wallet already available in the Agent page when one exists. The integration does not impose a wallet storage format and does not claim to discover arbitrary wallets managed elsewhere. If the current adapter cannot connect it, the command returns public creation guidance and does not call the Vault. The Docker-network-only Vault API and the separately published loopback operator form run as distinct services; the host port cannot reach wallet creation, signing, or intent-preparation routes.

To explicitly create or resume an Agent-owned wallet, invoke:

```json
{"command":"exchange connect","args":{"exchange":"hyperliquid","walletAction":"create"}}
```

Use the requested venue ID in the explicit creation call. Hyperliquid returns `awaiting_funding`; the user funds that address through a supported Hyperliquid mainnet deposit or transfer flow and reruns the command. Extended, Lighter, and Polymarket Perps use venue-specific registration signatures. Polymarket prediction uses the backend's official Builder provisioning path. Every successful path must be followed by `exchange credential_status` and `exchange status` before the Agent claims readiness.

For Binance or Binance Futures, run the selector without `walletAction`:

```json
{"command":"exchange connect","args":{"exchange":"binance"}}
```

Open the returned loopback URL on the same host within ten minutes, enter a read/trade key with withdrawal permission disabled, and then re-read credential and exchange status. The default operator port is `18091` and can be changed with `HEYTRADERS_OPERATOR_PORT`; Docker still binds it only to `127.0.0.1`.

The Vault intentionally has no private-key export, transfer, withdrawal, or order endpoint. All plugin-managed exchange onboarding is mainnet-only; `testnet` and arbitrary network overrides are rejected before wallet creation or intent preparation. No venue receives an environment-secret shortcut.

Before funding, the operator must back up both `agent-wallet-vault-data` and `agent-wallet-vault-key` through an access-controlled offline process. The database is unusable without the root-key volume, and the root key alone does not contain the wallet record; loss of either can make the Agent treasury permanently inaccessible. Never copy either volume's contents into a model prompt, chat, log, repository, or ordinary environment file.

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
