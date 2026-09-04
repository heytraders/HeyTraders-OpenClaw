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
2. For `exchange connect`, send only the canonical exchange and, when configured, a safe binding reference:

   ```json
   {"command":"exchange connect","args":{"exchange":"binance","connectionRef":"binance-main"}}
   ```

3. `connectionRef` names a local HeyTraders plugin binding. It is not a live page catalog field and is intercepted by the trusted adapter before public command dispatch.
4. Never ask the user to paste a credential into chat or tool arguments. If the adapter reports a missing or ambiguous binding, ask the operator to configure the named environment variable or select one reported reference outside the conversation.
5. After success, read `exchange credential_status` for the returned account ID and then `exchange status` before claiming the venue is ready.

CEX bindings use `cex_api_key` with API-key and secret environment names. Hyperliquid uses `hyperliquid_agent_wallet`: its private-key variable must contain an already approved Agent/API-wallet key and its address variable must contain the master account address. Never use or request the master wallet private key. Other DEX venues may use `dex_extended` with the exact fields from their current HeyTraders credential metadata; generic DEX bindings are rejected for Hyperliquid.

## Safety and ownership

- Never put login details, API keys, exchange credentials, wallet secrets, tokens, cookies, private keys, browser storage, or recovery phrases in model-visible `heytraders_cli` arguments.
- The plugin's trusted private transport may resolve configured secret values from its process environment only after automatic Agent authentication. Do not reproduce, summarize, or log those values.
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
