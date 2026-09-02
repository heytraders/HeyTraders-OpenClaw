import { resolveBrowserConfig, resolveProfile } from "openclaw/plugin-sdk/browser-config";

import { normalizeHeyTradersRequest, type HeyTradersRequest } from "./request-contract.js";

const HEYTRADERS_ORIGIN = "https://hey-traders.com";
const HEYTRADERS_TOOL_NAME = "heytraders_cli";
const MAX_CDP_MESSAGE_BYTES = 8 * 1024 * 1024;
const PAGE_ENABLE_REQUEST_ID = 1;
const FRAME_TREE_REQUEST_ID = 2;
const WEBMCP_ENABLE_REQUEST_ID = 3;
const WEBMCP_INVOKE_REQUEST_ID = 4;

export type BrowserTab = {
  targetId: string;
  title?: string;
  type?: string;
  url: string;
  wsUrl: string;
  label?: string;
  tabId?: string;
};

export type BrowserTransportConfig = {
  browserProfile?: string;
  timeoutMs?: number;
};

export type WebSocketLike = {
  addEventListener(type: string, listener: (event: Event | MessageEvent) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class BrowserTransportError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "BrowserTransportError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseBrowserTabs(payload: unknown): BrowserTab[] {
  if (!isRecord(payload) || !Array.isArray(payload.tabs)) {
    throw new BrowserTransportError(
      "INVALID_BROWSER_RESPONSE",
      "OpenClaw returned an invalid browser tab response.",
    );
  }

  return payload.tabs.flatMap((value): BrowserTab[] => {
    if (!isRecord(value)) return [];
    const targetId =
      typeof value.targetId === "string"
        ? value.targetId
        : typeof value.id === "string"
          ? value.id
          : undefined;
    const { title, type, url, label, tabId } = value;
    const wsUrl =
      typeof value.wsUrl === "string"
        ? value.wsUrl
        : typeof value.webSocketDebuggerUrl === "string"
          ? value.webSocketDebuggerUrl
          : undefined;
    if (typeof targetId !== "string" || typeof url !== "string" || typeof wsUrl !== "string") {
      return [];
    }
    return [
      {
        targetId,
        url,
        wsUrl,
        ...(typeof title === "string" ? { title } : {}),
        ...(typeof type === "string" ? { type } : {}),
        ...(typeof label === "string" ? { label } : {}),
        ...(typeof tabId === "string" ? { tabId } : {}),
      },
    ];
  });
}

function isCanonicalHeyTradersTab(tab: BrowserTab): boolean {
  if (tab.type !== undefined && tab.type !== "page") return false;
  try {
    return new URL(tab.url).origin === HEYTRADERS_ORIGIN;
  } catch {
    return false;
  }
}

export function selectHeyTradersTab(tabs: BrowserTab[]): BrowserTab {
  const eligibleTabs = tabs.filter(isCanonicalHeyTradersTab);
  if (eligibleTabs.length === 0) {
    throw new BrowserTransportError(
      "HEYTRADERS_TAB_NOT_FOUND",
      "No eligible https://hey-traders.com tab is open in the configured OpenClaw browser profile.",
      true,
    );
  }

  if (eligibleTabs.length === 1) return eligibleTabs[0];

  throw new BrowserTransportError(
    "AMBIGUOUS_HEYTRADERS_TAB",
    "Multiple HeyTraders tabs are open in the configured profile; keep exactly one eligible tab open.",
    true,
  );
}

export function assertSafeCdpHttpUrl(cdpUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(cdpUrl);
  } catch {
    throw new BrowserTransportError("UNSAFE_CDP_URL", "OpenClaw returned an invalid CDP URL.");
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BrowserTransportError(
      "UNSAFE_CDP_URL",
      "The configured browser profile does not expose an approved loopback CDP origin.",
    );
  }
  return parsed.origin;
}

export function assertSafeCdpWebSocketUrl(wsUrl: string, targetId: string): string {
  let parsed: URL;
  try {
    parsed = new URL(wsUrl);
  } catch {
    throw new BrowserTransportError("UNSAFE_CDP_URL", "OpenClaw returned an invalid CDP URL.");
  }

  const loopbackHosts = new Set(["127.0.0.1", "[::1]"]);
  const pagePrefix = "/devtools/page/";
  const encodedTarget = parsed.pathname.slice(pagePrefix.length);
  let decodedTarget = "";
  try {
    decodedTarget = decodeURIComponent(encodedTarget);
  } catch {
    throw new BrowserTransportError("UNSAFE_CDP_URL", "OpenClaw returned an invalid CDP target.");
  }

  if (
    parsed.protocol !== "ws:" ||
    !loopbackHosts.has(parsed.hostname) ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !parsed.pathname.startsWith(pagePrefix) ||
    encodedTarget.includes("/") ||
    decodedTarget !== targetId
  ) {
    throw new BrowserTransportError(
      "UNSAFE_CDP_URL",
      "The selected tab does not expose an approved loopback page CDP endpoint.",
    );
  }

  return parsed.toString();
}

type CdpResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: unknown };
  method?: string;
  params?: Record<string, unknown>;
};

function readCanonicalMainFrame(result: unknown): { id: string; url: string } {
  if (!isRecord(result) || !isRecord(result.frameTree) || !isRecord(result.frameTree.frame)) {
    throw new BrowserTransportError(
      "INVALID_CDP_FRAME_TREE",
      "The selected tab returned an invalid main-frame description.",
    );
  }

  const frame = result.frameTree.frame;
  if (typeof frame.id !== "string" || !frame.id || typeof frame.url !== "string") {
    throw new BrowserTransportError(
      "INVALID_CDP_FRAME_TREE",
      "The selected tab returned an invalid main-frame identity.",
    );
  }
  if (typeof frame.parentId === "string") {
    throw new BrowserTransportError(
      "INVALID_CDP_FRAME_TREE",
      "The selected frame is not the top-level page frame.",
    );
  }

  try {
    if (new URL(frame.url).origin !== HEYTRADERS_ORIGIN) {
      throw new BrowserTransportError(
        "HEYTRADERS_ORIGIN_CHANGED",
        "The selected tab navigated away from the canonical HeyTraders origin.",
        true,
      );
    }
  } catch (error) {
    if (error instanceof BrowserTransportError) throw error;
    throw new BrowserTransportError(
      "HEYTRADERS_ORIGIN_CHANGED",
      "The selected tab no longer has a valid HeyTraders origin.",
      true,
    );
  }

  return { id: frame.id, url: frame.url };
}

export type WebMcpToolResponse = {
  status: "Completed" | "Canceled" | "Error";
  output?: unknown;
  errorText?: string;
};

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url);
}

function readMessageData(event: Event | MessageEvent): string {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    throw new BrowserTransportError("INVALID_CDP_MESSAGE", "OpenClaw CDP returned non-text data.");
  }
  if (new TextEncoder().encode(event.data).byteLength > MAX_CDP_MESSAGE_BYTES) {
    throw new BrowserTransportError("CDP_MESSAGE_TOO_LARGE", "OpenClaw CDP response exceeded 8 MiB.");
  }
  return event.data;
}

function readToolResponse(params: Record<string, unknown>): WebMcpToolResponse {
  const status = params.status;
  if (status !== "Completed" && status !== "Canceled" && status !== "Error") {
    throw new BrowserTransportError(
      "INVALID_WEBMCP_RESPONSE",
      "HeyTraders returned an invalid WebMCP invocation status.",
    );
  }
  return {
    status,
    ...(params.output !== undefined ? { output: params.output } : {}),
    ...(typeof params.errorText === "string" ? { errorText: params.errorText } : {}),
  };
}

export function invokeHeyTradersWebMcpTool(params: {
  wsUrl: string;
  targetId: string;
  input: HeyTradersRequest;
  timeoutMs: number;
  signal?: AbortSignal;
  createWebSocket?: WebSocketFactory;
}): Promise<WebMcpToolResponse> {
  const safeUrl = assertSafeCdpWebSocketUrl(params.wsUrl, params.targetId);
  const createWebSocket = params.createWebSocket ?? defaultWebSocketFactory;

  return new Promise<WebMcpToolResponse>((resolve, reject) => {
    let settled = false;
    let invocationRequested = false;
    let invocationId: string | undefined;
    let mainFrameId: string | undefined;
    const pendingResponses = new Map<string, Record<string, unknown>>();
    let socket: WebSocketLike;

    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      params.signal?.removeEventListener("abort", abortHandler);
      try {
        socket.close(1000, "complete");
      } catch {
        // The result is already final; a close failure must not replace it.
      }
      callback();
    };
    const fail = (error: unknown): void =>
      settle(() =>
        reject(
          error instanceof BrowserTransportError
            ? error
            : new BrowserTransportError("WEBMCP_TRANSPORT_FAILED", "WebMCP transport failed.", true),
        ),
      );
    const finish = (responseParams: Record<string, unknown>): void => {
      try {
        const response = readToolResponse(responseParams);
        settle(() => resolve(response));
      } catch (error) {
        fail(error);
      }
    };
    const abortHandler = (): void =>
      fail(new BrowserTransportError("WEBMCP_ABORTED", "HeyTraders command was canceled.", true));
    const timeoutHandle = setTimeout(
      () => fail(new BrowserTransportError("WEBMCP_TIMEOUT", "HeyTraders command timed out.", true)),
      params.timeoutMs,
    );

    if (params.signal?.aborted) {
      clearTimeout(timeoutHandle);
      reject(new BrowserTransportError("WEBMCP_ABORTED", "HeyTraders command was canceled.", true));
      return;
    }
    params.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      socket = createWebSocket(safeUrl);
    } catch (error) {
      clearTimeout(timeoutHandle);
      params.signal?.removeEventListener("abort", abortHandler);
      reject(
        error instanceof BrowserTransportError
          ? error
          : new BrowserTransportError("WEBMCP_CONNECT_FAILED", "Could not connect to the selected tab.", true),
      );
      return;
    }

    socket.addEventListener("open", () => {
      try {
        socket.send(JSON.stringify({ id: PAGE_ENABLE_REQUEST_ID, method: "Page.enable" }));
      } catch (error) {
        fail(error);
      }
    });
    socket.addEventListener("error", () => {
      fail(new BrowserTransportError("WEBMCP_SOCKET_ERROR", "The selected tab CDP connection failed.", true));
    });
    socket.addEventListener("close", () => {
      if (!settled) {
        fail(
          new BrowserTransportError(
            "WEBMCP_SOCKET_CLOSED",
            "The selected HeyTraders tab closed before the command completed.",
            true,
          ),
        );
      }
    });
    socket.addEventListener("message", (event) => {
      if (settled) return;
      try {
        const message = JSON.parse(readMessageData(event)) as CdpResponse;
        if (message.error) {
          throw new BrowserTransportError(
            "WEBMCP_PROTOCOL_ERROR",
            typeof message.error.message === "string"
              ? message.error.message
              : "WebMCP protocol request failed.",
          );
        }

        if (message.id === PAGE_ENABLE_REQUEST_ID) {
          socket.send(
            JSON.stringify({ id: FRAME_TREE_REQUEST_ID, method: "Page.getFrameTree" }),
          );
          return;
        }

        if (message.id === FRAME_TREE_REQUEST_ID) {
          mainFrameId = readCanonicalMainFrame(message.result).id;
          socket.send(
            JSON.stringify({ id: WEBMCP_ENABLE_REQUEST_ID, method: "WebMCP.enable" }),
          );
          return;
        }

        if (message.method === "Page.frameNavigated" && isRecord(message.params?.frame)) {
          const frame = message.params.frame;
          const isTopLevelFrame = typeof frame.parentId !== "string";
          if (mainFrameId && (frame.id === mainFrameId || isTopLevelFrame)) {
            throw new BrowserTransportError(
              "HEYTRADERS_TAB_NAVIGATED",
              "The selected HeyTraders tab navigated while the command was starting; retry against fresh state.",
              true,
            );
          }
          return;
        }

        if (
          message.method === "Page.frameDetached" &&
          mainFrameId &&
          message.params?.frameId === mainFrameId
        ) {
          throw new BrowserTransportError(
            "HEYTRADERS_TAB_NAVIGATED",
            "The selected HeyTraders page frame detached while the command was starting.",
            true,
          );
        }

        if (message.method === "WebMCP.toolsAdded" && !invocationRequested) {
          const tools = message.params?.tools;
          if (!Array.isArray(tools)) return;
          const tool = tools.find(
            (candidate) =>
              isRecord(candidate) &&
              candidate.name === HEYTRADERS_TOOL_NAME &&
              candidate.frameId === mainFrameId,
          );
          if (!isRecord(tool) || typeof tool.frameId !== "string") return;
          invocationRequested = true;
          socket.send(
            JSON.stringify({
              id: WEBMCP_INVOKE_REQUEST_ID,
              method: "WebMCP.invokeTool",
              params: {
                frameId: tool.frameId,
                toolName: HEYTRADERS_TOOL_NAME,
                input: params.input,
              },
            }),
          );
          return;
        }

        if (message.id === WEBMCP_INVOKE_REQUEST_ID) {
          const id = message.result?.invocationId;
          if (typeof id !== "string" || !id) {
            throw new BrowserTransportError(
              "INVALID_WEBMCP_RESPONSE",
              "HeyTraders returned an invalid WebMCP invocation id.",
            );
          }
          invocationId = id;
          const pending = pendingResponses.get(id);
          if (pending) finish(pending);
          return;
        }

        if (message.method === "WebMCP.toolResponded" && isRecord(message.params)) {
          const responseInvocationId = message.params.invocationId;
          if (typeof responseInvocationId !== "string") return;
          if (invocationId === responseInvocationId) {
            finish(message.params);
          } else {
            pendingResponses.set(responseInvocationId, message.params);
          }
        }
      } catch (error) {
        fail(error);
      }
    });
  });
}

export function decodeHeyTradersOutput(output: unknown): unknown {
  if (!isRecord(output) || !Array.isArray(output.content) || output.content.length !== 1) {
    return output;
  }
  const content = output.content[0];
  if (!isRecord(content) || content.type !== "text" || typeof content.text !== "string") {
    return output;
  }
  try {
    return JSON.parse(content.text) as unknown;
  } catch {
    return output;
  }
}

export function resolveManagedBrowserCdpUrl(runtimeConfig: unknown, profileName: string): string {
  if (!isRecord(runtimeConfig)) {
    throw new BrowserTransportError(
      "INVALID_OPENCLAW_CONFIG",
      "OpenClaw runtime configuration is unavailable.",
    );
  }

  try {
    const browserConfig = resolveBrowserConfig(runtimeConfig.browser, runtimeConfig);
    if (!browserConfig.enabled) {
      throw new BrowserTransportError("BROWSER_DISABLED", "OpenClaw browser support is disabled.", true);
    }
    const profile = resolveProfile(browserConfig, profileName);
    if (profile.driver !== "openclaw" || profile.attachOnly || !profile.cdpIsLoopback) {
      throw new BrowserTransportError(
        "UNSUPPORTED_BROWSER_PROFILE",
        "The HeyTraders adapter currently requires a local OpenClaw-managed browser profile.",
      );
    }
    return assertSafeCdpHttpUrl(profile.cdpUrl);
  } catch (error) {
    if (error instanceof BrowserTransportError) throw error;
    throw new BrowserTransportError(
      "BROWSER_PROFILE_NOT_FOUND",
      `OpenClaw browser profile ${JSON.stringify(profileName)} is unavailable.`,
      true,
    );
  }
}

async function readBrowserTabs(
  cdpHttpUrl: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fetchFn: FetchLike,
): Promise<BrowserTab[]> {
  const controller = new AbortController();
  const abortHandler = (): void => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortHandler, { once: true });
  const timeoutHandle = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetchFn(`${assertSafeCdpHttpUrl(cdpHttpUrl)}/json/list`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new BrowserTransportError(
        "BROWSER_CDP_UNAVAILABLE",
        `OpenClaw browser CDP returned HTTP ${response.status}.`,
        true,
      );
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 1024 * 1024) {
      throw new BrowserTransportError(
        "INVALID_BROWSER_RESPONSE",
        "OpenClaw browser tab response exceeded 1 MiB.",
      );
    }
    return parseBrowserTabs({ tabs: JSON.parse(body) as unknown });
  } catch (error) {
    if (error instanceof BrowserTransportError) throw error;
    if (signal?.aborted) {
      throw new BrowserTransportError("WEBMCP_ABORTED", "HeyTraders command was canceled.", true);
    }
    throw new BrowserTransportError(
      controller.signal.aborted ? "BROWSER_CDP_TIMEOUT" : "BROWSER_NOT_RUNNING",
      controller.signal.aborted
        ? "OpenClaw browser tab discovery timed out."
        : "The configured OpenClaw browser profile is not running.",
      true,
    );
  } finally {
    clearTimeout(timeoutHandle);
    signal?.removeEventListener("abort", abortHandler);
  }
}

export async function executeHeyTradersCommand(
  request: unknown,
  config: BrowserTransportConfig,
  runtimeConfig: unknown,
  options: {
    signal?: AbortSignal;
    fetch?: FetchLike;
    createWebSocket?: WebSocketFactory;
  } = {},
): Promise<unknown> {
  const normalizedRequest = normalizeHeyTradersRequest(request);
  const browserProfile = config.browserProfile?.trim() || "openclaw";
  const timeoutMs = Math.min(Math.max(config.timeoutMs ?? 30_000, 1_000), 120_000);
  const cdpHttpUrl = resolveManagedBrowserCdpUrl(runtimeConfig, browserProfile);
  const tabs = await readBrowserTabs(cdpHttpUrl, timeoutMs, options.signal, options.fetch ?? fetch);
  const tab = selectHeyTradersTab(tabs);
  const response = await invokeHeyTradersWebMcpTool({
    wsUrl: tab.wsUrl,
    targetId: tab.targetId,
    input: normalizedRequest,
    timeoutMs,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.createWebSocket ? { createWebSocket: options.createWebSocket } : {}),
  });

  if (response.status !== "Completed") {
    throw new BrowserTransportError(
      `WEBMCP_${response.status.toUpperCase()}`,
      response.errorText ?? `HeyTraders WebMCP invocation ended with status ${response.status}.`,
      response.status === "Canceled",
    );
  }
  return decodeHeyTradersOutput(response.output);
}

export function formatToolError(error: unknown): {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
} {
  if (error instanceof BrowserTransportError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message, retryable: error.retryable },
    };
  }
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return {
      ok: false,
      error: { code: error.code, message: error.message, retryable: false },
    };
  }
  return {
    ok: false,
    error: {
      code: "HEYTRADERS_ADAPTER_ERROR",
      message: "HeyTraders adapter failed without exposing sensitive runtime details.",
      retryable: false,
    },
  };
}

export function formatErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) return "non-Error adapter failure";
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  if (code && /^[A-Z0-9_]{1,64}$/u.test(code)) {
    return `${error.name === "RequestContractError" ? "RequestContractError" : "BrowserTransportError"} [${code}]`;
  }
  return "Error [HEYTRADERS_ADAPTER_ERROR]";
}
