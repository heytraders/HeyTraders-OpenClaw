const SENSITIVE_KEY_FRAGMENTS = [
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

export class PublicResponseSafetyError extends Error {
  readonly reason: "depth" | "sensitive-field";

  constructor(reason: "depth" | "sensitive-field") {
    super(reason === "depth" ? "Public response is too deeply nested." : "Public response contains a sensitive field.");
    this.name = "PublicResponseSafetyError";
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertNoSensitivePublicFields(value: unknown, depth = 0): void {
  if (depth > 16) throw new PublicResponseSafetyError("depth");
  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitivePublicFields(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
    if (SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
      throw new PublicResponseSafetyError("sensitive-field");
    }
    assertNoSensitivePublicFields(nested, depth + 1);
  }
}
