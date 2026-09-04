import type { HeyTradersRequest } from "./request-contract.js";
import {
  WalletVaultClient,
  WalletVaultError,
  orchestrateHyperliquidWallet,
} from "./wallet-vault-client.js";
import {
  PublicResponseSafetyError,
  assertNoSensitivePublicFields,
} from "./public-response-safety.js";

export type HyperliquidWalletAction = "existing" | "create";

type ExistingWalletState = {
  available: boolean;
  state: "available" | "connected" | "unsupported" | "not_ready" | "authorization_required" | "failed";
  connected: boolean;
  accountId?: string;
  reasonCode?: string;
};

const EXISTING_WALLET_ADAPTER = "browser_evm";
const SAFE_REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidArgs(): WalletVaultError {
  return new WalletVaultError(
    "INVALID_EXCHANGE_CONNECT_ARGS",
    "Hyperliquid exchange connect accepts only exchange and walletAction existing/create.",
  );
}

export function parseHyperliquidConnectRequest(
  request: HeyTradersRequest,
): { walletAction: HyperliquidWalletAction } | null {
  if (request.command.trim().toLowerCase() !== "exchange connect") return null;
  const exchange = typeof request.args.exchange === "string"
    ? request.args.exchange.trim().toLowerCase()
    : "";
  const hasWalletAction = Object.prototype.hasOwnProperty.call(request.args, "walletAction");
  if (exchange !== "hyperliquid") {
    if (hasWalletAction) throw invalidArgs();
    return null;
  }
  const keys = Object.keys(request.args);
  if (keys.some((key) => key !== "exchange" && key !== "walletAction")) {
    throw invalidArgs();
  }
  const walletAction = request.args.walletAction ?? "existing";
  if (walletAction !== "existing" && walletAction !== "create") throw invalidArgs();
  return { walletAction };
}

function parseExistingWalletResponse(
  value: unknown,
  expectedAction: "existing_status" | "connect_existing",
): ExistingWalletState {
  try {
    assertNoSensitivePublicFields(value);
  } catch (error) {
    if (error instanceof PublicResponseSafetyError) {
      throw new WalletVaultError(
        error.reason === "sensitive-field"
          ? "EXISTING_WALLET_RESPONSE_UNSAFE"
          : "EXISTING_WALLET_RESPONSE_INVALID",
        "Existing wallet adapter returned invalid public state.",
      );
    }
    throw error;
  }
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new WalletVaultError(
      "EXISTING_WALLET_RESPONSE_INVALID",
      "Existing wallet adapter returned invalid public state.",
    );
  }
  const allowedEnvelopeFields = new Set([
    "ok",
    "protocolVersion",
    "domain",
    "action",
    "data",
    "presentation",
  ]);
  const allowedDataFields = new Set([
    "exchange",
    "network",
    "adapter",
    "available",
    "state",
    "connected",
    "accountId",
    "reasonCode",
  ]);
  if (
    Object.keys(value).some((key) => !allowedEnvelopeFields.has(key))
    || Object.keys(value.data).some((key) => !allowedDataFields.has(key))
  ) {
    throw new WalletVaultError(
      "EXISTING_WALLET_RESPONSE_INVALID",
      "Existing wallet adapter returned unknown public state.",
    );
  }
  const data = value.data;
  const state = data.state;
  const available = data.available;
  const connected = data.connected ?? false;
  const accountId = data.accountId;
  const reasonCode = data.reasonCode;
  const allowedStates = expectedAction === "existing_status"
    ? new Set(["available", "unsupported"])
    : new Set(["connected", "unsupported", "not_ready", "authorization_required", "failed"]);
  if (
    value.protocolVersion !== 2
    || value.domain !== "exchange"
    || value.action !== expectedAction
    || data.exchange !== "hyperliquid"
    || data.network !== "mainnet"
    || data.adapter !== EXISTING_WALLET_ADAPTER
    || typeof available !== "boolean"
    || typeof state !== "string"
    || !allowedStates.has(state)
    || typeof connected !== "boolean"
    || (state === "available" && !available)
    || (state === "unsupported" && available)
    || (state === "connected" && (!available || !connected || typeof accountId !== "string" || !accountId))
    || (state !== "connected" && connected)
    || (accountId !== undefined && (typeof accountId !== "string" || !accountId))
    || (reasonCode !== undefined && (typeof reasonCode !== "string" || !SAFE_REASON_CODE.test(reasonCode)))
  ) {
    throw new WalletVaultError(
      "EXISTING_WALLET_RESPONSE_INVALID",
      "Existing wallet adapter returned invalid public state.",
    );
  }
  return {
    available,
    state: state as ExistingWalletState["state"],
    connected,
    ...(typeof accountId === "string" ? { accountId } : {}),
    ...(typeof reasonCode === "string" ? { reasonCode } : {}),
  };
}

function creationGuidance(existing: ExistingWalletState): Record<string, unknown> {
  const stateByAdapterState = {
    unsupported: "existing_wallet_unsupported",
    not_ready: "existing_wallet_not_ready",
    authorization_required: "existing_wallet_authorization_required",
    failed: "existing_wallet_connection_failed",
  } as const;
  const state = existing.state in stateByAdapterState
    ? stateByAdapterState[existing.state as keyof typeof stateByAdapterState]
    : "existing_wallet_unsupported";
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "connect",
    data: {
      exchange: "hyperliquid",
      network: "mainnet",
      connectionMethod: "existing_browser_wallet",
      state,
      connected: false,
      reasonCode: existing.reasonCode ?? "wallet_provider_unavailable",
      walletCreationAvailable: true,
      nextAction:
        "This existing wallet cannot be connected through the current browser adapter. Explicitly choose create only if a new Agent-owned wallet is wanted.",
      nextCommand: {
        command: "exchange connect",
        args: { exchange: "hyperliquid", walletAction: "create" },
      },
    },
    presentation: {
      canonicalCommand: "exchange connect",
      commandId: "exchange.connect",
    },
  };
}

function existingConnectionResult(existing: ExistingWalletState): Record<string, unknown> {
  if (existing.state !== "connected" || !existing.accountId) return creationGuidance(existing);
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "connect",
    data: {
      exchange: "hyperliquid",
      network: "mainnet",
      connectionMethod: "existing_browser_wallet",
      state: "completed",
      connected: true,
      accountId: existing.accountId,
      credentialStored: true,
      verificationRequired: true,
    },
    presentation: {
      canonicalCommand: "exchange connect",
      commandId: "exchange.connect",
    },
  };
}

function withCreationMethod(result: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(result.data)) return result;
  return {
    ...result,
    data: {
      ...result.data,
      connectionMethod: "new_agent_wallet",
    },
  };
}

export async function orchestrateHyperliquidConnect(params: {
  walletAction: HyperliquidWalletAction;
  client: WalletVaultClient;
  invokeAgentExchange: (input: Record<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  if (params.walletAction === "create") {
    return withCreationMethod(await orchestrateHyperliquidWallet({
      client: params.client,
      invokeAgentExchange: params.invokeAgentExchange,
      ...(params.signal ? { signal: params.signal } : {}),
    }));
  }

  const status = parseExistingWalletResponse(
    await params.invokeAgentExchange({
      operation: "existing_status",
      exchange: "hyperliquid",
      network: "mainnet",
    }),
    "existing_status",
  );
  if (!status.available) return creationGuidance(status);

  const connected = parseExistingWalletResponse(
    await params.invokeAgentExchange({
      operation: "connect_existing",
      exchange: "hyperliquid",
      network: "mainnet",
    }),
    "connect_existing",
  );
  return existingConnectionResult(connected);
}
