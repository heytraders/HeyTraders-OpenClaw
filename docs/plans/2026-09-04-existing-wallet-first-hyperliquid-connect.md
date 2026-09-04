# Existing-Wallet-First Hyperliquid Connection Implementation Plan

> **For Codex:** Execute this plan sequentially in the existing `develop` working trees. Repository policy forbids worktrees, and sub-agent delegation was not requested.

**Goal:** Connect a compatible existing browser-managed Hyperliquid wallet without changing how it is stored, otherwise guide the Agent to explicitly create a HeyTraders-owned wallet, with no automatic wallet creation.

**Architecture:** `exchange connect` defaults to the Frontend-owned browser-wallet adapter. The Agent-only private bridge reports only public capability/connection state and reuses the canonical Hyperliquid browser-wallet connection service. Only `walletAction: "create"` enters the existing isolated Wallet Vault orchestration; unsupported existing sources return a structured next command rather than a fallback mutation.

**Tech Stack:** React/Vite browser bridge, ethers EIP-1193 provider, TypeScript OpenClaw plugin, Vitest, Docker Compose.

---

### Task 1: OpenClaw policy tests

**Files:**
- Create: `src/hyperliquid-connect.ts`
- Create: `src/hyperliquid-connect.test.ts`
- Modify: `src/wallet-vault-client.ts`
- Modify: `src/wallet-vault-client.test.ts`

1. Add failing tests proving an omitted action and `existing` invoke only the existing-wallet bridge.
2. Add a failing test proving an unsupported existing wallet returns `existing_wallet_unsupported` and an explicit-create next command.
3. Add a failing test proving only `walletAction: "create"` calls Vault `prepare`.
4. Add validation tests for unknown arguments/actions and mainnet/network overrides.
5. Implement the minimal request classifier, safe response parser, and orchestration policy.
6. Run `npm test -- --run src/hyperliquid-connect.test.ts src/wallet-vault-client.test.ts` and expect all tests to pass.

### Task 2: Frontend canonical existing-wallet service

**Files:**
- Create: `src/common/exchangeConnection/services/hyperliquidBrowserWalletConnection.js`
- Modify: `src/common/services/walletService.js`
- Modify: `src/domains/dashboard/Settings/ApiKeys/components/hooks/useExchangeApiKeys.js`

1. Add a side-effect-free browser-provider capability check.
2. Move Hyperliquid credential shaping and the existing account-connect call into one shared business service.
3. Keep settings-hook UI state, analytics, translations, and account-list updates in the hook while reusing the shared service.
4. Check changed files with `node --check`; do not run Jest-like suites or a Frontend build.

### Task 3: Agent-only existing-wallet bridge

**Files:**
- Modify: `src/common/appBridge/agentExchangeBridge.js`

1. Add `existing_status` and `connect_existing` operations with strict selector-only schemas.
2. Return only availability, public state, public account ID, and bounded reason codes.
3. Map absent provider, rejected authorization, deposit requirement, and unknown failures without exposing upstream error text.
4. Serialize connection mutation through the existing queue and require the Agent browser session.
5. Check the file with `node --check`.

### Task 4: OpenClaw dispatch and command contract

**Files:**
- Modify: `src/browser-transport.ts`
- Modify: `src/index.ts`
- Modify: `../HeyTraders-Frontend/src/common/commands/gateways/catalogs/ExchangeCommandCatalog.js`

1. Parse `walletAction` as omitted/`existing`/`create` only for Hyperliquid connect.
2. Route omitted/`existing` to the private existing-wallet bridge.
3. Route `create` to the current Vault orchestration.
4. Publish the optional enum in the live catalog and state explicitly that creation requires `create`.
5. Run OpenClaw unit tests and Frontend app-command discovery validation.

### Task 5: Guidance and runtime verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/browser-transport-evidence.md`
- Modify: `skills/heytraders/SKILL.md`

1. Replace every claim that first connect creates a wallet with existing-first behavior.
2. Document explicit-create syntax and the unsupported-existing-wallet response.
3. Run `npm run verify` and inspect the packed artifact.
4. Recreate the local plugin/Gateway against `http://localhost:5173`.
5. Invoke default Hyperliquid connect with no browser provider and prove it returns guidance without a Vault prepare/create call.
6. Inspect Git diffs and secret-shaped output, then commit the changed `develop` repositories.
7. Stop before any real wallet signature, funding, mainnet approval, account connection, order, or strategy action.
