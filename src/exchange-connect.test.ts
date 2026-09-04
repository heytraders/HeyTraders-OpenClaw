import { describe, expect, it, vi } from "vitest";

import {
  orchestrateExchangeConnect,
  parseExchangeConnectRequest,
} from "./exchange-connect.js";
import type { WalletVaultClient } from "./wallet-vault-client.js";

const FUNDING_ADDRESS = `0x${"1".repeat(40)}`;
const VAULT_PUBLIC_KEY = "A".repeat(43);

function walletClient(overrides: Partial<WalletVaultClient> = {}): WalletVaultClient {
  return {
    prepare: vi.fn(),
    connect: vi.fn(),
    prepareCredentialIdentity: vi.fn(),
    prepareCredentialHandoff: vi.fn(),
    ...overrides,
  } as unknown as WalletVaultClient;
}

function existingStatus(exchange: string, available: boolean) {
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "existing_status",
    data: {
      exchange,
      network: "mainnet",
      adapter: "browser_evm",
      available,
      state: available ? "available" : "unsupported",
      connected: false,
      ...(!available ? { reasonCode: "wallet_provider_unavailable" } : {}),
    },
  };
}

function existingConnected(exchange: string) {
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "connect_existing",
    data: {
      exchange,
      network: "mainnet",
      adapter: "browser_evm",
      available: true,
      state: "connected",
      connected: true,
      accountId: `${exchange}-account`,
    },
  };
}

describe("multi-venue exchange connect request", () => {
  it.each(["hyperliquid", "extended", "lighter", "polymarketperp", "polymarket"])(
    "defaults %s to a compatible existing wallet",
    (exchange) => {
      expect(parseExchangeConnectRequest({
        command: "exchange connect",
        args: { exchange },
      })).toEqual({ exchange, kind: "wallet", walletAction: "existing" });
    },
  );

  it.each(["binance", "binancefutures"])(
    "routes %s to an operator credential handoff without accepting walletAction",
    (exchange) => {
      expect(parseExchangeConnectRequest({
        command: "exchange connect",
        args: { exchange },
      })).toEqual({ exchange, kind: "operator_credentials" });
      expect(() => parseExchangeConnectRequest({
        command: "exchange connect",
        args: { exchange, walletAction: "create" },
      })).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
    },
  );

  it("rejects testnet and unknown fields before any transport call", () => {
    expect(() => parseExchangeConnectRequest({
      command: "exchange connect",
      args: { exchange: "lighter", network: "testnet" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
  });
});

describe("multi-venue exchange connect orchestration", () => {
  it("connects an Extended browser wallet without touching the Vault", async () => {
    const client = walletClient();
    const invokeAgentExchange = vi
      .fn()
      .mockResolvedValueOnce(existingStatus("extended", true))
      .mockResolvedValueOnce(existingConnected("extended"));

    const result = await orchestrateExchangeConnect({
      request: { exchange: "extended", kind: "wallet", walletAction: "existing" },
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: {
        exchange: "extended",
        state: "completed",
        connectionMethod: "existing_browser_wallet",
        accountId: "extended-account",
      },
    });
  });

  it("never falls through from an unsupported Lighter wallet to wallet creation", async () => {
    const client = walletClient();
    const invokeAgentExchange = vi.fn().mockResolvedValue(existingStatus("lighter", false));

    const result = await orchestrateExchangeConnect({
      request: { exchange: "lighter", kind: "wallet", walletAction: "existing" },
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: {
        exchange: "lighter",
        state: "existing_wallet_unsupported",
        walletCreationAvailable: true,
        nextCommand: {
          command: "exchange connect",
          args: { exchange: "lighter", walletAction: "create" },
        },
      },
    });
  });

  it("creates a venue-scoped wallet only after explicit create", async () => {
    const client = walletClient({
      prepare: vi.fn().mockResolvedValue({
        exchange: "polymarketperp",
        network: "mainnet",
        walletRef: "polymarketperp-main",
        fundingAddress: FUNDING_ADDRESS,
        vaultPublicKey: VAULT_PUBLIC_KEY,
        state: "ready",
        funded: false,
      }),
    });
    const prepared = {
      ok: true,
      protocolVersion: 2,
      domain: "exchange",
      action: "prepare",
      data: {
        intentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
        exchange: "polymarketperp",
        network: "mainnet",
        walletRef: "polymarketperp-main",
        fundingAddress: FUNDING_ADDRESS,
        state: "pending",
        completionType: "wallet_signatures",
        expiresAtMs: 1_900_000_000_000,
        challenge: "signed-intent",
        signingRequests: [{ type: "eip712", label: "Authorize", data: { domain: {} } }],
      },
    };
    (client.connect as ReturnType<typeof vi.fn>).mockResolvedValue({
      exchange: "polymarketperp",
      network: "mainnet",
      walletRef: "polymarketperp-main",
      fundingAddress: FUNDING_ADDRESS,
      vaultPublicKey: VAULT_PUBLIC_KEY,
      state: "completed",
      funded: false,
      intentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
      accountId: "perp-account",
    });
    const invokeAgentExchange = vi.fn()
      .mockResolvedValueOnce(prepared)
      .mockResolvedValueOnce({
        ok: true,
        protocolVersion: 2,
        domain: "exchange",
        action: "status",
        data: {
          intentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
          exchange: "polymarketperp",
          network: "mainnet",
          walletRef: "polymarketperp-main",
          fundingAddress: FUNDING_ADDRESS,
          state: "completed",
          completionType: "wallet_signatures",
          expiresAtMs: 1_900_000_000_000,
          accountId: "perp-account",
        },
      });

    const result = await orchestrateExchangeConnect({
      request: { exchange: "polymarketperp", kind: "wallet", walletAction: "create" },
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).toHaveBeenCalledWith("polymarketperp", undefined);
    expect(result).toMatchObject({ data: { connectionMethod: "new_agent_wallet" } });
  });

  it("starts a Binance operator handoff without model-visible credentials", async () => {
    const intentId = "16e3c6cb-a999-4acc-ae27-a80a730b91a8";
    const client = walletClient({
      prepareCredentialIdentity: vi.fn().mockResolvedValue({
        exchange: "binance",
        network: "mainnet",
        walletRef: "binance-main",
        identityAddress: FUNDING_ADDRESS,
        vaultPublicKey: VAULT_PUBLIC_KEY,
        state: "ready",
      }),
      prepareCredentialHandoff: vi.fn().mockResolvedValue({
        exchange: "binance",
        state: "awaiting_operator",
        setupUrl: `http://127.0.0.1:8791/operator-handoffs/${intentId}`,
        expiresAtMs: 1_900_000_000_000,
      }),
    });
    const invokeAgentExchange = vi.fn().mockResolvedValue({
      ok: true,
      protocolVersion: 2,
      domain: "exchange",
      action: "prepare_operator",
      data: {
        intentId,
        exchange: "binance",
        network: "mainnet",
        walletRef: "binance-main",
        fundingAddress: FUNDING_ADDRESS,
        state: "pending",
        expiresAtMs: 1_900_000_000_000,
        challenge: "signed-operator-intent",
        completionType: "operator_credentials",
        signingRequests: [],
      },
    });

    const result = await orchestrateExchangeConnect({
      request: { exchange: "binance", kind: "operator_credentials" },
      client,
      invokeAgentExchange,
    });

    expect(JSON.stringify(result)).not.toMatch(/api[_-]?key|secret|credentialValue/iu);
    expect(invokeAgentExchange).toHaveBeenCalledWith({
      operation: "prepare_operator",
      exchange: "binance",
      network: "mainnet",
      walletRef: "binance-main",
      identityAddress: FUNDING_ADDRESS,
      vaultPublicKey: VAULT_PUBLIC_KEY,
    });
    expect(client.prepareCredentialHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: "binance", identityAddress: FUNDING_ADDRESS }),
      expect.objectContaining({ intentId, completionType: "operator_credentials" }),
      undefined,
    );
    expect(result).toMatchObject({
      data: {
        exchange: "binance",
        state: "awaiting_operator",
        setupUrl: `http://127.0.0.1:8791/operator-handoffs/${intentId}`,
      },
    });
  });
});
