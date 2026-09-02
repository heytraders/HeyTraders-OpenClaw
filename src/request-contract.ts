export type HeyTradersRequest = {
  command: string;
  args: Record<string, unknown>;
};

const MAX_COMMAND_LENGTH = 512;
const MAX_VALUE_DEPTH = 24;
const MAX_VISITED_VALUES = 10_000;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const CREDENTIAL_KEY_FRAGMENTS = [
  "accesstoken",
  "apikey",
  "apisecret",
  "apitoken",
  "authorization",
  "authtoken",
  "bearertoken",
  "clientsecret",
  "cookie",
  "credential",
  "csrftoken",
  "idtoken",
  "localstorage",
  "mnemonic",
  "oauthtoken",
  "passphrase",
  "password",
  "privatekey",
  "recoveryphrase",
  "refreshtoken",
  "secret",
  "seedphrase",
  "sessionstorage",
  "sessiontoken",
  "signature",
  "verificationtoken",
] as const;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export class RequestContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RequestContractError";
    this.code = code;
  }
}

function normalizeObjectKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isCredentialBearingKey(key: string): boolean {
  const normalizedKey = normalizeObjectKey(key);
  return (
    normalizedKey === "token" ||
    normalizedKey === "jwt" ||
    CREDENTIAL_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))
  );
}

function assertSafeJsonValue(
  value: unknown,
  path: string,
  depth: number,
  visitedObjects: WeakSet<object>,
  visitCount: { value: number },
): void {
  visitCount.value += 1;
  if (visitCount.value > MAX_VISITED_VALUES) {
    throw new RequestContractError("ARGS_TOO_LARGE", "HeyTraders args exceed the safe value limit.");
  }
  if (depth > MAX_VALUE_DEPTH) {
    throw new RequestContractError("ARGS_TOO_DEEP", "HeyTraders args exceed the safe nesting limit.");
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RequestContractError("INVALID_ARGS", `${path} must contain only finite numbers.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new RequestContractError("INVALID_ARGS", `${path} must be JSON-serializable.`);
  }
  if (visitedObjects.has(value)) {
    throw new RequestContractError("INVALID_ARGS", `${path} must not contain circular references.`);
  }
  visitedObjects.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeJsonValue(item, `${path}[${index}]`, depth + 1, visitedObjects, visitCount),
    );
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RequestContractError("INVALID_ARGS", `${path} must contain only plain objects.`);
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      throw new RequestContractError("UNSAFE_OBJECT_KEY", `Unsafe object key rejected at ${path}.`);
    }
    if (isCredentialBearingKey(key)) {
      throw new RequestContractError(
        "CREDENTIAL_TRANSPORT_REJECTED",
        `Credential-bearing field rejected at ${path}; enter credentials only in the HeyTraders UI.`,
      );
    }
    assertSafeJsonValue(nestedValue, `${path}.${key}`, depth + 1, visitedObjects, visitCount);
  }
}

export function normalizeHeyTradersRequest(value: unknown): HeyTradersRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestContractError("INVALID_REQUEST", "HeyTraders request must be an object.");
  }

  const request = value as { command?: unknown; args?: unknown };
  if (typeof request.command !== "string") {
    throw new RequestContractError("INVALID_COMMAND", "HeyTraders command must be a string.");
  }
  const command = request.command.trim();
  if (!command || command.length > MAX_COMMAND_LENGTH || CONTROL_CHARACTER_PATTERN.test(command)) {
    throw new RequestContractError(
      "INVALID_COMMAND",
      "HeyTraders command must be a non-empty selector without control characters.",
    );
  }

  const args = request.args === undefined ? {} : request.args;
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new RequestContractError("INVALID_ARGS", "HeyTraders args must be an object.");
  }
  assertSafeJsonValue(args, "args", 0, new WeakSet<object>(), { value: 0 });

  return { command, args: args as Record<string, unknown> };
}
