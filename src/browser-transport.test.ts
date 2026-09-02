import { describe, expect, it, vi } from "vitest";

import {
  BrowserTransportError,
  assertSafeCdpHttpUrl,
  assertSafeCdpWebSocketUrl,
  decodeHeyTradersOutput,
  formatErrorForLog,
  invokeHeyTradersWebMcpTool,
  parseBrowserTabs,
  selectHeyTradersTab,
  type WebSocketFactory,
  type WebSocketLike,
} from "./browser-transport.js";

const canonicalTab = {
  targetId: "TARGET-1",
  title: "HeyTraders",
  type: "page",
  url: "https://hey-traders.com/dashboard",
  wsUrl: "ws://127.0.0.1:18800/devtools/page/TARGET-1",
  label: "heytraders",
};

describe("selectHeyTradersTab", () => {
  it("selects only the canonical production origin", () => {
    expect(
      selectHeyTradersTab([
        { ...canonicalTab, targetId: "EVIL", url: "https://hey-traders.com.evil.example/" },
        canonicalTab,
      ]),
    ).toEqual(canonicalTab);
  });

  it("fails closed when more than one canonical tab is eligible", () => {
    expect(() =>
      selectHeyTradersTab([canonicalTab, { ...canonicalTab, targetId: "TARGET-2" }]),
    ).toThrow(/multiple/i);
  });

  it("fails closed when the canonical tab is absent", () => {
    expect(() => selectHeyTradersTab([])).toThrow(BrowserTransportError);
  });
});

describe("parseBrowserTabs", () => {
  it("normalizes the raw Chrome CDP id and webSocketDebuggerUrl fields", () => {
    expect(
      parseBrowserTabs({
        tabs: [
          {
            id: "TARGET-1",
            title: "HeyTraders",
            type: "page",
            url: "https://hey-traders.com/",
            webSocketDebuggerUrl: "ws://127.0.0.1:18800/devtools/page/TARGET-1",
          },
        ],
      }),
    ).toEqual([
      {
        targetId: "TARGET-1",
        title: "HeyTraders",
        type: "page",
        url: "https://hey-traders.com/",
        wsUrl: "ws://127.0.0.1:18800/devtools/page/TARGET-1",
      },
    ]);
  });
});

describe("assertSafeCdpHttpUrl", () => {
  it("accepts an exact loopback CDP origin", () => {
    expect(assertSafeCdpHttpUrl("http://127.0.0.1:18800")).toBe("http://127.0.0.1:18800");
  });

  it.each([
    "https://127.0.0.1:18800",
    "http://localhost:18800",
    "http://attacker.example:18800",
    "http://user:pass@127.0.0.1:18800",
    "http://127.0.0.1:18800/path",
  ])("rejects an unsafe CDP HTTP URL: %s", (cdpUrl) => {
    expect(() => assertSafeCdpHttpUrl(cdpUrl)).toThrow(BrowserTransportError);
  });
});

describe("assertSafeCdpWebSocketUrl", () => {
  it("accepts the loopback page endpoint returned for the selected tab", () => {
    expect(assertSafeCdpWebSocketUrl(canonicalTab.wsUrl, canonicalTab.targetId)).toBe(
      canonicalTab.wsUrl,
    );
  });

  it.each([
    "ws://attacker.example/devtools/page/TARGET-1",
    "wss://127.0.0.1/devtools/page/TARGET-1",
    "ws://user:pass@127.0.0.1:18800/devtools/page/TARGET-1",
    "ws://127.0.0.1:18800/devtools/browser/TARGET-1",
    "ws://127.0.0.1:18800/devtools/page/OTHER",
  ])("rejects an unsafe CDP URL: %s", (wsUrl) => {
    expect(() => assertSafeCdpWebSocketUrl(wsUrl, canonicalTab.targetId)).toThrow(
      BrowserTransportError,
    );
  });
});

describe("decodeHeyTradersOutput", () => {
  it("decodes the canonical single text JSON response", () => {
    expect(
      decodeHeyTradersOutput({ content: [{ type: "text", text: '{"ok":true,"data":{"ready":true}}' }] }),
    ).toEqual({ ok: true, data: { ready: true } });
  });

  it("preserves a non-canonical WebMCP response", () => {
    const output = { content: [{ type: "image", data: "not-returned-by-heytraders" }] };
    expect(decodeHeyTradersOutput(output)).toBe(output);
  });

  it("does not execute or coerce invalid text", () => {
    const output = { content: [{ type: "text", text: "not-json" }] };
    expect(decodeHeyTradersOutput(output)).toBe(output);
  });

  it("preserves a structured application error", () => {
    const error = {
      ok: false,
      error: { code: "NOT_READY", message: "The requested gateway is not ready." },
    };
    expect(
      decodeHeyTradersOutput({
        content: [{ type: "text", text: JSON.stringify(error) }],
      }),
    ).toEqual(error);
  });

  it("preserves a visible user-action handoff", () => {
    const handoff = {
      ok: false,
      userActionRequired: {
        kind: "login",
        message: "Complete login in the visible HeyTraders browser.",
      },
    };
    expect(
      decodeHeyTradersOutput({
        content: [{ type: "text", text: JSON.stringify(handoff) }],
      }),
    ).toEqual(handoff);
  });
});

describe("formatErrorForLog", () => {
  it("logs only the fixed error type and code", () => {
    const error = new BrowserTransportError(
      "WEBMCP_PROTOCOL_ERROR",
      "Bearer short-secret from ws://127.0.0.1:18800/devtools/page/private",
    );

    expect(formatErrorForLog(error)).toBe(
      "BrowserTransportError [WEBMCP_PROTOCOL_ERROR]",
    );
  });

  it("does not log unknown error messages", () => {
    expect(formatErrorForLog(new Error("user-provided value"))).toBe(
      "Error [HEYTRADERS_ADAPTER_ERROR]",
    );
  });
});

type FakeWebSocketOptions = {
  advertisedFrameId?: string;
  advertisedToolName?: string;
  closeBeforeResponse?: boolean;
  errorText?: string;
  mainFrameUrl?: string;
  navigateAfterFrameTree?: boolean;
  respond?: boolean;
  responseOutput?: unknown;
  responseStatus?: "Completed" | "Canceled" | "Error";
};

class FakeWebSocket implements WebSocketLike {
  readonly sent: Array<Record<string, unknown>> = [];
  readonly invocationInput: Array<unknown> = [];
  private readonly listeners = new Map<string, Array<(event: Event | MessageEvent) => void>>();

  constructor(private readonly options: FakeWebSocketOptions = {}) {}

  addEventListener(type: string, listener: (event: Event | MessageEvent) => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  send(data: string): void {
    const request = JSON.parse(data) as {
      id: number;
      method: string;
      params?: { input?: unknown };
    };
    this.sent.push(request);

    if (request.method === "Page.enable") {
      queueMicrotask(() => this.emitMessage({ id: request.id, result: {} }));
      return;
    }

    if (request.method === "Page.getFrameTree") {
      queueMicrotask(() => {
        this.emitMessage({
          id: request.id,
          result: {
            frameTree: {
              frame: {
                id: canonicalTab.targetId,
                url: this.options.mainFrameUrl ?? canonicalTab.url,
              },
            },
          },
        });
        if (this.options.navigateAfterFrameTree) {
          this.emitMessage({
            method: "Page.frameNavigated",
            params: {
              frame: {
                id: canonicalTab.targetId,
                url: "https://example.com/",
              },
            },
          });
        }
      });
      return;
    }

    if (request.method === "WebMCP.enable") {
      queueMicrotask(() => {
        this.emitMessage({ id: request.id, result: {} });
        this.emitMessage({
          method: "WebMCP.toolsAdded",
          params: {
            tools: [
              {
                name: this.options.advertisedToolName ?? "heytraders_cli",
                frameId: this.options.advertisedFrameId ?? canonicalTab.targetId,
                inputSchema: { type: "object" },
              },
            ],
          },
        });
      });
      return;
    }

    if (request.method === "WebMCP.invokeTool") {
      this.invocationInput.push(request.params?.input);
      if (this.options.closeBeforeResponse) {
        queueMicrotask(() => this.close());
        return;
      }
      if (this.options.respond === false) return;
      queueMicrotask(() => {
        this.emitMessage({ id: request.id, result: { invocationId: "INVOCATION-1" } });
        this.emitMessage({
          method: "WebMCP.toolResponded",
          params: {
            invocationId: "INVOCATION-1",
            status: this.options.responseStatus ?? "Completed",
            output:
              this.options.responseOutput ??
              { content: [{ type: "text", text: '{"ok":true,"data":{"ready":true}}' }] },
            ...(this.options.errorText ? { errorText: this.options.errorText } : {}),
          },
        });
      });
    }
  }

  close(): void {
    this.emit("close", new Event("close"));
  }

  open(): void {
    this.emit("open", new Event("open"));
  }

  private emitMessage(message: unknown): void {
    this.emit("message", new MessageEvent("message", { data: JSON.stringify(message) }));
  }

  private emit(type: string, event: Event | MessageEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("invokeHeyTradersWebMcpTool", () => {
  it("binds WebMCP invocation to the canonical top-level frame", async () => {
    const socket = new FakeWebSocket();
    const createWebSocket: WebSocketFactory = vi.fn(() => {
      queueMicrotask(() => socket.open());
      return socket;
    });

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).resolves.toEqual({
      status: "Completed",
      output: { content: [{ type: "text", text: '{"ok":true,"data":{"ready":true}}' }] },
    });

    expect(socket.sent.map((request) => request.method)).toEqual([
      "Page.enable",
      "Page.getFrameTree",
      "WebMCP.enable",
      "WebMCP.invokeTool",
    ]);
    expect(socket.invocationInput).toEqual([{ command: "help", args: {} }]);
  });

  it("preserves a structured WebMCP error status", async () => {
    const socket = new FakeWebSocket({
      responseStatus: "Error",
      errorText: "HeyTraders rejected the command.",
    });
    const createWebSocket: WebSocketFactory = () => {
      queueMicrotask(() => socket.open());
      return socket;
    };

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "status", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).resolves.toEqual({
      status: "Error",
      errorText: "HeyTraders rejected the command.",
      output: { content: [{ type: "text", text: '{"ok":true,"data":{"ready":true}}' }] },
    });
  });

  it("fails closed when the page does not advertise the HeyTraders facade", async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeWebSocket({ advertisedToolName: "unrelated_tool" });
      const createWebSocket: WebSocketFactory = () => {
        queueMicrotask(() => socket.open());
        return socket;
      };
      const invocation = invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      });
      const rejection = expect(invocation).rejects.toMatchObject({ code: "WEBMCP_TIMEOUT" });

      await vi.runAllTimersAsync();
      await rejection;
      expect(socket.sent.map((request) => request.method)).toEqual([
        "Page.enable",
        "Page.getFrameTree",
        "WebMCP.enable",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invoke a same-name tool registered by a child frame", async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeWebSocket({ advertisedFrameId: "CHILD-FRAME" });
      const createWebSocket: WebSocketFactory = () => {
        queueMicrotask(() => socket.open());
        return socket;
      };
      const invocation = invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      });
      const rejection = expect(invocation).rejects.toMatchObject({ code: "WEBMCP_TIMEOUT" });

      await vi.runAllTimersAsync();
      await rejection;
      expect(socket.invocationInput).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a main frame that moved off the canonical origin", async () => {
    const socket = new FakeWebSocket({ mainFrameUrl: "https://example.com/" });
    const createWebSocket: WebSocketFactory = () => {
      queueMicrotask(() => socket.open());
      return socket;
    };

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).rejects.toMatchObject({ code: "HEYTRADERS_ORIGIN_CHANGED", retryable: true });
  });

  it("rejects top-level navigation after frame binding", async () => {
    const socket = new FakeWebSocket({ navigateAfterFrameTree: true });
    const createWebSocket: WebSocketFactory = () => {
      queueMicrotask(() => socket.open());
      return socket;
    };

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).rejects.toMatchObject({ code: "HEYTRADERS_TAB_NAVIGATED", retryable: true });
  });

  it("fails when the selected tab closes before responding", async () => {
    const socket = new FakeWebSocket({ closeBeforeResponse: true });
    const createWebSocket: WebSocketFactory = () => {
      queueMicrotask(() => socket.open());
      return socket;
    };

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "help", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).rejects.toMatchObject({ code: "WEBMCP_SOCKET_CLOSED", retryable: true });
  });
});
