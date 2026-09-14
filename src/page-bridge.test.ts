import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import {
  invokeHeyTradersPageBridge,
  type HeyTradersPageBridgeMember,
  type WebSocketFactory,
  type WebSocketLike,
} from "./browser-transport.js";

const TARGET_ID = "TARGET-1";
const ORIGIN = "https://hey-traders.com";
const PAGE_URL = `${ORIGIN}/dashboard`;
const WS_URL = `ws://127.0.0.1:18800/devtools/page/${TARGET_ID}`;

type DirectBridgeSocketOptions = {
  bootstrapFromAboutBlank?: boolean;
  bridgeInstallDelayMs?: number;
  bridgeMembers?: HeyTradersPageBridgeMember[];
  bridgePresent?: boolean;
  bridgeVersion?: number;
  closeAfterDispatch?: boolean;
  mainFrameUrl?: string;
  malformedEvaluationResult?: boolean;
  navigateAfterDispatch?: boolean;
  respond?: boolean;
  throwOnDispatch?: boolean;
  windowOrigin?: string;
  onInvoke?: (input: unknown, member: HeyTradersPageBridgeMember) => unknown;
};

class DirectBridgeSocket implements WebSocketLike {
  readonly sent: Array<Record<string, unknown>> = [];
  readonly invocations: Array<{ input: unknown; member: HeyTradersPageBridgeMember }> = [];
  private readonly listeners = new Map<string, Array<(event: Event | MessageEvent) => void>>();

  constructor(private readonly options: DirectBridgeSocketOptions = {}) {}

  addEventListener(type: string, listener: (event: Event | MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    const request = JSON.parse(data) as {
      id: number;
      method: string;
      params?: { expression?: string; awaitPromise?: boolean; returnByValue?: boolean };
    };
    this.sent.push(request);

    if (request.method === "Page.enable") {
      queueMicrotask(() => this.message({ id: request.id, result: {} }));
      return;
    }
    if (request.method === "Page.getFrameTree") {
      queueMicrotask(() => {
        this.message({
          id: request.id,
          result: {
            frameTree: {
              frame: {
                id: TARGET_ID,
                url: this.options.bootstrapFromAboutBlank
                  ? "about:blank"
                  : (this.options.mainFrameUrl ?? PAGE_URL),
              },
            },
          },
        });
        if (this.options.bootstrapFromAboutBlank) {
          this.message({
            method: "Page.frameNavigated",
            params: { frame: { id: TARGET_ID, url: PAGE_URL } },
          });
        }
        if (this.options.navigateAfterDispatch) {
          this.message({
            method: "Page.frameNavigated",
            params: { frame: { id: TARGET_ID, url: "https://example.com/" } },
          });
        }
      });
      return;
    }
    if (request.method !== "Runtime.evaluate") return;
    if (this.options.throwOnDispatch) throw new Error("fixture dispatch failure");

    expect(request.params?.awaitPromise).toBe(true);
    expect(request.params?.returnByValue).toBe(true);
    const bridge: Record<string, unknown> = { version: this.options.bridgeVersion ?? 6 };
    for (const member of this.options.bridgeMembers ?? ["request", "agentAuth"]) {
      bridge[member] = (input: unknown): unknown => {
        this.invocations.push({ input, member });
        return this.options.onInvoke?.(input, member)
          ?? { ok: true, data: { member } };
      };
    }
    const windowValue: Record<string, unknown> = {
      location: {
        origin: this.options.windowOrigin
          ?? new URL(this.options.mainFrameUrl ?? PAGE_URL).origin,
      },
    };
    if (this.options.bridgePresent !== false) {
      if (this.options.bridgeInstallDelayMs === undefined) {
        windowValue.__bridge = bridge;
      } else {
        setTimeout(() => { windowValue.__bridge = bridge; }, this.options.bridgeInstallDelayMs);
      }
    }

    const evaluated = runInNewContext(String(request.params?.expression), {
      atob,
      Reflect,
      setTimeout,
      TextDecoder,
      Uint8Array,
      window: windowValue,
    }) as Promise<unknown>;
    void Promise.resolve(evaluated).then((value) => {
      if (this.options.closeAfterDispatch) {
        this.close();
        return;
      }
      if (this.options.respond === false) return;
      if (this.options.malformedEvaluationResult) {
        this.message({ id: request.id, result: { result: { type: "object" } } });
        return;
      }
      this.message({
        id: request.id,
        result: {
          result: {
            type: "object",
            value: JSON.parse(JSON.stringify(value)) as unknown,
          },
        },
      });
    }, () => {
      this.message({
        id: request.id,
        result: { exceptionDetails: { text: "page bridge evaluation failed" } },
      });
    });
  }

  close(): void {
    this.emit("close", new Event("close"));
  }

  open(): void {
    this.emit("open", new Event("open"));
  }

  private message(value: unknown): void {
    this.emit("message", new MessageEvent("message", { data: JSON.stringify(value) }));
  }

  private emit(type: string, event: Event | MessageEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function invoke(
  socket: DirectBridgeSocket,
  overrides: Partial<Parameters<typeof invokeHeyTradersPageBridge>[0]> = {},
): Promise<unknown> {
  return invokeHeyTradersPageBridge({
    wsUrl: WS_URL,
    targetId: TARGET_ID,
    expectedOrigin: ORIGIN,
    member: "request",
    input: { command: "help", args: {} },
    timeoutMs: 1_000,
    createWebSocket: () => {
      queueMicrotask(() => socket.open());
      return socket;
    },
    ...overrides,
  });
}

describe("direct HeyTraders page bridge", () => {
  it("round-trips request input using only Page and Runtime CDP commands", async () => {
    const socket = new DirectBridgeSocket();
    const input = { command: "help", args: { note: "한글 🌏 '); window.pwned = true; //" } };

    await expect(invoke(socket, { input })).resolves.toEqual({
      ok: true,
      data: { member: "request" },
    });

    expect(socket.sent.map((request) => request.method)).toEqual([
      "Page.enable",
      "Page.getFrameTree",
      "Runtime.evaluate",
    ]);
    expect(socket.sent.some((request) => request.method.startsWith("WebMCP."))).toBe(false);
    expect(JSON.stringify(socket.sent.at(-1))).not.toContain(String(input.args.note));
    expect(socket.invocations).toEqual([{ input, member: "request" }]);
  });

  it("invokes the fixed Agent-auth bridge member", async () => {
    const socket = new DirectBridgeSocket();
    const input = { operation: "status" };

    await expect(invoke(socket, { member: "agentAuth", input })).resolves.toEqual({
      ok: true,
      data: { member: "agentAuth" },
    });
    expect(socket.invocations).toEqual([{ input, member: "agentAuth" }]);
  });

  it("preserves structured application results unchanged", async () => {
    const result = { ok: false, error: { code: "NOT_READY", message: "Try later." } };
    const socket = new DirectBridgeSocket({ onInvoke: () => result });
    await expect(invoke(socket)).resolves.toEqual(result);
  });

  it("waits for a newly created about:blank target to reach the expected origin", async () => {
    const socket = new DirectBridgeSocket({ bootstrapFromAboutBlank: true });
    await expect(invoke(socket)).resolves.toMatchObject({ ok: true });
    expect(socket.sent.map((request) => request.method)).toEqual([
      "Page.enable",
      "Page.getFrameTree",
      "Runtime.evaluate",
    ]);
  });

  it("waits for a newly loaded page to install the versioned bridge", async () => {
    const socket = new DirectBridgeSocket({ bridgeInstallDelayMs: 10 });
    await expect(invoke(socket)).resolves.toMatchObject({ ok: true });
    expect(socket.invocations).toEqual([{
      input: { command: "help", args: {} },
      member: "request",
    }]);
  });

  it("rejects bridge version 5 before calling a page member", async () => {
    const socket = new DirectBridgeSocket({ bridgeVersion: 5 });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "HEYTRADERS_BRIDGE_UPGRADE_REQUIRED",
      retryable: false,
    });
    expect(socket.invocations).toEqual([]);
  });

  it("rejects a missing bridge before calling a page member", async () => {
    const socket = new DirectBridgeSocket({ bridgePresent: false });
    await expect(invoke(socket, { timeoutMs: 100 })).rejects.toMatchObject({
      code: "HEYTRADERS_BRIDGE_UNAVAILABLE",
      retryable: true,
    });
    expect(socket.invocations).toEqual([]);
  });

  it("rejects a missing fixed bridge member", async () => {
    const socket = new DirectBridgeSocket({ bridgeMembers: ["request"] });
    await expect(invoke(socket, { member: "agentAuth" })).rejects.toMatchObject({
      code: "HEYTRADERS_BRIDGE_MEMBER_UNAVAILABLE",
      retryable: false,
    });
    expect(socket.invocations).toEqual([]);
  });

  it("rejects an off-origin top frame without evaluating page code", async () => {
    const socket = new DirectBridgeSocket({ mainFrameUrl: "https://example.com/" });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "HEYTRADERS_ORIGIN_CHANGED",
      retryable: true,
    });
    expect(socket.sent.map((request) => request.method)).toEqual([
      "Page.enable",
      "Page.getFrameTree",
    ]);
  });

  it("rechecks origin inside the evaluated page before calling the bridge", async () => {
    const socket = new DirectBridgeSocket({ windowOrigin: "https://example.com" });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "HEYTRADERS_ORIGIN_CHANGED",
      retryable: true,
    });
    expect(socket.invocations).toEqual([]);
  });

  it("marks navigation after dispatch as an unknown outcome", async () => {
    const socket = new DirectBridgeSocket({ navigateAfterDispatch: true });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("marks a synchronous dispatch failure as an unknown outcome", async () => {
    const socket = new DirectBridgeSocket({ throwOnDispatch: true });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("marks a closed target after dispatch as an unknown outcome", async () => {
    const socket = new DirectBridgeSocket({ closeAfterDispatch: true });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("marks a malformed post-dispatch result as an unknown outcome", async () => {
    const socket = new DirectBridgeSocket({ malformedEvaluationResult: true });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("marks a page exception after dispatch as an unknown outcome", async () => {
    const socket = new DirectBridgeSocket({ onInvoke: () => { throw new Error("fixture"); } });
    await expect(invoke(socket)).rejects.toMatchObject({
      code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
      retryable: false,
    });
  });

  it("marks a post-dispatch timeout as an unknown outcome", async () => {
    vi.useFakeTimers();
    try {
      const socket = new DirectBridgeSocket({ respond: false });
      const pending = invoke(socket);
      const rejection = expect(pending).rejects.toMatchObject({
        code: "PAGE_BRIDGE_OUTCOME_UNKNOWN",
        retryable: false,
      });
      await vi.runAllTimersAsync();
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid members and inputs before opening CDP", async () => {
    const createWebSocket: WebSocketFactory = vi.fn(() => new DirectBridgeSocket());
    expect(() => invokeHeyTradersPageBridge({
      wsUrl: WS_URL,
      targetId: TARGET_ID,
      expectedOrigin: ORIGIN,
      member: "arbitrary" as HeyTradersPageBridgeMember,
      input: {},
      timeoutMs: 1_000,
      createWebSocket,
    })).toThrow(expect.objectContaining({ code: "INVALID_PAGE_BRIDGE_MEMBER" }));

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => invokeHeyTradersPageBridge({
      wsUrl: WS_URL,
      targetId: TARGET_ID,
      expectedOrigin: ORIGIN,
      member: "request",
      input: cyclic,
      timeoutMs: 1_000,
      createWebSocket,
    })).toThrow(expect.objectContaining({ code: "INVALID_PAGE_BRIDGE_INPUT" }));
    expect(createWebSocket).not.toHaveBeenCalled();
  });
});
