import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createLocalStore } from "./server/local-store.js";
import {
  handleCalendar,
  handleFileDownload,
  handleFiles,
  handleNews,
  handleState,
  handleUpload,
  healthResponse
} from "./server/handlers.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4242);
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 55 * 1024 * 1024;
const localStore = await createLocalStore(PROJECT_ROOT);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

function isApiPath(pathname) {
  return pathname === "/api/health" || pathname === "/api/state" || pathname === "/api/upload" || pathname === "/api/files" || pathname === "/api/file" || pathname === "/api/news" || pathname === "/api/calendar";
}

async function readRequestBody(request) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) throw Object.assign(new Error("Corpo da requisição muito grande."), { status: 413 });
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("Corpo da requisição muito grande."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(request) {
  const url = `http://${HOST}:${PORT}${request.url || "/"}`;
  const init = {
    method: request.method,
    headers: request.headers
  };
  if (!["GET", "HEAD"].includes(request.method || "GET")) init.body = await readRequestBody(request);
  return new Request(url, init);
}

async function sendWebResponse(response, nodeResponse) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
  if (!response.body || nodeResponse.req.method === "HEAD") {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(nodeResponse);
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Painel-Token",
        "Access-Control-Max-Age": "86400"
      });
      response.end();
      return;
    }

    const webRequest = await toWebRequest(request);
    let webResponse;
    const localOptions = { local: true };

    if (pathname === "/api/health") {
      webResponse = healthResponse({
        mode: "local-server",
        database: true,
        files: true,
        news: true,
        calendar: true,
        requiresToken: false
      });
    } else if (pathname === "/api/state") {
      webResponse = await handleState(webRequest, localStore, localOptions);
    } else if (pathname === "/api/upload") {
      webResponse = await handleUpload(webRequest, localStore, localOptions);
    } else if (pathname === "/api/files") {
      webResponse = await handleFiles(webRequest, localStore, localOptions);
    } else if (pathname === "/api/file") {
      webResponse = await handleFileDownload(webRequest, localStore, localOptions);
    } else if (pathname === "/api/news") {
      webResponse = await handleNews(webRequest);
    } else if (pathname === "/api/calendar") {
      webResponse = await handleCalendar(webRequest);
    } else {
      webResponse = Response.json({ ok: false, message: "Rota não encontrada." }, { status: 404 });
    }

    const headers = new Headers(webResponse.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    const withCors = new Response(webResponse.body, { status: webResponse.status, statusText: webResponse.statusText, headers });
    await sendWebResponse(withCors, response);
  } catch (error) {
    response.writeHead(Number(error?.status) || 500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, message: error?.message || "Erro interno." }));
  }
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = path.posix.normalize(decoded);
  if (normalized.includes("..")) return null;
  if (/^\/(?:data|server|database|api|node_modules|scripts)(?:\/|$)/.test(normalized)) return null;
  if (normalized.split("/").some((segment) => segment.startsWith(".") && segment.length > 1)) return null;
  return normalized === "/" ? "/index.html" : normalized;
}

async function serveStatic(request, response, pathname) {
  const safePath = safeStaticPath(pathname);
  if (!safePath) {
    response.writeHead(404);
    response.end("Não encontrado");
    return;
  }

  let filePath = path.join(PROJECT_ROOT, safePath);
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(extension) || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": extension === ".html" || extension === ".js" || extension === ".css" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo não encontrado.");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (isApiPath(url.pathname)) {
    await handleApi(request, response, url.pathname);
    return;
  }
  await serveStatic(request, response, url.pathname);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} já está em uso. Feche a outra antena ou rode PORT=4243 node server.js.`);
  } else {
    console.error("A antena não conseguiu iniciar:", error.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`🌷 PAINEL DA MIRNA ONLINE — http://${HOST}:${PORT}`);
  console.log("🗃️ Banco SQLite ativo · 📎 arquivos privados locais · 🗓️ agenda · 📰 radar de notícias");
  console.log("Deixe este terminal aberto enquanto usar a versão local.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    localStore.close();
    server.close(() => process.exit(0));
  });
}
