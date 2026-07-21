import { getValue } from "./db.js";
import { parseIcs } from "./calendar.js";

const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const LEGACY_KEY = "painel-da-mirna:v1";
const INDEXED_STATE_KEY = "dashboard-state-v2";
const LOCATION_KEY = "painel-da-mirna:auto-location:v1";
const CLOUD_STATE_ID = "mirna-workspace-v4";
const PROFILE_URL = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const DEFAULT_CITY = "Marechal Cândido Rondon, Paraná";
const CALENDAR_REFRESH_MS = 10 * 60 * 1000;
const NOTES_REFRESH_MS = 15 * 1000;
const DATE_LOCALE = "pt-BR";

const workspaceChannel = "BroadcastChannel" in window
  ? new BroadcastChannel("painel-da-mirna-workspace")
  : null;

let panel;
let syncRunning = false;
let clockTimer;
let fullSyncTimer;
let notesTimer;
let lastWeather = null;
let lastStats = {
  calendars: 0,
  todayEvents: 0,
  notes: 0,
  cloud: "Local",
  lastSync: null
};

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cleanText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function categoryForText(...values) {
  const text = values.join(" ").toLocaleLowerCase(DATE_LOCALE);
  if (/ballet|balé|gin[aá]stica|r[ií]tmica|gr\b|aula|coreografia|martin luther/.test(text)) return "01";
  if (/faculdade|direito|dan[cç]a|unioeste|prova|trabalho acad[eê]mico|estudar/.test(text)) return "02";
  if (/trabalho|financeiro|pagamento|cliente|reuni[aã]o profissional/.test(text)) return "03";
  if (/casa|casinha|mercado|limpeza|aluguel/.test(text)) return "05";
  if (/viagem|festival|hotel|voo|passagem/.test(text)) return "06";
  if (/fam[ií]lia|missa|igreja|anivers[aá]rio/.test(text)) return "07";
  if (/livro|curso|leitura|pesquisa|refer[eê]ncia/.test(text)) return "08";
  return "00";
}

function workspaceState() {
  const parsed = safeJson(localStorage.getItem(WORKSPACE_KEY));
  const today = dateKey();
  return {
    version: 3,
    calendarView: ["month", "week", "pop"].includes(parsed?.calendarView) ? parsed.calendarView : "pop",
    cursorDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed?.cursorDate || "") ? parsed.cursorDate : today,
    selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed?.selectedDate || "") ? parsed.selectedDate : today,
    events: Array.isArray(parsed?.events) ? parsed.events : [],
    cards: Array.isArray(parsed?.cards) ? parsed.cards : [],
    spotify: {
      profileUrl: PROFILE_URL,
      contentUrl: String(parsed?.spotify?.contentUrl || "")
    },
    updatedAt: parsed?.updatedAt || new Date().toISOString()
  };
}

function publishWorkspace(next) {
  next.updatedAt = new Date().toISOString();
  const serialized = JSON.stringify(next);
  localStorage.setItem(WORKSPACE_KEY, serialized);
  if (workspaceChannel) workspaceChannel.postMessage(next);
  else window.dispatchEvent(new StorageEvent("storage", { key: WORKSPACE_KEY, newValue: serialized }));
}

function mergeById(localItems, remoteItems) {
  const merged = new Map();
  for (const item of remoteItems || []) if (item?.id) merged.set(item.id, item);
  for (const item of localItems || []) if (item?.id) merged.set(item.id, { ...merged.get(item.id), ...item });
  return [...merged.values()];
}

function mergeWorkspaceStates(localState, remoteState) {
  const remote = remoteState && typeof remoteState === "object" ? remoteState : {};
  return {
    ...localState,
    ...remote,
    calendarView: localState.calendarView,
    cursorDate: localState.cursorDate,
    selectedDate: localState.selectedDate,
    events: mergeById(localState.events, remote.events),
    cards: mergeById(localState.cards, remote.cards),
    spotify: {
      profileUrl: PROFILE_URL,
      contentUrl: localState.spotify?.contentUrl || remote.spotify?.contentUrl || PROFILE_URL
    },
    updatedAt: new Date().toISOString()
  };
}

async function waitForWorkspace() {
  const startedAt = Date.now();
  while (!window.__mirnaWorkspace && Date.now() - startedAt < 15000) {
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return Boolean(window.__mirnaWorkspace);
}

function injectStyles() {
  if (document.querySelector("#mirna-auto-sync-styles")) return;
  const style = document.createElement("style");
  style.id = "mirna-auto-sync-styles";
  style.textContent = `
    .mirna-auto-sync { margin: 0 auto 34px; max-width: 1180px; animation: mirnaSyncEnter .55s cubic-bezier(.2,.8,.2,1) both; }
    .mirna-auto-sync-head { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; margin-bottom:14px; }
    .mirna-auto-sync-head h2 { margin:3px 0 0; font: 700 clamp(1.45rem,2.2vw,2.05rem)/1.1 Georgia,"Times New Roman",serif; }
    .mirna-auto-sync-head p { margin:0; color:var(--muted,#756a70); }
    .mirna-sync-button { border:1px solid var(--line,rgba(72,54,63,.12)); border-radius:999px; background:var(--surface,#fffdfb); color:var(--text,#332b30); padding:10px 15px; cursor:pointer; box-shadow:var(--shadow-soft,0 10px 30px rgba(73,49,61,.06)); transition:transform .2s ease,border-color .2s ease; white-space:nowrap; }
    .mirna-sync-button:hover { transform:translateY(-2px); border-color:color-mix(in srgb,var(--accent,#8f5f72) 42%,transparent); }
    .mirna-sync-button[aria-busy="true"] { animation:mirnaPulse 1.1s ease-in-out infinite; }
    .mirna-auto-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; }
    .mirna-auto-card { position:relative; overflow:hidden; min-height:112px; padding:16px; border:1px solid var(--line,rgba(72,54,63,.12)); border-radius:20px; background:color-mix(in srgb,var(--surface,#fffdfb) 92%,transparent); box-shadow:var(--shadow-soft,0 10px 30px rgba(73,49,61,.06)); transition:transform .22s ease,box-shadow .22s ease; }
    .mirna-auto-card:hover { transform:translateY(-3px); box-shadow:var(--shadow,0 20px 50px rgba(73,49,61,.09)); }
    .mirna-auto-card::after { content:""; position:absolute; width:80px; height:80px; right:-34px; bottom:-38px; border-radius:50%; background:color-mix(in srgb,var(--card-accent,var(--accent,#8f5f72)) 15%,transparent); }
    .mirna-auto-icon { display:block; font-size:1.2rem; margin-bottom:8px; }
    .mirna-auto-card small { display:block; color:var(--muted,#756a70); font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; }
    .mirna-auto-card strong { display:block; margin-top:3px; font-size:.94rem; line-height:1.25; }
    .mirna-auto-card span[data-detail] { display:block; margin-top:5px; color:var(--muted,#756a70); font-size:.76rem; line-height:1.3; }
    .mirna-sync-foot { display:flex; justify-content:space-between; gap:12px; margin-top:10px; color:var(--muted,#756a70); font-size:.76rem; }
    .mirna-sync-dot { display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:#6caa7a; box-shadow:0 0 0 4px rgba(108,170,122,.12); }
    .mirna-sync-dot.is-working { background:#c5a36a; box-shadow:0 0 0 4px rgba(197,163,106,.13); animation:mirnaPulse 1s ease-in-out infinite; }
    @keyframes mirnaSyncEnter { from { opacity:0; transform:translateY(16px) scale(.99); } to { opacity:1; transform:none; } }
    @keyframes mirnaPulse { 50% { opacity:.45; transform:scale(.96); } }
    @media (max-width:1000px) { .mirna-auto-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
    @media (max-width:640px) { .mirna-auto-sync-head { align-items:flex-start; flex-direction:column; } .mirna-auto-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .mirna-auto-card { min-height:104px; } .mirna-sync-foot { flex-direction:column; } }
    @media (prefers-reduced-motion:reduce) { .mirna-auto-sync,.mirna-sync-button[aria-busy="true"],.mirna-sync-dot.is-working { animation:none; } }
  `;
  document.head.append(style);
}

function buildPanel() {
  if (document.querySelector("#mirna-auto-sync")) return document.querySelector("#mirna-auto-sync");
  const workspaceRoot = document.querySelector("#workspace-root");
  if (!workspaceRoot) return null;
  const section = document.createElement("section");
  section.id = "mirna-auto-sync";
  section.className = "mirna-auto-sync";
  section.innerHTML = `
    <div class="mirna-auto-sync-head">
      <div><p class="eyebrow">Tudo alinhado automaticamente</p><h2>Seu dia já chega pronto</h2></div>
      <button class="mirna-sync-button" id="mirna-sync-now" type="button">↻ Atualizar tudo</button>
    </div>
    <div class="mirna-auto-grid">
      <article class="mirna-auto-card" style="--card-accent:#c68a9f"><span class="mirna-auto-icon">📅</span><small>Hoje</small><strong id="mirna-auto-date">Carregando…</strong><span data-detail id="mirna-auto-time"></span></article>
      <article class="mirna-auto-card" style="--card-accent:#74a2a9"><span class="mirna-auto-icon">🌦️</span><small>Local & clima</small><strong id="mirna-auto-weather">Buscando…</strong><span data-detail id="mirna-auto-location"></span></article>
      <article class="mirna-auto-card" style="--card-accent:#8299b6"><span class="mirna-auto-icon">🗓️</span><small>Agenda</small><strong id="mirna-auto-calendar">Sincronizando…</strong><span data-detail id="mirna-auto-calendar-detail"></span></article>
      <article class="mirna-auto-card" style="--card-accent:#9a78aa"><span class="mirna-auto-icon">📝</span><small>Notas atuais</small><strong id="mirna-auto-notes">Importando…</strong><span data-detail>Entrada e Kanban unidos</span></article>
      <article class="mirna-auto-card" style="--card-accent:#1ed760"><span class="mirna-auto-icon">♫</span><small>Spotify</small><strong id="mirna-auto-spotify">Perfil conectado</strong><span data-detail>Conta atual da Mirna</span></article>
      <article class="mirna-auto-card" style="--card-accent:#7f9a83"><span class="mirna-auto-icon">☁️</span><small>Armazenamento</small><strong id="mirna-auto-cloud">Verificando…</strong><span data-detail id="mirna-auto-cloud-detail"></span></article>
    </div>
    <div class="mirna-sync-foot"><span><i class="mirna-sync-dot" id="mirna-sync-dot"></i><span id="mirna-sync-status">Preparando importação automática…</span></span><span id="mirna-sync-last"></span></div>
  `;
  workspaceRoot.prepend(section);
  section.querySelector("#mirna-sync-now")?.addEventListener("click", () => fullSync({ forceLocation: true }));
  panel = section;
  updateClock();
  return section;
}

function panelText(selector, value) {
  const element = panel?.querySelector(selector);
  if (element) element.textContent = value;
}

function updateClock() {
  const now = new Date();
  panelText("#mirna-auto-date", new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", day: "2-digit", month: "long" }).format(now));
  panelText("#mirna-auto-time", `${new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(now)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
}

function setSyncStatus(message, working = false) {
  panelText("#mirna-sync-status", message);
  const dot = panel?.querySelector("#mirna-sync-dot");
  dot?.classList.toggle("is-working", working);
  const button = panel?.querySelector("#mirna-sync-now");
  button?.setAttribute("aria-busy", String(working));
}

function renderStats() {
  panelText("#mirna-auto-calendar", `${lastStats.todayEvents} ${lastStats.todayEvents === 1 ? "item hoje" : "itens hoje"}`);
  panelText("#mirna-auto-calendar-detail", lastStats.calendars ? `${lastStats.calendars} ${lastStats.calendars === 1 ? "agenda conectada" : "agendas conectadas"}` : "Eventos locais e tarefas ativos");
  panelText("#mirna-auto-notes", `${lastStats.notes} ${lastStats.notes === 1 ? "nota alinhada" : "notas alinhadas"}`);
  panelText("#mirna-auto-cloud", lastStats.cloud);
  panelText("#mirna-auto-cloud-detail", lastStats.cloud === "Nuvem sincronizada" ? "Neon + Blob ativos" : "O navegador continua seguro");
  if (lastStats.lastSync) panelText("#mirna-sync-last", `Última atualização: ${new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(lastStats.lastSync)}`);
}

async function collectSources() {
  const sources = [];
  const add = (name, value) => {
    if (value && typeof value === "object") sources.push({ name, value });
  };

  add(LEGACY_KEY, safeJson(localStorage.getItem(LEGACY_KEY)));
  add("dashboard-local", safeJson(localStorage.getItem(INDEXED_STATE_KEY)));
  try {
    add("dashboard-indexed", await getValue(INDEXED_STATE_KEY, null));
  } catch {
    // A importação segue com os dados disponíveis no localStorage.
  }

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || key === WORKSPACE_KEY || key === LEGACY_KEY || key === LOCATION_KEY) continue;
    if (!/(painel|mirna|jarvis|calendar|agenda)/i.test(key)) continue;
    add(key, safeJson(localStorage.getItem(key)));
  }
  return sources;
}

function walk(value, visitor, path = [], depth = 0, seen = new WeakSet()) {
  if (depth > 6 || value == null) return;
  visitor(value, path);
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...path, String(index)], depth + 1, seen));
    return;
  }
  for (const [key, item] of Object.entries(value)) walk(item, visitor, [...path, key], depth + 1, seen);
}

function sourceInboxes(sources) {
  const results = [];
  for (const source of sources) {
    walk(source.value, (value, path) => {
      const key = path.at(-1)?.toLowerCase();
      if (key === "inbox" && Array.isArray(value)) results.push({ source: source.name, items: value });
    });
  }
  return results;
}

function sourceEvents(sources) {
  const results = [];
  for (const source of sources) {
    walk(source.value, (value, path) => {
      const key = path.at(-1)?.toLowerCase();
      if (key === "events" && Array.isArray(value)) results.push({ source: source.name, items: value });
    });
  }
  return results;
}

function calendarSources(sources) {
  const found = new Map();
  const calendarPattern = /https:\/\/calendar\.google\.com\/calendar\/ical\/[^\s"'<>]+(?:basic\.ics|\.ics)(?:\?[^\s"'<>]*)?/gi;
  for (const source of sources) {
    walk(source.value, (value, path) => {
      if (typeof value !== "string") return;
      const matches = value.match(calendarPattern) || [];
      for (const raw of matches) {
        const url = raw.replace(/[),.;]+$/, "");
        if (!found.has(url)) found.set(url, { url, name: path.at(-2) || "Google Agenda" });
      }
    });
  }
  return [...found.values()];
}

function cloudToken(sources) {
  let token = "";
  for (const source of sources) {
    walk(source.value, (value, path) => {
      const key = path.at(-1)?.toLowerCase();
      if (!token && typeof value === "string" && (key === "cloudtoken" || key === "painel_api_token")) token = value.trim();
    });
    if (token) break;
  }
  return token;
}

function preferredCity(sources) {
  let city = "";
  for (const source of sources) {
    walk(source.value, (value, path) => {
      if (city || typeof value !== "string") return;
      const key = path.at(-1)?.toLowerCase();
      if (key === "city" || key === "cidade") city = value.trim();
    });
    if (city) break;
  }
  return city || DEFAULT_CITY;
}

function convertSavedEvent(item, sourceName) {
  if (!item || typeof item !== "object" || !item.title) return null;
  let startDate;
  if (item.start) startDate = new Date(item.start);
  else if (item.date) startDate = new Date(`${item.date}T${item.startTime || item.time || "09:00"}:00`);
  if (!startDate || Number.isNaN(startDate.getTime())) return null;
  const endDate = item.end ? new Date(item.end) : new Date(startDate.getTime() + 60 * 60 * 1000);
  const notes = [item.location, item.description, item.notes].map((value) => cleanText(value, 240)).filter(Boolean).join(" · ");
  const stable = hashString(`${sourceName}:${item.id || item.uid || item.title}:${startDate.toISOString()}`);
  return {
    id: `import-event-${stable}`,
    title: cleanText(item.title, 120),
    date: dateKey(startDate),
    start: item.allDay ? "" : timeValue(startDate),
    end: item.allDay ? "" : timeValue(Number.isNaN(endDate.getTime()) ? new Date(startDate.getTime() + 3600000) : endDate),
    category: item.categoryId || categoryForText(item.title, notes),
    notes,
    autoSource: "saved-calendar",
    sourceName,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

async function importNotesAndSavedEvents(sources) {
  const current = workspaceState();
  const cardMap = new Map(current.cards.map((item) => [item.id, item]));
  const eventMap = new Map(current.events.map((item) => [item.id, item]));
  let importedNotes = 0;

  for (const group of sourceInboxes(sources)) {
    for (const item of group.items) {
      if (!item || typeof item.text !== "string" || !item.text.trim()) continue;
      const id = `import-note-${hashString(`${group.source}:${item.id || item.createdAt || item.text}`)}`;
      importedNotes += 1;
      const existing = cardMap.get(id);
      cardMap.set(id, {
        id,
        title: cleanText(item.text, 140),
        column: existing?.column || (item.done ? "done" : "ideas"),
        category: existing?.category || categoryForText(item.text),
        priority: existing?.priority || "medium",
        dueDate: existing?.dueDate || "",
        notes: existing?.notes || "Importada automaticamente da Entrada atual.",
        autoSource: "current-notes",
        createdAt: item.createdAt || existing?.createdAt || new Date().toISOString()
      });
    }
  }

  for (const group of sourceEvents(sources)) {
    for (const item of group.items) {
      const converted = convertSavedEvent(item, group.source);
      if (converted) eventMap.set(converted.id, { ...eventMap.get(converted.id), ...converted });
    }
  }

  const next = {
    ...current,
    selectedDate: dateKey(),
    cursorDate: current.cursorDate || dateKey(),
    cards: [...cardMap.values()],
    events: [...eventMap.values()],
    spotify: {
      profileUrl: PROFILE_URL,
      contentUrl: current.spotify?.contentUrl || PROFILE_URL
    }
  };
  publishWorkspace(next);
  lastStats.notes = importedNotes || next.cards.filter((item) => item.column !== "done").length;
}

async function importGoogleCalendars(sources) {
  const calendars = calendarSources(sources);
  lastStats.calendars = calendars.length;
  if (!calendars.length) {
    const current = workspaceState();
    lastStats.todayEvents = current.events.filter((item) => item.date === dateKey()).length + current.cards.filter((item) => item.dueDate === dateKey()).length;
    return;
  }

  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 30);
  const rangeEnd = new Date();
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  const imported = [];
  let successfulSources = 0;

  const results = await Promise.allSettled(calendars.map(async (calendar, sourceIndex) => {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: calendar.url }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Agenda indisponível");
    const raw = await response.text();
    const parsed = parseIcs(raw, { timeZone, rangeStart, rangeEnd });
    successfulSources += 1;
    for (const event of parsed.events) {
      const notes = [event.location, event.description].map((value) => cleanText(value, 220)).filter(Boolean).join(" · ");
      imported.push({
        id: `google-${hashString(`${calendar.url}:${event.id}:${event.start.toISOString()}`)}`,
        title: cleanText(event.title, 120),
        date: dateKey(event.start),
        start: event.allDay ? "" : timeValue(event.start),
        end: event.allDay ? "" : timeValue(event.end),
        category: categoryForText(event.title, notes),
        notes,
        autoSource: "google-calendar",
        sourceName: cleanText(calendar.name || `Agenda ${sourceIndex + 1}`, 60),
        readOnly: true,
        createdAt: new Date().toISOString()
      });
    }
  }));

  const failures = results.filter((result) => result.status === "rejected").length;
  if (!successfulSources && failures) return;

  const current = workspaceState();
  const preserved = current.events.filter((event) => event.autoSource !== "google-calendar");
  const next = { ...current, events: [...preserved, ...imported] };
  publishWorkspace(next);
  lastStats.todayEvents = next.events.filter((item) => item.date === dateKey()).length + next.cards.filter((item) => item.dueDate === dateKey()).length;
  if (failures) panelText("#mirna-auto-calendar-detail", `${successfulSources} sincronizada(s) · ${failures} precisa(m) de novo link`);
}

function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌥️";
}

function browserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocalização indisponível"));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: "Localização atual", savedAt: Date.now() }),
      reject,
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 6 * 60 * 60 * 1000 }
    );
  });
}

async function syncWeather(sources, { forceLocation = false } = {}) {
  let location = safeJson(localStorage.getItem(LOCATION_KEY));
  const fresh = location?.savedAt && Date.now() - location.savedAt < 30 * 24 * 60 * 60 * 1000;
  if (forceLocation || !fresh) {
    try {
      location = await browserLocation();
      localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
    } catch {
      location = null;
    }
  }

  const url = new URL("/api/weather", location.href);
  if (location?.latitude != null && location?.longitude != null) {
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    url.searchParams.set("label", location.label || "Localização atual");
  } else {
    url.searchParams.set("city", preferredCity(sources));
  }

  try {
    const response = await fetch(url.pathname + url.search, { cache: "no-store" });
    if (!response.ok) throw new Error("Clima indisponível");
    lastWeather = await response.json();
    const icon = weatherIcon(lastWeather.current?.code);
    panelText("#mirna-auto-weather", `${icon} ${lastWeather.current?.temperature}° · sensação ${lastWeather.current?.feelsLike}°`);
    panelText("#mirna-auto-location", `${lastWeather.location?.label || preferredCity(sources)} · máx. ${lastWeather.today?.max}° · ${lastWeather.today?.rainChance || 0}% chuva`);
  } catch {
    panelText("#mirna-auto-weather", "Previsão indisponível");
    panelText("#mirna-auto-location", preferredCity(sources));
  }
}

async function syncCloud(sources) {
  let health;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    health = response.ok ? await response.json() : null;
  } catch {
    health = null;
  }

  if (!health?.database) {
    lastStats.cloud = "Banco local ativo";
    return;
  }

  const token = cloudToken(sources);
  if (!token) {
    lastStats.cloud = health.files ? "Nuvem pronta" : "Banco conectado";
    return;
  }

  const headers = { "x-painel-token": token, Accept: "application/json" };
  try {
    const local = workspaceState();
    const remoteResponse = await fetch(`/api/state?id=${encodeURIComponent(CLOUD_STATE_ID)}`, { headers, cache: "no-store" });
    let merged = local;
    if (remoteResponse.ok) {
      const remote = await remoteResponse.json();
      merged = mergeWorkspaceStates(local, remote.payload);
      publishWorkspace(merged);
    } else if (remoteResponse.status !== 404) {
      throw new Error("Falha ao ler nuvem");
    }

    const saveResponse = await fetch("/api/state", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: CLOUD_STATE_ID, payload: merged, clientUpdatedAt: merged.updatedAt })
    });
    if (!saveResponse.ok) throw new Error("Falha ao salvar nuvem");
    lastStats.cloud = "Nuvem sincronizada";
  } catch {
    lastStats.cloud = "Local protegido";
  }
}

function alignSpotify() {
  const current = workspaceState();
  if (current.spotify?.profileUrl === PROFILE_URL && current.spotify?.contentUrl) return;
  publishWorkspace({
    ...current,
    spotify: {
      profileUrl: PROFILE_URL,
      contentUrl: current.spotify?.contentUrl || PROFILE_URL
    }
  });
}

async function notesOnlySync() {
  if (document.visibilityState === "hidden" || syncRunning) return;
  const sources = await collectSources();
  await importNotesAndSavedEvents(sources);
  const current = workspaceState();
  lastStats.todayEvents = current.events.filter((item) => item.date === dateKey()).length + current.cards.filter((item) => item.dueDate === dateKey()).length;
  renderStats();
}

async function fullSync({ forceLocation = false } = {}) {
  if (syncRunning) return;
  syncRunning = true;
  setSyncStatus("Atualizando dia, agenda, notas, Spotify e nuvem…", true);
  try {
    const sources = await collectSources();
    await importNotesAndSavedEvents(sources);
    alignSpotify();
    await Promise.all([
      syncWeather(sources, { forceLocation }),
      importGoogleCalendars(sources),
      syncCloud(sources)
    ]);
    const current = workspaceState();
    lastStats.todayEvents = current.events.filter((item) => item.date === dateKey()).length + current.cards.filter((item) => item.dueDate === dateKey()).length;
    lastStats.lastSync = new Date();
    renderStats();
    setSyncStatus("Tudo alinhado automaticamente.", false);
  } catch {
    setSyncStatus("O modo local continua ativo; uma fonte não respondeu.", false);
  } finally {
    syncRunning = false;
  }
}

async function init() {
  await waitForWorkspace();
  injectStyles();
  buildPanel();
  alignSpotify();
  await fullSync();
  clockTimer = window.setInterval(updateClock, 60 * 1000);
  fullSyncTimer = window.setInterval(() => fullSync(), CALENDAR_REFRESH_MS);
  notesTimer = window.setInterval(notesOnlySync, NOTES_REFRESH_MS);
  window.addEventListener("online", () => fullSync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fullSync();
  });
}

init().catch(() => {
  setSyncStatus("O painel principal segue funcionando normalmente.", false);
});

window.addEventListener("beforeunload", () => {
  window.clearInterval(clockTimer);
  window.clearInterval(fullSyncTimer);
  window.clearInterval(notesTimer);
  workspaceChannel?.close();
});
