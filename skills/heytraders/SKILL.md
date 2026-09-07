---
name: heytraders
description: Operate HeyTraders through the live heytraders_cli browser command catalog when the user asks to inspect, navigate, configure, or manage the HeyTraders application.
user-invocable: false
---

# HeyTraders Quant Trading Skills

Use this skill only with the `heytraders_cli` tool supplied by the HeyTraders OpenClaw plugin. The live HeyTraders page owns command names, schemas, identifiers, onboarding documents, readiness, policy, and results. Never replace that authority with remembered commands, copied schemas, or guessed venue instructions.

## Required plugin

This skill is bundled with `@heytraders/openclaw-plugin`. Installing the standalone ClawHub skill does not install the browser transport. If `heytraders_cli` is unavailable, ask the operator to install and enable the plugin and allow its optional tool:

```bash
openclaw plugins install clawhub:@heytraders/openclaw-plugin@0.1.1
openclaw plugins enable heytraders
```

The operator must add `heytraders_cli` to their existing tool allowance and have a running managed OpenClaw browser profile. Follow the [package installation guide](https://github.com/heytraders/HeyTraders-OpenClaw/blob/develop/README.md#install-in-an-existing-openclaw-environment) for the supported OpenClaw/Node versions and configuration. Preserve existing tool policy: append to `tools.allow` when it is configured, otherwise use `tools.alsoAllow`; never configure both. Do not install software or change the operator's environment without their authorization. If the plugin is already installed, do not install this skill a second time.

## Operating loop

1. Use `status` when browser readiness is uncertain. The plugin reuses its HeyTraders work tab and Agent session. It opens `/agent` only when no app tab exists and visits that route for signing only when a session must be established.
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

HeyTraders and this plugin do not create wallets, venue accounts, API keys, or signing keys for OpenClaw. They also do not prescribe how an Agent stores an existing wallet. Wallet and credential preparation belongs to the selected venue and to capabilities already chosen by the OpenClaw operator.

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

Pass only arguments declared by the live command schema. Never include connection secrets or wallet material.

## Safety and ownership

- The plugin stores only its Ed25519 HeyTraders login identity in the OpenClaw state directory. That identity authenticates the Agent account; it is not an exchange wallet or trading credential.
- Agent login does not require Google login, a Link Agent code, Codex OAuth, or a human browser handoff. The selected AI provider is independent of the HeyTraders Agent identity.
- Do not call a HeyTraders HTTP API, shell command, page script, undocumented bridge member, or fallback transport to bypass `heytraders_cli`.
- Do not bypass confirmations, authorization, subscription limits, exchange permissions, or application policy. A discoverable command is not permission to perform an unrequested financial action.
- Treat orders, strategy starts, wallet approvals, credential creation, deposits, and other irreversible actions as separate operations with their own explicit authority.

## Browser transport recovery

The adapter binds one work tab at its configured HeyTraders origin in the managed OpenClaw browser profile. It retains that tab across navigation; it need not remain on `/agent`.

- If no eligible tab exists, let the next call create it. If the browser profile is stopped, start that existing profile first.
- Before a work tab is bound (including after Gateway restart), multiple eligible app tabs are ambiguous. Ask the operator to identify the intended tab and resolve the ambiguity; do not pick another account's tab.
- Normal session refresh is automatic. If signing is needed, the adapter temporarily visits `/agent` in the same tab and restores the prior registered route before the requested command.
- A human session or change from the bound Agent account is an error, not permission to overwrite that session.
- If a dispatched command's outcome is unconfirmed, stop and have the operator inspect the action before restarting the adapter. Never replay the action or restart merely to bypass this guard.
- If automatic authentication fails, preserve the structured Agent-auth error. Do not redirect to human login or fall back to an API-key/Link Agent flow.
- If the live page does not expose `heytraders_cli`, report the transport error rather than guessing a legacy path.
