import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

import {
  executeHeyTradersCommand,
  formatErrorForLog,
  formatToolError,
} from "./browser-transport.js";

const bindingRefSchema = Type.String({ minLength: 1, maxLength: 64 });
const bindingExchangeSchema = Type.String({ minLength: 1, maxLength: 64 });
const bindingAccountNameSchema = Type.Optional(
  Type.String({ minLength: 1, maxLength: 80 }),
);
const bindingEnvironmentNameSchema = Type.String({ minLength: 1, maxLength: 128 });

const credentialBindingSchema = Type.Union([
  Type.Object(
    {
      ref: bindingRefSchema,
      exchange: bindingExchangeSchema,
      kind: Type.Literal("cex_api_key"),
      accountName: bindingAccountNameSchema,
      apiKeyEnv: bindingEnvironmentNameSchema,
      secretEnv: bindingEnvironmentNameSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ref: bindingRefSchema,
      exchange: bindingExchangeSchema,
      kind: Type.Literal("hyperliquid_agent_wallet"),
      accountName: bindingAccountNameSchema,
      agentPrivateKeyEnv: bindingEnvironmentNameSchema,
      masterAddressEnv: bindingEnvironmentNameSchema,
      agentExpiresAtMsEnv: Type.Optional(bindingEnvironmentNameSchema),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ref: bindingRefSchema,
      exchange: bindingExchangeSchema,
      kind: Type.Literal("dex_extended"),
      accountName: bindingAccountNameSchema,
      credentialEnv: Type.Record(
        Type.String(),
        bindingEnvironmentNameSchema,
      ),
    },
    { additionalProperties: false },
  ),
]);

const configSchema = Type.Object(
  {
    appOrigin: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 256,
        description:
          "Exact HeyTraders app origin. Defaults to production; HTTP is accepted only for loopback or host.docker.internal development.",
      }),
    ),
    agentDisplayName: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 80,
        description: "Display name for the autonomous HeyTraders Agent-owned account.",
      }),
    ),
    browserProfile: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 64,
        description: "OpenClaw browser profile that owns the authorized HeyTraders tab.",
      }),
    ),
    credentialBindings: Type.Optional(
      Type.Array(credentialBindingSchema, {
        maxItems: 50,
        description:
          "HeyTraders-owned mapping from safe connection refs to environment variable names. Secret values stay in the OpenClaw process environment.",
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Integer({
        minimum: 1_000,
        maximum: 120_000,
        description: "Maximum time for browser discovery and one HeyTraders command.",
      }),
    ),
  },
  { additionalProperties: false },
);

const requestSchema = Type.Object(
  {
    command: Type.String({
      minLength: 1,
      maxLength: 512,
      description:
        'Canonical selector-only HeyTraders command. Use "help", "help <domain>", or "describe <command>" for live discovery.',
    }),
    args: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Structured operands for the canonical command. Never include credentials or browser storage.",
      }),
    ),
  },
  { additionalProperties: false },
);

export default defineToolPlugin({
  id: "heytraders",
  name: "HeyTraders",
  description: "Operate the live HeyTraders browser command catalog through an origin-pinned WebMCP adapter.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "heytraders_cli",
      label: "HeyTraders CLI",
      description:
        "Discover and invoke canonical HeyTraders commands through the Agent-owned HeyTraders browser session. The adapter creates or resumes its account automatically with a persistent local Ed25519 identity. For exchange connect, pass only exchange and an optional connectionRef; configured secrets are resolved outside model arguments.",
      parameters: requestSchema,
      optional: true,
      execute: async (params, config, context) => {
        try {
          return await executeHeyTradersCommand(
            params,
            config,
            context.api.runtime.config.current(),
            {
              signal: context.signal,
              stateDir: context.api.runtime.state.resolveStateDir(process.env),
            },
          );
        } catch (error) {
          context.api.logger.error(`heytraders_cli adapter failed: ${formatErrorForLog(error)}`);
          return formatToolError(error);
        }
      },
    }),
  ],
});
