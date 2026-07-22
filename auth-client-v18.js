const SYNC_KEYS = [
  "painel-da-mirna:v1",
  "painel-da-mirna:workspace:v3",
  "painel-da-mirna:teacher:v1",
  "painel-da-mirna:teacher-schedules:v1",
  "atelie-da-mirna:v3",
  "painel-da-mirna:faculty:v1",
  "painel-da-mirna:calendar-connections:v1"
];
const META_KEY = "painel-da-mirna:sync-meta:v2";
const DEVICE_KEY = "painel-da-mirna:device:v1";
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
let suppress = false;
let timer = 0;
let user = null;
let status = "starting";
const listeners = new Set();

document.documentElement.style.visibility = "hidden";

function safe(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = `device-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
    originalSetItem.call(localStorage, DEVICE_KEY, value);
  }
  return value;
}

function snapshot() {
  const values = {};
  for (const key of SYNC_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) values[key] = value;
  }
  return { version: 2, deviceId: deviceId(), savedAt: new Date().toISOString(), values };
}

function fingerprint(payload = snapshot()) {
  const keys = Object.keys(payload.values || {}).sort();
  return JSON.stringify(keys.map((key) => [key, payload.values[key]]));
}

function meta() {
  return safe(localStorage.getItem(META_KEY), {}) || {};
}

function writeMeta(next) {
  originalSetItem.call(localStorage, META_KEY, JSON.stringify({ ...meta(), ...next }));
}

function notify() {
  for (const listener of listeners) listener({ user, status });
}

function setStatus(next) {
  status = next;
  notify();
}

function patchStorage() {
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && !suppress && SYNC_KEYS.includes(String(key))) markDirty();
  };
  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && !suppress && SYNC_KEYS.includes(String(key))) markDirty();
  };
}

function markDirty() {
  writeMeta({ dirtyAt: new Date().toISOString() });
  clearTimeout(timer);
  if (user) timer = window.setTimeout(() => syncNow().catch(() => {}), 1100);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "Falha de comunicacao."), { status: response.status });
  return data;
}

function hasMeaningfulLocalData(payload) {
  return Object.values(payload.values || {}).some((value) => {
    const parsed = safe(value, null);
    if (!parsed || typeof parsed !== "object") return Boolean(value);
    if (Array.isArray(parsed)) return parsed.length > 0;
    return Object.keys(parsed).some((key) => {
      if (["version", "dayKey", "weekKey", "theme", "calendarView", "cursorDate", "spotify", "updatedAt"].includes(key)) return false;
      const current = parsed[key];
      return Array.isArray(current) ? current.length > 0 : current && typeof current === "object" ? Object.keys(current).length > 0 : Boolean(current);
    });
  });
}

function applyCloud(payload) {
  suppress = true;
  try {
    for (const key of SYNC_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload.values || {}, key)) originalSetItem.call(localStorage, key, payload.values[key]);
      else originalRemoveItem.call(localStorage, key);
    }
  } finally {
    suppress = false;
  }
}

async function upload(localPayload = snapshot()) {
  setStatus("syncing");
  const saved = await request("/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: localPayload, clientUpdatedAt: localPayload.savedAt })
  });
  writeMeta({
    lastCloudUpdatedAt: saved.updatedAt,
    lastSyncedFingerprint: fingerprint(localPayload),
    dirtyAt: null,
    syncedAt: new Date().toISOString()
  });
  setStatus("synced");
  return saved;
}

export async function syncNow() {
  if (!user) {
    setStatus("local");
    return null;
  }
  const localPayload = snapshot();
  const currentMeta = meta();
  if (!currentMeta.dirtyAt && currentMeta.lastSyncedFingerprint === fingerprint(localPayload)) return null;
  return upload(localPayload);
}

async function initialSync() {
  setStatus("syncing");
  const cloud = await request("/api/sync");
  const localPayload = snapshot();
  const currentMeta = meta();
  if (cloud.empty || !cloud.payload) {
    await upload(localPayload);
    return;
  }
  const cloudFingerprint = fingerprint(cloud.payload);
  const localFingerprint = fingerprint(localPayload);
  const isNewDevice = !currentMeta.lastCloudUpdatedAt;
  const localDirty = Boolean(currentMeta.dirtyAt) && currentMeta.lastSyncedFingerprint !== localFingerprint;
  const localDirtyAt = Date.parse(currentMeta.dirtyAt || 0);
  const cloudClientAt = Date.parse(cloud.clientUpdatedAt || cloud.updatedAt || 0);
  if (isNewDevice && hasMeaningfulLocalData(localPayload) && !hasMeaningfulLocalData(cloud.payload)) {
    await upload(localPayload);
    return;
  }
  if (localDirty && localDirtyAt > cloudClientAt) {
    await upload(localPayload);
    return;
  }
  if (localFingerprint !== cloudFingerprint) {
    applyCloud(cloud.payload);
    writeMeta({ lastCloudUpdatedAt: cloud.updatedAt, lastSyncedFingerprint: cloudFingerprint, dirtyAt: null, syncedAt: new Date().toISOString() });
    const marker = sessionStorage.getItem("mirna-cloud-reload");
    if (marker !== cloud.updatedAt) {
      sessionStorage.setItem("mirna-cloud-reload", cloud.updatedAt);
      location.reload();
      await new Promise(() => {});
    }
  } else {
    writeMeta({ lastCloudUpdatedAt: cloud.updatedAt, lastSyncedFingerprint: localFingerprint, dirtyAt: null, syncedAt: new Date().toISOString() });
  }
  setStatus("synced");
}

async function initialize() {
  patchStorage();
  try {
    const session = await request("/api/auth");
    user = session.user;
    await initialSync();
    window.addEventListener("online", () => syncNow().catch(() => setStatus("error")));
    window.addEventListener("pagehide", () => {
      if (!user || !meta().dirtyAt) return;
      fetch("/api/sync", {
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: snapshot(), clientUpdatedAt: new Date().toISOString() })
      }).catch(() => {});
    });
  } catch (error) {
    if (error.status === 401) {
      user = null;
      setStatus("local");
    } else {
      setStatus("error");
    }
  } finally {
    document.documentElement.classList.add("auth-resolved");
    document.documentElement.style.visibility = "";
  }
  return user;
}

export async function logout() {
  if (user) {
    await request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" })
    }).catch(() => {});
  }
  sessionStorage.clear();
  location.replace("/login/");
}

export const authReady = initialize();
export const currentUser = () => user;
export const syncStatus = () => status;
export const subscribeSync = (listener) => {
  listeners.add(listener);
  listener({ user, status });
  return () => listeners.delete(listener);
};