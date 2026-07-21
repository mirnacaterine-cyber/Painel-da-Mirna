import { parseIcs } from "./calendar.js";

const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const LEGACY_CONNECTION_KEY = "painel-da-mirna:calendar-connections:v1";
const SAFE_CONNECTION_KEY = "painel-da-mirna:ical-feeds:v6";
const LEGACY_JARVIS_KEY = "jarvis_calendars";
const REFRESH_MS = 10 * 60 * 1000;
const DATE_LOCALE = "pt-BR";
const ALLOWED_HOSTS = new Set(["calendar.google.com", "calendar.googleusercontent.com"]);
const channel = "BroadcastChannel" in window ? new BroadcastChannel("painel-da-mirna-workspace") : null;

let connections = [];
let syncing = false;
let refreshTimer;
let statusTimer;

function uid(prefix = "calendar") {
  return `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function encodeSecret(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeSecret(value) {
  try {
    const binary = atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function cleanText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function categoryForText(...values) {
  const text = values.join(" ").toLocaleLowerCase(DATE_LOCALE);
  if (/ballet|balé|gin[aá]stica|r[ií]tmica|\bgr\b|aula|coreografia|martin luther/.test(text)) return "01";
  if (/faculdade|direito|dan[cç]a|unioeste|prova|trabalho acad[eê]mico|estudar/.test(text)) return "02";
  if (/trabalho|financeiro|pagamento|cliente|reuni[aã]o profissional/.test(text)) return "03";
  if (/casa|casinha|mercado|limpeza|aluguel/.test(text)) return "05";
  if (/viagem|festival|hotel|voo|passagem/.test(text)) return "06";
  if (/fam[ií]lia|missa|igreja|anivers[aá]rio/.test(text)) return "07";
  if (/livro|curso|leitura|pesquisa|refer[eê]ncia/.test(text)) return "08";
  return "00";
}

function decodeCid(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return atob(padded);
  } catch {
    return "";
  }
}

function normalizeCalendarUrl(rawValue) {
  const value = String(rawValue || "").trim();
  let url;
  try { url = new URL(value); } catch { throw new Error("O endereço informado não é um link válido."); }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("Use um endereço do Google Agenda em HTTPS.");
  }

  if (/\/calendar\/ical\//i.test(url.pathname) || /\.ics$/i.test(url.pathname)) {
    url.hash = "";
    return { url: url.toString(), convertedFromView: false };
  }

  const cid = url.searchParams.get("cid");
  if (cid) {
    const calendarId = decodeCid(cid);
    if (!calendarId || !calendarId.includes("@")) {
      throw new Error("Este é um link de visualização. Copie o ‘Endereço secreto em formato iCal’ nas configurações da agenda.");
    }
    return {
      url: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`,
      convertedFromView: true
    };
  }

  throw new Error("Copie o ‘Endereço secreto em formato iCal’, normalmente terminado em basic.ics.");
}

function connectionUrl(connection) {
  return decodeSecret(connection.secret);
}

function sanitizedConnection(connection) {
  return {
    id: connection.id,
    name: cleanText(connection.name || "Google Agenda", 60),
    color: /^#[0-9a-f]{6}$/i.test(connection.color || "") ? connection.color : "#8f5f72",
    secret: connection.secret,
    lastStatus: connection.lastStatus || "idle",
    lastSyncAt: connection.lastSyncAt || "",
    eventCount: Number(connection.eventCount || 0),
    error: cleanText(connection.error || "", 180)
  };
}

function dedupeConnections(items) {
  const map = new Map();
  for (const item of items) {
    const url = connectionUrl(item);
    if (!url) continue;
    const key = hashString(url);
    const existing = map.get(key);
    map.set(key, sanitizedConnection({ ...existing, ...item }));
  }
  return [...map.values()];
}

function migrateLegacyConnections() {
  const migrated = [];
  for (const key of [LEGACY_CONNECTION_KEY, LEGACY_JARVIS_KEY]) {
    const value = safeJson(localStorage.getItem(key), []);
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const rawUrl = typeof item === "string" ? item : item?.url;
      if (!rawUrl) continue;
      try {
        const normalized = normalizeCalendarUrl(rawUrl);
        migrated.push({
          id: item?.id || uid(),
          name: item?.name || item?.label || "Google Agenda",
          color: item?.color || "#8f5f72",
          secret: encodeSecret(normalized.url),
          lastStatus: "idle",
          eventCount: 0,
          lastSyncAt: "",
          error: ""
        });
      } catch {
        // Links inválidos não são migrados para evitar ciclos de erro.
      }
    }
    localStorage.removeItem(key);
  }
  return migrated;
}

function loadConnections() {
  const saved = safeJson(localStorage.getItem(SAFE_CONNECTION_KEY), []);
  const migrated = migrateLegacyConnections();
  connections = dedupeConnections([
    ...(Array.isArray(saved) ? saved : []),
    ...migrated
  ]);
  saveConnections({ notify: false });
  return connections;
}

function saveConnections({ notify = true } = {}) {
  connections = dedupeConnections(connections);
  localStorage.setItem(SAFE_CONNECTION_KEY, JSON.stringify(connections.map(sanitizedConnection)));
  localStorage.removeItem(LEGACY_CONNECTION_KEY);
  localStorage.removeItem(LEGACY_JARVIS_KEY);
  if (notify) window.dispatchEvent(new CustomEvent("mirna:calendar-connections", { detail: { count: connections.length } }));
}

function workspaceState() {
  const state = safeJson(localStorage.getItem(WORKSPACE_KEY), {});
  return state && typeof state === "object" ? state : {};
}

function publishWorkspace(next) {
  next.updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(next);
  localStorage.setItem(WORKSPACE_KEY, serialized);
  channel?.postMessage(next);
  window.dispatchEvent(new CustomEvent("mirna:calendar-updated", { detail: { count: next.events?.length || 0 } }));
}

function friendlyFetchError(status, message, convertedFromView = false) {
  if (convertedFromView && [401, 403, 404].includes(status)) {
    return "O link de visualização não dá acesso aos eventos. Copie o Endereço secreto em formato iCal nas configurações do Google Agenda.";
  }
  if ([401, 403, 404].includes(status)) {
    return "O Google recusou este endereço. Gere um novo Endereço secreto em formato iCal e tente novamente.";
  }
  if (status === 408 || status === 504) return "A agenda demorou demais para responder. Tente atualizar novamente.";
  if (status >= 500) return "O Google Agenda não respondeu agora. O painel manteve os últimos eventos válidos.";
  return message || `Não foi possível consultar a agenda (erro ${status}).`;
}

async function fetchAndParseCalendar(connection, normalizedMeta = {}) {
  const url = connectionUrl(connection);
  if (!url) throw new Error("Endereço da agenda ausente.");
  const response = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    cache: "no-store"
  });
  const raw = await response.text();
  if (!response.ok) {
    let message = "";
    try { message = JSON.parse(raw)?.message || ""; } catch { message = raw.slice(0, 160); }
    throw Object.assign(new Error(friendlyFetchError(response.status, message, normalizedMeta.convertedFromView)), { status: response.status });
  }
  if (!/BEGIN:VCALENDAR/i.test(raw)) throw new Error("O endereço não devolveu um calendário iCal válido.");

  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 45);
  const rangeEnd = new Date();
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
  const parsed = parseIcs(raw, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
    rangeStart,
    rangeEnd
  });
  if (!parsed || !Array.isArray(parsed.events)) throw new Error("O calendário foi recebido, mas não pôde ser interpretado.");
  return parsed;
}

function toWorkspaceEvent(event, connection) {
  const notes = [event.location, event.description].map((value) => cleanText(value, 240)).filter(Boolean).join(" · ");
  const stable = hashString(`${connection.id}:${event.uid || event.id}:${event.start.toISOString()}`);
  return {
    id: `gcal-v6-${stable}`,
    title: cleanText(event.title || "Compromisso", 140),
    date: dateKey(event.start),
    start: event.allDay ? "" : timeValue(event.start),
    end: event.allDay ? "" : timeValue(event.end),
    category: categoryForText(event.title, notes),
    notes,
    autoSource: "google-calendar-v6",
    sourceId: connection.id,
    sourceName: connection.name,
    sourceColor: connection.color,
    readOnly: true,
    allDay: Boolean(event.allDay),
    createdAt: new Date().toISOString()
  };
}

function mergeCalendarEvents(imported) {
  const current = workspaceState();
  const preserved = Array.isArray(current.events)
    ? current.events.filter((event) => !["google-calendar", "google-calendar-v6"].includes(event?.autoSource))
    : [];
  const unique = new Map();
  for (const event of imported) unique.set(event.id, event);
  publishWorkspace({
    ...current,
    events: [...preserved, ...unique.values()],
    calendarView: current.calendarView || "pop",
    cursorDate: current.cursorDate || dateKey(),
    selectedDate: current.selectedDate || dateKey()
  });
}

function statusElement() {
  return document.querySelector("#hub-calendar-status");
}

function setStatus(message, type = "") {
  const element = statusElement();
  if (!element) return;
  element.textContent = message;
  element.className = `hub-status${type ? ` is-${type}` : ""}`;
}

function maskUrl(url) {
  try {
    const parsed = new URL(url);
    const suffix = parsed.pathname.split("/").filter(Boolean).pop() || "basic.ics";
    return `${parsed.hostname}/…/${suffix}`;
  } catch { return "link protegido"; }
}

function renderConnections() {
  const list = document.querySelector("#hub-calendar-list");
  const count = document.querySelector("#hub-calendar-count");
  if (count) count.textContent = String(connections.length);
  if (!list) return;
  if (!connections.length) {
    list.innerHTML = '<div class="hub-empty">Nenhuma agenda conectada neste navegador.</div>';
    return;
  }
  list.innerHTML = connections.map((connection) => {
    const url = connectionUrl(connection);
    const stateLabel = connection.lastStatus === "ok"
      ? `${connection.eventCount} evento(s) · ${connection.lastSyncAt ? new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(new Date(connection.lastSyncAt)) : "agora"}`
      : connection.lastStatus === "error" ? connection.error || "Falha na atualização" : "Aguardando primeira atualização";
    return `
      <div class="hub-secret-item" data-calendar-id="${connection.id}">
        <div>
          <strong><span style="color:${connection.color}">●</span> ${connection.name.replace(/[<>&"]/g, "")}</strong>
          <small>${maskUrl(url)} · ${stateLabel.replace(/[<>&"]/g, "")}</small>
        </div>
        <div class="hub-actions">
          <button class="hub-mini" data-calendar-sync="${connection.id}" type="button">Atualizar</button>
          <button class="hub-mini" data-calendar-remove="${connection.id}" type="button">Remover</button>
        </div>
      </div>`;
  }).join("");
}

function updateSummaryWidgets(importedCount = null) {
  const totalEvents = importedCount ?? workspaceState().events?.filter((event) => event?.autoSource === "google-calendar-v6").length ?? 0;
  const today = dateKey();
  const current = workspaceState();
  const todayCount = (current.events || []).filter((event) => event.date === today).length
    + (current.cards || []).filter((card) => card.dueDate === today && card.column !== "done").length;
  const calendarStrong = document.querySelector("#mirna-auto-calendar");
  const calendarDetail = document.querySelector("#mirna-auto-calendar-detail");
  if (calendarStrong) calendarStrong.textContent = `${todayCount} ${todayCount === 1 ? "item hoje" : "itens hoje"}`;
  if (calendarDetail) calendarDetail.textContent = connections.length
    ? `${connections.length} ${connections.length === 1 ? "agenda conectada" : "agendas conectadas"} · ${totalEvents} evento(s)`
    : "Eventos locais e tarefas ativos";
}

async function syncConnections(targetIds = null) {
  if (syncing) return false;
  syncing = true;
  const targets = targetIds ? connections.filter((item) => targetIds.includes(item.id)) : [...connections];
  if (!targets.length) {
    mergeCalendarEvents([]);
    renderConnections();
    updateSummaryWidgets(0);
    setStatus("Nenhuma agenda conectada. Cole um endereço secreto iCal para começar.");
    syncing = false;
    return true;
  }

  setStatus("Atualizando as agendas sem alterar sua visualização…");
  const imported = [];
  let successes = 0;
  let failures = 0;

  const results = await Promise.allSettled(targets.map(async (connection) => {
    const parsed = await fetchAndParseCalendar(connection);
    return { connection, parsed };
  }));

  results.forEach((result, index) => {
    const connection = targets[index];
    if (result.status === "fulfilled") {
      const events = result.value.parsed.events.map((event) => toWorkspaceEvent(event, connection));
      imported.push(...events);
      connection.lastStatus = "ok";
      connection.lastSyncAt = new Date().toISOString();
      connection.eventCount = events.length;
      connection.error = "";
      successes += 1;
    } else {
      connection.lastStatus = "error";
      connection.lastSyncAt = new Date().toISOString();
      connection.error = cleanText(result.reason?.message || "Não foi possível atualizar.", 180);
      failures += 1;
    }
  });

  if (!targetIds) {
    mergeCalendarEvents(imported);
  } else {
    const currentImported = (workspaceState().events || []).filter((event) => event.autoSource === "google-calendar-v6" && !targets.some((connection) => connection.id === event.sourceId));
    mergeCalendarEvents([...currentImported, ...imported]);
  }

  saveConnections({ notify: false });
  renderConnections();
  updateSummaryWidgets();
  if (failures && successes) setStatus(`${successes} agenda(s) atualizada(s); ${failures} precisa(m) de atenção.`, "error");
  else if (failures) setStatus("A agenda não foi alterada. Confira a mensagem ao lado de cada conexão.", "error");
  else setStatus(`${successes} agenda(s) atualizada(s) com sucesso.`, "ok");
  syncing = false;
  return failures === 0;
}

async function addConnectionFromForm(form) {
  const nameInput = form.querySelector("#hub-calendar-name");
  const colorInput = form.querySelector("#hub-calendar-color");
  const urlInput = form.querySelector("#hub-calendar-url");
  const submitButton = form.querySelector('button[type="submit"]');
  const rawUrl = urlInput?.value.trim() || "";
  if (!rawUrl) {
    setStatus("Cole o Endereço secreto em formato iCal.", "error");
    urlInput?.focus();
    return;
  }

  submitButton?.setAttribute("disabled", "");
  setStatus("Testando o endereço antes de salvar…");
  try {
    const normalized = normalizeCalendarUrl(rawUrl);
    const draft = {
      id: uid(),
      name: cleanText(nameInput?.value || "Google Agenda", 60),
      color: colorInput?.value || "#8f5f72",
      secret: encodeSecret(normalized.url),
      lastStatus: "idle",
      lastSyncAt: "",
      eventCount: 0,
      error: ""
    };
    const parsed = await fetchAndParseCalendar(draft, normalized);
    const key = hashString(normalized.url);
    const existingIndex = connections.findIndex((connection) => hashString(connectionUrl(connection)) === key);
    if (existingIndex >= 0) draft.id = connections[existingIndex].id;
    draft.lastStatus = "ok";
    draft.lastSyncAt = new Date().toISOString();
    draft.eventCount = parsed.events.length;
    if (existingIndex >= 0) connections.splice(existingIndex, 1, draft);
    else connections.push(draft);
    saveConnections();
    renderConnections();
    urlInput.value = "";
    const currentImported = (workspaceState().events || []).filter((event) => event.autoSource === "google-calendar-v6" && event.sourceId !== draft.id);
    mergeCalendarEvents([...currentImported, ...parsed.events.map((event) => toWorkspaceEvent(event, draft))]);
    updateSummaryWidgets();
    setStatus(normalized.convertedFromView
      ? "O link de visualização era público e foi convertido. Para agendas privadas, use o endereço secreto iCal."
      : `Agenda conectada com ${parsed.events.length} evento(s).`, "ok");
  } catch (error) {
    setStatus(error.message || "Não foi possível conectar a agenda.", "error");
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

function removeConnection(id) {
  const connection = connections.find((item) => item.id === id);
  if (!connection) return;
  if (!window.confirm(`Remover a agenda “${connection.name}” deste navegador?`)) return;
  connections = connections.filter((item) => item.id !== id);
  saveConnections();
  const current = workspaceState();
  const remaining = (current.events || []).filter((event) => !(event.autoSource === "google-calendar-v6" && event.sourceId === connection.id));
  publishWorkspace({ ...current, events: remaining });
  renderConnections();
  updateSummaryWidgets();
  setStatus("Agenda removida. Os demais eventos foram preservados.", "ok");
}

function installCaptureHandlers() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest?.("#hub-calendar-form");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    addConnectionFromForm(form);
  }, true);

  document.addEventListener("click", (event) => {
    const removeButton = event.target.closest?.("[data-calendar-remove]");
    const syncButton = event.target.closest?.("[data-calendar-sync]");
    if (removeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      removeConnection(removeButton.dataset.calendarRemove);
    }
    if (syncButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncConnections([syncButton.dataset.calendarSync]);
    }
  }, true);
}

async function waitForCalendarUi() {
  const startedAt = Date.now();
  while (!document.querySelector("#hub-calendar-form") && Date.now() - startedAt < 18000) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return Boolean(document.querySelector("#hub-calendar-form"));
}

async function init() {
  installCaptureHandlers();
  loadConnections();
  await waitForCalendarUi();
  renderConnections();
  updateSummaryWidgets();
  if (connections.length) await syncConnections();
  else setStatus("Cole o Endereço secreto em formato iCal. O link será testado antes de ser salvo.");

  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) syncConnections();
  }, REFRESH_MS);
  statusTimer = window.setInterval(updateSummaryWidgets, 5000);
  window.addEventListener("online", () => syncConnections());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && connections.length) syncConnections();
  });
  window.__mirnaCalendarV6 = {
    syncNow: () => syncConnections(),
    getConnections: () => connections.map((connection) => ({ ...connection, secret: undefined })),
    reload: () => { loadConnections(); renderConnections(); return syncConnections(); }
  };
  if (window.__mirnaDataHub) window.__mirnaDataHub.refreshCalendars = window.__mirnaCalendarV6.reload;
}

init().catch((error) => setStatus(error.message || "Falha ao iniciar a agenda.", "error"));
window.addEventListener("beforeunload", () => {
  window.clearInterval(refreshTimer);
  window.clearInterval(statusTimer);
  channel?.close();
});