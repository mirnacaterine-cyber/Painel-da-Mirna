import { authenticateRequest, getUserState, putUserState } from "../server/auth-store.js";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: HEADERS });
}

async function requireSession(request) {
  const session = await authenticateRequest(request);
  if (!session) throw Object.assign(new Error("Entre novamente para sincronizar."), { status: 401 });
  return session;
}

function validPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) && payload.values && typeof payload.values === "object" && !Array.isArray(payload.values);
}

async function run(request) {
  try {
    const session = await requireSession(request);
    if (request.method === "GET") {
      const state = await getUserState(session.user.id);
      return state ? json({ ok: true, ...state }) : json({ ok: true, empty: true, payload: null });
    }
    if (request.method === "PUT") {
      const body = await request.json();
      if (!validPayload(body?.payload)) return json({ ok: false, message: "Estado de sincronizacao invalido." }, 400);
      const size = Buffer.byteLength(JSON.stringify(body.payload));
      if (size > 2 * 1024 * 1024) return json({ ok: false, message: "Os dados ultrapassam o limite de 2 MB." }, 413);
      const saved = await putUserState(session.user.id, body.payload, body.clientUpdatedAt || null);
      return json({ ok: true, ...saved });
    }
    return json({ ok: false, message: "Metodo nao permitido." }, 405);
  } catch (error) {
    return json({ ok: false, message: error?.message || "Nao foi possivel sincronizar." }, Number(error?.status) || 500);
  }
}

export const GET = run;
export const PUT = run;
