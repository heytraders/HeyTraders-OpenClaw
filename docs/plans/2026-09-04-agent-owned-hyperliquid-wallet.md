# Agent-Owned Hyperliquid Wallet Implementation Plan

> **For Codex:** Execute this plan sequentially in the existing `develop` working trees. Repository policy forbids worktrees, and sub-agent delegation was not requested.

**Goal:** Let an autonomous OpenClaw Agent create and retain its own Hyperliquid treasury wallet, expose only the public funding address to the Agent/user, approve a separate Hyperliquid API wallet after funding, and install that trading credential into the same Agent-owned HeyTraders `user_id` without any private key passing through OpenClaw, the model, or browser JavaScript.

**Architecture:** A separate local Wallet Vault process owns the EVM treasury private key and a signing identity in isolated Docker volumes. The authenticated `/agent` browser surface creates a short-lived HeyTraders connection intent bound to the Vault public key and the Agent `user_id`. Once the public treasury address has Hyperliquid mainnet funds, the Vault uses the official Hyperliquid Python SDK to rotate a fresh signer in one stable named API-wallet slot and posts that key directly to a signed backend completion endpoint. The existing account credential installer remains the only owner of validation, encrypted storage, rollback, and broker transition fencing. OpenClaw receives only a wallet reference, funding address, fixed `mainnet` network, lifecycle state, and final account ID.

**Tech Stack:** FastAPI, PostgreSQL/SQLAlchemy, Ed25519, AES-GCM, SQLite, `eth-account`, the official `hyperliquid-python-sdk`, React browser WebMCP bridge, TypeScript OpenClaw Plugin SDK, Docker Compose, pytest, Vitest.

---

## Constraints

- Keep one model-facing OpenClaw tool: `heytraders_cli`.
- Support Hyperliquid mainnet only. Reject `testnet` or any other network before wallet creation or connection.
- Remove all Gateway environment credential bindings and raw-credential browser transports.
- Never expose treasury/API private keys in model arguments, plugin configuration, browser DOM, URLs, logs, status payloads, or committed files.
- The Vault must have no secret export, transfer, withdrawal, or order endpoint.
- Hyperliquid account queries use the treasury/master address; the API wallet is only the trading signer.
- Generate a new API wallet for every approval attempt that reaches Hyperliquid; never reuse a deregistered signer address.
- Use a named Hyperliquid API wallet with a deterministic name no longer than 16 characters.
- Reuse one stable named-agent slot so each later approval invalidates the preceding signer instead of consuming another slot; securely delete superseded failed-delivery ciphertext.
- Back up the encrypted data volume and separate root-key volume through an access-controlled offline process before funding; loss of either can make the treasury inaccessible.
- No real funding, mainnet approval, exchange connection, order, or strategy mutation during automated verification. The final mainnet venue checkpoint is performed with the user.
- Do not publish, deploy, or release as part of this plan.

## Task 1: Backend signed connection-intent contract

**Files:**

- Create: `HeyTraders/api_server/application/auth/agent_wallet_connection.py`
- Create: `HeyTraders/src/hey_traders/trading_utils/db_manager/agent_wallet_connection_repo.py`
- Modify: `HeyTraders/src/hey_traders/trading_utils/db_manager/__init__.py`
- Create: `HeyTraders/migrations/20260904HHMMSS_agent_wallet_connection_intents.sql`
- Modify: `HeyTraders/api_server/presentation/api/v1/routes/accounts/api_keys.py`
- Test: `HeyTraders/api_server/tests/test_agent_wallet_connection.py`
- Test: `HeyTraders/api_server/tests/test_agent_wallet_connection_migration.py`

1. Write failing tests for canonical challenge/completion messages, Ed25519 proof verification, expiry, wrong wallet/network/key rejection, single-use completion, and safe status projection.
2. Add a server-only `private.agent_wallet_connection_intents` table with Agent user/agent ownership, Vault public key/fingerprint, wallet reference, public master address, network, state, expiry, completion lease, account ID, and bounded public error code. Revoke direct public/authenticated grants and use the backend repository only.
3. Implement canonical message builders and verifier. Bind completion to the intent, Vault identity, API-wallet address, API private-key digest, and expiry metadata.
4. Add repository methods for create/read, compare-and-set completion claim, completed/failed transitions, and expired-intent cleanup.
5. Extract the existing `connect_exchange` body into one reusable internal function in the same route module so browser connect and signed Vault completion use exactly the same validation, encrypted storage, rollback, and broker transition owner.
6. Add Agent-browser-only prepare/status routes and one proof-authenticated Vault completion route. The completion route must never return or log credential material.
7. Run scoped tests with `uv run pytest`.

## Task 2: Isolated Wallet Vault runtime

**Files:**

- Modify: `HeyTraders/pyproject.toml`
- Modify: `HeyTraders/uv.lock`
- Create: `HeyTraders/agent-wallet-vault/pyproject.toml`
- Create: `HeyTraders/agent-wallet-vault/Dockerfile`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/__init__.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/config.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/crypto.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/store.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/hyperliquid_gateway.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/service.py`
- Create: `HeyTraders/agent-wallet-vault/agent_wallet_vault/main.py`
- Test: `HeyTraders/agent-wallet-vault/tests/test_vault_store.py`
- Test: `HeyTraders/agent-wallet-vault/tests/test_vault_service.py`

1. Write failing tests proving stable wallet identity across restart, encrypted-at-rest key material, strict file permissions, no key fields in public responses, idempotent prepare, funding-gated approval, fresh signer generation, one-time backend delivery, deletion of the local API signer after success, and retry-safe state transitions.
2. Add a dedicated workspace package with only the required FastAPI, crypto, HTTP, EVM, and official Hyperliquid SDK dependencies.
3. Generate a root encryption key inside the Vault-only volume with mode `0600`; encrypt treasury and Vault signing keys with AES-256-GCM and per-record nonces.
4. Persist exactly one canonical `hyperliquid-main` wallet in SQLite with explicit lifecycle states. Do not implement key export, funds transfer, withdrawal, or order APIs.
5. Implement the official-SDK adapter for `user_state`, `spot_user_state`, and `approve_agent`. Treat positive perpetual account value or positive spot USDC as funded; unrelated spot-token dust is not trading funding.
6. Implement `prepare` and `connect` HTTP endpoints. `connect` validates the exact backend challenge before approval and sends credentials only from Vault to the configured HeyTraders API base URL.
7. Add a minimal non-root container image and health endpoint.
8. Run scoped Vault tests with `uv run --package heytraders-agent-wallet-vault pytest`.

## Task 3: Browser command intent surface

**Files:**

- Modify: `HeyTraders-Frontend/src/common/api/internal/accountApiKeyApi.js`
- Modify: `HeyTraders-Frontend/src/common/appBridge/agentExchangeBridge.js`
- Modify: `HeyTraders-Frontend/src/common/commands/gateways/catalogs/ExchangeCommandCatalog.js`

1. Replace the raw credential input schema with `prepare` and `status` operations containing public Vault metadata only.
2. Require an authenticated Agent browser session for both operations.
3. Call the backend prepare/status routes and return only the signed intent challenge, public funding address, lifecycle state, and final account ID.
4. Update the live command description to describe Agent-owned Wallet Vault orchestration without claiming environment-secret support.
5. Run repository-approved static syntax/lint checks only; do not run Jest-like suites or `npm run build`.

## Task 4: OpenClaw Vault orchestration

**Files:**

- Delete: `HeyTraders-OpenClaw/src/credential-bindings.ts`
- Delete: `HeyTraders-OpenClaw/src/credential-bindings.test.ts`
- Create: `HeyTraders-OpenClaw/src/wallet-vault-client.ts`
- Create: `HeyTraders-OpenClaw/src/wallet-vault-client.test.ts`
- Modify: `HeyTraders-OpenClaw/src/browser-transport.ts`
- Modify: `HeyTraders-OpenClaw/src/browser-transport.test.ts`
- Modify: `HeyTraders-OpenClaw/src/request-contract.test.ts`
- Modify: `HeyTraders-OpenClaw/src/index.ts`
- Modify: `HeyTraders-OpenClaw/openclaw.plugin.json`

1. Write failing tests for the fixed/restricted Vault URL, safe response validation, no credential-shaped fields, `awaiting_funding` projection, connect completion, and error redaction.
2. Remove `credentialBindings`, environment reads, `connectionRef`, and raw secret browser requests.
3. For exact `exchange connect hyperliquid`, call Vault prepare, create the browser-owned intent, ask Vault to complete it, and finally read the browser-owned status.
4. Return `awaiting_funding` with the public treasury address when unfunded; return the final account ID only after backend status confirms completion.
5. Reject autonomous Vault orchestration for unsupported venues with the live application handoff instead of inventing a generic secret path.
6. Run `npm test`, plugin build/check/validate, and packed-artifact inspection.

## Task 5: Docker isolation and operator documentation

**Files:**

- Modify: `HeyTraders-OpenClaw/docker-compose.yml`
- Delete: `HeyTraders-OpenClaw/.env.agent.example`
- Modify: `HeyTraders-OpenClaw/README.md`
- Modify: `HeyTraders-OpenClaw/docs/architecture.md`
- Modify: `HeyTraders-OpenClaw/docs/browser-transport-evidence.md`
- Modify: `HeyTraders-OpenClaw/skills/heytraders/SKILL.md`

1. Add the Vault service on an internal Docker network with a dedicated volume, no published host port, dropped capabilities, read-only root filesystem, and a writable Vault data mount only.
2. Remove `.env.agent` from the Gateway and remove the repository mount path that could expose it. Pass only the safe Vault URL to the plugin.
3. Update documentation and the bundled skill: first connect creates a funding address; the operator backs up both Vault volumes; the user funds that address using Hyperliquid `Send USDC` (or an equivalent supported deposit flow); the Agent retries; Vault rotates a fresh signer in its stable named API-wallet slot; HeyTraders stores it; the Agent verifies credential and exchange status.
4. State explicitly that the treasury/master key never leaves Vault and the Hyperliquid API wallet cannot transfer or withdraw funds.
5. Do not publish the updated skill or plugin.

## Task 6: Automated verification and final checkpoint

1. Run backend and Vault scoped tests through `uv`.
2. Run allowed Frontend static checks.
3. Run OpenClaw unit/build/plugin/package verification.
4. Build the Vault container and inspect Compose rendering to prove no credential env file or Vault data mount reaches the Gateway.
5. Run a disposable fake-adapter Vault smoke test proving mainnet wallet persistence and `awaiting_funding` without venue mutation; remove the disposable volume afterward.
6. Re-scan repository state, generated OpenClaw state, logs, Compose config, and container metadata for the known old `.env.agent` values without printing them.
7. Commit each completed repository on `develop`, preserving unrelated work.
8. Stop before the user-assisted Hyperliquid mainnet checkpoint. At that checkpoint only: create the persistent Agent treasury, fund its public address, approve the named API wallet, confirm HeyTraders connection, then run read-only account checks. Orders and strategies require a separate explicit instruction.
