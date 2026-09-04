import {
  chmodSync,
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicKey, verify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentIdentityError,
  getAgentIdentityPath,
  loadOrCreateAgentIdentity,
  signAgentChallenge,
} from "./agent-identity.js";

const temporaryDirectories: string[] = [];

function temporaryStateDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "heytraders-agent-identity-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("Agent identity persistence", () => {
  it("creates one private Ed25519 identity and reuses it", () => {
    const stateDir = temporaryStateDirectory();
    const first = loadOrCreateAgentIdentity(stateDir);
    const second = loadOrCreateAgentIdentity(stateDir);
    const path = getAgentIdentityPath(stateDir);

    expect(second).toEqual(first);
    expect(first.privateKeyPkcs8).not.toContain(first.publicKey);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(first);

    const challenge = "heytraders-agent-browser-auth-v1\nfixture";
    const signature = Buffer.from(signAgentChallenge(first, challenge), "base64url");
    const publicKey = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: first.publicKey },
      format: "jwk",
    });
    expect(verify(null, Buffer.from(challenge), publicKey, signature)).toBe(true);
  });

  it("fails closed instead of using an identity file with loose permissions", () => {
    const stateDir = temporaryStateDirectory();
    loadOrCreateAgentIdentity(stateDir);
    chmodSync(getAgentIdentityPath(stateDir), 0o644);

    expect(() => loadOrCreateAgentIdentity(stateDir)).toThrowError(
      expect.objectContaining<Partial<AgentIdentityError>>({
        code: "UNSAFE_AGENT_IDENTITY_PERMISSIONS",
      }),
    );
  });

  it("fails closed instead of silently replacing a corrupt identity", () => {
    const stateDir = temporaryStateDirectory();
    const identity = loadOrCreateAgentIdentity(stateDir);
    const path = getAgentIdentityPath(stateDir);
    const corrupted = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    corrupted.publicKey = Buffer.alloc(32, 1).toString("base64url");
    const descriptor = openSync(path, "w", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify(corrupted));
    } finally {
      closeSync(descriptor);
    }

    expect(() => loadOrCreateAgentIdentity(stateDir)).toThrowError(
      expect.objectContaining<Partial<AgentIdentityError>>({ code: "INVALID_AGENT_IDENTITY" }),
    );
    expect(identity.publicKey).not.toBe(corrupted.publicKey);
  });
});
