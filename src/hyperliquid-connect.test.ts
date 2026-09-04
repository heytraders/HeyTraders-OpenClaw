import { describe, expect, it, vi } from "vitest";

import {
  orchestrateHyperliquidConnect,
  parseHyperliquidConnectRequest,
} from "./hyperliquid-connect.js";
import {
  HYPERLIQUID_WALLET_REF,
  type WalletVaultClient,
} from "./wallet-vault-client.js";

const FUNDING_ADDRESS = `0x${"1".repeat(40)}`;
const VAULT_PUBLIC_KEY = "A".repeat(43);

function existingStatus(available: boolean) {
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "existing_status",
    data: {
      exchange: "hyperliquid",
      network: "mainnet",
      adapter: "browser_evm",
      available,
      state: available ? "available" : "unsupported",
      ...(!available ? { reasonCode: "wallet_provider_unavailable" } : {}),
    },
  };
}

function existingConnected() {
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "connect_existing",
    data: {
      exchange: "hyperliquid",
      network: "mainnet",
      adapter: "browser_evm",
      available: true,
      state: "connected",
      connected: true,
      accountId: "account-1",
    },
  };
}

function vaultClient(overrides: Partial<WalletVaultClient> = {}): WalletVaultClient {
  return {
    prepare: vi.fn(),
    connect: vi.fn(),
    ...overrides,
  } as unknown as WalletVaultClient;
}

describe("parseHyperliquidConnectRequest", () => {
  it("defaults an exact Hyperliquid connect to the existing-wallet path", () => {
    expect(parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "hyperliquid" },
    })).toEqual({ walletAction: "existing" });
  });

  it("accepts only explicit existing/create actions", () => {
    expect(parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "hyperliquid", walletAction: "existing" },
    })).toEqual({ walletAction: "existing" });
    expect(parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "hyperliquid", walletAction: "create" },
    })).toEqual({ walletAction: "create" });
    expect(() => parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "hyperliquid", walletAction: "import" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
  });

  it("rejects unknown fields and does not claim other venues", () => {
    expect(parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "binance" },
    })).toBeNull();
    expect(() => parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "hyperliquid", network: "testnet" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
    expect(() => parseHyperliquidConnectRequest({
      command: "exchange connect",
      args: { exchange: "binance", walletAction: "create" },
    })).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
  });
});

describe("Hyperliquid existing-wallet-first orchestration", () => {
  it("returns explicit creation guidance without touching Vault when no compatible wallet exists", async () => {
    const client = vaultClient();
    const invokeAgentExchange = vi.fn().mockResolvedValue(existingStatus(false));

    const result = await orchestrateHyperliquidConnect({
      walletAction: "existing",
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(invokeAgentExchange).toHaveBeenCalledOnce();
    expect(invokeAgentExchange).toHaveBeenCalledWith({
      operation: "existing_status",
      exchange: "hyperliquid",
      network: "mainnet",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        state: "existing_wallet_unsupported",
        connected: false,
        walletCreationAvailable: true,
        nextCommand: {
          command: "exchange connect",
          args: { exchange: "hyperliquid", walletAction: "create" },
        },
      },
    });
  });

  it("connects a compatible existing wallet without touching Vault", async () => {
    const client = vaultClient();
    const invokeAgentExchange = vi
      .fn()
      .mockResolvedValueOnce(existingStatus(true))
      .mockResolvedValueOnce(existingConnected());

    const result = await orchestrateHyperliquidConnect({
      walletAction: "existing",
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(invokeAgentExchange).toHaveBeenNthCalledWith(2, {
      operation: "connect_existing",
      exchange: "hyperliquid",
      network: "mainnet",
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        state: "completed",
        connected: true,
        connectionMethod: "existing_browser_wallet",
        accountId: "account-1",
      },
    });
  });

  it("calls Wallet Vault only for the explicit create action", async () => {
    const client = vaultClient({
      prepare: vi.fn().mockResolvedValue({
        exchange: "hyperliquid",
        network: "mainnet",
        walletRef: HYPERLIQUID_WALLET_REF,
        fundingAddress: FUNDING_ADDRESS,
        vaultPublicKey: VAULT_PUBLIC_KEY,
        state: "awaiting_funding",
        funded: false,
      }),
    });
    const invokeAgentExchange = vi.fn();

    const result = await orchestrateHyperliquidConnect({
      walletAction: "create",
      client,
      invokeAgentExchange,
    });

    expect(client.prepare).toHaveBeenCalledOnce();
    expect(invokeAgentExchange).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      data: {
        state: "awaiting_funding",
        connectionMethod: "new_agent_wallet",
        fundingAddress: FUNDING_ADDRESS,
        nextCommand: {
          command: "exchange connect",
          args: { exchange: "hyperliquid", walletAction: "create" },
        },
      },
    });
  });

  it("rejects credential-shaped fields from the existing-wallet bridge", async () => {
    const client = vaultClient();
    const invokeAgentExchange = vi.fn().mockResolvedValue({
      ...existingStatus(false),
      data: {
        ...existingStatus(false).data,
        privateKey: "must-not-cross",
      },
    });

    await expect(orchestrateHyperliquidConnect({
      walletAction: "existing",
      client,
      invokeAgentExchange,
    })).rejects.toMatchObject({ code: "EXISTING_WALLET_RESPONSE_UNSAFE" });
    expect(client.prepare).not.toHaveBeenCalled();
  });
});
