import { parseIcs } from "./calendar.js";
import { resolveSpotifyContent } from "./spotify.js";

const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const CALENDAR_KEY = "painel-da-mirna:calendar-connections:v1";
const TOKEN_KEY = "painel-da-mirna:cloud-token:v1";
const CLOUD_CONFIG_KEY = "painel-da-mirna:cloud-config:v1";
const CLOUD_STATE_ID = "mirna-workspace-v5";
const PROFILE_URL = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const DEFAULT_PLAYLIST = "https://open.spotify.com/playlist/1DgRQ20bvrC01pUtSR4yzC";
const AUTO_SOURCE = "google-calendar-v5";
const REFRESH_MS = 10 * 60 * 1000;
const channel = "BroadcastChannel" in window
  ? new BroadcastChannel("painel-da-mirna-workspace")
  : null;

let calendarSyncRunning = false;
let cloudSyncRunning = false;
let timer;

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function workspaceState() {
  return safeJson(localStorage.getItem(WORKSPACE_KEY), {}) || {};
}

function publishWorkspace(next) {
  if (!next || typeof next !== "object") return;
  next.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  channel?.postMessage(next);
}

function cloudToken() {
  const direct = localStorage.getItem(TOKEN_KEY)?.trim();
  if (direct) return direct;
  const config = safeJson(localStorage.getItem(CLOUD_CONFIG_KEY), {});
  return typeof config?.cloudToken === "string" ? config.cloudToken.trim() : "";
}

function authHeaders(extra = {}) {
  const token = cloudToken();
  return token ? { ...extra, "x-painel-token": token } : extra;
}

function mergeById(localItems = [], remoteItems = []) {
  const merged = new Map();
  for (const item of remoteItems || []) if (item?.id) merged.set(item.id, item);
  for (const item of localItems || []) if (item?.id) merged.set(item.id, { ...merged.get(item.id), ...item });
  return [...merged.values()];
}

function ensureSpotify() {
  const current = workspaceState();
  const content = resolveSpotifyContent(current.spotify?.contentUrl);
  if (content?.kind === "embed" && current.spotify?.profileUrl === PROFILE_URL) return false;
  publishWorkspace({
    ...current,
    spotify: { profileUrl: PROFILE_URL, contentUrl: DEFAULT_PLAYLIST }
  });
  return true;
}

function calendarConnections() {
  const rows = safeJson(localStorage.getItem(CALENDAR_KEY), []);
  return Array.isArray(rows)
    ? rows.filter((item) => item?.id && item?.url)
    : [];
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function clean(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function categoryForText(...values) {
  const text = values.join(" ").toLocaleLowerCase("pt-BR");
  if (/ballet|balé|gin[aá]stica|r[ií]tmica|\bgr\b|aula|coreografia|martin luther/.test(text)) return "01";
  if (/faculdade|direito|dan[cç]a|unioeste|prova|trabalho acad[eê]mico|estudar/.test(text)) return "02";
  if (/trabalho|financeiro|pagamento|cliente|reuni[aã]o profissional/.test(text)) return "03";
  if (/casa|casinha|mercado|limpeza|aluguel/.test(text)) return "05";
  if (/viagem|festival|hotel|voo|passagem/.test(text)) return "06";
  if (/fam[ií]lia|missa|igreja|anivers[aá]rio/.test(text)) return "07";
  if (/livro|curso|leitura|pesquisa|refer[eê]ncia/.test(text)) return "08";
  return "00";
}

function setCalendarStatus(message, type = "") {
  const element = document.querySelector("#hub-calendar-status");
  if (!element) return;
  element.textContent = message;
  element.className = `hub-status${type ? ` ${type}` : ""}`;
}

function updateCalendarCount(count) {
  const badge = document.querySelector("#hub-calendar-count");
  if (badge) badge.textContent = String(count);
}

async function readCalendar(connection, rangeStart, rangeEnd, timeZone) {
  const response = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: connection.url }),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "A agenda não respondeu.");
  }

  const parsed = parseIcs(await response.text(), { timeZone, rangeStart, rangeEnd });
  return parsed.events.map((event) => {
    const notes = [event.location, event.description]
      .map((value) => clean(value, 220))
      .filter(Boolean)
      .join(" · ");
    return {
      id: `google-v5-${hashString(`${connection.id}:${event.id}:${event.start.toISOString()}`)}`,
      title: clean(event.title, 120) || "Compromisso",
      date: dateKey(event.start),
      start: event.allDay ? "" : timeValue(event.start),
      end: event.allDay ? "" : timeValue(event.end),
      allDay: Boolean(event.allDay),
      category: categoryForText(event.title, notes),
      notes,
      color: connection.color || "#8f5f72",
      sourceName: clean(connection.name || "Google Agenda", 60),
      autoSource: AUTO_SOURCE,
      readOnly: true,
      createdAt: new Date().toISOString()
    };
  });
}

export async function syncConnectedCalendars() {
  if (calendarSyncRunning) return false;
  const connections = calendarConnections();
  updateCalendarCount(connections.length);

  if (!connections.length) {
    setCalendarStatus("Cole o endereço secreto iCal uma vez; depois a atualização será automática.");
    return false;
  }

  calendarSyncRunning = true;
  setCalendarStatus("Sincronizando agendas…");
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 35);
  const rangeEnd = new Date();
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

  try {
    const results = await Promise.allSettled(
      connections.map((connection) => readCalendar(connection, rangeStart, rangeEnd, timeZone))
    );
    const imported = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const successes = results.filter((result) => result.status === "fulfilled").length;
    const failures = results.length - successes;

    if (!successes) {
      setCalendarStatus("Nenhuma agenda respondeu. Gere um novo endereço secreto iCal no Google Agenda.", "is-error");
      return false;
    }

    const current = workspaceState();
    const preserved = Array.isArray(current.events)
      ? current.events.filter((event) => event.autoSource !== AUTO_SOURCE && event.autoSource !== "google-calendar")
      : [];
    publishWorkspace({ ...current, events: [...preserved, ...imported] });

    const detail = failures
      ? `${successes} sincronizada(s) · ${failures} com link inválido ou expirado`
      : `${successes} agenda(s) sincronizada(s) · ${imported.length} evento(s) importado(s)`;
    setCalendarStatus(detail, failures ? "is-error" : "is-ok");
    await syncWorkspaceCloud();
    return true;
  } finally {
    calendarSyncRunning = false;
  }
}

export async function syncWorkspaceCloud() {
  if (cloudSyncRunning) return false;
  const token = cloudToken();
  if (!token) return false;
  cloudSyncRunning = true;

  try {
    let local = workspaceState();
    const headers = authHeaders({ Accept: "application/json" });
    const remoteResponse = await fetch(`/api/state?id=${encodeURIComponent(CLOUD_STATE_ID)}`, {
      headers,
      cache: "no-store"
    });

    if (remoteResponse.ok) {
      const remote = await remoteResponse.json();
      const payload = remote?.payload && typeof remote.payload === "object" ? remote.payload : {};
      local = {
        ...payload,
        ...local,
        calendarView: local.calendarView || payload.calendarView,
        cursorDate: local.cursorDate || payload.cursorDate,
        selectedDate: local.selectedDate || payload.selectedDate,
        events: mergeById(local.events, payload.events),
        cards: mergeById(local.cards, payload.cards),
        notes: mergeById(local.notes, payload.notes),
        spotify: {
          profileUrl: PROFILE_URL,
          contentUrl: local.spotify?.contentUrl || payload.spotify?.contentUrl || DEFAULT_PLAYLIST
        }
      };
      publishWorkspace(local);
    } else if (remoteResponse.status !== 404) {
      return false;
    }

    const saveResponse = await fetch("/api/state", {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({
        id: CLOUD_STATE_ID,
        payload: local,
        clientUpdatedAt: local.updatedAt || new Date().toISOString()
      })
    });
    return saveResponse.ok;
  } catch {
    return false;
  } finally {
    cloudSyncRunning = false;
  }
}

function scheduleCloudSync(delay = 800) {
  window.setTimeout(() => syncWorkspaceCloud(), delay);
}

async function init() {
  const startedAt = Date.now();
  while (!window.__mirnaWorkspace && Date.now() - startedAt < 16000) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  ensureSpotify();
  await Promise.allSettled([syncConnectedCalendars(), syncWorkspaceCloud()]);
  timer = window.setInterval(
    () => Promise.allSettled([syncConnectedCalendars(), syncWorkspaceCloud()]),
    REFRESH_MS
  );

  window.addEventListener("storage", (event) => {
    if (event.key === CALENDAR_KEY) syncConnectedCalendars();
    if ([WORKSPACE_KEY, TOKEN_KEY, CLOUD_CONFIG_KEY].includes(event.key)) scheduleCloudSync(100);
  });
  window.addEventListener("online", () => Promise.allSettled([syncConnectedCalendars(), syncWorkspaceCloud()]));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      Promise.allSettled([syncConnectedCalendars(), syncWorkspaceCloud()]);
    }
  });
  channel?.addEventListener("message", () => scheduleCloudSync());

  window.__mirnaIntegrationsV5 = {
    syncCalendars: syncConnectedCalendars,
    syncCloud: syncWorkspaceCloud,
    ensureSpotify
  };
}

init().catch(() => setCalendarStatus("As integrações não conseguiram iniciar; o modo local continua ativo.", "is-error"));
window.addEventListener("beforeunload", () => {
  window.clearInterval(timer);
  channel?.close();
});