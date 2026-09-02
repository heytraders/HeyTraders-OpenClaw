import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

import {
  executeHeyTradersCommand,
  formatErrorForLog,
  formatToolError,
} from "./browser-transport.js";

const configSchema = Type.Object(
  {
    browserProfile: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 64,
        description: "OpenClaw browser profile that owns the authorized HeyTraders tab.",
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
        "Discover and invoke canonical HeyTraders commands in a user-authorized https://hey-traders.com browser tab. Start with live help or describe output when the exact contract is unknown. Credentials and visible confirmations remain in the browser UI.",
      parameters: requestSchema,
      optional: true,
      execute: async (params, config, context) => {
        try {
          return await executeHeyTradersCommand(
            params,
            config,
            context.api.runtime.config.current(),
            { signal: context.signal },
          );
        } catch (error) {
          context.api.logger.error(`heytraders_cli adapter failed: ${formatErrorForLog(error)}`);
          return formatToolError(error);
        }
      },
    }),
  ],
});
