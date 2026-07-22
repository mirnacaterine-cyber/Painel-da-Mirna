import { timingSafeEqual } from "node:crypto";
import { createTeacherStore } from "../server/teacher-store.js";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function json(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { ...HEADERS, ...extra } });
}

function safeEquals(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request) {
  const expected = process.env.PAINEL_API_TOKEN;
  if (!expected) return json({ ok: false, message: "Defina PAINEL_API_TOKEN na Vercel antes de ativar dados privados." }, 503);
  const received = request.headers.get("x-painel-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return received && safeEquals(received, expected) ? null : json({ ok: false, message: "Token pessoal ausente ou inválido." }, 401);
}

function resourceFrom(request, body = {}) {
  const url = new URL(request.url);
  return String(body.resource || url.searchParams.get("resource") || "").trim();
}

function id(prefix = "teacher") {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function run(request) {
  const authFailure = authorize(request);
  if (authFailure) return authFailure;
  try {
    const store = await createTeacherStore();
    if (request.method === "GET") return json({ ok: true, ...(await store.snapshot()) });
    if (request.method === "POST") {
      const body = await request.json();
      const resource = resourceFrom(request, body);
      const created = await store.create(resource, String(body.id || id(resource.slice(0, -1) || "teacher")).slice(0, 120), body.data || {});
      return json({ ok: true, item: created }, 201);
    }
    if (request.method === "PATCH") {
      const body = await request.json();
      const resource = resourceFrom(request, body);
      const recordId = String(body.id || "").slice(0, 120);
      const updated = await store.update(resource, recordId, body.data || {});
      return updated ? json({ ok: true, item: updated }) : json({ ok: false, message: "Registro não encontrado." }, 404);
    }
    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const resource = resourceFrom(request);
      const recordId = String(url.searchParams.get("id") || "").slice(0, 120);
      const removed = await store.remove(resource, recordId);
      return removed ? json({ ok: true }) : json({ ok: false, message: "Registro não encontrado." }, 404);
    }
    return json({ ok: false, message: "Método não permitido." }, 405, { Allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    return json({ ok: false, message: error?.message || "Não foi possível concluir esta ação." }, Number(error?.status) || 500);
  }
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
