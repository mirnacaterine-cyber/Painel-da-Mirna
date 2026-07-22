import { timingSafeEqual } from "node:crypto";
import { authenticateRequest } from "./auth-store.js";
import { fetchCalendarIcs, fetchNewsItems } from "./feed-utils.js";

const DESTINATION_IDS = new Set(["00", "01", "02", "03", "04", "05", "06", "07", "08", "99"]);
const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...COMMON_HEADERS, ...extraHeaders } });
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  const message = status >= 500 && !error?.message
    ? "O servidor encontrou um erro."
    : error?.message || "Não foi possível concluir esta ação.";
  return json({ ok: false, message }, status);
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function authorize(request, { local = false } = {}) {
  if (local) return null;
  const expected = process.env.PAINEL_API_TOKEN;
  const received = request.headers.get("x-painel-token")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  if (expected && received && safeEquals(received, expected)) return null;
  try {
    const session = await authenticateRequest(request);
    if (session) return null;
  } catch (error) {
    if (!expected) return json({ ok: false, message: error?.message || "Banco de acesso indisponível." }, Number(error?.status) || 503);
  }
  if (!expected) return json({ ok: false, message: "Configure o acesso privado antes de ativar dados na nuvem." }, 503);
  return json({ ok: false, message: "Entre novamente para acessar estes dados." }, 401);
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeFilename(value = "arquivo") {
  return String(value).replace(/[\r\n"]/g, "_").trim().slice(0, 180) || "arquivo";
}

function normalizedFileMetadata(body) {
  const id = String(body?.id || "").trim().slice(0, 180);
  const name = safeFilename(body?.name || "arquivo");
  const note = String(body?.note || "").trim().slice(0, 180);
  const destinationId = String(body?.destinationId || "00").trim();
  if (!id) throw Object.assign(new Error("Arquivo não informado."), { status: 400 });
  if (!DESTINATION_IDS.has(destinationId)) {
    throw Object.assign(new Error("Destino de arquivo inválido."), { status: 400 });
  }
  return { id, name, note, destinationId };
}

export function healthResponse({ mode, database, files, news = true, calendar = true, requiresToken = false }) {
  return json({
    ok: true,
    reachable: true,
    mode,
    database: Boolean(database),
    files: Boolean(files),
    news: Boolean(news),
    calendar: Boolean(calendar),
    requiresToken: Boolean(requiresToken)
  });
}

export async function handleState(request, store, options = {}) {
  const authFailure = await authorize(request, options);
  if (authFailure) return authFailure;
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "mirna-dashboard").slice(0, 100);
      const row = await store.getState(id);
      return row ? json(row) : json({ ok: false, message: "Estado ainda não criado." }, 404);
    }
    if (request.method === "PUT") {
      const body = await request.json();
      const id = String(body?.id || "mirna-dashboard").slice(0, 100);
      if (!body?.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        return json({ ok: false, message: "Estado inválido." }, 400);
      }
      const serializedSize = Buffer.byteLength(JSON.stringify(body.payload));
      if (serializedSize > 2 * 1024 * 1024) {
        return json({ ok: false, message: "O estado ultrapassa o limite de 2 MB." }, 413);
      }
      const row = await store.putState(id, body.payload, body.clientUpdatedAt || null);
      return json(row);
    }
    return json({ ok: false, message: "Método não permitido." }, 405, { Allow: "GET, PUT" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleFiles(request, store, options = {}) {
  const authFailure = await authorize(request, options);
  if (authFailure) return authFailure;
  try {
    if (request.method === "GET") return json(await store.listFiles());
    if (request.method === "PATCH") {
      if (typeof store.updateFile !== "function") {
        return json({ ok: false, message: "Este armazenamento ainda não aceita atualizações." }, 501);
      }
      const metadata = normalizedFileMetadata(await request.json());
      const updated = await store.updateFile(metadata.id, metadata);
      return updated ? json(updated) : json({ ok: false, message: "Arquivo não encontrado." }, 404);
    }
    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return json({ ok: false, message: "Arquivo não informado." }, 400);
      const deleted = await store.deleteFile(String(id).slice(0, 180));
      return deleted ? json({ ok: true }) : json({ ok: false, message: "Arquivo não encontrado." }, 404);
    }
    return json({ ok: false, message: "Método não permitido." }, 405, { Allow: "GET, PATCH, DELETE" });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleUpload(request, store, options = {}) {
  const authFailure = await authorize(request, options);
  if (authFailure) return authFailure;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const destinationId = String(form.get("destinationId") || "00");
    const note = String(form.get("note") || "").slice(0, 180);
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string") {
      return json({ ok: false, message: "Nenhum arquivo foi recebido." }, 400);
    }
    if (file.size > store.maxUploadBytes) {
      return json({ ok: false, message: `O arquivo ultrapassa o limite de ${Math.round(store.maxUploadBytes / 1024 / 1024)} MB deste armazenamento.` }, 413);
    }
    const saved = await store.saveFile({ id: randomId("file"), destinationId, note, file });
    return json(saved, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleFileDownload(request, store, options = {}) {
  const authFailure = await authorize(request, options);
  if (authFailure) return authFailure;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ ok: false, message: "Arquivo não informado." }, 400);
    const result = await store.getFile(String(id).slice(0, 180));
    if (!result) return json({ ok: false, message: "Arquivo não encontrado." }, 404);
    const filename = safeFilename(result.metadata.name);
    const headers = {
      "Content-Type": result.metadata.mimeType || "application/octet-stream",
      "Content-Length": String(result.metadata.sizeBytes || ""),
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    };
    if (!headers["Content-Length"]) delete headers["Content-Length"];
    if (result.etag) headers.ETag = result.etag;
    return new Response(result.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleNews(request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const limit = Math.min(15, Math.max(1, Number(url.searchParams.get("limit") || 10)));
    const items = await fetchNewsItems(query, limit);
    return json({ ok: true, items, fetchedAt: new Date().toISOString() }, 200, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleCalendar(request) {
  if (request.method !== "POST") {
    return json({ ok: false, message: "Método não permitido." }, 405, { Allow: "POST" });
  }
  try {
    const body = await request.json();
    const ics = await fetchCalendarIcs(body?.url);
    return new Response(ics, {
      status: 200,
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": "text/calendar; charset=utf-8"
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
