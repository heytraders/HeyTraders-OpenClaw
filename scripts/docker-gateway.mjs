import net from "node:net";
import { spawn } from "node:child_process";

const separatorIndex = process.argv.indexOf("--");
const childCommand = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 1) : [];
if (childCommand.length === 0) {
  throw new Error("The OpenClaw gateway command is required after --.");
}

const parsePort = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return value;
};

let proxy;
if (process.env.HEYTRADERS_LOCAL_APP_PROXY === "true") {
  const upstreamHost = process.env.HEYTRADERS_LOCAL_APP_UPSTREAM_HOST || "host.docker.internal";
  const upstreamPort = parsePort("HEYTRADERS_LOCAL_APP_UPSTREAM_PORT", 5174);
  const localPort = parsePort("HEYTRADERS_LOCAL_APP_PORT", 5174);
  proxy = net.createServer((downstream) => {
    const upstream = net.connect({ host: upstreamHost, port: upstreamPort });
    const close = () => {
      downstream.destroy();
      upstream.destroy();
    };
    downstream.on("error", close);
    upstream.on("error", close);
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  });
  await new Promise((resolve, reject) => {
    const rejectListen = (error) => reject(error);
    proxy.once("error", rejectListen);
    proxy.listen({ host: "127.0.0.1", port: localPort }, () => {
      proxy.removeListener("error", rejectListen);
      resolve();
    });
  });
}

const child = spawn(childCommand[0], childCommand.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

proxy?.on("error", (error) => {
  console.error(`[heytraders] local app proxy failed: ${error.code || "UNKNOWN"}`);
  if (!child.killed) child.kill("SIGTERM");
});

const signalHandlers = new Map();
const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  const handler = () => forwardSignal(signal);
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

child.once("error", (error) => {
  console.error(`[heytraders] gateway process failed: ${error.code || "UNKNOWN"}`);
  proxy?.close();
  process.exit(1);
});
child.once("exit", (code, signal) => {
  proxy?.close();
  if (signal) {
    const handler = signalHandlers.get(signal);
    if (handler) process.removeListener(signal, handler);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
