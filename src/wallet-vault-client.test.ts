import { describe, expect, it, vi } from "vitest";

import {
  HYPERLIQUID_WALLET_REF,
  WALLET_VAULT_ORIGIN,
  WalletVaultClient,
  WalletVaultError,
  isHyperliquidConnectRequest,
  orchestrateHyperliquidWallet,
  parseAgentWalletIntent,
  parseWalletVaultResponse,
} from "./wallet-vault-client.js";

const INTENT_ID = "16e3c6cb-a999-4acc-ae27-a80a730b91a8";
const FUNDING_ADDRESS = `0x${"1".repeat(40)}`;
const VAULT_PUBLIC_KEY = "A".repeat(43);
const EXPIRES_AT_MS = 1_900_000_000_000;

function publicState(state: "awaiting_funding" | "ready" | "completed") {
  return {
    exchange: "hyperliquid",
    network: "mainnet",
    wallet_ref: HYPERLIQUID_WALLET_REF,
    funding_address: FUNDING_ADDRESS,
    vault_public_key: VAULT_PUBLIC_KEY,
    state,
    funded: state !== "awaiting_funding",
    intent_id: state === "completed" ? INTENT_ID : null,
    account_id: state === "completed" ? "account-1" : null,
    error_code: null,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function browserIntent(action: "prepare" | "status") {
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action,
    data: {
      intentId: INTENT_ID,
      exchange: "hyperliquid",
      network: "mainnet",
      walletRef: HYPERLIQUID_WALLET_REF,
      fundingAddress: FUNDING_ADDRESS,
      state: action === "prepare" ? "pending" : "completed",
      expiresAtMs: EXPIRES_AT_MS,
      ...(action === "prepare"
        ? {
            challenge: [
              "heytraders-agent-wallet-connect-v1",
              `intent:${INTENT_ID}`,
              "exchange:hyperliquid",
              "network:mainnet",
              `wallet_ref:${HYPERLIQUID_WALLET_REF}`,
              `master_address:${FUNDING_ADDRESS}`,
              `vault_key:${"B".repeat(43)}`,
              `nonce:${"C".repeat(43)}`,
              `expires_at_ms:${EXPIRES_AT_MS}`,
            ].join("\n"),
          }
        : { accountId: "account-1" }),
    },
  };
}

describe("WalletVaultClient", () => {
  it("uses only the fixed internal Vault origin and mainnet prepare contract", async () => {
    const fetchFn = vi.fn(async () => response(publicState("awaiting_funding")));
    const client = new WalletVaultClient({ fetch: fetchFn });

    await expect(client.prepare()).resolves.toMatchObject({
      network: "mainnet",
      state: "awaiting_funding",
      fundingAddress: FUNDING_ADDRESS,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${WALLET_VAULT_ORIGIN}/v1/wallets/prepare`);
    expect(JSON.parse(String(init?.body))).toEqual({
      exchange: "hyperliquid",
      network: "mainnet",
      wallet_ref: HYPERLIQUID_WALLET_REF,
    });
  });

  it("rejects credential-shaped fields anywhere in a Vault response", () => {
    expect(() =>
      parseWalletVaultResponse({
        ...publicState("ready"),
        nested: { private_key: "must-never-cross" },
      }),
    ).toThrowError(expect.objectContaining({ code: "VAULT_RESPONSE_UNSAFE" }));
  });

  it("rejects API-key fields in a browser intent response", () => {
    const intent = browserIntent("prepare");
    intent.data = { ...intent.data, api_key: "must-never-cross" } as typeof intent.data;

    expect(() => parseAgentWalletIntent(intent, true)).toThrowError(
      expect.objectContaining({ code: "VAULT_RESPONSE_UNSAFE" }),
    );
  });

  it("redacts upstream error bodies", async () => {
    const client = new WalletVaultClient({
      fetch: async () =>
        response(
          {
            ok: false,
            error: {
              code: "WALLET_PREPARE_FAILED",
              message: "upstream private detail that must not escape",
            },
          },
          503,
        ),
    });

    let caught: unknown;
    try {
      await client.prepare();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WalletVaultError);
    expect(caught).toMatchObject({ code: "WALLET_PREPARE_FAILED", retryable: true });
    expect((caught as Error).message).not.toContain("upstream private detail");
  });

  it("stops reading a chunked response after the public size limit", async () => {
    const client = new WalletVaultClient({
      fetch: async () => new Response("x".repeat((1024 * 1024) + 1)),
    });

    await expect(client.prepare()).rejects.toMatchObject({
      code: "VAULT_RESPONSE_TOO_LARGE",
    });
  });

  it("does not contact the Vault when the operation is already canceled", async () => {
    const fetchFn = vi.fn(async () => response(publicState("ready")));
    const client = new WalletVaultClient({ fetch: fetchFn });
    const controller = new AbortController();
    controller.abort("user-canceled");

    await expect(client.prepare(controller.signal)).rejects.toMatchObject({
      code: "WALLET_VAULT_ABORTED",
      retryable: true,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Hyperliquid Wallet Vault orchestration", () => {
  it("returns the funding address before creating a browser intent", async () => {
    const client = new WalletVaultClient({
      fetch: async () => response(publicState("awaiting_funding")),
    });
    const invokeAgentExchange = vi.fn();

    const result = await orchestrateHyperliquidWallet({ client, invokeAgentExchange });

    expect(result).toMatchObject({
      ok: true,
      data: {
        network: "mainnet",
        state: "awaiting_funding",
        connected: false,
        fundingAddress: FUNDING_ADDRESS,
      },
    });
    expect(invokeAgentExchange).not.toHaveBeenCalled();
  });

  it("prepares in the browser, completes in Vault, then confirms browser status", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(publicState("ready")))
      .mockResolvedValueOnce(response(publicState("completed")));
    const client = new WalletVaultClient({ fetch: fetchFn });
    const invokeAgentExchange = vi
      .fn()
      .mockResolvedValueOnce(browserIntent("prepare"))
      .mockResolvedValueOnce(browserIntent("status"));

    const result = await orchestrateHyperliquidWallet({ client, invokeAgentExchange });

    expect(result).toMatchObject({
      ok: true,
      data: {
        state: "completed",
        connected: true,
        accountId: "account-1",
        credentialStored: true,
      },
    });
    expect(invokeAgentExchange).toHaveBeenNthCalledWith(1, {
      operation: "prepare",
      exchange: "hyperliquid",
      network: "mainnet",
      walletRef: HYPERLIQUID_WALLET_REF,
      fundingAddress: FUNDING_ADDRESS,
      vaultPublicKey: VAULT_PUBLIC_KEY,
    });
    expect(invokeAgentExchange).toHaveBeenNthCalledWith(2, {
      operation: "status",
      intentId: INTENT_ID,
    });
    const connectBody = JSON.parse(String(fetchFn.mock.calls[1]![1]?.body));
    expect(connectBody).toMatchObject({
      intent_id: INTENT_ID,
      exchange: "hyperliquid",
      network: "mainnet",
      wallet_ref: HYPERLIQUID_WALLET_REF,
      funding_address: FUNDING_ADDRESS,
    });
    expect(JSON.stringify(connectBody)).not.toMatch(/private|secret|credential/iu);
  });

  it("intercepts only exact Hyperliquid connects and rejects network overrides", () => {
    expect(
      isHyperliquidConnectRequest({
        command: "exchange connect",
        args: { exchange: "hyperliquid" },
      }),
    ).toBe(true);
    expect(
      isHyperliquidConnectRequest({
        command: "exchange connect",
        args: { exchange: "binance" },
      }),
    ).toBe(false);
    expect(() =>
      isHyperliquidConnectRequest({
        command: "exchange connect",
        args: { exchange: "hyperliquid", network: "testnet" },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EXCHANGE_CONNECT_ARGS" }));
  });
});
