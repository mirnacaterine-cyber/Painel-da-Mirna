import { timingSafeEqual } from "node:crypto";
import { authenticateRequest } from "../server/auth-store.js";
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

async function authorize(request) {
  const expected = process.env.PAINEL_API_TOKEN;
  const received = request.headers.get("x-painel-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (expected && received && safeEquals(received, expected)) return null;
  try {
    if (await authenticateRequest(request)) return null;
  } catch (error) {
    if (!expected) return json({ ok: false, message: error?.message || "Banco de acesso indisponivel." }, Number(error?.status) || 503);
  }
  return json({ ok: false, message: "Entre novamente para acessar as rotinas." }, 401);
}

function id(prefix = "schedule") {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function run(request) {
  const authFailure = await authorize(request);
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
      return item ? json({ ok: true, item }) : json({ ok: false, message: "Rotina nao encontrada." }, 404);
    }
    if (request.method === "DELETE") {
      const recordId = String(new URL(request.url).searchParams.get("id") || "").slice(0, 120);
      const removed = await store.remove(recordId);
      return removed ? json({ ok: true }) : json({ ok: false, message: "Rotina nao encontrada." }, 404);
    }
    return json({ ok: false, message: "Metodo nao permitido." }, 405, { Allow: "GET, POST, PATCH, DELETE" });
  } catch (error) {
    return json({ ok: false, message: error?.message || "Nao foi possivel concluir esta acao." }, Number(error?.status) || 500);
  }
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
