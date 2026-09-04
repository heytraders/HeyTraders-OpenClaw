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

  it("maps the approved Hyperliquid Agent wallet through its dedicated contract", () => {
    const selector = readExchangeConnectSelector({
      command: "exchange connect",
      args: { exchange: "hyperliquid" },
    });

    expect(
      resolvePrivateExchangeConnectRequest({
        selector: selector!,
        bindings: [{
          ref: "approved-agent-wallet",
          exchange: "hyperliquid",
          kind: "hyperliquid_agent_wallet",
          agentPrivateKeyEnv: "HYPERLIQUID_AGENT_PRIVATE_KEY",
          masterAddressEnv: "HYPERLIQUID_MASTER_ADDRESS",
          agentExpiresAtMsEnv: "HYPERLIQUID_AGENT_EXPIRES_AT_MS",
        }],
        environment: {
          HYPERLIQUID_AGENT_PRIVATE_KEY: "0xfixture-agent-private-key",
          HYPERLIQUID_MASTER_ADDRESS: "0xfixture-master-address",
          HYPERLIQUID_AGENT_EXPIRES_AT_MS: "1798761600000",
        },
      }),
    ).toEqual({
      operation: "connect",
      exchange: "hyperliquid",
      credential: {
        kind: "hyperliquid_agent_wallet",
        agentPrivateKey: "0xfixture-agent-private-key",
        masterAddress: "0xfixture-master-address",
        agentExpiresAtMs: 1798761600000,
      },
    });
  });

  it("keeps generic extended-field bindings available for other DEX venues", () => {
    expect(
      resolvePrivateExchangeConnectRequest({
        selector: { exchange: "extended" },
        bindings: [{
          ref: "extended-wallet",
          exchange: "extended",
          kind: "dex_extended",
          credentialEnv: {
            stark_private_key: "EXTENDED_STARK_PRIVATE_KEY",
            account_address: "EXTENDED_ACCOUNT_ADDRESS",
          },
        }],
        environment: {
          EXTENDED_STARK_PRIVATE_KEY: "0xfixture-stark-private-key",
          EXTENDED_ACCOUNT_ADDRESS: "0xfixture-account-address",
        },
      }),
    ).toEqual({
      operation: "connect",
      exchange: "extended",
      credential: {
        kind: "dex_extended",
        fields: {
          stark_private_key: "0xfixture-stark-private-key",
          account_address: "0xfixture-account-address",
        },
      },
    });
  });

  it("rejects generic Hyperliquid field mappings", () => {
    expect(() =>
      resolvePrivateExchangeConnectRequest({
        selector: { exchange: "hyperliquid" },
        bindings: [{
          ref: "ambiguous-wallet",
          exchange: "hyperliquid",
          kind: "dex_extended",
          credentialEnv: { private_key: "HYPERLIQUID_PRIVATE_KEY" },
        }],
        environment: { HYPERLIQUID_PRIVATE_KEY: "must-never-appear-in-errors" },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CREDENTIAL_BINDING" }));
  });

  it("rejects malformed Hyperliquid Agent expiry without exposing its value", () => {
    let caught: unknown;
    try {
      resolvePrivateExchangeConnectRequest({
        selector: { exchange: "hyperliquid" },
        bindings: [{
          ref: "approved-agent-wallet",
          exchange: "hyperliquid",
          kind: "hyperliquid_agent_wallet",
          agentPrivateKeyEnv: "HYPERLIQUID_AGENT_PRIVATE_KEY",
          masterAddressEnv: "HYPERLIQUID_MASTER_ADDRESS",
          agentExpiresAtMsEnv: "HYPERLIQUID_AGENT_EXPIRES_AT_MS",
        }],
        environment: {
          HYPERLIQUID_AGENT_PRIVATE_KEY: "0xfixture-agent-private-key",
          HYPERLIQUID_MASTER_ADDRESS: "0xfixture-master-address",
          HYPERLIQUID_AGENT_EXPIRES_AT_MS: "invalid-secret-shaped-value",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CredentialBindingError);
    expect((caught as Error).message).toContain("HYPERLIQUID_AGENT_EXPIRES_AT_MS");
    expect((caught as Error).message).not.toContain("invalid-secret-shaped-value");
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
