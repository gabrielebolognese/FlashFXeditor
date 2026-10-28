// The headless side of `cli render` and `cli compare` (spec §21.6): a localhost server for the built app
// (`dist/`) and the folders it reads and writes, Chrome or Edge discovery, a headless launch with a
// throwaway profile named `shorts-editor-render-<random>`, and the DevTools protocol over Node's
// WebSocket and fetch (no Puppeteer, no Playwright).
// Ported from FlashFX-v2 scripts/lib/headless-gpu.mjs @ a91c675, adapted: the esbuild bundling is
// replaced by the app's own dist/, the page is the render-only entry, Chrome is found and stopped with
// its whole process tree, and a watchdog ends a run that stops making progress.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, createReadStream, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";

/** Ports that belong to other tools (the user's progress preview and the reels autopilot). */
export const RESERVED_PORTS = [5300, 5310];

export const PROFILE_PREFIX = "shorts-editor-render-";

/** The flags that give headless Chrome a GPU for WebGPU and WebGL2 (docs/PROGRESS.md records what they were measured to do). */
export const CHROME_FLAGS = ["--headless=new", "--enable-unsafe-webgpu", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-extensions", "--hide-scrollbars", "--mute-audio"];

/** A Chrome, Chromium or Edge binary, or null. `CHROME_PATH` wins. */
export function findChrome(env: NodeJS.ProcessEnv = process.env, exists: (path: string) => boolean = existsSync): string | null {
  const candidates = [
    env["CHROME_PATH"],
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    env["LOCALAPPDATA"] ? `${env["LOCALAPPDATA"]}/Google/Chrome/Application/chrome.exe` : undefined,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ].filter((path): path is string => typeof path === "string" && path !== "");
  return candidates.find((path) => exists(path)) ?? null;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** `path` inside `root` (no `..`, no absolute escape), or null. */
export function insideRoot(root: string, path: string): string | null {
  const base = resolve(root);
  const full = resolve(base, `.${sep}${path}`);
  return full === base || full.startsWith(base + sep) ? full : null;
}

/** An inclusive byte range of a file of `size` bytes from a Range header, or null (whole file) / "bad". */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "bad" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "bad";
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return "bad";
  let start: number;
  let end: number;
  if (from === "") {
    const count = Number(to);
    start = Math.max(0, size - count);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  }
  return start > end || start >= size ? "bad" : { start, end };
}

/** What a run of the server writes and reads. */
export interface ServerRoots {
  /** The built app. */
  dist: string;
  /** The project folder (`project/` routes), when there is one. */
  project?: string;
  /** Compare inputs: a file or a folder each. */
  inputs?: { a?: string; b?: string };
  /** Where `out/` uploads land (PNG frames, difference images). */
  out?: string;
  /** The file the `sink/` bytes are written to (written as <file>.part, renamed on close). */
  sinkFile?: string;
}

export interface RunServer {
  port: number;
  token: string;
  /** Epoch ms of the last sign of life from the page (a request that moves a render forward). */
  lastActivity: () => number;
  progress: () => { done: number; total: number };
  /** Calls `listener` with each progress report. */
  onProgress(listener: (done: number, total: number) => void): void;
  /** The bytes the sink received (and whether it was closed). */
  sink: () => { bytes: number; closed: boolean };
  close(): Promise<void>;
}

function send(response: ServerResponse, status: number, body: string | Buffer = "", headers: Record<string, string> = {}): void {
  response.writeHead(status, { "cache-control": "no-store", ...headers });
  response.end(body);
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function serveFile(request: IncomingMessage, response: ServerResponse, file: string): void {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    send(response, 404);
    return;
  }
  if (!stat.isFile()) {
    send(response, 404);
    return;
  }
  const headers: Record<string, string> = { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "last-modified": stat.mtime.toUTCString(), "accept-ranges": "bytes", "cache-control": "no-store" };
  const range = parseRange(request.headers.range, stat.size);
  if (range === "bad") {
    send(response, 416, "", { "content-range": `bytes */${stat.size}` });
    return;
  }
  if (range) {
    response.writeHead(206, { ...headers, "content-range": `bytes ${range.start}-${range.end}/${stat.size}`, "content-length": String(range.end - range.start + 1) });
    if (request.method === "HEAD") response.end();
    else createReadStream(file, range).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "content-length": String(stat.size) });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}

/** A directory listing as the page's `HttpDir.list` reads it; 404 when there is no such directory. */
function serveList(response: ServerResponse, dir: string): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    send(response, 404);
    return;
  }
  send(response, 200, JSON.stringify(entries.map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? "directory" : "file" }))), { "content-type": "application/json" });
}

/** A compare input is a folder, or one file that stands for a folder holding it. */
function inputTarget(input: string, rest: string): { dir: string } | { file: string } | null {
  if (statSync(input).isDirectory()) {
    const full = insideRoot(input, rest);
    return full ? (rest === "" || rest.endsWith("/") ? { dir: full } : { file: full }) : null;
  }
  if (rest === "" || rest === "/") return { dir: "" };
  return rest === basename(input) ? { file: input } : null;
}

export async function startServer(roots: ServerRoots): Promise<RunServer> {
  const token = randomBytes(12).toString("hex");
  const prefix = `/__t/${token}/`;
  let last = Date.now();
  let progress = { done: 0, total: 0 };
  const listeners: ((done: number, total: number) => void)[] = [];
  let sinkBytes = 0;
  let sinkClosed = false;
  let sinkFd: number | null = null;
  const sinkPart = roots.sinkFile ? `${roots.sinkFile}.part` : null;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname);
    last = Date.now();
    if (!path.startsWith(prefix)) {
      // The built app: any path that is not a file falls back to index.html (the page is /?render=<token>).
      const full = insideRoot(roots.dist, path === "/" ? "index.html" : path);
      if (!full) return send(response, 403);
      if (!existsSync(full) || !statSync(full).isFile()) return serveFile(request, response, join(roots.dist, "index.html"));
      return serveFile(request, response, full);
    }
    const route = path.slice(prefix.length);
    const [kind = "", ...parts] = route.split("/");
    const rest = parts.join("/");
    const wantsList = url.searchParams.has("list");
    try {
      if (kind === "project" && roots.project) {
        const full = insideRoot(roots.project, rest);
        if (!full) return send(response, 403);
        return wantsList ? serveList(response, full) : serveFile(request, response, full);
      }
      if (kind === "input" && (parts[0] === "a" || parts[0] === "b")) {
        const input = roots.inputs?.[parts[0]];
        if (!input || !existsSync(input)) return send(response, 404);
        const target = inputTarget(input, parts.slice(1).join("/"));
        if (!target) return send(response, 404);
        if ("dir" in target) {
          if (!wantsList) return send(response, 404);
          return statSync(input).isDirectory() ? serveList(response, target.dir) : send(response, 200, JSON.stringify([{ name: basename(input), kind: "file" }]), { "content-type": "application/json" });
        }
        return serveFile(request, response, target.file);
      }
      if (kind === "progress" && request.method === "POST") {
        const body = JSON.parse((await readBody(request)).toString("utf8")) as { done: number; total: number };
        progress = body;
        for (const listener of listeners) listener(body.done, body.total);
        return send(response, 204);
      }
      if (kind === "sink" && sinkPart && roots.sinkFile) {
        const op = url.searchParams.get("op");
        if (request.method === "PUT") {
          const body = await readBody(request);
          mkdirSync(resolve(roots.sinkFile, ".."), { recursive: true });
          sinkFd ??= openSync(sinkPart, "w");
          const position = Number(url.searchParams.get("pos") ?? "0");
          writeSync(sinkFd, body, 0, body.length, position);
          sinkBytes = Math.max(sinkBytes, position + body.length);
          return send(response, 204);
        }
        if (op === "close") {
          await readBody(request);
          if (sinkFd !== null) {
            fsyncSync(sinkFd);
            closeSync(sinkFd);
            sinkFd = null;
            renameSync(sinkPart, roots.sinkFile);
          }
          sinkClosed = true;
          return send(response, 204);
        }
        if (op === "abort") {
          await readBody(request);
          if (sinkFd !== null) closeSync(sinkFd);
          sinkFd = null;
          rmSync(sinkPart, { force: true });
          return send(response, 204);
        }
      }
      if (kind === "out" && roots.out && request.method === "PUT") {
        const full = insideRoot(roots.out, rest);
        if (!full) return send(response, 403);
        mkdirSync(resolve(full, ".."), { recursive: true });
        writeFileSync(full, await readBody(request));
        return send(response, 204);
      }
      return send(response, 404);
    } catch (error) {
      return send(response, 500, error instanceof Error ? error.message : String(error));
    }
  };

  const server: Server = createServer((request, response) => void handle(request, response));
  // A free port that is not one of the other tools' ports.
  let port = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    port = (server.address() as AddressInfo).port;
    if (!RESERVED_PORTS.includes(port)) break;
    await new Promise<void>((done) => server.close(() => done()));
  }
  if (RESERVED_PORTS.includes(port)) throw new Error("No free port outside 5300 and 5310");
  return {
    port,
    token,
    lastActivity: () => last,
    progress: () => progress,
    onProgress: (listener) => void listeners.push(listener),
    sink: () => ({ bytes: sinkBytes, closed: sinkClosed }),
    close: async () => {
      if (sinkFd !== null) closeSync(sinkFd);
      if (sinkPart) rmSync(sinkPart, { force: true });
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

const sleep = (ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

/** Stops a process and everything it started (Chrome's GPU and renderer processes). Only this tree. */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export interface Page {
  /** Evaluates an expression (awaiting promises) and returns its value; throws the page's exception text. */
  evaluate<T>(expression: string): Promise<T>;
  logs: string[];
}

export interface Session {
  page: Page;
  server: RunServer;
  /** Stops Chrome and its tree, the server and the profile. Safe to call more than once. */
  cleanup(): Promise<void>;
  /** Rejects when the run stops making progress for `watchdogMs`, or Chrome exits. */
  failed: Promise<never>;
}

export interface SessionOptions {
  roots: Omit<ServerRoots, "dist">;
  dist: string;
  renderer: "webgpu" | "webgl2";
  mode?: "compare";
  chrome?: string | null;
  watchdogMs?: number;
}

/** Starts the server and headless Chrome on the render page. Cleans up after itself when it fails to start. */
export async function startSession(options: SessionOptions): Promise<Session> {
  const chrome = options.chrome ?? findChrome();
  if (!chrome) throw new Error("No Chrome, Chromium or Edge found (set CHROME_PATH)");
  if (!existsSync(join(options.dist, "index.html"))) throw new Error(`${options.dist} has no index.html: run npm run build first`);
  const server = await startServer({ ...options.roots, dist: options.dist });
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  let child: ChildProcess | null = null;
  let socket: WebSocket | null = null;
  let cleaned = false;
  const logs: string[] = [];
  const watchdogMs = options.watchdogMs ?? 60_000;

  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(watchdog);
    process.off("exit", onExit);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
    if (child) killTree(child);
    await server.close().catch(() => undefined);
    // Chrome can hold the profile for a moment after it is gone.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(150);
      }
    }
  };

  let fail: (error: Error) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  failed.catch(() => undefined);
  const watchdog = setInterval(() => {
    if (Date.now() - server.lastActivity() > watchdogMs) fail(new Error(`No progress for ${Math.round(watchdogMs / 1000)} s: the render was stopped`));
  }, 1000);
  watchdog.unref();
  // A last resort if the process is ended without the handlers below.
  const onExit = () => {
    if (child) killTree(child);
  };
  process.once("exit", onExit);
  // Ctrl+C or SIGTERM at any point of startup (and later, until cleanup) stops Chrome and removes the profile.
  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const args = [...CHROME_FLAGS, `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*", "--window-size=1280,720", "about:blank"];
    child = spawn(chrome, args, { stdio: "ignore", detached: process.platform !== "win32", windowsHide: true });
    child.once("exit", (code) => {
      if (!cleaned) fail(new Error(`Chrome exited unexpectedly (code ${code ?? "?"})`));
    });
    child.once("error", (error) => fail(error));

    // Chrome writes its debugging port to <profile>/DevTools/DevToolsActivePort (first line).
    let debugPort = 0;
    for (let attempt = 0; attempt < 200 && debugPort === 0; attempt++) {
      try {
        debugPort = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      } catch {
        await sleep(100);
      }
    }
    if (!debugPort) throw new Error("Chrome did not start (no DevToolsActivePort)");
    let target: { webSocketDebuggerUrl: string } | undefined;
    for (let attempt = 0; attempt < 100 && !target; attempt++) {
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        target = targets.find((t) => t.type === "page");
      } catch {
        /* not up yet */
      }
      if (!target) await sleep(100);
    }
    if (!target) throw new Error("Chrome opened no page");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    socket = ws;
    await new Promise<void>((resolveOpen, reject) => {
      ws.addEventListener("open", () => resolveOpen());
      ws.addEventListener("error", () => reject(new Error("Cannot connect to the DevTools protocol")));
    });
    let nextId = 0;
    const pending = new Map<number, (message: { result?: { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } }; error?: { message: string } }) => void>();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: Record<string, unknown> };
      if (message.method === "Runtime.consoleAPICalled") {
        const params = message.params as { type: string; args: { value?: unknown; description?: string }[] };
        logs.push(`${params.type}: ${params.args.map((arg) => String(arg.value ?? arg.description)).join(" ")}`);
      } else if (message.method === "Runtime.exceptionThrown") {
        const details = (message.params as { exceptionDetails?: { exception?: { description?: string }; text?: string } }).exceptionDetails;
        logs.push(`exception: ${details?.exception?.description ?? details?.text}`);
      }
      if (message.id !== undefined) {
        pending.get(message.id)?.(message as never);
        pending.delete(message.id);
      }
    });
    const command = (method: string, params: Record<string, unknown>) =>
      new Promise<NonNullable<ReturnType<typeof JSON.parse>>>((resolveCommand, reject) => {
        const id = ++nextId;
        pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolveCommand(message.result ?? {})));
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async <T>(expression: string): Promise<T> => {
      const result = (await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result?: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } };
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description?.split("\n")[0] ?? result.exceptionDetails.text ?? "page exception");
      return result.result?.value as T;
    };
    await command("Runtime.enable", {});
    await command("Page.enable", {});
    const query = `render=${server.token}${options.renderer === "webgl2" ? "&renderer=webgl2" : ""}${options.mode === "compare" ? "&mode=compare" : ""}`;
    await command("Page.navigate", { url: `http://127.0.0.1:${server.port}/?${query}` });
    // The page defines window.__render when its bundle has run.
    for (let attempt = 0; attempt < 600; attempt++) {
      if ((await evaluate<boolean>("typeof window.__render === 'object'").catch(() => false)) === true) break;
      if (attempt === 599) throw new Error(`The render page did not start. ${logs.slice(-5).join(" | ")}`);
      await sleep(100);
    }
    return { page: { evaluate, logs }, server, cleanup, failed };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Runs `work` in a session, always cleaning up, and installs Ctrl+C handling for its duration. */
export async function withSession<T>(options: SessionOptions, work: (session: Session) => Promise<T>): Promise<T> {
  const session = await startSession(options);
  try {
    return await Promise.race([work(session), session.failed]);
  } finally {
    await session.cleanup();
  }
}

/** Removes a stale `.part` file next to an output (a run that was killed). */
export function clearPart(file: string): void {
  try {
    unlinkSync(`${file}.part`);
  } catch {
    /* none */
  }
}
