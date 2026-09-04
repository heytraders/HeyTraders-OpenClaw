import { describe, expect, it } from "vitest";

import {
  CredentialBindingError,
  readExchangeConnectSelector,
  resolvePrivateExchangeConnectRequest,
} from "./credential-bindings.js";

describe("OpenClaw credential bindings", () => {
  it("resolves CEX values from named environment variables outside model args", () => {
    const selector = readExchangeConnectSelector({
      command: "exchange connect",
      args: { exchange: "binance", connectionRef: "primary" },
    });

    expect(selector).not.toBeNull();
    expect(
      resolvePrivateExchangeConnectRequest({
        selector: selector!,
        bindings: [{
          ref: "primary",
          exchange: "binance",
          kind: "cex_api_key",
          apiKeyEnv: "BINANCE_API_KEY",
          secretEnv: "BINANCE_API_SECRET",
          accountName: "OpenClaw Binance",
        }],
        environment: {
          BINANCE_API_KEY: "fixture-api-key",
          BINANCE_API_SECRET: "fixture-api-secret",
        },
      }),
    ).toEqual({
      operation: "connect",
      exchange: "binance",
      accountName: "OpenClaw Binance",
      credential: {
        kind: "cex_api_key",
        apiKey: "fixture-api-key",
        secret: "fixture-api-secret",
      },
    });
  });

  it("maps Hyperliquid-style DEX fields without imposing a CEX shape", () => {
    const selector = readExchangeConnectSelector({
      command: "exchange connect",
      args: { exchange: "hyperliquid" },
    });

    expect(
      resolvePrivateExchangeConnectRequest({
        selector: selector!,
        bindings: [{
          ref: "main-wallet",
          exchange: "hyperliquid",
          kind: "dex_extended",
          credentialEnv: {
            private_key: "HYPERLIQUID_PRIVATE_KEY",
            account_address: "HYPERLIQUID_ACCOUNT_ADDRESS",
          },
        }],
        environment: {
          HYPERLIQUID_PRIVATE_KEY: "0xfixture-private-key",
          HYPERLIQUID_ACCOUNT_ADDRESS: "0xfixture-account-address",
        },
      }),
    ).toEqual({
      operation: "connect",
      exchange: "hyperliquid",
      credential: {
        kind: "dex_extended",
        fields: {
          private_key: "0xfixture-private-key",
          account_address: "0xfixture-account-address",
        },
      },
    });
  });

  it("requires an explicit safe ref when one exchange has multiple bindings", () => {
    expect(() =>
      resolvePrivateExchangeConnectRequest({
        selector: { exchange: "binance" },
        bindings: [
          { ref: "one", exchange: "binance", kind: "cex_api_key", apiKeyEnv: "ONE_KEY", secretEnv: "ONE_SECRET" },
          { ref: "two", exchange: "binance", kind: "cex_api_key", apiKeyEnv: "TWO_KEY", secretEnv: "TWO_SECRET" },
        ],
        environment: {},
      }),
    ).toThrowError(expect.objectContaining({ code: "CREDENTIAL_BINDING_AMBIGUOUS" }));
  });

  it("reports only a missing environment-variable name, never another secret", () => {
    let caught: unknown;
    try {
      resolvePrivateExchangeConnectRequest({
        selector: { exchange: "binance" },
        bindings: [{
          ref: "primary",
          exchange: "binance",
          kind: "cex_api_key",
          apiKeyEnv: "BINANCE_API_KEY",
          secretEnv: "BINANCE_API_SECRET",
        }],
        environment: {
          BINANCE_API_KEY: "must-never-appear-in-errors",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CredentialBindingError);
    expect((caught as Error).message).toContain("BINANCE_API_SECRET");
    expect((caught as Error).message).not.toContain("must-never-appear-in-errors");
  });

  it("rejects credential-shaped model arguments before binding resolution", () => {
    expect(() =>
      readExchangeConnectSelector({
        command: "exchange connect",
        args: { exchange: "binance", apiKey: "fixture" },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
  });

  it("does not intercept unrelated canonical commands", () => {
    expect(
      readExchangeConnectSelector({ command: "exchange status", args: { exchange: "binance" } }),
    ).toBeNull();
  });
});
