import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserTransportError,
  assertSafeCdpHttpUrl,
  assertSafeCdpWebSocketUrl,
  executeHeyTradersCommand,
  formatErrorForLog,
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

describe("formatErrorForLog", () => {
  it("logs only the fixed error type and code", () => {
    const error = new BrowserTransportError(
      "PAGE_BRIDGE_PROTOCOL_ERROR",
      "Bearer short-secret from ws://127.0.0.1:18800/devtools/page/private",
    );

    expect(formatErrorForLog(error)).toBe(
      "BrowserTransportError [PAGE_BRIDGE_PROTOCOL_ERROR]",
    );
  });

  it("does not log unknown error messages", () => {
    expect(formatErrorForLog(new Error("user-provided value"))).toBe(
      "Error [HEYTRADERS_ADAPTER_ERROR]",
    );
  });
});

type FakeWebSocketOptions = {
  bootstrapFromAboutBlank?: boolean;
  bridgeMembers?: Array<"request" | "agentAuth">;
  bridgeVersion?: number;
  closeBeforeResponse?: boolean;
  mainFrameUrl?: string;
  navigateAfterFrameTree?: boolean;
  respond?: boolean;
  onInvoke?: (input: unknown, member: "request" | "agentAuth") => unknown;
  deferResponse?: (
    input: unknown,
    member: "request" | "agentAuth",
    respond: () => void,
  ) => void;
};

class FakeWebSocket implements WebSocketLike {
  readonly sent: Array<Record<string, unknown>> = [];
  readonly invocationInput: Array<unknown> = [];
  readonly invocationMembers: Array<"request" | "agentAuth"> = [];
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
      params?: { expression?: string; awaitPromise?: boolean; returnByValue?: boolean };
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

    if (request.method === "Runtime.evaluate") {
      expect(request.params?.awaitPromise).toBe(true);
      expect(request.params?.returnByValue).toBe(true);
      expect(typeof request.params?.expression).toBe("string");
      const members = this.options.bridgeMembers ?? ["request", "agentAuth"];
      const bridge: Record<string, unknown> = { version: this.options.bridgeVersion ?? 6 };
      for (const member of members) {
        bridge[member] = (input: unknown): unknown => {
          this.invocationInput.push(input);
          this.invocationMembers.push(member);
          return this.options.onInvoke?.(input, member) ?? { ok: true, data: { ready: true } };
        };
      }
      const origin = new URL(this.options.mainFrameUrl ?? canonicalTab.url).origin;
      const evaluated = runInNewContext(String(request.params?.expression), {
        atob,
        Reflect,
        setTimeout,
        TextDecoder,
        Uint8Array,
        window: { location: { origin }, __bridge: bridge },
      }) as Promise<unknown>;
      void Promise.resolve(evaluated).then((value) => {
        if (this.options.closeBeforeResponse) {
          this.close();
          return;
        }
        if (this.options.respond === false) return;
        const respond = (): void => this.emitMessage({
          id: request.id,
          result: {
            result: {
              type: "object",
              value: JSON.parse(JSON.stringify(value)) as unknown,
            },
          },
        });
        const input = this.invocationInput.at(-1);
        const member = this.invocationMembers.at(-1);
        if (this.options.deferResponse && member) {
          this.options.deferResponse(input, member, respond);
        } else {
          queueMicrotask(respond);
        }
      }, () => {
        this.emitMessage({
          id: request.id,
          result: { exceptionDetails: { text: "page bridge evaluation failed" } },
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
        mainFrameUrl: tab.url,
        deferResponse: (_input, member, respond) => {
          if (member === "request" && state.deferNextCommand) {
            state.deferNextCommand = false;
            state.deferred.push(respond);
          } else {
            queueMicrotask(respond);
          }
        },
        onInvoke: (rawInput, member) => {
          const input = rawInput as Record<string, unknown>;
          if (member === "agentAuth") {
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
      .rejects.toMatchObject({ code: "PAGE_BRIDGE_ABORTED" });
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
    const canceled = expect(first).rejects.toMatchObject({ code: "PAGE_BRIDGE_ABORTED" });
    controller.abort();
    await canceled;
    const second = h.call({ command: "exchange connect", args: { exchange: "hyperliquid" } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.state.authChecks).toBe(1);
    expect(h.state.commands.map((entry) => entry.input.command)).toEqual(["nav"]);
    h.state.deferred.shift()?.();
    await second;
    expect(h.state.commands.at(-1)?.url).toBe("https://hey-traders.com/dashboard/settings/exchanges");
  });

  it("blocks later dispatch when a dispatched command times out without a terminal result", async () => {
    const h = workTabHarness();
    h.state.deferNextCommand = true;
    await expect(h.call({ command: "status" })).rejects.toMatchObject({ code: "PAGE_BRIDGE_OUTCOME_UNKNOWN" });
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
  it("forwards exchange connect unchanged to the versioned page bridge", async () => {
    const authSocket = new FakeWebSocket({
      onInvoke: () => ({
        ok: true,
        data: {
          authenticated: true,
          userId: "7d50b461-5031-4f25-b70f-89ec7f6bd6d1",
          agentId: "16e3c6cb-a999-4acc-ae27-a80a730b91a8",
        },
      }),
    });
    const commandSocket = new FakeWebSocket({
      onInvoke: () => ({
        ok: true,
        domain: "exchange",
        action: "connect",
        data: { state: "user-action-required" },
      }),
    });
    const sockets = [authSocket, commandSocket];
    const createWebSocket: WebSocketFactory = () => {
      const socket = sockets.shift();
      if (!socket) throw new Error("unexpected page bridge invocation");
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
    expect(authSocket.invocationMembers).toEqual(["agentAuth"]);
    expect(commandSocket.invocationInput).toEqual([
      { command: "exchange connect", args: { exchange: "hyperliquid" } },
    ]);
    expect(commandSocket.invocationMembers).toEqual(["request"]);
  });
});
