import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserTransportError,
  assertSafeCdpHttpUrl,
  assertSafeCdpWebSocketUrl,
  decodeHeyTradersOutput,
  executeHeyTradersCommand,
  formatErrorForLog,
  invokeHeyTradersWebMcpTool,
  parseBrowserTabs,
  selectHeyTradersTab,
  type WebSocketFactory,
  type WebSocketLike,
  type BrowserTab,
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
  bootstrapFromAboutBlank?: boolean;
  closeBeforeResponse?: boolean;
  errorText?: string;
  mainFrameUrl?: string;
  navigateAfterFrameTree?: boolean;
  respond?: boolean;
  responseOutput?: unknown;
  responseStatus?: "Completed" | "Canceled" | "Error";
  onInvoke?: (input: unknown, toolName: string) => unknown;
  deferResponse?: (input: unknown, toolName: string, respond: () => void) => void;
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
      params?: { input?: unknown; toolName?: string };
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
                url: this.options.bootstrapFromAboutBlank
                  ? "about:blank"
                  : (this.options.mainFrameUrl ?? canonicalTab.url),
              },
            },
          },
        });
        if (this.options.bootstrapFromAboutBlank) {
          this.emitMessage({
            method: "Page.frameNavigated",
            params: {
              frame: {
                id: canonicalTab.targetId,
                url: canonicalTab.url,
              },
            },
          });
        }
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
            tools: (this.options.advertisedToolName === "*"
              ? ["heytraders_cli", "heytraders_agent_auth"]
              : [this.options.advertisedToolName ?? "heytraders_cli"]).map((name) => (
              {
                name,
                frameId: this.options.advertisedFrameId ?? canonicalTab.targetId,
                inputSchema: { type: "object" },
              }
            )),
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
      const respond = (): void => {
        this.emitMessage({ id: request.id, result: { invocationId: "INVOCATION-1" } });
        this.emitMessage({
          method: "WebMCP.toolResponded",
          params: {
            invocationId: "INVOCATION-1",
            status: this.options.responseStatus ?? "Completed",
            output:
              this.options.onInvoke?.(request.params?.input, String(request.params?.toolName)) ??
              this.options.responseOutput ??
              { content: [{ type: "text", text: '{"ok":true,"data":{"ready":true}}' }] },
            ...(this.options.errorText ? { errorText: this.options.errorText } : {}),
          },
        });
      };
      if (this.options.deferResponse) {
        this.options.deferResponse(request.params?.input, String(request.params?.toolName), respond);
      } else {
        queueMicrotask(respond);
      }
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

  it("waits for a newly-created about:blank tab to reach HeyTraders", async () => {
    const socket = new FakeWebSocket({ bootstrapFromAboutBlank: true });
    const createWebSocket: WebSocketFactory = vi.fn(() => {
      queueMicrotask(() => socket.open());
      return socket;
    });

    await expect(
      invokeHeyTradersWebMcpTool({
        wsUrl: canonicalTab.wsUrl,
        targetId: canonicalTab.targetId,
        input: { command: "status", args: {} },
        timeoutMs: 1_000,
        createWebSocket,
      }),
    ).resolves.toMatchObject({ status: "Completed" });

    expect(socket.sent.map((request) => request.method)).toEqual([
      "Page.enable",
      "Page.getFrameTree",
      "WebMCP.enable",
      "WebMCP.invokeTool",
    ]);
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
    ).rejects.toMatchObject({ code: "WEBMCP_OUTCOME_UNKNOWN", retryable: false });
  });
});

const temporaryStateDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryStateDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function workTabHarness(initialUrl = "https://hey-traders.com/agent") {
  const stateDir = mkdtempSync(join(tmpdir(), "heytraders-work-tab-"));
  temporaryStateDirectories.push(stateDir);
  const state = {
    tabs: [{ ...canonicalTab, url: initialUrl }] as BrowserTab[],
    authenticated: true,
    humanSession: false,
    userId: "7d50b461-5031-4f25-b70f-89ec7f6bd6d1",
    agentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
    createdTabs: 0,
    authChecks: 0,
    rejectCommand: false,
    rejectNavigation: false,
    deferNextCommand: false,
    deferred: [] as Array<() => void>,
    commands: [] as Array<{ targetId: string; url: string; input: Record<string, unknown> }>,
  };
  const runtimeConfig = {
    gateway: { port: 18_789 },
    browser: { enabled: true, profiles: { openclaw: { cdpPort: 18_800 } } },
  };
  const options = {
    stateDir,
    fetch: vi.fn(async (input: string | URL) => {
      if (String(input).includes("/json/new?")) {
        state.createdTabs += 1;
        const targetId = `NEW-${state.createdTabs}`;
        const tab = {
          ...canonicalTab, targetId,
          url: "https://hey-traders.com/agent",
          wsUrl: `ws://127.0.0.1:18800/devtools/page/${targetId}`,
        };
        state.tabs.push(tab);
        return Response.json(tab);
      }
      return Response.json(state.tabs);
    }),
    createWebSocket: vi.fn((url: string) => {
      const tab = state.tabs.find((candidate) => candidate.wsUrl === url);
      if (!tab) throw new Error("Selected tab is absent");
      const socket = new FakeWebSocket({
        advertisedToolName: "*",
        mainFrameUrl: tab.url,
        deferResponse: (_input, toolName, respond) => {
          if (toolName === "heytraders_cli" && state.deferNextCommand) {
            state.deferNextCommand = false;
            state.deferred.push(respond);
          } else {
            queueMicrotask(respond);
          }
        },
        onInvoke: (rawInput, toolName) => {
          const input = rawInput as Record<string, unknown>;
          if (toolName === "heytraders_agent_auth") {
            if (input.operation === "status") {
              state.authChecks += 1;
              return { ok: true, data: {
                authenticated: state.authenticated && !state.humanSession,
                ...(state.humanSession ? { authSource: "supabase" } : {}),
                ...(state.authenticated ? { userId: state.userId, agentId: state.agentId } : {}),
              } };
            }
            expect(new URL(tab.url).pathname).toBe("/agent");
            if (input.operation === "challenge") {
              const fingerprint = createHash("sha256")
                .update(Buffer.from(String(input.publicKey), "base64url")).digest("base64url");
              return { ok: true, data: {
                challenge_id: "4d2e32c4-0936-429b-a15f-b11df48d3920",
                challenge: ["heytraders-agent-browser-auth-v1", "origin:https://hey-traders.com",
                  `key:${fingerprint}`, `client:${String(input.clientInstanceId)}`,
                  `nonce:${Buffer.alloc(32, 7).toString("base64url")}`].join("\n"),
                expires_at: Math.floor(Date.now() / 1000) + 120,
                algorithm: "Ed25519",
              } };
            }
            state.authenticated = true;
            return { ok: true, data: { userId: state.userId, agentId: state.agentId, created: false } };
          }
          state.commands.push({ targetId: tab.targetId, url: tab.url, input });
          if (input.command === "nav") {
            if (state.rejectNavigation) return { ok: false, error: "navigation-runtime-not-ready" };
            tab.url = new URL(String((input.args as Record<string, unknown>).target), tab.url).href;
            const { pathname, search, hash } = new URL(tab.url);
            return { ok: true, data: { locationMatched: true, location: { pathname, search, hash } } };
          }
          return state.rejectCommand
            ? { ok: false, error: "authentication-required" }
            : { ok: true, data: { state: "user-action-required" } };
        },
      });
      queueMicrotask(() => socket.open());
      return socket;
    }),
  };
  return {
    state, options,
    call: (request: unknown, signal?: AbortSignal) => executeHeyTradersCommand(
      request, { timeoutMs: 1_000 }, runtimeConfig, { ...options, ...(signal ? { signal } : {}) },
    ),
  };
}

describe("Agent work-tab lifecycle", () => {
  it("keeps the same work tab after navigation and ignores unrelated bootstrap tabs", async () => {
    const h = workTabHarness();
    await h.call({ command: "nav", args: { target: "/dashboard/settings/exchanges" } });
    h.state.tabs.push({ ...canonicalTab, targetId: "UNRELATED", url: "https://hey-traders.com/agent",
      wsUrl: "ws://127.0.0.1:18800/devtools/page/UNRELATED" });
    await h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } });
    expect(h.state.createdTabs).toBe(0);
    expect(h.state.commands.at(-1)).toMatchObject({ targetId: "TARGET-1",
      url: "https://hey-traders.com/dashboard/settings/exchanges" });
  });

  it("resumes an existing authenticated dashboard without opening /agent", async () => {
    const h = workTabHarness("https://hey-traders.com/dashboard/settings/exchanges");
    await h.call({ command: "status" });
    expect(h.state.createdTabs).toBe(0);
    expect(h.state.commands[0].targetId).toBe("TARGET-1");
  });

  it("serializes simultaneous calls before choosing or creating a work tab", async () => {
    const h = workTabHarness();
    h.state.tabs = [];
    await Promise.all([
      h.call({ command: "nav", args: { target: "/dashboard/settings/exchanges" } }),
      h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } }),
    ]);
    expect(h.state.createdTabs).toBe(1);
    expect(h.state.commands.at(-1)?.url).toBe("https://hey-traders.com/dashboard/settings/exchanges");
  });

  it("rejects ambiguity before adopting a work tab", async () => {
    const h = workTabHarness();
    h.state.tabs.push({ ...canonicalTab, targetId: "OTHER" });
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "AMBIGUOUS_HEYTRADERS_TAB" });
    expect(h.options.createWebSocket).not.toHaveBeenCalled();
  });

  it("fails closed if its bound tab leaves the allowed origin", async () => {
    const h = workTabHarness();
    await h.call({ command: "status" });
    h.state.tabs[0].url = "https://example.com/";
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "HEYTRADERS_ORIGIN_CHANGED" });
    expect(h.state.createdTabs).toBe(0);
  });

  it("replaces a closed tab only when no other eligible tab is open", async () => {
    const h = workTabHarness();
    await h.call({ command: "status" });
    h.state.tabs = [];
    await h.call({ command: "status" });
    expect(h.state.createdTabs).toBe(1);
    expect(h.state.commands.at(-1)?.targetId).toBe("NEW-1");
  });

  it("reauthenticates in the same tab and restores the full work route before dispatch", async () => {
    const workUrl = "https://hey-traders.com/dashboard/settings/exchanges?view=all#connections";
    const h = workTabHarness(workUrl);
    h.state.authenticated = false;
    await h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } });
    expect(h.state.createdTabs).toBe(0);
    expect(h.state.commands.map((entry) => entry.input.command)).toEqual(["nav", "nav", "exchange connect"]);
    expect(h.state.commands.at(-1)).toMatchObject({ targetId: "TARGET-1", url: workUrl });
  });

  it("does not replace a human session with an Agent session", async () => {
    const h = workTabHarness();
    h.state.humanSession = true;
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "AGENT_BROWSER_SESSION_CONFLICT" });
    expect(h.state.commands).toEqual([]);
  });

  it("rejects an account switch in the bound browser session", async () => {
    const h = workTabHarness();
    await h.call({ command: "status" });
    h.state.agentId = "a1391cdf-8a74-4f9b-8eea-1b59baf23e6a";
    await expect(h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } }))
      .rejects.toMatchObject({ code: "AGENT_BROWSER_SESSION_CHANGED" });
    expect(h.state.commands).toHaveLength(1);
  });

  it("never retries a command that the application already received", async () => {
    const h = workTabHarness();
    h.state.rejectCommand = true;
    await expect(h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } }))
      .resolves.toEqual({ ok: false, error: "authentication-required" });
    expect(h.state.commands).toHaveLength(1);
  });

  it("does not start a canceled call and allows the following call to proceed", async () => {
    const h = workTabHarness();
    const controller = new AbortController();
    controller.abort();
    await expect(h.call({ command: "status" }, controller.signal))
      .rejects.toMatchObject({ code: "WEBMCP_ABORTED" });
    expect(h.options.fetch).not.toHaveBeenCalled();
    await h.call({ command: "status" });
    expect(h.state.commands).toHaveLength(1);
  });

  it("holds the browser queue after caller cancellation until the dispatched command finishes", async () => {
    const h = workTabHarness();
    h.state.deferNextCommand = true;
    const controller = new AbortController();
    const first = h.call({ command: "nav", args: { target: "/dashboard/settings/exchanges" } }, controller.signal);
    await vi.waitFor(() => expect(h.state.deferred).toHaveLength(1));
    const canceled = expect(first).rejects.toMatchObject({ code: "WEBMCP_ABORTED" });
    controller.abort();
    await canceled;
    const second = h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.state.authChecks).toBe(1);
    expect(h.state.commands).toEqual([]);
    h.state.deferred.shift()?.();
    await second;
    expect(h.state.commands.at(-1)?.url).toBe("https://hey-traders.com/dashboard/settings/exchanges");
  });

  it("blocks later dispatch when a dispatched command times out without a terminal result", async () => {
    const h = workTabHarness();
    h.state.deferNextCommand = true;
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "WEBMCP_OUTCOME_UNKNOWN" });
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "AGENT_BROWSER_OUTCOME_UNCONFIRMED" });
    expect(h.state.authChecks).toBe(1);
  });

  it("does not authenticate or dispatch the requested command after failed recovery navigation", async () => {
    const h = workTabHarness("https://hey-traders.com/dashboard/settings/exchanges");
    h.state.authenticated = false;
    h.state.rejectNavigation = true;
    await expect(h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } }))
      .rejects.toMatchObject({ code: "AGENT_AUTH_NAVIGATION_FAILED" });
    expect(h.state.commands.map((entry) => entry.input.command)).toEqual(["nav"]);
    expect(h.state.authenticated).toBe(false);
  });
});

describe("executeHeyTradersCommand", () => {
  it("forwards exchange connect unchanged to the canonical browser command tool", async () => {
    const authSocket = new FakeWebSocket({
      advertisedToolName: "heytraders_agent_auth",
      responseOutput: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              data: {
                authenticated: true,
                userId: "7d50b461-5031-4f25-b70f-89ec7f6bd6d1",
                agentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
              },
            }),
          },
        ],
      },
    });
    const commandSocket = new FakeWebSocket({
      advertisedToolName: "heytraders_cli",
      responseOutput: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              domain: "exchange",
              action: "connect",
              data: { state: "user-action-required" },
            }),
          },
        ],
      },
    });
    const sockets = [authSocket, commandSocket];
    const createWebSocket: WebSocketFactory = () => {
      const socket = sockets.shift();
      if (!socket) throw new Error("unexpected WebMCP invocation");
      queueMicrotask(() => socket.open());
      return socket;
    };

    await expect(
      executeHeyTradersCommand(
        { command: "exchange connect", args: { exchange: "hyperliquid" } },
        { timeoutMs: 1_000 },
        {
          gateway: { port: 18_789 },
          browser: { enabled: true, profiles: { openclaw: { cdpPort: 18_800 } } },
        },
        {
          stateDir: "/tmp/heytraders-browser-transport-test",
          fetch: async () =>
            new Response(
              JSON.stringify([{ ...canonicalTab, url: "https://hey-traders.com/agent" }]),
              {
              headers: { "content-type": "application/json" },
              },
            ),
          createWebSocket,
        },
      ),
    ).resolves.toEqual({
      ok: true,
      domain: "exchange",
      action: "connect",
      data: { state: "user-action-required" },
    });

    expect(authSocket.invocationInput).toEqual([{ operation: "status" }]);
    expect(commandSocket.invocationInput).toEqual([
      { command: "exchange connect", args: { exchange: "hyperliquid" } },
    ]);
  });
});
