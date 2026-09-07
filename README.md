# HeyTraders OpenClaw

OpenClaw integration for operating [HeyTraders](https://hey-traders.com/) through the application's live browser command catalog.

> OpenClaw package: `@heytraders/openclaw-plugin` (version `0.1.0`). The plugin includes the HeyTraders Quant Trading Skills guidance. The separate [ClawHub skill](https://clawhub.ai/heytraders/skills/heytraders) is an entry point to the same guidance, not a replacement for the plugin.

## Install in an existing OpenClaw environment

Requires OpenClaw `>=2026.8.2 <2027`, a Node.js release supported by that OpenClaw version (and meeting this plugin's minimum `22.22.3`), a configured AI provider with tool support, and an available managed OpenClaw browser profile. No Docker container, Vault, exchange wallet, or particular AI-provider subscription is installed or required by this package.

```bash
openclaw plugins install clawhub:@heytraders/openclaw-plugin@0.1.0
openclaw plugins enable heytraders
```

The tool is optional. Preserve your existing tool policy and entries:

- If `tools.allow` is already configured, append `heytraders_cli` to that array.
- Otherwise, append it to `tools.alsoAllow` (or create that array).
- Do not configure both `tools.allow` and `tools.alsoAllow`; OpenClaw rejects that combination. Existing deny policies still apply.

For a configuration without `tools.allow`, merge this example into the existing configuration:

```json
{
  "tools": {
    "alsoAllow": ["heytraders_cli"]
  }
}
```

Reload or restart your Gateway using the method already used in your environment. Start the existing managed browser profile when needed:

```bash
openclaw browser start --browser-profile openclaw
```

The default browser profile is `openclaw` and the default application origin is `https://hey-traders.com`. If your managed profile has another name, set `plugins.entries.heytraders.config.browserProfile` to that existing profile. Do not import a person's browser cookies or exchange secrets.

Ask your Agent to invoke `heytraders_cli` with `status`, discover `help auth`, and run the live `auth status` command. Success means the response reports an authenticated, verified Agent session; merely opening the page is not proof. The Agent's HeyTraders account is created or resumed automatically without Google login. Installing the plugin already provides the bundled skill, so a second skill installation is unnecessary.

## What ships here

- One optional OpenClaw tool, `heytraders_cli`, using a structured `{ command, args }` envelope.
- One bundled skill that teaches discovery-first command use without copying the live catalog.
- One persistent local Ed25519 identity used only to create or resume the Agent's HeyTraders account.
- An optional Docker Compose environment for developing and verifying OpenClaw itself.

The plugin does **not** ship or install an exchange wallet, Wallet Vault, API-key manager, venue account, or wallet-creation runtime. It does not require Docker when installed into an existing OpenClaw environment. The Compose file in this repository is only a reproducible development harness.

## Runtime flow

```text
OpenClaw agent
  -> optional heytraders_cli tool
    -> origin-pinned HeyTraders plugin
      -> create/resume the local Agent login identity
      -> resolve the existing managed OpenClaw browser profile
      -> reuse the bound work tab (open /agent only when no app tab exists)
      -> verify its Agent session; visit /agent only when signing is necessary
      -> forward every normal command to the page-owned heytraders_cli tool
```

There is no special `exchange connect` interceptor and no second exchange transport. Command names, schemas, supported venues, guide documents, Trusted IP metadata, secure dialogs, connection status, subscription policy, and credential validation remain owned by the live HeyTraders application.

The transport does not evaluate arbitrary page JavaScript, read cookies or browser storage, call a public HeyTraders Agent API, or fall back to a shell command. The Agent login private key stays in the OpenClaw state directory and is never reused as an exchange wallet.

## Exchange onboarding

Exchange onboarding is always guide-first:

1. Invoke `exchange list` and use a canonical identifier from the live result.
2. Invoke `exchange guide` for that identifier.
3. Follow the returned current venue requirements and official references to create or prepare the required wallet, exchange account, or API credentials outside HeyTraders.
4. Invoke `exchange connect` with only the exchange identifier.
5. Complete any secret entry or wallet approval only in the secure browser/venue surface returned by the application.
6. Verify with `exchange status`, and when needed `exchange connections` plus `exchange credential_status`.

Example envelopes:

```json
{"command":"exchange list","args":{}}
{"command":"exchange guide","args":{"exchange":"<exchange-from-list>"}}
{"command":"exchange connect","args":{"exchange":"<exchange-from-list>"}}
```

The OpenClaw skill deliberately does not hardcode supported venues or wallet steps. If an Agent does not already have compatible wallet/venue tooling, the result is guidance—not an attempt to install software or create a HeyTraders-managed wallet. Never place API keys, private keys, recovery phrases, signatures, cookies, or tokens in model-visible command arguments.

## Ownership boundaries

| Concern | Authoritative owner |
| --- | --- |
| Command contracts, venue list, guide revision, Trusted IPs, navigation, and workflow policy | Live HeyTraders frontend catalogs and gateways |
| Agent login identity and origin-pinned browser transport | This plugin and the existing OpenClaw state directory |
| Wallet/account/API-key creation and custody | The selected venue and the OpenClaw operator's chosen external tooling |
| Secure credential entry and wallet approval | The live HeyTraders or venue browser surface identified by the guide |
| Encrypted exchange credentials, plan limits, and connection status | HeyTraders backend and broker services |

## Local development harness

The Compose file uses the official OpenClaw `2026.8.2-browser` image pinned by digest. Gateway ports bind only to `127.0.0.1`; no Docker socket, host browser profile, exchange secret, or repository-wide host path is mounted into the Gateway.

Create the ignored local environment file and add a locally generated Gateway token:

```bash
cp .env.example .env
openssl rand -hex 32
```

Then verify and install the exact local package:

```bash
docker compose --profile dev pull openclaw-gateway openclaw-cli plugin-dev
docker compose --profile dev run --rm plugin-dev ci
docker compose --profile dev run --rm plugin-dev run verify
docker compose --profile dev run --rm plugin-dev pack --silent
docker compose up -d openclaw-gateway
docker compose run --rm openclaw-cli plugins install \
  npm-pack:/workspace/HeyTraders-OpenClaw/heytraders-openclaw-plugin-0.1.0.tgz \
  --force --accept-capabilities
```

Enable the browser plugin, this plugin, and the optional tool using the normal OpenClaw configuration. `browser.noSandbox=true` is required only by Chromium inside this development container; it is not a requirement imposed on external OpenClaw installations.

The first invocation adopts one unambiguous HeyTraders page in the managed profile, or opens `/agent` if none exists. Later calls retain that target ID after navigation to dashboards or settings. The work tab need not stay on `/agent`. After Gateway restart, multiple app tabs are ambiguous until the operator leaves one intended work tab.

Status revalidates the browser session on every app route; normal cookie refresh does not trigger signing. Only an unauthenticated session enters `/agent` for proof-of-possession, in the same tab, then returns to its prior registered route. A human session or a change from the initially bound Agent account stops dispatch. Initial session adoption uses the managed browser profile; it is not installation attestation or a comparison against the local key after Gateway restart. Agent login is independent of Google login, Link Agent, Codex OAuth, and the selected AI provider.

Calls in one browser context are serialized. Caller cancellation does not release a dispatched operation ahead of its terminal response. If a connection is lost after dispatch and the outcome cannot be confirmed, later calls stop: inspect the last action in the managed browser before restarting the adapter. Never automatically replay a possibly completed action.

Deploy the matching Frontend revision (private session status on all app routes and the `auth.agent` navigation route) before publishing/installing this transport. Do not work around an older Frontend with an alternate transport.

## Distribution boundary

`npm pack` includes compiled `dist/`, `skills/`, `openclaw.plugin.json`, package metadata, and this README. Installing only the ClawHub skill supplies guidance but not the `heytraders_cli` transport. Neither distribution installs a container, wallet, or credential service.

No npm publish, GitHub release, ClawHub update, production deployment, wallet connection, credential entry, funding, order, or strategy action is implied by this repository's local verification commands.
