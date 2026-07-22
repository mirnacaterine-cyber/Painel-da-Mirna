import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "mirna_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
let sqlClientPromise;
let schemaPromise;

function appError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase().slice(0, 180);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw appError("Informe um e-mail valido.");
  return email;
}

function safeText(value, max = 100) {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, max);
}

function safeEquals(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function parseCookies(request) {
  const cookie = request.headers.get("cookie") || "";
  return Object.fromEntries(cookie.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw appError("Banco Neon ainda nao foi conectado ao projeto.", 503);
  if (!sqlClientPromise) {
    sqlClientPromise = import("@neondatabase/serverless").then(({ neon }) => neon(process.env.DATABASE_URL));
  }
  return sqlClientPromise;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = await getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES mirna_users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mirna_sessions_token_idx ON mirna_sessions(token_hash)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_sessions_expiry_idx ON mirna_sessions(expires_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_user_state (
          user_id TEXT PRIMARY KEY REFERENCES mirna_users(id) ON DELETE CASCADE,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          client_updated_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })();
  }
  return schemaPromise;
}

async function hashPassword(password) {
  const normalized = String(password || "");
  if (normalized.length < 8) throw appError("A senha precisa ter pelo menos 8 caracteres.");
  if (normalized.length > 200) throw appError("A senha informada e muito longa.");
  const salt = randomBytes(16);
  const derived = await scrypt(normalized, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, saltHex, hashHex] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = Buffer.from(await scrypt(String(password || ""), Buffer.from(saltHex, "hex"), expected.length, { N: 16384, r: 8, p: 1 }));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function userShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    createdAt: new Date(row.created_at).toISOString()
  };
}

async function createSession(sql, userId) {
  const token = randomBytes(32).toString("base64url");
  const id = `session-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await sql`
    INSERT INTO mirna_sessions (id, user_id, token_hash, expires_at)
    VALUES (${id}, ${userId}, ${tokenHash(token)}, ${expiresAt})
  `;
  return { token, expiresAt };
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function setupStatus() {
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM mirna_users`;
  return { configured: Number(rows[0]?.count || 0) > 0 };
}

export async function registerUser({ name, email, password, activationCode }) {
  await ensureSchema();
  const expected = process.env.PAINEL_API_TOKEN;
  if (!expected) throw appError("O codigo de ativacao ainda nao foi configurado na Vercel.", 503);
  if (!safeEquals(activationCode, expected)) throw appError("Codigo de ativacao invalido.", 401);
  const sql = await getSql();
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM mirna_users`;
  if (Number(countRows[0]?.count || 0) > 0) throw appError("O cadastro inicial ja foi concluido.", 409);
  const displayName = safeText(name, 80);
  if (displayName.length < 2) throw appError("Informe o nome da pessoa que usara o Atelie.");
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const userId = `user-${crypto.randomUUID()}`;
  try {
    const rows = await sql`
      INSERT INTO mirna_users (id, email, display_name, password_hash)
      VALUES (${userId}, ${normalizedEmail}, ${displayName}, ${passwordHash})
      RETURNING id, email, display_name, created_at
    `;
    const session = await createSession(sql, userId);
    return { user: userShape(rows[0]), ...session };
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) throw appError("O cadastro inicial ja foi concluido.", 409);
    throw error;
  }
}

export async function loginUser({ email, password }) {
  await ensureSchema();
  const sql = await getSql();
  const normalizedEmail = normalizeEmail(email);
  const rows = await sql`
    SELECT id, email, display_name, password_hash, created_at
    FROM mirna_users
    WHERE email = ${normalizedEmail}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) throw appError("E-mail ou senha incorretos.", 401);
  await sql`DELETE FROM mirna_sessions WHERE expires_at <= NOW()`;
  const session = await createSession(sql, row.id);
  return { user: userShape(row), ...session };
}

export async function authenticateRequest(request) {
  const token = parseCookies(request)[COOKIE_NAME] || "";
  if (!token) return null;
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.created_at, s.id AS session_id, s.expires_at
    FROM mirna_sessions s
    JOIN mirna_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  await sql`UPDATE mirna_sessions SET last_seen_at = NOW() WHERE id = ${row.session_id}`;
  return { user: userShape(row), sessionId: row.session_id, expiresAt: new Date(row.expires_at).toISOString() };
}

export async function destroySession(request) {
  const token = parseCookies(request)[COOKIE_NAME] || "";
  if (!token) return;
  await ensureSchema();
  const sql = await getSql();
  await sql`DELETE FROM mirna_sessions WHERE token_hash = ${tokenHash(token)}`;
}

export async function getUserState(userId) {
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`
    SELECT payload, client_updated_at, updated_at
    FROM mirna_user_state
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    payload: row.payload,
    clientUpdatedAt: row.client_updated_at ? new Date(row.client_updated_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export async function putUserState(userId, payload, clientUpdatedAt) {
  await ensureSchema();
  const sql = await getSql();
  const serialized = JSON.stringify(payload);
  const rows = await sql`
    INSERT INTO mirna_user_state (user_id, payload, client_updated_at, updated_at)
    VALUES (${userId}, CAST(${serialized} AS jsonb), ${clientUpdatedAt || null}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      payload = EXCLUDED.payload,
      client_updated_at = EXCLUDED.client_updated_at,
      updated_at = NOW()
    RETURNING payload, client_updated_at, updated_at
  `;
  const row = rows[0];
  return {
    payload: row.payload,
    clientUpdatedAt: row.client_updated_at ? new Date(row.client_updated_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
