# Guide-Only Exchange Onboarding Implementation Plan

> **For Claude:** Execute this plan in the current working trees because repository instructions prohibit worktrees and the user already requested implementation.

**Goal:** Remove HeyTraders-provided Agent wallet creation and make OpenClaw use the live venue guide followed by the canonical secure exchange connection flow.

**Architecture:** The OpenClaw plugin continues to establish its Agent browser session and forwards every normalized command to the page-owned `heytraders_cli` tool. The Frontend Docs registry and Exchange gateway remain the only onboarding authority. Vault-specific browser tools, API endpoints, persistence, and Docker runtime are retired; ordinary human/browser wallet connection code remains intact.

**Tech Stack:** TypeScript/OpenClaw Plugin SDK, React command gateways/WebMCP, FastAPI/PostgreSQL migrations, Vitest/pytest.

---

### Task 1: Make OpenClaw exchange commands use the canonical browser tool

**Files:**
- Modify: `src/browser-transport.test.ts`
- Modify: `src/browser-transport.ts`
- Delete: `src/exchange-connect.ts`
- Delete: `src/exchange-connect.test.ts`
- Delete: `src/wallet-vault-client.ts`
- Delete: `src/wallet-vault-client.test.ts`
- Delete if unreferenced: `src/public-response-safety.ts`

1. Add a test proving `exchange connect` is forwarded unchanged to `heytraders_cli`.
2. Run the targeted test and confirm the current Vault interception fails it.
3. Remove the special exchange tool and Vault client path.
4. Run the OpenClaw test suite.

### Task 2: Publish guidance-only OpenClaw behavior

**Files:**
- Modify: `skills/heytraders/SKILL.md`
- Modify: `src/index.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/browser-transport-evidence.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Delete: obsolete Agent-wallet design plans

1. Require `exchange list` followed by `exchange guide` for the selected canonical venue.
2. State that wallet/account/key creation belongs to the venue and that HeyTraders never generates it for OpenClaw.
3. Remove Wallet Vault containers, volumes, setup instructions, and claims.
4. Build and inspect the packed plugin.

### Task 3: Remove the Frontend OpenClaw-only wallet creation surface

**Files:**
- Modify: `src/common/appBridge/webMcpBridge.js`
- Modify: `src/common/commands/gateways/catalogs/ExchangeCommandCatalog.js`
- Delete: `src/common/appBridge/agentExchangeBridge.js`
- Delete or trim: its tests and OpenClaw-only wallet adapter services
- Modify: `src/common/api/internal/accountApiKeyApi.js`

1. Add/update catalog tests so `exchange connect` accepts only the exchange selector.
2. Remove registration of the hidden Agent exchange WebMCP tool.
3. Remove Agent-wallet intent client methods and adapters that have no ordinary UI consumer.
4. Run only the repository's targeted supported checks; do not run Jest or a full build.

### Task 4: Retire backend Vault infrastructure

**Files:**
- Delete: `agent-wallet-vault/`
- Delete: `api_server/application/auth/agent_wallet_connection.py`
- Remove Agent-wallet intent routes from `api_server/presentation/api/v1/routes/accounts/api_keys.py`
- Remove: Agent-wallet intent repository exports/implementation
- Remove: Vault-only tests and dependencies
- Create: a forward migration dropping `private.agent_wallet_connection_intents`

1. Identify and preserve ordinary exchange connection and credential-installation code.
2. Remove only the Vault proof/intention API surface and Polymarket Vault provisioner.
3. Add the forward database cleanup migration without rewriting historical migrations.
4. Run targeted API tests through `uv`.

### Task 5: Verify and commit

1. Search active source and shipped docs for Vault creation claims and `walletAction`.
2. Run `git diff --check` in every changed repository.
3. Verify OpenClaw tests/build/package, Frontend targeted checks, and Backend targeted tests.
4. Update `.codex/orchestration/memory.md` with the guide-only ownership decision.
5. Commit OpenClaw on its sole `main` branch; commit other repositories according to each repository's branch policy, with scoped messages.
