import type { HeyTradersRequest } from "./request-contract.js";

export type CredentialBindingConfig = {
  ref: string;
  exchange: string;
  kind: "cex_api_key" | "dex_extended";
  accountName?: string;
  apiKeyEnv?: string;
  secretEnv?: string;
  credentialEnv?: Record<string, string>;
};

export type ExchangeConnectSelector = {
  exchange: string;
  connectionRef?: string;
};

export type PrivateExchangeConnectRequest = {
  operation: "connect";
  exchange: string;
  accountName?: string;
  credential:
    | { kind: "cex_api_key"; apiKey: string; secret: string }
    | { kind: "dex_extended"; fields: Record<string, string> };
};

const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const EXCHANGE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const ENVIRONMENT_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/u;
const CREDENTIAL_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const UNSAFE_FIELDS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_BINDINGS = 50;
const MAX_CREDENTIAL_FIELDS = 32;
const MAX_SECRET_LENGTH = 16 * 1024;

export class CredentialBindingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CredentialBindingError";
    this.code = code;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeExchange(value: unknown): string {
  const exchange = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EXCHANGE_PATTERN.test(exchange)) {
    throw new CredentialBindingError(
      "INVALID_EXCHANGE_SELECTOR",
      "exchange connect requires one canonical exchange identifier.",
    );
  }
  return exchange;
}

function normalizeReference(value: unknown, field: string): string {
  const reference = typeof value === "string" ? value.trim() : "";
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `${field} must be a safe 1 to 64 character identifier.`,
    );
  }
  return reference;
}

function normalizeEnvironmentName(value: unknown, field: string): string {
  const environmentName = typeof value === "string" ? value.trim() : "";
  if (!ENVIRONMENT_NAME_PATTERN.test(environmentName)) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `${field} must name an uppercase environment variable.`,
    );
  }
  return environmentName;
}

function normalizeAccountName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const accountName = typeof value === "string" ? value.trim() : "";
  if (!accountName || accountName.length > 80) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      "credentialBindings accountName must contain 1 to 80 characters.",
    );
  }
  return accountName;
}

function normalizeCredentialEnvironment(
  value: unknown,
  bindingRef: string,
): Record<string, string> {
  if (!isPlainRecord(value)) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `DEX binding ${bindingRef} requires credentialEnv field mappings.`,
    );
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_CREDENTIAL_FIELDS) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `DEX binding ${bindingRef} must map 1 to ${MAX_CREDENTIAL_FIELDS} credential fields.`,
    );
  }
  const normalized: Record<string, string> = {};
  for (const [rawField, environmentName] of entries) {
    const field = rawField.trim();
    if (!CREDENTIAL_FIELD_PATTERN.test(field) || UNSAFE_FIELDS.has(field)) {
      throw new CredentialBindingError(
        "INVALID_CREDENTIAL_BINDING",
        `DEX binding ${bindingRef} contains an invalid credential field name.`,
      );
    }
    normalized[field] = normalizeEnvironmentName(
      environmentName,
      `credentialBindings[${bindingRef}].credentialEnv.${field}`,
    );
  }
  return normalized;
}

function normalizeBindings(value: unknown): CredentialBindingConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_BINDINGS) {
    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `credentialBindings must contain at most ${MAX_BINDINGS} entries.`,
    );
  }

  const references = new Set<string>();
  return value.map((rawBinding, index) => {
    if (!isPlainRecord(rawBinding)) {
      throw new CredentialBindingError(
        "INVALID_CREDENTIAL_BINDING",
        `credentialBindings[${index}] must be an object.`,
      );
    }
    const allowed = new Set([
      "ref",
      "exchange",
      "kind",
      "accountName",
      "apiKeyEnv",
      "secretEnv",
      "credentialEnv",
    ]);
    const unsupported = Object.keys(rawBinding).find((key) => !allowed.has(key));
    if (unsupported) {
      throw new CredentialBindingError(
        "INVALID_CREDENTIAL_BINDING",
        `credentialBindings[${index}] contains unsupported field ${unsupported}.`,
      );
    }

    const ref = normalizeReference(rawBinding.ref, `credentialBindings[${index}].ref`);
    if (references.has(ref)) {
      throw new CredentialBindingError(
        "DUPLICATE_CREDENTIAL_BINDING",
        `credentialBindings contains duplicate ref ${ref}.`,
      );
    }
    references.add(ref);
    const exchange = normalizeExchange(rawBinding.exchange);
    const accountName = normalizeAccountName(rawBinding.accountName);

    if (rawBinding.kind === "cex_api_key") {
      if (rawBinding.credentialEnv !== undefined) {
        throw new CredentialBindingError(
          "INVALID_CREDENTIAL_BINDING",
          `CEX binding ${ref} cannot define credentialEnv.`,
        );
      }
      return {
        ref,
        exchange,
        kind: "cex_api_key",
        ...(accountName ? { accountName } : {}),
        apiKeyEnv: normalizeEnvironmentName(
          rawBinding.apiKeyEnv,
          `credentialBindings[${ref}].apiKeyEnv`,
        ),
        secretEnv: normalizeEnvironmentName(
          rawBinding.secretEnv,
          `credentialBindings[${ref}].secretEnv`,
        ),
      };
    }

    if (rawBinding.kind === "dex_extended") {
      if (rawBinding.apiKeyEnv !== undefined || rawBinding.secretEnv !== undefined) {
        throw new CredentialBindingError(
          "INVALID_CREDENTIAL_BINDING",
          `DEX binding ${ref} cannot define CEX key fields.`,
        );
      }
      return {
        ref,
        exchange,
        kind: "dex_extended",
        ...(accountName ? { accountName } : {}),
        credentialEnv: normalizeCredentialEnvironment(rawBinding.credentialEnv, ref),
      };
    }

    throw new CredentialBindingError(
      "INVALID_CREDENTIAL_BINDING",
      `credentialBindings[${ref}] has an unsupported kind.`,
    );
  });
}

function readSecret(
  environment: Record<string, string | undefined>,
  environmentName: string,
): string {
  const value = environment[environmentName];
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new CredentialBindingError(
      "CREDENTIAL_ENV_MISSING",
      `Required credential environment variable ${environmentName} is not set.`,
    );
  }
  if (normalized.length > MAX_SECRET_LENGTH) {
    throw new CredentialBindingError(
      "CREDENTIAL_ENV_INVALID",
      `Credential environment variable ${environmentName} exceeds the supported size.`,
    );
  }
  return normalized;
}

export function readExchangeConnectSelector(
  request: HeyTradersRequest,
): ExchangeConnectSelector | null {
  if (request.command.trim().toLowerCase() !== "exchange connect") return null;
  const unsupported = Object.keys(request.args).find(
    (key) => key !== "exchange" && key !== "connectionRef",
  );
  if (unsupported) {
    throw new CredentialBindingError(
      "INVALID_EXCHANGE_CONNECT_ARGS",
      `exchange connect does not accept field ${unsupported}.`,
    );
  }
  const exchange = normalizeExchange(request.args.exchange);
  const connectionRef = request.args.connectionRef === undefined
    ? undefined
    : normalizeReference(request.args.connectionRef, "args.connectionRef");
  return { exchange, ...(connectionRef ? { connectionRef } : {}) };
}

export function resolvePrivateExchangeConnectRequest(params: {
  selector: ExchangeConnectSelector;
  bindings: unknown;
  environment: Record<string, string | undefined>;
}): PrivateExchangeConnectRequest {
  const bindings = normalizeBindings(params.bindings);
  const candidates = bindings.filter(
    (binding) => binding.exchange === params.selector.exchange,
  );
  const selected = params.selector.connectionRef
    ? candidates.find((binding) => binding.ref === params.selector.connectionRef)
    : candidates.length === 1
      ? candidates[0]
      : undefined;

  if (!selected) {
    if (!params.selector.connectionRef && candidates.length > 1) {
      throw new CredentialBindingError(
        "CREDENTIAL_BINDING_AMBIGUOUS",
        `Multiple local bindings exist for ${params.selector.exchange}; set args.connectionRef to one of: ${candidates.map((binding) => binding.ref).join(", ")}.`,
      );
    }
    throw new CredentialBindingError(
      "CREDENTIAL_BINDING_NOT_FOUND",
      `No local credential binding matches ${params.selector.exchange}${params.selector.connectionRef ? ` and ref ${params.selector.connectionRef}` : ""}.`,
    );
  }

  if (selected.kind === "cex_api_key") {
    return {
      operation: "connect",
      exchange: selected.exchange,
      ...(selected.accountName ? { accountName: selected.accountName } : {}),
      credential: {
        kind: "cex_api_key",
        apiKey: readSecret(params.environment, selected.apiKeyEnv!),
        secret: readSecret(params.environment, selected.secretEnv!),
      },
    };
  }

  const fields: Record<string, string> = {};
  for (const [field, environmentName] of Object.entries(selected.credentialEnv!)) {
    fields[field] = readSecret(params.environment, environmentName);
  }
  return {
    operation: "connect",
    exchange: selected.exchange,
    ...(selected.accountName ? { accountName: selected.accountName } : {}),
    credential: { kind: "dex_extended", fields },
  };
}
