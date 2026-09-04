---
name: heytraders
description: Operate HeyTraders through the live heytraders_cli browser command catalog when the user asks to inspect, navigate, configure, or manage the HeyTraders application.
user-invocable: false
---

# HeyTraders Quant Trading Skills

Use this skill only with the `heytraders_cli` tool supplied by the HeyTraders OpenClaw plugin. The live HeyTraders page owns the command catalog, schemas, readiness, identifiers, workflow policy, and results. Do not replace that authority with remembered commands or copied schemas.

## Operating loop

1. Confirm the browser transport is ready with `status` when readiness is uncertain. The plugin automatically opens `/agent` and creates or resumes its Agent-owned HeyTraders browser session before executing the command.
2. Discover only what the current request needs:
   - Use `help` for the top-level live catalog.
   - Use `help <domain>` to narrow the catalog.
   - Use `describe <command>` before a command when its current arguments, readiness, or execution policy are not already known from fresh output in this run.
3. Invoke the tool with exactly one structured envelope:

   ```json
   { "command": "<live selector>", "args": { "<field>": "<value>" } }
   ```

   Do not repeat structured arguments inside the command selector.
4. After a command that may change application state, read the affected state again before claiming success or taking a dependent action.
5. Preserve structured errors and `userActionRequired` results. Explain the exact visible browser step only when the live application or venue genuinely requires one, then re-read state after it finishes.

## Exchange connection

1. Read `exchange guide` for the requested venue and refresh `exchange status` or `exchange connections` before connecting.
2. For Hyperliquid, Extended, Lighter, Polymarket Perps, or Polymarket prediction, first send the canonical selector without a wallet action. This tries only a compatible existing wallet already exposed to the Agent browser:

   ```json
   {"command":"exchange connect","args":{"exchange":"<wallet-venue>"}}
   ```

3. The current existing-wallet adapter supports an EIP-1193 EVM provider already injected into the exact `/agent` browser page for Hyperliquid, Extended, Lighter, and Polymarket Perps. It does not scan OpenClaw files, environment variables, secret stores, wallet references, extensions, or arbitrary wallet formats. Polymarket prediction currently has no compatible existing-wallet adapter and therefore returns explicit creation guidance. Wallet material never enters the model-visible result.
4. If the result is `existing_wallet_unsupported`, `existing_wallet_not_ready`, `existing_wallet_authorization_required`, or `existing_wallet_connection_failed`, preserve its reason and explain that the existing wallet cannot be connected through the current adapter. Do not automatically run the suggested creation command.
5. Only after the user explicitly chooses a new Agent-owned wallet, send:

   ```json
   {"command":"exchange connect","args":{"exchange":"<wallet-venue>","walletAction":"create"}}
   ```

6. The plugin-managed path is mainnet-only. Never add `network`, `connectionRef`, wallet material, API keys, or credentials to the command request.
7. Before any Agent-created address receives funds, remind the operator to back up both the encrypted Wallet Vault data volume and its separate root-key volume through an access-controlled offline process; never inspect or expose their contents.
8. Hyperliquid creation is funding-first. If the result is `awaiting_funding`, show the returned public address, identify it as the Agent-owned Hyperliquid mainnet treasury, and wait for the user to fund it through a supported Hyperliquid mainnet deposit or transfer flow. After confirmation, run the same explicit creation command again. Do not claim that arbitrary token or network transfers will be credited.
9. Extended, Lighter, and Polymarket Perps creation signs only the exact short-lived registration messages returned by HeyTraders. Polymarket prediction creation sends its isolated signer directly to the backend for official Builder/Deposit Wallet provisioning; after completion, use the returned public `venueFundingAddress` as the Deposit Wallet and do not confuse it with the Vault signer in `fundingAddress`. Preserve any venue prerequisite or retry error; never substitute a generic signature or export the wallet key.
10. Binance and Binance Futures do not accept `walletAction`. Send only the selector:

   ```json
   {"command":"exchange connect","args":{"exchange":"binance"}}
   ```

   Return the loopback-only setup URL and ask the human operator to open it on the OpenClaw host within its expiry. The human enters a mainnet key with read and trade permission and withdrawals disabled. Do not ask for, receive, repeat, summarize, or inspect the key or secret in chat. After the operator says the form completed, re-read status.
11. After any `completed` result, read `exchange credential_status` for the returned account ID when available and then `exchange status` before claiming the venue is ready.
12. For other venues, preserve the live application's `userActionRequired` or browser handoff. This plugin does not read venue credentials from environment variables.

Agent-created wallet keys remain encrypted in the Wallet Vault. The Vault has no model-facing key export, transfer, withdrawal, or order operation. Do not attempt a testnet flow; this integration rejects it before wallet creation or operator handoff preparation.

## Safety and ownership

- Never put login details, API keys, exchange credentials, wallet secrets, tokens, cookies, private keys, browser storage, or recovery phrases in model-visible `heytraders_cli` arguments.
- The Wallet Vault may send a newly approved signer or operator-entered CEX credential only through its proof-bound direct backend channel after automatic Agent authentication. Do not attempt to reproduce, summarize, export, or log that material.
- Agent login does not require Google login, a Link Agent code, Codex OAuth, or a human browser handoff. The configured AI provider is independent of the HeyTraders Agent identity.
- Do not invent or reuse stale command names, IDs, schemas, readiness, venue metadata, or chart capabilities. Refresh them from the live catalog.
- Do not call a HeyTraders HTTP API, shell command, page script, undocumented bridge member, or fallback transport to bypass this tool.
- Do not bypass confirmations, authorization, quotas, or other application policy. A command being discoverable does not by itself authorize a state change.
- Treat financial or irreversible actions as user-owned final decisions. Present the live parameters and require the user's explicit instruction when the requested action has not already been clearly authorized.

## Browser transport recovery

The adapter accepts exactly one eligible `/agent` page at its configured HeyTraders origin in the managed OpenClaw browser profile.

- If no eligible tab exists, let the next tool call create the exact `/agent` page; if the browser profile itself is stopped, start it first.
- If multiple eligible Agent bootstrap tabs exist, keep one intended tab and close the duplicates before retrying.
- If automatic authentication fails, preserve the structured Agent-auth error. Do not redirect to human login or attempt a legacy API-key/link flow.
- If the live page does not expose `heytraders_cli`, report the transport error instead of guessing a legacy path.
