---
name: heytraders
description: Operate HeyTraders through the live heytraders_cli browser command catalog when the user asks to inspect, navigate, configure, or manage the HeyTraders application.
user-invocable: false
---

# HeyTraders Quant Trading Skills

Use this skill only with the `heytraders_cli` tool supplied by the HeyTraders OpenClaw plugin. The live HeyTraders page owns command names, schemas, identifiers, onboarding documents, readiness, policy, and results. Never replace that authority with remembered commands, copied schemas, or guessed venue instructions.

## Operating loop

1. Use `status` when browser readiness is uncertain. The plugin opens the exact `/agent` page and creates or resumes its Agent-owned HeyTraders browser session before forwarding the requested command.
2. Discover only what the current request needs:
   - `help` lists current domains.
   - `help <domain>` lists that domain's current commands.
   - `describe <command>` returns the current argument and execution contract.
3. Invoke one structured envelope and never repeat an argument inside the selector:

   ```json
   {"command":"<live selector>","args":{"<field>":"<value>"}}
   ```

4. After a state-changing command, read the affected state again before claiming success.
5. Preserve structured errors and user-action handoffs. Do not turn a displayed dialog or a submitted request into an unverified success claim.

## Exchange onboarding

HeyTraders and this plugin do not create wallets, venue accounts, API keys, signing keys, or a local wallet/Vault service for OpenClaw. They also do not prescribe how an Agent stores an existing wallet. Wallet and credential preparation belongs to the selected venue and to capabilities already chosen by the OpenClaw operator.

For every exchange connection:

1. Run `help exchange` when the exchange commands are not already fresh in the current run.
2. Run `exchange list` and select only an exchange identifier returned by that live result.
3. Run `exchange guide` for that exact identifier before attempting connection. Treat its document revision, requirements, permission limits, current Trusted IP metadata, setup steps, and official references as authoritative.
4. If the Agent does not yet have the required venue account, wallet, or credential, follow the venue-owned preparation described by that guide outside HeyTraders. Use only wallet, browser, or venue tooling already available in the Agent's environment. Do not install software, generate a wallet through HeyTraders, invent a wallet format, or substitute a generic wallet procedure.
5. Never put an API key, secret, private key, seed phrase, recovery phrase, signature, cookie, token, or browser storage value in `heytraders_cli` arguments or chat. Secret entry and wallet approval belong only to the secure browser or venue surface identified by the live guide.
6. Follow live navigation remediation when needed, then call `exchange connect` with only the canonical exchange identifier:

   ```json
   {"command":"exchange connect","args":{"exchange":"<exchange-from-exchange-list>"}}
   ```

7. If the result requires user or venue action, explain that exact step and stop the HeyTraders command flow until it is completed. Never claim to have approved a wallet request or entered credentials unless the responsible external capability returned its own verified result.
8. After completion, run `exchange status`. When an account identifier is returned or needed, use `exchange connections` followed by `exchange credential_status` before claiming the connection is ready.

Do not send `walletAction`, `network`, `walletRef`, connection secrets, or wallet material. There is no HeyTraders Agent-wallet creation fallback.

## Safety and ownership

- The plugin stores only its Ed25519 HeyTraders login identity in the OpenClaw state directory. That identity authenticates the Agent account; it is not an exchange wallet or trading credential.
- Agent login does not require Google login, a Link Agent code, Codex OAuth, or a human browser handoff. The selected AI provider is independent of the HeyTraders Agent identity.
- Do not call a HeyTraders HTTP API, shell command, page script, undocumented bridge member, or fallback transport to bypass `heytraders_cli`.
- Do not bypass confirmations, authorization, subscription limits, exchange permissions, or application policy. A discoverable command is not permission to perform an unrequested financial action.
- Treat orders, strategy starts, wallet approvals, credential creation, deposits, and other irreversible actions as separate operations with their own explicit authority.

## Browser transport recovery

The adapter accepts exactly one eligible `/agent` page at its configured HeyTraders origin in the managed OpenClaw browser profile.

- If no eligible tab exists, let the next call create it. If the browser profile is stopped, start that existing profile first.
- If multiple eligible tabs exist, keep one intended `/agent` tab and close the duplicates before retrying.
- If automatic authentication fails, preserve the structured Agent-auth error. Do not redirect to human login or fall back to an API-key/Link Agent flow.
- If the live page does not expose `heytraders_cli`, report the transport error rather than guessing a legacy path.
