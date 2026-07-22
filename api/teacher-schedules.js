import { timingSafeEqual } from "node:crypto";
import { createTeacherScheduleStore } from "../server/teacher-schedule-store.js";

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

function id(prefix = "schedule") {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function run(request) {
  const authFailure = authorize(request);
  if (authFailure) return authFailure;
  try {
    const store = await createTeacherScheduleStore();
    if (request.method === "GET") return json({ ok: true, schedules: await store.list() });
    if (request.method === "POST") {
      const body = await request.json();
      const item = await store.create(String(body.id || id()).slice(0, 120), body.data || {});
      return json({ ok: true, item }, 201);
    }
    if (request.method === "PATCH") {
      const body = await request.json();
      const item = await store.update(String(body.id || "").slice(0, 120), body.data || {});
      return item ? json({ ok: true, item }) : json({ ok: false, message: "Rotina não encontrada." }, 404);
    }
    if (request.method === "DELETE") {
      const recordId = String(new URL(request.url).searchParams.get("id") || "").slice(0, 120);
      const removed = await store.remove(recordId);
      return removed ? json({ ok: true }) : json({ ok: false, message: "Rotina não encontrada." }, 404);
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
