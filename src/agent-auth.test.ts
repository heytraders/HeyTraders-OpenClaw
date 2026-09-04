import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { AgentAuthenticationError, ensureAgentBrowserSession } from "./agent-auth.js";

const USER_ID = "7d50b461-5031-4f25-b70f-89ec7f6bd6d1";
const AGENT_ID = "16e3c6cb-a999-4acc-ae27-a80a730b91a8";
const CHALLENGE_ID = "4d2e32c4-0936-429b-a15f-b11df48d3920";
const ORIGIN = "https://hey-traders.com";
const temporaryDirectories: string[] = [];

function stateDirectory(): string {
  const value = mkdtempSync(join(tmpdir(), "heytraders-auth-flow-"));
  temporaryDirectories.push(value);
  return value;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("Agent browser authentication", () => {
  it("signs only the canonical origin-bound challenge and establishes a session", async () => {
    let challenge = "";
    let publicKey = "";
    const operations: string[] = [];

    const session = await ensureAgentBrowserSession({
      appOrigin: ORIGIN,
      displayName: "OpenClaw Runtime",
      stateDir: stateDirectory(),
      invoke: async (input) => {
        operations.push(String(input.operation));
        if (input.operation === "status") {
          return { ok: true, data: { authenticated: false } };
        }
        if (input.operation === "challenge") {
          publicKey = String(input.publicKey);
          const fingerprint = createHash("sha256")
            .update(Buffer.from(publicKey, "base64url"))
            .digest("base64url");
          challenge = [
            "heytraders-agent-browser-auth-v1",
            `origin:${ORIGIN}`,
            `key:${fingerprint}`,
            `client:${String(input.clientInstanceId)}`,
            `nonce:${Buffer.alloc(32, 7).toString("base64url")}`,
          ].join("\n");
          return {
            ok: true,
            data: {
              challenge_id: CHALLENGE_ID,
              challenge,
              expires_at: Math.floor(Date.now() / 1000) + 120,
              algorithm: "Ed25519",
            },
          };
        }
        if (input.operation === "complete") {
          const key = createPublicKey({
            key: { kty: "OKP", crv: "Ed25519", x: publicKey },
            format: "jwk",
          });
          expect(
            verify(
              null,
              Buffer.from(challenge),
              key,
              Buffer.from(String(input.signature), "base64url"),
            ),
          ).toBe(true);
          return {
            ok: true,
            data: { userId: USER_ID, agentId: AGENT_ID, created: true },
          };
        }
        throw new Error("unexpected operation");
      },
    });

    expect(session).toEqual({
      authenticated: true,
      userId: USER_ID,
      agentId: AGENT_ID,
      created: true,
    });
    expect(operations).toEqual(["status", "challenge", "complete"]);
  });

  it("reuses an authenticated browser session without loading or creating a key", async () => {
    const missingStateDir = join(tmpdir(), `missing-${Date.now()}`);
    const session = await ensureAgentBrowserSession({
      appOrigin: ORIGIN,
      displayName: "OpenClaw Runtime",
      stateDir: missingStateDir,
      invoke: async (input) => {
        expect(input).toEqual({ operation: "status" });
        return {
          ok: true,
          data: { authenticated: true, userId: USER_ID, agentId: AGENT_ID },
        };
      },
    });

    expect(session.created).toBe(false);
  });

  it("refuses to sign a challenge for another origin", async () => {
    await expect(
      ensureAgentBrowserSession({
        appOrigin: ORIGIN,
        displayName: "OpenClaw Runtime",
        stateDir: stateDirectory(),
        invoke: async (input) => {
          if (input.operation === "status") {
            return { ok: true, data: { authenticated: false } };
          }
          if (input.operation === "challenge") {
            const fingerprint = createHash("sha256")
              .update(Buffer.from(String(input.publicKey), "base64url"))
              .digest("base64url");
            return {
              ok: true,
              data: {
                challenge_id: CHALLENGE_ID,
                challenge: [
                  "heytraders-agent-browser-auth-v1",
                  "origin:https://evil.example",
                  `key:${fingerprint}`,
                  `client:${String(input.clientInstanceId)}`,
                  `nonce:${Buffer.alloc(32, 9).toString("base64url")}`,
                ].join("\n"),
                expires_at: Math.floor(Date.now() / 1000) + 120,
                algorithm: "Ed25519",
              },
            };
          }
          throw new Error("The mismatched challenge must not reach completion.");
        },
      }),
    ).rejects.toMatchObject<Partial<AgentAuthenticationError>>({
      code: "AGENT_AUTH_CHALLENGE_MISMATCH",
    });
  });
});
