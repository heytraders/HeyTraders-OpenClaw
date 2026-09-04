import {
  PublicResponseSafetyError,
  assertNoSensitivePublicFields,
} from "./public-response-safety.js";

export const WALLET_VAULT_ORIGIN = "http://agent-wallet-vault:8091";
export const WALLET_EXCHANGES = [
  "hyperliquid",
  "extended",
  "lighter",
  "polymarketperp",
  "polymarket",
] as const;
export const CEX_EXCHANGES = ["binance", "binancefutures"] as const;
export type WalletExchange = (typeof WALLET_EXCHANGES)[number];
export type CexExchange = (typeof CEX_EXCHANGES)[number];
export type AgentExchange = WalletExchange | CexExchange;
export const WALLET_REFS: Record<WalletExchange, string> = {
  hyperliquid: "hyperliquid-main",
  extended: "extended-main",
  lighter: "lighter-main",
  polymarketperp: "polymarketperp-main",
  polymarket: "polymarket-main",
};
export const HYPERLIQUID_WALLET_REF = WALLET_REFS.hyperliquid;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/u;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const WALLET_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/u;
const PUBLIC_STATES = new Set(["awaiting_funding", "ready", "completed"]);

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WalletVaultPublicState = {
  exchange: WalletExchange;
  network: "mainnet";
  walletRef: string;
  fundingAddress: string;
  venueFundingAddress?: string;
  vaultPublicKey: string;
  state: "awaiting_funding" | "ready" | "completed";
  funded: boolean;
  intentId?: string;
  accountId?: string;
  errorCode?: string;
};

export type WalletSigningRequest =
  | { type: "personal_sign"; label: string; data: string }
  | { type: "eip712"; label: string; data: Record<string, unknown> };

export type AgentWalletIntent = {
  intentId: string;
  exchange: AgentExchange;
  network: "mainnet";
  walletRef: string;
  fundingAddress: string;
  venueFundingAddress?: string;
  state: string;
  expiresAtMs: number;
  challenge: string;
  completionType:
    | "hyperliquid_agent"
    | "wallet_signatures"
    | "polymarket_provision"
    | "operator_credentials";
  signingRequests: WalletSigningRequest[];
  accountId?: string;
  errorCode?: string;
};

export type OperatorHandoffPublicState = {
  exchange: CexExchange;
  state: "awaiting_operator";
  setupUrl: string;
  expiresAtMs: number;
};

export type OperatorIdentityPublicState = {
  exchange: CexExchange;
  network: "mainnet";
  walletRef: string;
  identityAddress: string;
  vaultPublicKey: string;
  state: "ready";
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

function assertNoSensitiveFields(value: unknown): void {
  try {
    assertNoSensitivePublicFields(value);
  } catch (error) {
    if (error instanceof PublicResponseSafetyError) {
      throw new WalletVaultError(
        error.reason === "sensitive-field" ? "VAULT_RESPONSE_UNSAFE" : "VAULT_RESPONSE_INVALID",
        error.reason === "sensitive-field"
          ? "Wallet Vault returned a credential-shaped field."
          : "Wallet Vault response is too deeply nested.",
      );
    }
    throw error;
  }
}

function optionalString(value: unknown, pattern?: RegExp): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return value;
}

function isWalletExchange(value: unknown): value is WalletExchange {
  return typeof value === "string" && (WALLET_EXCHANGES as readonly string[]).includes(value);
}

function isCexExchange(value: unknown): value is CexExchange {
  return typeof value === "string" && (CEX_EXCHANGES as readonly string[]).includes(value);
}

export function parseWalletVaultResponse(
  value: unknown,
  expectedExchange: WalletExchange = "hyperliquid",
): WalletVaultPublicState {
  assertNoSensitiveFields(value);
  if (!isRecord(value)) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  const allowed = new Set([
    "exchange",
    "network",
    "wallet_ref",
    "funding_address",
    "venue_funding_address",
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
  const venueFundingAddress = optionalString(value.venue_funding_address, ADDRESS_PATTERN);
  const vaultPublicKey = optionalString(value.vault_public_key, PUBLIC_KEY_PATTERN);
  const intentId = optionalString(value.intent_id, UUID_PATTERN);
  const accountId = optionalString(value.account_id);
  const errorCode = optionalString(value.error_code, ERROR_CODE_PATTERN);
  if (
    !isWalletExchange(value.exchange)
    || value.exchange !== expectedExchange
    || value.network !== "mainnet"
    || !walletRef
    || !fundingAddress
    || !vaultPublicKey
    || typeof value.state !== "string"
    || !PUBLIC_STATES.has(value.state)
    || typeof value.funded !== "boolean"
    || (value.exchange === "polymarket" && value.state === "completed" && !venueFundingAddress)
    || (value.state !== "completed" && venueFundingAddress !== undefined)
    || (value.state === "awaiting_funding" && value.funded)
    || (value.exchange === "hyperliquid"
      && (value.state === "ready" || value.state === "completed")
      && !value.funded)
    || (value.state === "completed" && !accountId)
  ) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return {
    exchange: value.exchange,
    network: "mainnet",
    walletRef,
    fundingAddress,
    ...(venueFundingAddress ? { venueFundingAddress } : {}),
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

export function parseOperatorHandoffResponse(
  value: unknown,
  expectedExchange: CexExchange,
): OperatorHandoffPublicState {
  assertNoSensitiveFields(value);
  if (!isRecord(value)) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  const allowed = new Set(["exchange", "state", "setup_url", "expires_at_ms"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned unknown public state.");
  }
  const setupUrl = optionalString(value.setup_url);
  let parsedSetupUrl: URL;
  try {
    parsedSetupUrl = new URL(setupUrl ?? "");
  } catch {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned an invalid setup URL.");
  }
  const handoffPathPrefix = "/operator-handoffs/";
  const handoffId = parsedSetupUrl.pathname.startsWith(handoffPathPrefix)
    ? parsedSetupUrl.pathname.slice(handoffPathPrefix.length)
    : "";
  if (
    !isCexExchange(value.exchange)
    || value.exchange !== expectedExchange
    || value.state !== "awaiting_operator"
    || !setupUrl
    || parsedSetupUrl.protocol !== "http:"
    || parsedSetupUrl.hostname !== "127.0.0.1"
    || !parsedSetupUrl.port
    || parsedSetupUrl.username !== ""
    || parsedSetupUrl.password !== ""
    || !UUID_PATTERN.test(handoffId)
    || parsedSetupUrl.search !== ""
    || parsedSetupUrl.hash !== ""
    || !Number.isSafeInteger(value.expires_at_ms)
    || (value.expires_at_ms as number) <= 0
  ) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return {
    exchange: value.exchange,
    state: "awaiting_operator",
    setupUrl,
    expiresAtMs: value.expires_at_ms as number,
  };
}

export function parseOperatorIdentityResponse(
  value: unknown,
  expectedExchange: CexExchange,
): OperatorIdentityPublicState {
  assertNoSensitiveFields(value);
  if (!isRecord(value)) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  const allowed = new Set([
    "exchange",
    "network",
    "wallet_ref",
    "identity_address",
    "vault_public_key",
    "state",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned unknown public state.");
  }
  const walletRef = optionalString(value.wallet_ref, WALLET_REF_PATTERN);
  const identityAddress = optionalString(value.identity_address, ADDRESS_PATTERN);
  const vaultPublicKey = optionalString(value.vault_public_key, PUBLIC_KEY_PATTERN);
  if (
    !isCexExchange(value.exchange)
    || value.exchange !== expectedExchange
    || value.network !== "mainnet"
    || value.state !== "ready"
    || !walletRef
    || !identityAddress
    || !vaultPublicKey
  ) {
    throw new WalletVaultError("VAULT_RESPONSE_INVALID", "Wallet Vault returned invalid public state.");
  }
  return {
    exchange: value.exchange,
    network: "mainnet",
    walletRef,
    identityAddress,
    vaultPublicKey,
    state: "ready",
  };
}

export class WalletVaultClient {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 30_000, 1_000), 120_000);
  }

  private async postJson(
    path: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
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
      return body;
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

  prepare(signal?: AbortSignal): Promise<WalletVaultPublicState>;
  prepare(exchange: WalletExchange, signal?: AbortSignal): Promise<WalletVaultPublicState>;
  async prepare(
    exchangeOrSignal?: WalletExchange | AbortSignal,
    optionalSignal?: AbortSignal,
  ): Promise<WalletVaultPublicState> {
    const exchange = typeof exchangeOrSignal === "string" ? exchangeOrSignal : "hyperliquid";
    const signal = typeof exchangeOrSignal === "string" ? optionalSignal : exchangeOrSignal;
    const body = await this.postJson(
      "/v1/wallets/prepare",
      {
        exchange,
        network: "mainnet",
        wallet_ref: WALLET_REFS[exchange],
      },
      signal,
    );
    return parseWalletVaultResponse(body, exchange);
  }

  async connect(
    wallet: WalletVaultPublicState,
    intent: AgentWalletIntent,
    signal?: AbortSignal,
  ): Promise<WalletVaultPublicState> {
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
    const body = await this.postJson(
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
        completion_type: intent.completionType,
        signing_requests: intent.signingRequests.map((request) => (
          request.type === "personal_sign"
            ? { type: request.type, label: request.label, data: request.data }
            : { type: request.type, label: request.label, data: request.data }
        )),
      },
      signal,
    );
    return parseWalletVaultResponse(body, wallet.exchange);
  }

  async prepareCredentialIdentity(
    exchange: CexExchange,
    signal?: AbortSignal,
  ): Promise<OperatorIdentityPublicState> {
    const body = await this.postJson(
      "/v1/operator-handoffs/identity",
      { exchange, network: "mainnet" },
      signal,
    );
    return parseOperatorIdentityResponse(body, exchange);
  }

  async prepareCredentialHandoff(
    identity: OperatorIdentityPublicState,
    intent: AgentWalletIntent,
    signal?: AbortSignal,
  ): Promise<OperatorHandoffPublicState> {
    if (
      intent.exchange !== identity.exchange
      || intent.network !== "mainnet"
      || intent.walletRef !== identity.walletRef
      || intent.fundingAddress !== identity.identityAddress
      || intent.completionType !== "operator_credentials"
      || intent.signingRequests.length !== 0
    ) {
      throw new WalletVaultError(
        "OPERATOR_INTENT_MISMATCH",
        "Browser operator intent does not match the Vault identity.",
      );
    }
    const body = await this.postJson(
      "/v1/operator-handoffs/prepare",
      {
        intent_id: intent.intentId,
        exchange: intent.exchange,
        network: intent.network,
        wallet_ref: intent.walletRef,
        funding_address: intent.fundingAddress,
        vault_public_key: identity.vaultPublicKey,
        challenge: intent.challenge,
        expires_at_ms: intent.expiresAtMs,
        completion_type: intent.completionType,
        signing_requests: [],
      },
      signal,
    );
    return parseOperatorHandoffResponse(body, identity.exchange);
  }
}

function defaultCompletionType(exchange: AgentExchange): AgentWalletIntent["completionType"] {
  if (exchange === "hyperliquid") return "hyperliquid_agent";
  if (exchange === "polymarket") return "polymarket_provision";
  if (isCexExchange(exchange)) return "operator_credentials";
  return "wallet_signatures";
}

function parseSigningRequests(value: unknown): WalletSigningRequest[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
    }
    const label = optionalString(item.label);
    if (!label || label.length > 120) {
      throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
    }
    if (item.type === "personal_sign") {
      if (
        Object.keys(item).some((key) => !["type", "label", "data"].includes(key))
        || typeof item.data !== "string"
        || !item.data
        || item.data.length > 65_536
      ) {
        throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
      }
      return { type: "personal_sign", label, data: item.data };
    }
    if (item.type === "eip712") {
      if (
        Object.keys(item).some((key) => !["type", "label", "data"].includes(key))
        || !isRecord(item.data)
        || JSON.stringify(item.data).length > 262_144
      ) {
        throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
      }
      return { type: "eip712", label, data: item.data };
    }
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid signing requests.");
  });
}

export function parseAgentWalletIntent(
  value: unknown,
  requireChallenge: boolean,
  expectedExchange: AgentExchange = "hyperliquid",
): AgentWalletIntent {
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
    "venueFundingAddress",
    "state",
    "expiresAtMs",
    "challenge",
    "completionType",
    "signingRequests",
    "accountId",
    "errorCode",
  ]);
  if (Object.keys(data).some((key) => !allowedDataFields.has(key))) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned unknown wallet intent state.");
  }
  const intentId = optionalString(data.intentId, UUID_PATTERN);
  const walletRef = optionalString(data.walletRef, WALLET_REF_PATTERN);
  const fundingAddress = optionalString(data.fundingAddress, ADDRESS_PATTERN);
  const venueFundingAddress = optionalString(data.venueFundingAddress, ADDRESS_PATTERN);
  const challenge = optionalString(data.challenge);
  const accountId = optionalString(data.accountId);
  const errorCode = optionalString(data.errorCode, ERROR_CODE_PATTERN);
  const rawCompletionType = data.completionType ?? defaultCompletionType(expectedExchange);
  const completionType = rawCompletionType === "hyperliquid_agent"
    || rawCompletionType === "wallet_signatures"
    || rawCompletionType === "polymarket_provision"
    || rawCompletionType === "operator_credentials"
    ? rawCompletionType
    : undefined;
  const signingRequests = parseSigningRequests(data.signingRequests);
  const expectedCompletionType = defaultCompletionType(expectedExchange);
  if (
    !intentId
    || value.protocolVersion !== 2
    || value.domain !== "exchange"
    || value.action !== (
      requireChallenge
        ? (isCexExchange(expectedExchange) ? "prepare_operator" : "prepare")
        : "status"
    )
    || (!isWalletExchange(data.exchange) && !isCexExchange(data.exchange))
    || data.exchange !== expectedExchange
    || data.network !== "mainnet"
    || !walletRef
    || !fundingAddress
    || typeof data.state !== "string"
    || !Number.isSafeInteger(data.expiresAtMs)
    || (data.expiresAtMs as number) <= 0
    || (requireChallenge && !challenge)
    || !completionType
    || completionType !== expectedCompletionType
    || (
      data.exchange === "polymarket"
      && data.state === "completed"
      && !venueFundingAddress
    )
    || (data.state !== "completed" && venueFundingAddress !== undefined)
    || (requireChallenge && completionType === "wallet_signatures" && signingRequests.length === 0)
    || (!requireChallenge && signingRequests.length !== 0)
  ) {
    throw new WalletVaultError("WALLET_INTENT_INVALID", "HeyTraders returned invalid wallet intent state.");
  }
  return {
    intentId,
    exchange: data.exchange,
    network: "mainnet",
    walletRef,
    fundingAddress,
    ...(venueFundingAddress ? { venueFundingAddress } : {}),
    state: data.state,
    expiresAtMs: data.expiresAtMs as number,
    challenge: challenge ?? "",
    completionType,
    signingRequests,
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
      exchange: wallet.exchange,
      network: "mainnet",
      walletRef: wallet.walletRef,
      fundingAddress: wallet.fundingAddress,
      ...(wallet.venueFundingAddress
        ? { venueFundingAddress: wallet.venueFundingAddress }
        : {}),
      state: wallet.state,
      funded: wallet.funded,
      connected: completed,
      ...(wallet.intentId ? { intentId: wallet.intentId } : {}),
      ...(wallet.accountId ? { accountId: wallet.accountId } : {}),
      ...(!completed
        ? {
            nextAction:
              "Fund this address on the documented mainnet route, then run the same explicit walletAction create command again.",
            nextCommand: {
              command: "exchange connect",
              args: { exchange: wallet.exchange, walletAction: "create" },
            },
          }
        : { credentialStored: true, verificationRequired: true }),
    },
    presentation: {
      canonicalCommand: "exchange connect",
      commandId: "exchange.connect",
    },
  };
}

export async function orchestrateAgentWallet(params: {
  exchange: WalletExchange;
  client: WalletVaultClient;
  invokeAgentExchange: (input: Record<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const wallet = await params.client.prepare(params.exchange, params.signal);
  if (wallet.state === "awaiting_funding") return connectionResult(wallet);
  if (wallet.state !== "ready") {
    throw new WalletVaultError("WALLET_STATE_INVALID", "Agent wallet is not ready for connection.");
  }
  const prepared = parseAgentWalletIntent(
    await params.invokeAgentExchange({
      operation: "prepare",
      exchange: params.exchange,
      network: "mainnet",
      walletRef: wallet.walletRef,
      fundingAddress: wallet.fundingAddress,
      vaultPublicKey: wallet.vaultPublicKey,
    }),
    true,
    params.exchange,
  );
  const completed = await params.client.connect(wallet, prepared, params.signal);
  if (completed.state === "awaiting_funding") return connectionResult(completed);
  if (completed.state !== "completed" || !completed.accountId) {
    throw new WalletVaultError("WALLET_CONNECTION_UNCONFIRMED", "Wallet Vault did not confirm connection.", true);
  }
  const status = parseAgentWalletIntent(
    await params.invokeAgentExchange({ operation: "status", intentId: prepared.intentId }),
    false,
    params.exchange,
  );
  if (
    status.state !== "completed"
    || status.accountId !== completed.accountId
    || status.venueFundingAddress !== completed.venueFundingAddress
  ) {
    throw new WalletVaultError(
      "WALLET_CONNECTION_UNCONFIRMED",
      "HeyTraders did not confirm the connected Agent wallet.",
      true,
    );
  }
  return connectionResult(completed);
}
