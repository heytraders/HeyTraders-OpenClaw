import type { HeyTradersRequest } from "./request-contract.js";

export const WALLET_VAULT_ORIGIN = "http://agent-wallet-vault:8091";
export const HYPERLIQUID_WALLET_REF = "hyperliquid-main";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const WALLET_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/u;
const PUBLIC_STATES = new Set(["awaiting_funding", "ready", "completed"]);
const UNSAFE_KEY_FRAGMENTS = [
  "apikey",
  "bearer",
  "cookie",
  "credential",
  "mnemonic",
  "password",
  "private",
  "recoveryphrase",
  "secret",
  "seed",
  "signature",
  "token",
] as const;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WalletVaultPublicState = {
  exchange: "hyperliquid";
  network: "mainnet";
  walletRef: string;
  fundingAddress: string;
  vaultPublicKey: string;
  state: "awaiting_funding" | "ready" | "completed";
  funded: boolean;
  intentId?: string;
  accountId?: string;
  errorCode?: string;
};

export type AgentWalletIntent = {
  intentId: string;
  exchange: "hyperliquid";
  network: "mainnet";
  walletRef: string;
  fundingAddress: string;
  state: string;
  expiresAtMs: number;
  challenge: string;
  accountId?: string;
  errorCode?: string;
};

export class WalletVaultError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "WalletVaultError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoSensitiveFields(value: unknown, depth = 0): void {
  if (depth > 16) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault response is too deeply nested.");
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitiveFields(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
    if (UNSAFE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
      throw new WalletVaultError(
        "VAULT_RESPONSE_UNSAFE",
        "Wallet Vault returned a credential-shaped field.",
      );
    }
    assertNoSensitiveFields(nested, depth + 1);
  }
}

function optionalString(value: unknown, pattern?: RegExp): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return value;
}

export function parseWalletVaultResponse(value: unknown): WalletVaultPublicState {
  assertNoSensitiveFields(value);
  if (!isRecord(value)) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  const allowed = new Set([
    "exchange",
    "network",
    "wallet_ref",
    "funding_address",
    "vault_public_key",
    "state",
    "funded",
    "intent_id",
    "account_id",
    "error_code",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned unknown public state.");
  }
  const walletRef = optionalString(value.wallet_ref, WALLET_REF_PATTERN);
  const fundingAddress = optionalString(value.funding_address, ADDRESS_PATTERN);
  const vaultPublicKey = optionalString(value.vault_public_key, PUBLIC_KEY_PATTERN);
  const intentId = optionalString(value.intent_id, UUID_PATTERN);
  const accountId = optionalString(value.account_id);
  const errorCode = optionalString(value.error_code, ERROR_CODE_PATTERN);
  if (
    value.exchange !== "hyperliquid"
    || value.network !== "mainnet"
    || !walletRef
    || !fundingAddress
    || !vaultPublicKey
    || typeof value.state !== "string"
    || !PUBLIC_STATES.has(value.state)
    || typeof value.funded !== "boolean"
    || (value.state === "awaiting_funding" && value.funded)
    || ((value.state === "ready" || value.state === "completed") && !value.funded)
    || (value.state === "completed" && !accountId)
  ) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return {
    exchange: "hyperliquid",
    network: "mainnet",
    walletRef,
    fundingAddress,
    vaultPublicKey,
    state: value.state as WalletVaultPublicState["state"],
    funded: value.funded,
    ...(intentId ? { intentId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

function publicErrorCode(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  return optionalString(body.error.code, ERROR_CODE_PATTERN);
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new WalletVaultError("VAULT_RESPONSE_TOO_LARGE", "Wallet Vault response exceeded 1 MiB.");
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new WalletVaultError("VAULT_RESPONSE_TOO_LARGE", "Wallet Vault response exceeded 1 MiB.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new WalletVaultError("VAULT_RESPONSE_TOO_LARGE", "Wallet Vault response exceeded 1 MiB.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

export class WalletVaultClient {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 30_000, 1_000), 120_000);
  }

  private async post(path: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<WalletVaultPublicState> {
    const controller = new AbortController();
    const abort = (): void => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort(signal.reason);
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    try {
      if (controller.signal.aborted) {
        throw new WalletVaultError("WALLET_VAULT_ABORTED", "Wallet Vault operation was canceled.", true);
      }
      const response = await this.fetchFn(`${WALLET_VAULT_ORIGIN}${path}`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: controller.signal,
      });
      const text = await readBoundedResponseText(response);
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid JSON.");
      }
      if (!response.ok) {
        const code = publicErrorCode(body) ?? "WALLET_VAULT_UNAVAILABLE";
        throw new WalletVaultError(
          code,
          "Agent Wallet Vault could not complete the requested operation.",
          response.status >= 500,
        );
      }
      return parseWalletVaultResponse(body);
    } catch (error) {
      if (error instanceof WalletVaultError) throw error;
      if (signal?.aborted) {
        throw new WalletVaultError("WALLET_VAULT_ABORTED", "Wallet Vault operation was canceled.", true);
      }
      throw new WalletVaultError(
        controller.signal.aborted ? "WALLET_VAULT_TIMEOUT" : "WALLET_VAULT_UNAVAILABLE",
        controller.signal.aborted
          ? "Wallet Vault operation timed out."
          : "Agent Wallet Vault is unavailable.",
        true,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  prepare(signal?: AbortSignal): Promise<WalletVaultPublicState> {
    return this.post(
      "/v1/wallets/prepare",
      {
        exchange: "hyperliquid",
        network: "mainnet",
        wallet_ref: HYPERLIQUID_WALLET_REF,
      },
      signal,
    );
  }

  connect(wallet: WalletVaultPublicState, intent: AgentWalletIntent, signal?: AbortSignal): Promise<WalletVaultPublicState> {
    if (
      wallet.state !== "ready"
      || wallet.network !== "mainnet"
      || intent.exchange !== wallet.exchange
      || intent.network !== wallet.network
      || intent.walletRef !== wallet.walletRef
      || intent.fundingAddress !== wallet.fundingAddress
    ) {
      throw new WalletVaultError("WALLET_INTENT_MISMATCH", "Browser wallet intent does not match the Vault wallet.");
    }
    return this.post(
      "/v1/wallets/connect",
      {
        intent_id: intent.intentId,
        exchange: intent.exchange,
        network: intent.network,
        wallet_ref: intent.walletRef,
        funding_address: intent.fundingAddress,
        vault_public_key: wallet.vaultPublicKey,
        challenge: intent.challenge,
        expires_at_ms: intent.expiresAtMs,
      },
      signal,
    );
  }
}

export function isHyperliquidConnectRequest(request: HeyTradersRequest): boolean {
  if (request.command.trim().toLowerCase() !== "exchange connect") return false;
  const keys = Object.keys(request.args);
  if (keys.some((key) => key !== "exchange")) {
    throw new WalletVaultError(
      "INVALID_EXCHANGE_CONNECT_ARGS",
      "exchange connect accepts only the canonical exchange selector.",
    );
  }
  return typeof request.args.exchange === "string"
    && request.args.exchange.trim().toLowerCase() === "hyperliquid";
}

export function parseAgentWalletIntent(value: unknown, requireChallenge: boolean): AgentWalletIntent {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid wallet intent state.");
  }
  assertNoSensitiveFields(value);
  const allowedEnvelopeFields = new Set([
    "ok",
    "protocolVersion",
    "domain",
    "action",
    "data",
    "presentation",
  ]);
  if (Object.keys(value).some((key) => !allowedEnvelopeFields.has(key))) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned unknown wallet intent state.");
  }
  const data = value.data;
  const allowedDataFields = new Set([
    "intentId",
    "exchange",
    "network",
    "walletRef",
    "fundingAddress",
    "state",
    "expiresAtMs",
    "challenge",
    "accountId",
    "errorCode",
  ]);
  if (Object.keys(data).some((key) => !allowedDataFields.has(key))) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned unknown wallet intent state.");
  }
  const intentId = optionalString(data.intentId, UUID_PATTERN);
  const walletRef = optionalString(data.walletRef, WALLET_REF_PATTERN);
  const fundingAddress = optionalString(data.fundingAddress, ADDRESS_PATTERN);
  const challenge = optionalString(data.challenge);
  const accountId = optionalString(data.accountId);
  const errorCode = optionalString(data.errorCode, ERROR_CODE_PATTERN);
  if (
    !intentId
    || value.protocolVersion !== 2
    || value.domain !== "exchange"
    || value.action !== (requireChallenge ? "prepare" : "status")
    || data.exchange !== "hyperliquid"
    || data.network !== "mainnet"
    || !walletRef
    || !fundingAddress
    || typeof data.state !== "string"
    || !Number.isSafeInteger(data.expiresAtMs)
    || (data.expiresAtMs as number) <= 0
    || (requireChallenge && !challenge)
  ) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid wallet intent state.");
  }
  return {
    intentId,
    exchange: "hyperliquid",
    network: "mainnet",
    walletRef,
    fundingAddress,
    state: data.state,
    expiresAtMs: data.expiresAtMs as number,
    challenge: challenge ?? "",
    ...(accountId ? { accountId } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

function connectionResult(wallet: WalletVaultPublicState): Record<string, unknown> {
  const completed = wallet.state === "completed";
  return {
    ok: true,
    protocolVersion: 2,
    domain: "exchange",
    action: "connect",
    data: {
      exchange: "hyperliquid",
      network: "mainnet",
      walletRef: wallet.walletRef,
      fundingAddress: wallet.fundingAddress,
      state: wallet.state,
      funded: wallet.funded,
      connected: completed,
      ...(wallet.intentId ? { intentId: wallet.intentId } : {}),
      ...(wallet.accountId ? { accountId: wallet.accountId } : {}),
      ...(!completed
        ? {
            nextAction:
              "Fund this address with USDC on Hyperliquid mainnet, then run exchange connect again.",
          }
        : { credentialStored: true, verificationRequired: true }),
    },
    presentation: {
      canonicalCommand: "exchange connect",
      commandId: "exchange.connect",
    },
  };
}

export async function orchestrateHyperliquidWallet(params: {
  client: WalletVaultClient;
  invokeAgentExchange: (input: Record<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const wallet = await params.client.prepare(params.signal);
  if (wallet.state === "awaiting_funding") return connectionResult(wallet);
  if (wallet.state !== "ready") {
    throw new WalletVaultError("WALLET_STATE_INVALID", "Agent wallet is not ready for connection.");
  }
  const prepared = parseAgentWalletIntent(
    await params.invokeAgentExchange({
      operation: "prepare",
      exchange: "hyperliquid",
      network: "mainnet",
      walletRef: wallet.walletRef,
      fundingAddress: wallet.fundingAddress,
      vaultPublicKey: wallet.vaultPublicKey,
    }),
    true,
  );
  const completed = await params.client.connect(wallet, prepared, params.signal);
  if (completed.state === "awaiting_funding") return connectionResult(completed);
  if (completed.state !== "completed" || !completed.accountId) {
    throw new WalletVaultError("WALLET_CONNECTION_UNCONFIRMED", "Wallet Vault did not confirm connection.", true);
  }
  const status = parseAgentWalletIntent(
    await params.invokeAgentExchange({ operation: "status", intentId: prepared.intentId }),
    false,
  );
  if (status.state !== "completed" || status.accountId !== completed.accountId) {
    throw new WalletVaultError(
      "WALLET_CONNECTION_UNCONFIRMED",
      "HeyTraders did not confirm the connected Agent wallet.",
      true,
    );
  }
  return connectionResult(completed);
}
