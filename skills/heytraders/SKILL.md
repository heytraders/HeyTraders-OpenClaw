---
name: heytraders
description: Operate HeyTraders through the live heytraders_cli browser command catalog when the user asks to inspect, navigate, configure, or manage the HeyTraders application.
user-invocable: false
---

# HeyTraders Quant Trading Skills

Use this skill only with the `heytraders_cli` tool supplied by the HeyTraders OpenClaw plugin. The live HeyTraders page owns the command catalog, schemas, readiness, identifiers, workflow policy, and results. Do not replace that authority with remembered commands or copied schemas.

## Operating loop

1. Confirm the browser transport is ready with `status` when readiness is uncertain.
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
5. Preserve structured errors and `userActionRequired` results. Explain the exact visible browser step the user must complete, then re-read state after the user finishes it.

## Safety and ownership

- Never send login details, API keys, exchange credentials, wallet secrets, tokens, cookies, private keys, browser storage, or recovery phrases through `heytraders_cli`.
- Login, exchange connection, wallet approval, CAPTCHA, 2FA, and visible confirmations belong to the user in the HeyTraders browser.
- Do not invent or reuse stale command names, IDs, schemas, readiness, venue metadata, or chart capabilities. Refresh them from the live catalog.
- Do not call a HeyTraders HTTP API, shell command, page script, undocumented bridge member, or fallback transport to bypass this tool.
- Do not bypass confirmations, authorization, quotas, or other application policy. A command being discoverable does not by itself authorize a state change.
- Treat financial or irreversible actions as user-owned final decisions. Present the live parameters and require the user's explicit instruction when the requested action has not already been clearly authorized.

## Browser transport recovery

The adapter accepts exactly one eligible page at `https://hey-traders.com` in the managed OpenClaw browser profile.

- If no eligible tab exists, open the canonical HeyTraders origin in that managed profile and retry after it loads.
- If multiple eligible tabs exist, keep one intended tab and close the duplicates before retrying.
- If the user is not authenticated, stop at the visible login handoff. Do not import, inspect, or copy credentials on their behalf.
- If the live page does not expose `heytraders_cli`, report the transport error instead of guessing a legacy path.
