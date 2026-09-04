# Browser Transport Evidence

Verified locally on 2026-09-04 using Docker Desktop on Apple Silicon. This
evidence is local-only; no production deployment, package publication, or live
exchange mutation was performed.

## Runtime identity

- OpenClaw release: `2026.8.2` (`0965053` in the running CLI banner).
- Image: `ghcr.io/openclaw/openclaw:2026.8.2-browser`, pinned to digest
  `sha256:e164a318801fad2d49dc19b99adadfa629fa5f9ffb43673e73661c1d3f9cc7de`.
- Gateway: healthy, loopback-only host mappings on ports `18789` and `18790`.
- Browser: managed `openclaw` profile, headless Chromium, loopback CDP at
  `http://127.0.0.1:18800` inside the container.
- Writable cache: `XDG_CACHE_HOME` targets the ignored host cache mount; its
  OpenClaw SQLite staging child was verified owner-local with mode `0700`.
- HeyTraders app: the exact Agent surface at `http://localhost:5173/agent`,
  served through the Gateway-local development proxy.

## Tool boundaries

Runtime plugin inspection reported one model-facing optional tool:

- `heytraders_cli`

The canonical `/agent` page registered three page-defined WebMCP tools:

- `heytraders_cli`, the public command facade;
- `heytraders_agent_auth`, the adapter-only proof-of-possession handshake;
- `heytraders_agent_exchange`, the adapter-only existing-wallet capability/connection and public Wallet Vault intent path.

The two adapter-only names are not declared by the OpenClaw plugin and were not
present in its accepted model tool surface. The plugin invokes them directly
over the selected top-level page's WebMCP/CDP connection. No generic JavaScript
evaluation, page DOM scraping, or undocumented Gateway method is used.
Fresh page discovery also confirmed that a regular HeyTraders page registers
only `heytraders_cli`; the two private tools exist only on `/agent`.

The plugin imports only public SDK paths:

- `openclaw/plugin-sdk/tool-plugin`;
- `openclaw/plugin-sdk/browser-config`.

## Autonomous login proof

The first `heytraders_cli` request opened `/agent`, generated a local Ed25519
identity, completed the origin-bound challenge, created one first-class
HeyTraders user, and established an opaque browser session. The private key
remained in the ignored OpenClaw state directory with mode `0600`; only its
public key reached HeyTraders.

After an explicit logout, Gateway/browser restart, and a second invocation,
the adapter signed a fresh challenge with the persisted key and resumed the
same user instead of creating another account. The local database then showed:

- one Agent-provider `Users` row;
- one `self_owned` `Agents` row;
- one authentication key and one distinct Agent `user_id` mapping;
- one active session plus the deliberately revoked earlier session;
- RLS enabled on all three private authentication tables;
- zero `anon`, `authenticated`, or `service_role` Data API grants on them.

The legacy public registration and claim endpoints returned HTTP `404`.

## Live command proof

After stale manual-test tabs were closed, the managed profile contained one
canonical `/agent` tab. Invocation through the authenticated Gateway
`POST /tools/invoke` endpoint returned structured success for `status`:

- protocol version `3`;
- system, navigation, auth, docs, settings, exchange, portfolio, order,
  execution, and market gateways ready;
- chart gateway not ready, as expected on the minimal `/agent` surface.

The Gateway bearer was read only from the running container environment for
the diagnostic. It was never printed, persisted in evidence, or passed to the
HeyTraders plugin.

An actual OpenClaw Agent turn was then run with the configured
`openai/gpt-5.6-luna` provider at `max` reasoning. Its runtime receipt recorded
one successful `heytraders_cli` status call, no reroute, and protocol version
`3`; the prompt explicitly prohibited mutations and exchange connection.

The runtime `describe exchange connect` result from the `5173` Agent page exposed
the optional `walletAction` enum with only `existing` and `create`; omission is
documented as the existing-wallet-first behavior.

## Existing-wallet and Agent Wallet Vault proof boundary

Exact Hyperliquid `exchange connect` accepts only `exchange: "hyperliquid"` plus
optional `walletAction: "existing" | "create"` from the model. Omission defaults
to `existing`. That path queries only the exact Agent page for an injected
EIP-1193 provider; it does not scan OpenClaw files, environment variables,
secret stores, wallet references, extensions, or arbitrary wallet formats.

The local managed browser had no compatible injected provider. Its default
connection invocation returned `existing_wallet_unsupported`,
`wallet_provider_unavailable`, and the explicit `walletAction: "create"` next
command. Wallet and delivery row counts remained `0` before and after, and the
Vault access log contained no `/v1/wallets/prepare` or `/v1/wallets/connect`
request. No funding address was returned.

An actual `openai/gpt-5.6-luna` Agent turn at `max` reasoning was then told to
try only the compatible-existing path and prohibit creation. Its receipt showed
a successful `heytraders_cli` call with no provider reroute or tool failure, and
its final response reported the unavailable provider without running
`walletAction: "create"`. The final Vault counts remained zero.

Only the explicit `create` action can call the fixed Docker-internal Vault
origin. The Vault has no configurable credential source, `connectionRef`, or
exchange-secret environment binding. The model-capable Gateway does not mount
the repository or load `.env.agent`.

Fake-only tests cover:

- default and explicit-existing requests never calling the Vault;
- unsupported existing wallets returning bounded creation guidance;
- a compatible existing browser-wallet adapter returning only public account state;
- explicit `walletAction: "create"` as the sole route to Vault preparation;
- stable encrypted mainnet treasury identity and owner-only files;
- hard rejection of testnet before wallet creation;
- unfunded public-address return without an approval attempt;
- canonical browser intent matching and Ed25519 Vault proof;
- one API-wallet approval across retry and deletion of its local encrypted copy
  after backend confirmation;
- stable named-agent replacement across new intents and secure deletion of
  superseded failed-delivery ciphertext;
- rejection of nested credential-shaped Vault/backend output;
- absence of export, transfer, withdrawal, and order HTTP routes;
- rejection of credential-bearing model arguments and arbitrary network fields.

No real Hyperliquid wallet, approval, deposit, account mutation, order, or
strategy was used. Mainnet funding and live venue verification remain an
operator-assisted final checkpoint.

## Artifact and verification

The packed artifact `heytraders-openclaw-plugin-0.1.0.tgz` had SHA-256
`ea938562b27cd3769fbf299aad3607381b385be817687b9b4c2ae5bb8a449c33` and
contained only compiled `dist/` files, the plugin manifest, package metadata,
README, and the `heytraders` skill.

Fresh verification against the pinned Docker toolchain reported:

- six plugin test files and 70 tests passed;
- 16 Wallet Vault tests passed with fake venue/backend adapters only;
- TypeScript build passed;
- generated plugin metadata current;
- official plugin validation returned `valid: true` with no errors;
- runtime inspection returned plugin status `loaded`, one `heytraders_cli`
  tool, and an eligible model-visible skill;
- the live `/agent` private schema exposed only Agent authentication, bounded
  existing-wallet capability/connection, and public wallet-intent operations
  outside the normal command facade;
- backend scoped Wallet Vault/CEX/DEX suite: 60 tests passed;
- Frontend changed JavaScript parsed successfully;
- the broader Frontend command-discovery validator still stops on the existing
  `market get_crypto_open_interests` entry whose `inputSchema.type` is absent;
  the validator had already accepted the changed Exchange catalog before
  reaching that unrelated Market entry;
- cached offline npm audits returned zero findings for runtime-only and full
  dependency scopes. The final online advisory refresh was unavailable because
  the npm audit endpoint returned HTTP `503`; no dependency or lockfile changed
  since the prior successful audit.

## Fail-closed controls

- Exact app origin and exact `/agent` bootstrap path are required.
- Multiple matching Agent tabs, wrong or changing top-level origin, child-frame
  collisions, unsupported browser profiles, unsafe CDP URLs, malformed WebMCP
  output, timeouts, and early closes fail without a legacy transport fallback.
- Model requests are bounded plain JSON and reject credential-like fields,
  prototype-polluting keys, non-finite numbers, excessive depth, and excessive
  value counts.
- Logs contain fixed error types/codes only, never request arguments, browser
  URLs, tokens, cookies, private keys, or exchange values.
- Wallet Vault has no published host port, runs as UID/GID `10001` with a
  read-only root filesystem, and keeps ciphertext and its root key in separate
  named volumes.

## Publication boundary

No npm publish, ClawHub publish, GitHub release, push, production deployment, or
`main`-branch commit was performed as part of this verification.
