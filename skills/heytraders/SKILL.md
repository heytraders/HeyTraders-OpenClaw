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
2. For an Agent-owned Hyperliquid connection, send only the canonical exchange selector:

   ```json
   {"command":"exchange connect","args":{"exchange":"hyperliquid"}}
   ```

3. The plugin and its isolated Wallet Vault support Hyperliquid mainnet only. Never add `network`, `connectionRef`, wallet material, or credentials to this request.
4. When the result is `awaiting_funding`, show the returned public funding address exactly as public account information. Before asking the user to fund it, remind the operator to back up both the encrypted Wallet Vault data volume and its separate root-key volume through an access-controlled offline process; never inspect or expose their contents. Tell the user that the address is the Agent-owned Hyperliquid mainnet treasury and wait for the user to fund it through a supported Hyperliquid mainnet deposit or transfer flow. Do not claim that arbitrary token or network transfers will be credited.
5. After the user confirms funding, run the same `exchange connect` command again. The Vault checks the public balance, rotates a fresh signer in its stable named API-wallet slot, and sends it directly to HeyTraders; neither the model nor browser receives a private key.
6. After a `completed` result, read `exchange credential_status` for the returned account ID and then `exchange status` before claiming the venue is ready.
7. For every other CEX or DEX, preserve the live application's `userActionRequired` or browser handoff. This plugin does not read venue credentials from environment variables.

The Hyperliquid treasury master key remains encrypted in the Wallet Vault. The Vault has no model-facing key export, transfer, withdrawal, or order operation. Do not attempt a testnet flow; this integration rejects it before wallet creation.

## Safety and ownership

- Never put login details, API keys, exchange credentials, wallet secrets, tokens, cookies, private keys, browser storage, or recovery phrases in model-visible `heytraders_cli` arguments.
- The Wallet Vault may send a newly approved API signer only through its signed direct backend channel after automatic Agent authentication. Do not attempt to reproduce, summarize, export, or log wallet material.
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
