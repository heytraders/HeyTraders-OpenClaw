# OpenClaw Browser Adapter Architecture

Status: Agent-owned login is implemented and locally verified against OpenClaw `2026.8.2`; real venue credential verification remains pending.

## Problem

HeyTraders already owns a live, capability-driven command system. The OpenClaw integration must expose that system without duplicating commands or moving application policy into a provider-specific repository. A prompt-only skill cannot create the browser transport, so this repository owns one tool plugin and bundles a thin guidance skill with it.

## Runtime responsibilities

### HeyTraders frontend

- Registers and executes the live command catalog.
- Owns command schemas, readiness, identifiers, policy, idempotency, and presentation.
- Returns structured success, error, and user-action-required results.
- Hosts the exact `/agent` bootstrap surface and private WebMCP tools for proof-of-possession login, existing browser-wallet capability/connection, and public Agent exchange-intent preparation/status.

### HeyTraders backend

- Creates one ordinary `Users.id` and one self-owned `Agents` row for a new Agent public key.
- Owns single-use, origin-bound challenges and hashed, revocable browser sessions.
- Resolves the Agent browser cookie into the same canonical user principal used by accounts, billing, quota, strategies, and orders.
- Creates single-use Agent exchange intents bound to the Agent `user_id`, Agent identity, mainnet connection address, exchange, completion type, and Wallet Vault public key.
- Verifies the Wallet Vault's completion signature before accepting a transient signer, venue signatures, Polymarket signer, or operator-entered CEX credential.
- Owns Polymarket Builder secrets and official Deposit Wallet/trading-approval provisioning; it persists and returns only the public Deposit Wallet as `venueFundingAddress`, while those secrets never enter OpenClaw or the Vault.
- Validates and encrypts venue credentials through the existing account/broker path.

### Agent Wallet Vault

- Runs as separate non-root programmatic and operator-form containers with no model-facing Vault tool. They share the encrypted data/key volumes, but only the form-only container has a `127.0.0.1` host binding; wallet creation, signing, and intent preparation stay Docker-network-only.
- Creates and persists venue-scoped Agent-owned mainnet wallets only after an explicit creation request.
- Keeps its AES root key and encrypted records in separate named volumes.
- Returns only public wallet/intent state and, when required, the mainnet funding address to OpenClaw.
- Checks funding, rotates a fresh signer in one stable named Hyperliquid API-wallet slot with the official SDK, and sends that signer directly to the HeyTraders backend against a signed one-time intent.
- Erases the local API signer only after the backend confirms encrypted storage.
- When a later intent replaces the named signer, securely deletes ciphertext retained by any superseded failed delivery.
- Signs exact Extended/Lighter/Polymarket Perps broker registration requests without exporting the wallet key.
- Delivers the Polymarket prediction signer directly to the backend's Builder provisioner.
- Serves a short-lived, origin-checked and one-time-CSRF-protected Binance/Binance Futures form on loopback; it never persists the entered key or secret.
- Exposes no private-key export, transfer, withdrawal, or order operation.

### OpenClaw adapter

- Registers one optional `heytraders_cli` agent tool.
- Accepts only a selector command and structured argument object.
- Persists one Ed25519 identity in the OpenClaw state directory and proves possession without exposing the private key.
- Resolves the configured managed OpenClaw browser profile through the public `openclaw/plugin-sdk/browser-config` export.
- Rejects remote, extension-attached, `attachOnly`, non-loopback, wrong-origin, missing, and ambiguous targets.
- Invokes the page-defined authentication tool before every application command.
- Invokes the public page-defined `heytraders_cli` tool for normal commands.
- For supported DEX `exchange connect` calls, first asks the private page-defined exchange tool for a compatible existing wallet; it coordinates the fixed internal Wallet Vault only for explicit `walletAction: "create"`.
- For Binance/Binance Futures, creates an Agent-bound intent before asking the Vault for a loopback operator setup URL.
- Preserves structured responses without inventing application policy.

### Bundled skill

- Explains when and how to use the tool.
- Uses live `help` and `describe` discovery instead of copied command contracts.
- Requires state re-reading after mutations and genuine venue handoffs.
- Keeps credentials out of model-visible arguments, explains existing-wallet compatibility limits, treats wallet creation as explicit, and identifies the Binance loopback handoff as a human-only credential boundary.

## Transport sequence

For every call, `src/browser-transport.ts` performs the following sequence:

1. Normalize and validate `{ command, args }`.
2. Resolve the named browser profile from the current OpenClaw configuration.
3. Require the managed `openclaw` driver with loopback HTTP CDP.
4. Read the bounded CDP `/json/list` target list.
5. Select exactly one `/agent` page at the configured exact origin, or create it through the loopback CDP target endpoint.
6. Validate that the selected WebSocket is the loopback `/devtools/page/<targetId>` endpoint returned for that exact target.
7. Enable CDP page lifecycle events and read `Page.getFrameTree` to revalidate the current top-level frame origin after connecting.
8. Invoke the private auth tool's `status`; when unauthenticated, request a challenge, validate the server's canonical bytes, sign them with the local private key, and complete the session.
9. For normal commands, invoke public `heytraders_cli`.
10. For a supported wallet venue with no action or `walletAction: "existing"`, ask the private exchange tool whether its current EIP-1193 adapter is available on the exact Agent page.
11. If available, invoke the canonical HeyTraders browser-wallet flow and return only its public connection state. If unavailable or incompatible, return explicit creation guidance without calling the Vault.
12. Only for `walletAction: "create"`, call the fixed internal Vault prepare operation, create an Agent-bound backend intent, and sign only that intent's venue-specific onboarding request. Hyperliquid pauses at a public mainnet funding checkpoint; Polymarket prediction delegates official Builder provisioning to the backend.
13. Read the browser-side intent status and return completion only when both Vault and HeyTraders report the same connected account.
14. For Binance/Binance Futures, obtain the Vault's stable public verifier identity, create an Agent-bound ten-minute intent in the browser, and then return only the loopback operator URL created from that exact intent. The form posts key material directly from the human browser to the Vault and from the Vault to the backend.
15. For every page invocation, accept the named tool only when its registration `frameId` equals the canonical top-level frame, fail on navigation or detach, correlate the response, and enforce time and message-size limits.

There is no arbitrary JavaScript evaluation, direct bridge call, cookie or browser-storage extraction, environment credential binding, public Agent API-key bootstrap, or shell fallback. Wallet secret values never enter the Gateway, model request, browser tool input/output, DOM, or OpenClaw configuration.

## Required invariants

1. **One ingress:** every provider request reaches the same generic application command boundary.
2. **One command authority:** current runtime `help` and `describe` output outrank remembered or durable guidance.
3. **Exact origin and route:** only the configured approved origin's `/agent` surface is eligible.
4. **Stable identity:** one protected local Ed25519 key resumes one HeyTraders `user_id`; a new key creates a new user rather than guessing ownership.
5. **No model credential transport:** public tool parameters reject credential-like fields; wallet venues accept only the exchange selector plus optional `walletAction: "existing" | "create"`, and Binance accepts only its exchange selector.
6. **Explicit Vault custody:** the default existing-wallet path never contacts the Vault. After explicit creation, master keys remain in the isolated Vault. Secret delivery crosses only the proof-bound direct Vault-to-backend request; Binance form values are never stored by the Vault.
7. **No policy duplication:** authorization, quota, credential validation/encryption, and application state remain owned by HeyTraders.
8. **Mainnet only:** testnet and arbitrary network overrides are rejected before wallet creation, intent preparation, or venue approval.
9. **Fail closed:** missing browser capability, unsupported profile, wrong or changing top-level origin, child-frame tool collision, multiple eligible tabs, unsafe CDP, auth failure, intent mismatch, timeout, or invalid Vault/WebMCP output returns a structured error without a legacy fallback.
10. **Bounded input and output:** commands, nesting, value count, response bodies, tab-list bodies, CDP messages, and execution time have explicit limits.
11. **Recoverable custody:** both the encrypted Vault data volume and its separate root-key volume require an access-controlled offline backup before the public treasury address is funded; neither is sufficient alone.
12. **Publication follows proof and approval:** local package and runtime proof do not authorize npm, ClawHub, or GitHub release publication.

## Resolved design decisions

### Browser access contract

OpenClaw `2026.8.2` publicly exports browser configuration and profile resolution from `openclaw/plugin-sdk/browser-config`. The managed browser exposes a loopback CDP endpoint, and its Chromium protocol advertises the `Page` and `WebMCP` domains. The adapter uses page lifecycle/frame identity only to bind the WebMCP registration to the canonical top-level frame; it never evaluates page code.

### Tab selection and stability

The adapter does not persist a raw DevTools target across calls. It resolves the current profile and fresh tab list for each invocation, requires one eligible target, then rechecks the connected top-level frame and binds the tool registration to that frame ID. Navigation, child-frame collisions, or duplicate tabs therefore fail explicitly rather than silently retargeting a command.

### Optional tool exposure

The plugin declares `heytraders_cli` as optional. An operator must explicitly include it in OpenClaw tool policy, while HeyTraders remains responsible for command authorization and visible confirmations. The adapter never interprets tool discoverability as approval for a financial or irreversible action.

### Agent-owned authentication

The Agent private key is generated atomically with owner-only file permissions under the OpenClaw state directory. HeyTraders stores only the 32-byte public key and its fingerprint. Challenges are single-use, short-lived, and bound to the exact application origin, client instance, display name, and public key. Access and refresh bearer values are returned as HttpOnly cookies while the database stores only SHA-256 digests. Logging out or rotating a refresh token revokes the previous session without changing the Agent's canonical `user_id`.

This path is independent of Google login, Link Agent codes, Codex OAuth, and the selected OpenClaw AI provider.

### Venue-specific onboarding

The adapter intercepts exact `exchange connect` calls for Hyperliquid, Extended, Lighter, Polymarket Perps, Polymarket prediction, Binance, and Binance Futures. It rejects selectors such as a network or credential reference. Wallet venues default to `existing`, checking only an EIP-1193 provider already injected into the exact Agent page; they never enumerate OpenClaw secrets, infer how another wallet is stored, or force an external `walletRef` convention. Polymarket prediction intentionally reports the current existing-wallet adapter as unsupported. An unsupported source returns guidance and never creates a Vault wallet.

Only explicit `walletAction: "create"` calls the wallet-creation surface. The Vault creates or resumes one persistent venue-scoped EVM wallet. Hyperliquid performs no approval while unfunded; Extended, Lighter, and Polymarket Perps sign their broker-issued registration payloads; Polymarket prediction passes its signer directly to the backend's official Builder integration. Every path remains tied to the Agent's existing `user_id` and the backend's normal plan and encrypted-credential installer.

For Hyperliquid, after funding, the page derives the canonical Agent `user_id` from its browser session and creates a short-lived intent containing only public identity fields. The Vault verifies those exact fields, rotates a fresh signer in one stable named Hyperliquid API-wallet slot, signs a completion message whose digest binds the signer without embedding it, and posts the signer directly to the backend. Reusing the name makes Hyperliquid replace the preceding signer instead of consuming another named-agent slot; the Vault then securely deletes any superseded failed-delivery ciphertext. The backend verifies the Vault signature and reuses the existing account connection boundary, which owns plan enforcement, exchange lookup, credential validation, encryption, rollback, and broker transition fencing. The Vault erases its temporary signer after confirmation. A storage response is not treated as venue readiness; the Agent must re-read credential and exchange status.

Binance and Binance Futures use neither wallet creation nor model-visible key fields. The Vault first exposes only a stable public verifier identity. The authenticated Agent page binds that identity to a ten-minute backend intent. Only then does the Vault return a loopback URL. The human form requires the exact host and origin plus a one-time CSRF value; its key/secret pair is hashed into the Vault signature, sent directly to the backend, and never written to SQLite. The backend verifies the signature and installs the credentials under the same Agent `user_id` through the canonical account transition. This is a narrow operator handoff, not a generic credential-binding API.

### Supported version

The package is built against OpenClaw `2026.8.2`, requires Node.js `22.22.3` or newer, and declares a peer range of `>=2026.8.2 <2027`. Compatibility with later OpenClaw releases must be revalidated before widening that contract.

### Skill distribution

The plugin bundles the skill so the guidance and required tool can travel together. The same guidance is also published independently on ClawHub as **HeyTraders Quant Trading Skills**; installing that skill alone does not supply the browser transport, Vault, or `heytraders_cli` plugin.

## Current proof boundary

The current exact packed artifact passed unit tests, TypeScript build, official plugin build/validation, archive inspection, Docker installation, runtime inspection, skill discovery, managed-browser startup, and an authenticated live `status` call on the Agent bootstrap page. After explicit server-side logout and Gateway/browser restart, the persisted key authenticated again to the same Agent and `user_id`; no second identity row was created. Existing-wallet-unavailable guidance and both CEX loopback handoff preparations were exercised locally. Secret delivery, real wallet signatures, venue provisioning, account installation, funding, and trading remain fake-only or unexecuted until the operator-assisted mainnet checkpoint.

The following are intentionally not claimed:

- real credential or wallet acceptance and broker readiness for any supported venue;
- order, strategy, or other financial mutation behavior;
- compatibility outside OpenClaw `2026.8.2`;
- npm, ClawHub, or GitHub release publication.
