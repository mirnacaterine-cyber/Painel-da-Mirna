import {
  authenticateRequest,
  clearSessionCookie,
  destroySession,
  loginUser,
  registerUser,
  sessionCookie,
  setupStatus
} from "../server/auth-store.js";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...HEADERS, ...extraHeaders } });
}

function failure(error) {
  return json({ ok: false, message: error?.message || "Nao foi possivel concluir o acesso." }, Number(error?.status) || 500);
}

export async function GET(request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode") || "session";
    if (mode === "status") {
      const status = await setupStatus();
      const session = await authenticateRequest(request);
      return json({ ok: true, ...status, user: session?.user || null });
    }
    const session = await authenticateRequest(request);
    return session
      ? json({ ok: true, user: session.user, expiresAt: session.expiresAt })
      : json({ ok: false, message: "Sessao nao encontrada." }, 401);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "login");
    if (action === "register") {
      const result = await registerUser(body);
      return json({ ok: true, user: result.user }, 201, { "Set-Cookie": sessionCookie(result.token) });
    }
    if (action === "login") {
      const result = await loginUser(body);
      return json({ ok: true, user: result.user }, 200, { "Set-Cookie": sessionCookie(result.token) });
    }
    if (action === "logout") {
      await destroySession(request);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }
    return json({ ok: false, message: "Acao de acesso invalida." }, 400);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request) {
  try {
    await destroySession(request);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch (error) {
    return failure(error);
  }
}
