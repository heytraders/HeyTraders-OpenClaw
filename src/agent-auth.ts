import { createHash } from "node:crypto";

import {
  loadOrCreateAgentIdentity,
  signAgentChallenge,
  type AgentIdentity,
} from "./agent-identity.js";

const AUTH_PROTOCOL = "heytraders-agent-browser-auth-v1";
const MAX_CHALLENGE_LIFETIME_SECONDS = 5 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/u;

export class AgentAuthenticationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentAuthenticationError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

export type AgentSessionIdentity = {
  authenticated: true;
  userId: string;
  agentId: string;
  created: boolean;
};

export type AgentAuthInvoker = (input: JsonRecord) => Promise<unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSuccessData(value: unknown): JsonRecord {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    const code = isRecord(value) && isRecord(value.error) && typeof value.error.code === "string"
      ? value.error.code
      : "AGENT_AUTH_RESPONSE_INVALID";
    throw new AgentAuthenticationError(code, "HeyTraders Agent authentication was rejected.");
  }
  return value.data;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AgentAuthenticationError(
      "AGENT_AUTH_RESPONSE_INVALID",
      `HeyTraders returned an invalid ${field}.`,
    );
  }
  return value.toLowerCase();
}

function identityFingerprint(identity: AgentIdentity): string {
  return createHash("sha256").update(Buffer.from(identity.publicKey, "base64url")).digest("base64url");
}

function validateChallenge(
  data: JsonRecord,
  identity: AgentIdentity,
  appOrigin: string,
): { challengeId: string; challenge: string } {
  const challengeId = requireUuid(data.challenge_id, "challenge id");
  if (data.algorithm !== "Ed25519" || typeof data.challenge !== "string") {
    throw new AgentAuthenticationError(
      "AGENT_AUTH_RESPONSE_INVALID",
      "HeyTraders returned an invalid Agent challenge.",
    );
  }
  if (
    typeof data.expires_at !== "number" ||
    !Number.isSafeInteger(data.expires_at) ||
    data.expires_at <= Math.floor(Date.now() / 1000) ||
    data.expires_at > Math.floor(Date.now() / 1000) + MAX_CHALLENGE_LIFETIME_SECONDS
  ) {
    throw new AgentAuthenticationError(
      "AGENT_AUTH_CHALLENGE_EXPIRED",
      "HeyTraders returned an expired or invalid Agent challenge.",
    );
  }

  const lines = data.challenge.split("\n");
  const expected = [
    AUTH_PROTOCOL,
    `origin:${appOrigin}`,
    `key:${identityFingerprint(identity)}`,
    `client:${identity.clientInstanceId}`,
  ];
  if (
    lines.length !== 5 ||
    expected.some((line, index) => lines[index] !== line) ||
    !lines[4]?.startsWith("nonce:") ||
    !NONCE_RE.test(lines[4].slice("nonce:".length))
  ) {
    throw new AgentAuthenticationError(
      "AGENT_AUTH_CHALLENGE_MISMATCH",
      "HeyTraders returned a challenge that does not match this Agent identity and origin.",
    );
  }
  return { challengeId, challenge: data.challenge };
}

function readAuthenticatedSession(data: JsonRecord, created: boolean): AgentSessionIdentity {
  return {
    authenticated: true,
    userId: requireUuid(data.userId, "user id"),
    agentId: requireUuid(data.agentId, "Agent id"),
    created,
  };
}

export async function ensureAgentBrowserSession(params: {
  appOrigin: string;
  displayName: string;
  stateDir: string;
  invoke: AgentAuthInvoker;
  prepareAuthentication?: () => Promise<void>;
}): Promise<AgentSessionIdentity> {
  const status = readSuccessData(await params.invoke({ operation: "status" }));
  if (status.authenticated === true) {
    return readAuthenticatedSession(status, false);
  }
  if (status.authenticated !== false) {
    throw new AgentAuthenticationError(
      "AGENT_AUTH_RESPONSE_INVALID",
      "HeyTraders returned an invalid Agent session status.",
    );
  }
  if (status.authSource && status.authSource !== "agent_session") {
    throw new AgentAuthenticationError(
      "AGENT_BROWSER_SESSION_CONFLICT",
      "The managed browser contains a human session; use a dedicated Agent browser profile.",
    );
  }

  await params.prepareAuthentication?.();

  const identity = loadOrCreateAgentIdentity(params.stateDir);
  const challengeData = readSuccessData(
    await params.invoke({
      operation: "challenge",
      publicKey: identity.publicKey,
      clientInstanceId: identity.clientInstanceId,
      displayName: params.displayName,
    }),
  );
  const { challengeId, challenge } = validateChallenge(
    challengeData,
    identity,
    params.appOrigin,
  );
  const completion = readSuccessData(
    await params.invoke({
      operation: "complete",
      challengeId,
      signature: signAgentChallenge(identity, challenge),
    }),
  );
  return readAuthenticatedSession(completion, completion.created === true);
}

export const __agentAuthInternalsForTests = {
  identityFingerprint,
  readSuccessData,
  validateChallenge,
};
