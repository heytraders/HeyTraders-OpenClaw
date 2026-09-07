# HeyTraders Quant Trading Skills

Connect your OpenClaw Agent to [HeyTraders](https://hey-traders.com/) and operate the application through its live browser commands.

The plugin includes the `heytraders_cli` tool and its usage skill. You do not need to install a separate skill.

## Requirements

- OpenClaw `>=2026.8.2 <2027`, with an AI provider that supports tools.
- A Node.js release supported by your OpenClaw version and meeting this plugin's minimum `22.22.3`.
- An available managed OpenClaw browser profile.

## Install in an existing OpenClaw environment

```bash
openclaw plugins install clawhub:@heytraders/openclaw-plugin@0.1.1
openclaw plugins enable heytraders
```

Allow the optional `heytraders_cli` tool while preserving your existing tool policy:

- If `tools.allow` is already configured, append `heytraders_cli` to that array.
- Otherwise, append it to `tools.alsoAllow`, or create that array.
- Do not configure both `tools.allow` and `tools.alsoAllow`. Existing deny policies still apply.

For a configuration without `tools.allow`, merge this example into your existing configuration:

```json
{
  "tools": {
    "alsoAllow": ["heytraders_cli"]
  }
}
```

Reload or restart OpenClaw using your environment's normal method. Start your managed browser profile when needed:

```bash
openclaw browser start --browser-profile openclaw
```

The default profile is `openclaw`. If yours has another name, set `plugins.entries.heytraders.config.browserProfile` to that existing profile. The plugin connects to `https://hey-traders.com` by default.

## First use and Agent login

Ask your Agent to check its HeyTraders connection. It should use `heytraders_cli` to check `status`, discover `help auth`, and run the live `auth status` command.

The plugin automatically creates or resumes the Agent's own HeyTraders account. Google login, a human account link, and a particular AI-provider subscription are not required. The HeyTraders login identity stays in your OpenClaw state directory and is separate from any exchange wallet.

Login is complete only when the command reports an authenticated, verified Agent session. The Agent keeps using the same browser tab as it navigates the application; you do not need to keep an Agent login page open separately.

## Using HeyTraders

Tell the Agent what you want to do. The bundled skill tells it to discover the application's current commands instead of guessing:

- `help` lists the available domains.
- `help <domain>` narrows the available commands.
- `describe <command>` provides the current arguments and execution requirements.

Requests use one structured `heytraders_cli` envelope:

```json
{"command":"<live selector>","args":{"<field>":"<value>"}}
```

The Agent must verify the resulting application state after making a change. Available commands do not override your authorization, subscription limits, exchange permissions, or required confirmations.

## Connecting an exchange

1. Discover the current exchange commands, then use `exchange list` to choose a supported exchange identifier.
2. Read `exchange guide` for that identifier. Follow its current requirements and official references to prepare your wallet, venue account, or credentials using your chosen external tools.
3. After checking the live command requirements, use `exchange connect` with only the exchange identifier.
4. Complete credential entry or wallet approval only in the secure browser or venue surface identified by the guide.
5. Verify the connection with `exchange status` and any additional checks requested by the live result.

HeyTraders does not create or manage the Agent's exchange wallet. Never place API keys, private keys, recovery phrases, signatures, tokens, or cookies in chat or command arguments. Funding, wallet approvals, orders, and strategy execution remain separately authorized actions.

## Troubleshooting

- **Tool unavailable:** confirm that the plugin is enabled, `heytraders_cli` is allowed by your tool policy, and OpenClaw has reloaded the configuration.
- **Browser unavailable:** start the managed browser profile configured for this plugin.
- **Multiple HeyTraders tabs:** identify the intended Agent tab and resolve the ambiguity before continuing. Do not switch into a person's account session.
- **Login error:** follow the returned Agent-authentication error. Do not copy browser cookies or substitute a person's Google login.
- **Unconfirmed action:** inspect the application's actual state before retrying. Do not replay a potentially completed order or other state-changing action.
