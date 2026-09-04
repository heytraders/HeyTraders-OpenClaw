# Multi-Venue Agent Exchange Onboarding Implementation Plan

> **Execution note:** Work directly in the existing checkouts. Keep this checklist and `.codex/orchestration/plan.md` synchronized as each verified slice completes.

**Goal:** Extend the mainnet-only OpenClaw connection experience from Hyperliquid to Extended, Lighter, Polymarket Perps, Polymarket prediction, Binance, and Binance Futures while preserving venue-specific security boundaries.

**Architecture:** A canonical OpenClaw dispatcher classifies a venue as signed-wallet, Polymarket prediction, or CEX credentials. Existing-wallet commands call one private Frontend bridge that uses only an explicitly available browser provider. Explicit wallet creation calls the isolated Vault, which obtains an Agent-bound backend intent and signs only the messages described by that intent. The backend remains the authoritative owner of account installation, quotas, encrypted venue credentials, one-time sessions, and server-held platform secrets.

**Technology:** TypeScript/Vitest (OpenClaw), React/JavaScript command bridge (Frontend), FastAPI/Pydantic/Pytest (API and Vault), Rust/Cargo (broker wallet-connect), Supabase SQL migrations, Docker Compose.

---

## Phase 1: Contract Tests and Shared Vocabulary

- Define canonical exchange IDs and capability classes in one OpenClaw module.
- Add red-first tests for existing-first dispatch, explicit creation, unsupported adapters, CEX routing, and secret-free public responses.
- Add backend tests for generic signed intents, per-exchange binding, idempotent session use, and first-account credential transitions.
- Add Vault tests for generic personal/EIP-712 signing without key export.

## Phase 2: Signed-Wallet Venues

- Generalize the Agent intent schema/repository and add a forward-only migration for supported exchanges and completion metadata.
- Prepare Extended/Lighter/Polymarket Perps signing requests through the broker and store the opaque broker session server-side.
- Have the Vault sign exact backend-issued messages and direct-submit signatures plus the Agent identity proof.
- Extract/reuse the Frontend's canonical broker-wallet signing service for compatible existing wallets.
- Fix Lighter account discovery so upstream or nonce lookup failures stop onboarding instead of selecting guessed defaults.

## Phase 3: Polymarket Prediction

- Add a distinct server-side provisioning boundary that uses the existing Builder configuration.
- Let the Vault own only the Agent signer; return/store only the resulting public Deposit Wallet and encrypted trading credentials.
- Return a configuration-required error when Builder support is unavailable; never fall back to a browser-wallet or raw-private-key form.

## Phase 4: Binance and Binance Futures

- Add an Agent-bound one-time credential intent with a loopback-only operator page owned by the Vault.
- Keep key/secret input and delivery outside OpenClaw arguments/results, never persist them in the Vault, and retain them only for the in-flight signed delivery request.
- Require trading/read permissions only, reject withdrawal-enabled intent metadata where detectable, and expose trusted-IP guidance from the live catalog.

## Phase 5: Product Contract and Runtime Proof

- Update the Exchange command catalog, ClawHub SKILL, README, and architecture docs with the exact per-venue flow.
- Run scoped tests and static validation; do not run Frontend Jest or production builds.
- Recreate local Docker services and verify login/dispatch/status on `http://localhost:5173`.
- Stop before real signatures, Builder mutations, API-key submission, funding, approvals, or trading and leave those as a user-assisted checkpoint.
