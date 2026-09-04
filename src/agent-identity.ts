import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { randomUUID } from "node:crypto";

const IDENTITY_DIRECTORY = "heytraders";
const IDENTITY_FILENAME = "agent-identity-v1.json";
const MAX_IDENTITY_BYTES = 16 * 1024;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/u;

export class AgentIdentityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentIdentityError";
    this.code = code;
  }
}

export type AgentIdentity = {
  version: 1;
  algorithm: "Ed25519";
  clientInstanceId: string;
  publicKey: string;
  privateKeyPkcs8: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64Url(value: string): Buffer {
  if (!value || !BASE64URL_RE.test(value)) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity is invalid.");
  }
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) {
      throw new Error("non-canonical base64url");
    }
    return decoded;
  } catch (error) {
    if (error instanceof AgentIdentityError) throw error;
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity is invalid.");
  }
}

function validateUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    value,
  );
}

function rawPublicKey(publicKey: ReturnType<typeof createPublicKey>): string {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Agent public key is not Ed25519.");
  }
  return jwk.x;
}

function validateIdentity(value: unknown): AgentIdentity {
  if (!isRecord(value)) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity is invalid.");
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "algorithm",
    "clientInstanceId",
    "createdAt",
    "privateKeyPkcs8",
    "publicKey",
    "version",
  ].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity has unknown fields.");
  }
  if (
    value.version !== 1 ||
    value.algorithm !== "Ed25519" ||
    typeof value.clientInstanceId !== "string" ||
    !validateUuid(value.clientInstanceId) ||
    typeof value.publicKey !== "string" ||
    typeof value.privateKeyPkcs8 !== "string" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt))
  ) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity is invalid.");
  }
  const publicBytes = decodeBase64Url(value.publicKey);
  if (publicBytes.byteLength !== 32) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent public key is invalid.");
  }
  const privateKey = createPrivateKey({
    key: decodeBase64Url(value.privateKeyPkcs8),
    format: "der",
    type: "pkcs8",
  });
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent private key is invalid.");
  }
  if (rawPublicKey(createPublicKey(privateKey)) !== value.publicKey) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent key pair does not match.");
  }
  return value as AgentIdentity;
}

function assertPrivatePath(path: string, expectedMode: number, kind: "file" | "directory"): void {
  const stat = lstatSync(path);
  if ((kind === "file" && !stat.isFile()) || (kind === "directory" && !stat.isDirectory())) {
    throw new AgentIdentityError("UNSAFE_AGENT_IDENTITY_PATH", `Agent identity ${kind} is invalid.`);
  }
  if ((stat.mode & 0o077) !== 0 || (stat.mode & 0o700) !== expectedMode) {
    throw new AgentIdentityError(
      "UNSAFE_AGENT_IDENTITY_PERMISSIONS",
      `Agent identity ${kind} permissions must be ${expectedMode.toString(8)}.`,
    );
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new AgentIdentityError("UNSAFE_AGENT_IDENTITY_OWNER", `Agent identity ${kind} owner is invalid.`);
  }
}

function identityPath(stateDir: string): string {
  if (!stateDir || !stateDir.startsWith("/")) {
    throw new AgentIdentityError("INVALID_STATE_DIRECTORY", "OpenClaw state directory is invalid.");
  }
  return join(stateDir, IDENTITY_DIRECTORY, IDENTITY_FILENAME);
}

function readIdentity(path: string): AgentIdentity {
  assertPrivatePath(dirname(path), PRIVATE_DIRECTORY_MODE, "directory");
  assertPrivatePath(path, PRIVATE_FILE_MODE, "file");
  const stat = lstatSync(path);
  if (stat.size <= 0 || stat.size > MAX_IDENTITY_BYTES) {
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity size is invalid.");
  }
  try {
    return validateIdentity(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof AgentIdentityError) throw error;
    throw new AgentIdentityError("INVALID_AGENT_IDENTITY", "Stored Agent identity cannot be read.");
  }
}

function generateIdentity(): AgentIdentity {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    version: 1,
    algorithm: "Ed25519",
    clientInstanceId: randomUUID(),
    publicKey: rawPublicKey(publicKey),
    privateKeyPkcs8: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
}

function createIdentityAtomically(path: string, identity: AgentIdentity): AgentIdentity {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertPrivatePath(directory, PRIVATE_DIRECTORY_MODE, "directory");
  const temporaryPath = join(directory, `.${IDENTITY_FILENAME}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      PRIVATE_FILE_MODE,
    );
    writeFileSync(descriptor, `${JSON.stringify(identity)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporaryPath, path);
    } catch (error) {
      const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
      if (code !== "EEXIST") throw error;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return readIdentity(path);
}

export function loadOrCreateAgentIdentity(stateDir: string): AgentIdentity {
  const path = identityPath(stateDir);
  if (existsSync(path)) return readIdentity(path);
  return createIdentityAtomically(path, generateIdentity());
}

export function signAgentChallenge(identity: AgentIdentity, challenge: string): string {
  const validated = validateIdentity(identity);
  const privateKey = createPrivateKey({
    key: decodeBase64Url(validated.privateKeyPkcs8),
    format: "der",
    type: "pkcs8",
  });
  return sign(null, Buffer.from(challenge, "utf8"), privateKey).toString("base64url");
}

export function getAgentIdentityPath(stateDir: string): string {
  return identityPath(stateDir);
}
