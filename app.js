import { APP_CONFIG } from "./app-config.js";
import {
  deleteLocalFile,
  getLocalFile,
  getStorageEstimate,
  getValue,
  listLocalFiles,
  putLocalFile,
  setValue
} from "./db.js";
import {
  addCalendarDays,
  buildGoogleCalendarUrl,
  endOfDay,
  formatEventTime,
  normalizeLocalEvent,
  parseIcs,
  startOfDay
} from "./calendar.js";

const STATE_KEY = "dashboard-state-v2";
const LEGACY_STORAGE_KEY = "painel-da-mirna:v1";
const DATE_LOCALE = "pt-BR";
const CLOUD_STATE_ID = "mirna-dashboard";
const NEWS_CACHE_MS = 30 * 60 * 1000;
const WEATHER_CACHE_MS = 30 * 60 * 1000;
const CALENDAR_CACHE_MS = 10 * 60 * 1000;
const CLOUD_FILE_LIMIT = 4 * 1024 * 1024;

const $ = (selector, scope = document) => scope.querySelector(selector);

const elements = {
  brandEyebrow: $("#brand-eyebrow"),
  brandName: $("#brand-name"),
  appSubtitle: $("#app-subtitle"),
  todayLabel: $("#today-label"),
  todayDate: $("#today-date"),
  footerYear: $("#footer-year"),
  footerStorageMode: $("#footer-storage-mode"),
  connectionStatus: $("#connection-status"),
  themeToggle: $("#theme-toggle"),
  settingsOpen: $("#settings-open"),
  settingsDialog: $("#settings-dialog"),
  settingsSave: $("#settings-save"),
  settingsCity: $("#settings-city"),
  settingsAutoSpeak: $("#settings-auto-speak"),
  settingsCalendarName: $("#settings-calendar-name"),
  settingsCalendarUrl: $("#settings-calendar-url"),
  settingsCloudToken: $("#settings-cloud-token"),
  calendarSettingsOpen: $("#calendar-settings-open"),
  databaseStatusTitle: $("#database-status-title"),
  databaseStatusCopy: $("#database-status-copy"),
  nextEventTitle: $("#next-event-title"),
  nextEventCopy: $("#next-event-copy"),
  weatherStatusTitle: $("#weather-status-title"),
  weatherStatusCopy: $("#weather-status-copy"),
  weatherChip: $("#weather-chip"),
  digestTitle: $("#digest-title"),
  digestCopy: $("#digest-copy"),
  motivationCopy: $("#motivation-copy"),
  speakDigest: $("#speak-digest"),
  refreshDigest: $("#refresh-digest"),
  agendaTimeline: $("#agenda-timeline"),
  agendaEmpty: $("#agenda-empty"),
  agendaNextTitle: $("#agenda-next-title"),
  agendaNextMeta: $("#agenda-next-meta"),
  agendaCountdown: $("#agenda-countdown"),
  calendarRefresh: $("#calendar-refresh"),
  eventOpen: $("#event-open"),
  eventDialog: $("#event-dialog"),
  eventForm: $("#event-form"),
  eventTitle: $("#event-title"),
  eventDate: $("#event-date"),
  eventStart: $("#event-start"),
  eventEnd: $("#event-end"),
  eventAllDay: $("#event-all-day"),
  eventCategory: $("#event-category"),
  eventLocation: $("#event-location"),
  eventDescription: $("#event-description"),
  eventOpenGoogle: $("#event-open-google"),
  eventSave: $("#event-save"),
  uploadForm: $("#upload-form"),
  dropZone: $("#drop-zone"),
  fileInput: $("#file-input"),
  selectedFile: $("#selected-file"),
  fileDestination: $("#file-destination"),
  fileNote: $("#file-note"),
  uploadSubmit: $("#upload-submit"),
  uploadProgress: $("#upload-progress"),
  storageEstimate: $("#storage-estimate"),
  fileFilter: $("#file-filter"),
  fileList: $("#file-list"),
  filesEmpty: $("#files-empty"),
  newsGrid: $("#news-grid"),
  newsRefresh: $("#news-refresh"),
  folderGrid: $("#folder-grid"),
  folderEmpty: $("#folder-empty"),
  folderSearch: $("#folder-search"),
  folderTemplate: $("#folder-card-template"),
  dailyChecklist: $("#daily-checklist"),
  weeklyChecklist: $("#weekly-checklist"),
  checkTemplate: $("#check-item-template"),
  dailyProgressNumber: $("#daily-progress-number"),
  dailyProgressTrack: $("#daily-progress-track"),
  dailyProgressBar: $("#daily-progress-bar"),
  dailyProgressMessage: $("#daily-progress-message"),
  resetDaily: $("#reset-daily"),
  resetWeekly: $("#reset-weekly"),
  captureForm: $("#capture-form"),
  captureInput: $("#capture-input"),
  captureCounter: $("#capture-counter"),
  inboxList: $("#inbox-list"),
  inboxCount: $("#inbox-count"),
  emptyInbox: $("#empty-inbox"),
  inboxTemplate: $("#inbox-item-template"),
  visionGrid: $("#vision-grid"),
  exportData: $("#export-data"),
  importData: $("#import-data"),
  toast: $("#toast")
};

let state;
let backend = {
  reachable: false,
  mode: "browser",
  database: false,
  files: false,
  news: false,
  calendar: false,
  requiresToken: false
};
let selectedUploadFile = null;
let backendFiles = [];
let localFiles = [];
let calendarEvents = [];
let currentWeather = null;
let syncTimer;
let toastTimer;
let countdownTimer;
let isSyncing = false;

function randomId(prefix = "item") {
  return `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekKey(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return getDateKey(local);
}

function createInitialState() {
  return {
    version: 2,
    dayKey: getDateKey(),
    weekKey: getWeekKey(),
    daily: {},
    weekly: {},
    inbox: [],
    events: [],
    theme: "system",
    settings: {
      city: APP_CONFIG.defaultCity,
      autoSpeak: false,
      calendarName: "Agenda da Mirna",
      calendarUrl: "",
      cloudToken: ""
    },
    cache: {
      weather: null,
      calendar: null,
      news: {}
    },
    lastSpokenDate: "",
    updatedAt: new Date().toISOString()
  };
}

function normalizeInboxItem(item) {
  if (!item || typeof item.text !== "string") return null;
  return {
    id: typeof item.id === "string" ? item.id : randomId("note"),
    text: item.text.trim().slice(0, 280),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    done: Boolean(item.done)
  };
}

function normalizeEvent(item) {
  if (!item || typeof item.title !== "string" || !item.start || !item.end) return null;
  const start = new Date(item.start);
  const end = new Date(item.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    id: typeof item.id === "string" ? item.id : randomId("event"),
    title: item.title.trim().slice(0, 120),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: Boolean(item.allDay),
    categoryId: String(item.categoryId || "00"),
    location: String(item.location || "").slice(0, 140),
    description: String(item.description || "").slice(0, 500),
    source: "local",
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
  };
}

function normalizeState(candidate) {
  const base = createInitialState();
  if (!candidate || typeof candidate !== "object") return base;

  const normalized = {
    ...base,
    ...candidate,
    daily: candidate.daily && typeof candidate.daily === "object" ? candidate.daily : {},
    weekly: candidate.weekly && typeof candidate.weekly === "object" ? candidate.weekly : {},
    inbox: Array.isArray(candidate.inbox) ? candidate.inbox.map(normalizeInboxItem).filter(Boolean) : [],
    events: Array.isArray(candidate.events) ? candidate.events.map(normalizeEvent).filter(Boolean) : [],
    settings: {
      ...base.settings,
      ...(candidate.settings && typeof candidate.settings === "object" ? candidate.settings : {})
    },
    cache: {
      ...base.cache,
      ...(candidate.cache && typeof candidate.cache === "object" ? candidate.cache : {}),
      news: candidate.cache?.news && typeof candidate.cache.news === "object" ? candidate.cache.news : {}
    }
  };

  if (normalized.dayKey !== getDateKey()) {
    normalized.dayKey = getDateKey();
    normalized.daily = {};
  }

  if (normalized.weekKey !== getWeekKey()) {
    normalized.weekKey = getWeekKey();
    normalized.weekly = {};
  }

  if (!["light", "dark", "system"].includes(normalized.theme)) normalized.theme = "system";
  normalized.settings.city = String(normalized.settings.city || APP_CONFIG.defaultCity).slice(0, 120);
  normalized.settings.calendarName = String(normalized.settings.calendarName || "Agenda da Mirna").slice(0, 60);
  normalized.settings.calendarUrl = String(normalized.settings.calendarUrl || "");
  normalized.settings.cloudToken = String(normalized.settings.cloudToken || "");
  normalized.settings.autoSpeak = Boolean(normalized.settings.autoSpeak);
  normalized.updatedAt = typeof normalized.updatedAt === "string" ? normalized.updatedAt : new Date().toISOString();
  return normalized;
}

async function loadState() {
  let stored = await getValue(STATE_KEY, null);

  if (!stored) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy) {
        stored = legacy;
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      // O painel inicia limpo caso a versão antiga esteja corrompida.
    }
  }

  state = normalizeState(stored);
  await setValue(STATE_KEY, state);
}

function cloneForCloud() {
  const payload = structuredClone(state);
  payload.settings.cloudToken = "";
  payload.settings.calendarUrl = "";
  payload.cache.calendar = null;
  return payload;
}

async function persistState({ sync = true, touch = true } = {}) {
  if (touch) state.updatedAt = new Date().toISOString();
  await setValue(STATE_KEY, state);
  if (sync) scheduleBackendSync();
}

function scheduleBackendSync() {
  window.clearTimeout(syncTimer);
  if (!backend.database) return;
  syncTimer = window.setTimeout(() => syncStateToBackend().catch(() => {}), 850);
}

function tokenHeaders() {
  const token = state?.settings?.cloudToken?.trim();
  return token ? { "x-painel-token": token } : {};
}

async function apiFetch(path, options = {}, { token = true } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) {
    for (const [key, value] of Object.entries(tokenHeaders())) headers.set(key, value);
  }
  return fetch(path, { ...options, headers });
}

function setConnectionLabel(label, mode = "online") {
  elements.connectionStatus.textContent = label;
  elements.connectionStatus.classList.toggle("offline", mode === "offline");
  elements.connectionStatus.classList.toggle("syncing", mode === "syncing");
}

async function detectBackend() {
  if (location.protocol === "file:") {
    backend = { ...backend, reachable: false };
    updateBackendStatus();
    return backend;
  }

  try {
    const response = await fetch("./api/health", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Backend indisponível");
    backend = { ...backend, ...(await response.json()), reachable: true };
  } catch {
    backend = {
      reachable: false,
      mode: "browser",
      database: false,
      files: false,
      news: false,
      calendar: false,
      requiresToken: false
    };
  }

  updateBackendStatus();
  return backend;
}

function updateBackendStatus() {
  if (!navigator.onLine) {
    setConnectionLabel("Offline", "offline");
  } else if (isSyncing) {
    setConnectionLabel("Sincronizando", "syncing");
  } else if (backend.database && backend.mode === "local-server") {
    setConnectionLabel("SQLite ativo");
  } else if (backend.database) {
    setConnectionLabel("Nuvem pronta");
  } else {
    setConnectionLabel("Banco local");
  }

  if (backend.database && backend.mode === "local-server") {
    elements.databaseStatusTitle.textContent = "Banco SQLite sincronizado";
    elements.databaseStatusCopy.textContent = "O servidor local salva notas, agenda e arquivos no computador.";
    elements.footerStorageMode.textContent = "SQLite + IndexedDB";
  } else if (backend.database) {
    elements.databaseStatusTitle.textContent = "Nuvem disponível";
    elements.databaseStatusCopy.textContent = state.settings.cloudToken
      ? "Alterações sincronizadas com o banco privado."
      : "Informe o token pessoal para ativar a sincronização.";
    elements.footerStorageMode.textContent = "Banco local + nuvem";
  } else {
    elements.databaseStatusTitle.textContent = "Banco local ativo";
    elements.databaseStatusCopy.textContent = "Tudo continua salvo neste navegador, mesmo sem servidor.";
    elements.footerStorageMode.textContent = "IndexedDB local";
  }
}

async function pushStateToBackend() {
  const response = await apiFetch("./api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: CLOUD_STATE_ID, payload: cloneForCloud(), clientUpdatedAt: state.updatedAt })
  });

  if (response.status === 401 || response.status === 403) {
    backend.database = false;
    return false;
  }

  if (!response.ok) throw new Error("Não foi possível sincronizar");
  return true;
}

async function syncStateFromBackend() {
  if (!backend.database) return;

  try {
    isSyncing = true;
    updateBackendStatus();
    const response = await apiFetch(`./api/state?id=${encodeURIComponent(CLOUD_STATE_ID)}`, { cache: "no-store" });

    if (response.status === 404) {
      await pushStateToBackend();
      return;
    }

    if (response.status === 401 || response.status === 403) {
      backend.database = false;
      return;
    }

    if (!response.ok) throw new Error("Falha ao ler o banco");
    const remote = await response.json();
    if (!remote?.payload) return;

    const remoteUpdatedAt = Date.parse(remote.payload.updatedAt || remote.clientUpdatedAt || remote.updatedAt || 0);
    const localUpdatedAt = Date.parse(state.updatedAt || 0);

    if (remoteUpdatedAt > localUpdatedAt) {
      const localSecrets = {
        calendarUrl: state.settings.calendarUrl,
        cloudToken: state.settings.cloudToken
      };
      state = normalizeState(remote.payload);
      state.settings = { ...state.settings, ...localSecrets };
      await persistState({ sync: false, touch: false });
      renderAllDynamicContent();
    } else if (localUpdatedAt > remoteUpdatedAt) {
      await pushStateToBackend();
    }
  } catch {
    // O banco local continua sendo a fonte segura quando a nuvem falha.
  } finally {
    isSyncing = false;
    updateBackendStatus();
  }
}

async function syncStateToBackend() {
  if (!backend.database || isSyncing) return;
  isSyncing = true;
  updateBackendStatus();

  try {
    await pushStateToBackend();
  } catch {
    // O dado já está seguro no IndexedDB; a sincronização tenta novamente depois.
  } finally {
    isSyncing = false;
    updateBackendStatus();
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3000);
}

function applyStaticCopy() {
  elements.brandEyebrow.textContent = APP_CONFIG.eyebrow;
  elements.brandName.textContent = APP_CONFIG.appName;
  elements.appSubtitle.textContent = APP_CONFIG.subtitle;
  document.title = `${APP_CONFIG.appName} 🌷`;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  elements.todayLabel.textContent = `${greeting}, ${APP_CONFIG.ownerName}`;
  elements.todayDate.textContent = new Intl.DateTimeFormat(DATE_LOCALE, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(now);
  elements.footerYear.textContent = String(now.getFullYear());
}

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = resolved;
  elements.themeToggle.innerHTML = `<span aria-hidden="true">${resolved === "dark" ? "☀" : "☾"}</span>`;
  elements.themeToggle.setAttribute("aria-label", resolved === "dark" ? "Usar tema claro" : "Usar tema escuro");
}

async function toggleTheme() {
  state.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme();
  await persistState();
}

function renderFolders(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase(DATE_LOCALE);
  const folders = APP_CONFIG.folders.filter((folder) => {
    const haystack = `${folder.id} ${folder.label} ${folder.description}`.toLocaleLowerCase(DATE_LOCALE);
    return haystack.includes(normalizedQuery);
  });

  elements.folderGrid.replaceChildren();
  for (const folder of folders) {
    const card = elements.folderTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.tone = folder.tone;
    card.dataset.sensitive = String(Boolean(folder.sensitive));
    card.href = folder.href || `#arquivos`;
    if (!folder.href) card.removeAttribute("target");
    card.setAttribute("aria-label", folder.href ? `Abrir ${folder.label} no Google Drive` : `Usar ${folder.label} no arquivo do painel`);
    $(".folder-icon", card).textContent = folder.icon;
    $(".folder-number", card).textContent = folder.id;
    $("h3", card).textContent = folder.label;
    $("p", card).textContent = folder.description;
    $(".folder-link-label", card).innerHTML = folder.href ? "Abrir no Drive <span aria-hidden=\"true\">↗</span>" : "Usar no Painel";
    elements.folderGrid.append(card);
  }

  elements.folderEmpty.hidden = folders.length > 0;
}

function renderChecklist(container, tasks, stateKey) {
  container.replaceChildren();
  tasks.forEach((task, index) => {
    const item = elements.checkTemplate.content.firstElementChild.cloneNode(true);
    const input = $("input", item);
    const label = $(".check-label", item);
    input.id = `${stateKey}-${index}`;
    input.checked = Boolean(state[stateKey][index]);
    label.textContent = task;
    input.addEventListener("change", async () => {
      state[stateKey][index] = input.checked;
      if (stateKey === "daily") updateDailyProgress();
      await persistState();
      updateDigest();
    });
    container.append(item);
  });
}

function updateDailyProgress() {
  const total = APP_CONFIG.dailyTasks.length;
  const done = APP_CONFIG.dailyTasks.reduce((count, _, index) => count + Number(Boolean(state.daily[index])), 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  elements.dailyProgressNumber.textContent = `${done}/${total}`;
  elements.dailyProgressBar.style.width = `${percent}%`;
  elements.dailyProgressTrack.setAttribute("aria-valuenow", String(percent));

  const messages = [
    "Comece com um passo pequeno.",
    "Você já abriu espaço para o dia.",
    "O essencial está entrando no eixo.",
    "Mais da metade — continue com gentileza.",
    "Quase lá. Falta só um cuidado.",
    "Feito. Agora respira e segue leve."
  ];
  elements.dailyProgressMessage.textContent = messages[Math.min(done, messages.length - 1)];
}

async function resetChecklist(key) {
  state[key] = {};
  renderChecklist(key === "daily" ? elements.dailyChecklist : elements.weeklyChecklist, key === "daily" ? APP_CONFIG.dailyTasks : APP_CONFIG.weeklyTasks, key);
  if (key === "daily") updateDailyProgress();
  await persistState();
  showToast(key === "daily" ? "Revisão diária reiniciada." : "Revisão semanal reiniciada.");
}

function renderVision() {
  elements.visionGrid.replaceChildren();
  for (const item of APP_CONFIG.vision) {
    const card = document.createElement("article");
    card.className = "vision-card";
    const icon = document.createElement("span");
    icon.className = "vision-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.icon;
    const title = document.createElement("h3");
    title.textContent = item.label;
    const text = document.createElement("p");
    text.textContent = item.text;
    card.append(icon, title, text);
    elements.visionGrid.append(card);
  }
}

function formatInboxDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  const time = new Intl.DateTimeFormat(DATE_LOCALE, { hour: "2-digit", minute: "2-digit" }).format(date);
  if (getDateKey(date) === getDateKey()) return `Hoje, ${time}`;
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function renderInbox() {
  elements.inboxList.replaceChildren();
  const sorted = [...state.inbox].sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || b.createdAt.localeCompare(a.createdAt));

  for (const entry of sorted) {
    const item = elements.inboxTemplate.content.firstElementChild.cloneNode(true);
    const check = $(".inbox-check", item);
    const text = $(".inbox-text", item);
    const time = $(".inbox-time", item);
    const deleteButton = $(".delete-button", item);
    check.checked = Boolean(entry.done);
    text.textContent = entry.text;
    time.dateTime = entry.createdAt;
    time.textContent = formatInboxDate(entry.createdAt);

    check.addEventListener("change", async () => {
      entry.done = check.checked;
      renderInbox();
      await persistState();
      updateDigest();
    });

    deleteButton.addEventListener("click", async () => {
      state.inbox = state.inbox.filter((itemEntry) => itemEntry.id !== entry.id);
      renderInbox();
      await persistState();
      updateDigest();
      showToast("Anotação removida.");
    });

    elements.inboxList.append(item);
  }

  const pendingCount = state.inbox.filter((item) => !item.done).length;
  elements.inboxCount.textContent = String(pendingCount);
  elements.inboxCount.setAttribute("aria-label", `${pendingCount} itens pendentes`);
  elements.emptyInbox.hidden = state.inbox.length > 0;
}

function weatherDescription(code) {
  if (code === 0) return "céu limpo";
  if ([1, 2].includes(code)) return "sol entre nuvens";
  if (code === 3) return "céu nublado";
  if ([45, 48].includes(code)) return "neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "neve";
  if ([95, 96, 99].includes(code)) return "trovoadas";
  return "tempo variável";
}

function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌥️";
}

async function fetchWeather(force = false) {
  const city = state.settings.city.trim() || APP_CONFIG.defaultCity;
  const cached = state.cache.weather;
  if (!force && cached?.city === city && Date.now() - Date.parse(cached.fetchedAt || 0) < WEATHER_CACHE_MS) {
    currentWeather = cached.data;
    renderWeather();
    return currentWeather;
  }

  try {
    let coordinates = cached?.city === city ? cached.coordinates : null;
    if (!coordinates) {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", city);
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "pt");
      geoUrl.searchParams.set("format", "json");
      const geoResponse = await fetch(geoUrl);
      if (!geoResponse.ok) throw new Error("Cidade não encontrada");
      const geoData = await geoResponse.json();
      const place = geoData.results?.[0];
      if (!place) throw new Error("Cidade não encontrada");
      coordinates = {
        latitude: place.latitude,
        longitude: place.longitude,
        label: [place.name, place.admin1].filter(Boolean).join(", ")
      };
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(coordinates.latitude));
    forecastUrl.searchParams.set("longitude", String(coordinates.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", "2");
    const forecastResponse = await fetch(forecastUrl);
    if (!forecastResponse.ok) throw new Error("Previsão indisponível");
    const forecast = await forecastResponse.json();

    currentWeather = {
      city: coordinates.label || city,
      temperature: Math.round(forecast.current?.temperature_2m),
      feelsLike: Math.round(forecast.current?.apparent_temperature),
      code: Number(forecast.current?.weather_code ?? forecast.daily?.weather_code?.[0] ?? -1),
      max: Math.round(forecast.daily?.temperature_2m_max?.[0]),
      min: Math.round(forecast.daily?.temperature_2m_min?.[0]),
      rainChance: Math.round(forecast.daily?.precipitation_probability_max?.[0] || 0)
    };

    state.cache.weather = {
      city,
      coordinates,
      fetchedAt: new Date().toISOString(),
      data: currentWeather
    };
    await persistState({ sync: false, touch: false });
  } catch {
    currentWeather = cached?.data || null;
  }

  renderWeather();
  return currentWeather;
}

function renderWeather() {
  if (!currentWeather) {
    elements.weatherChip.textContent = "Clima indisponível";
    elements.weatherStatusTitle.textContent = "Previsão do dia";
    elements.weatherStatusCopy.textContent = "Confira a cidade nas configurações.";
    return;
  }

  const description = weatherDescription(currentWeather.code);
  const icon = weatherIcon(currentWeather.code);
  elements.weatherChip.textContent = `${icon} ${currentWeather.temperature}°`;
  elements.weatherStatusTitle.textContent = `${currentWeather.max}° / ${currentWeather.min}° · ${description}`;
  elements.weatherStatusCopy.textContent = currentWeather.rainChance
    ? `${currentWeather.rainChance}% de chance de chuva em ${currentWeather.city}.`
    : `Sensação de ${currentWeather.feelsLike}° em ${currentWeather.city}.`;
}

function serializeCalendarEvents(events) {
  return events.map((event) => ({
    ...event,
    start: new Date(event.start).toISOString(),
    end: new Date(event.end).toISOString(),
    exdates: undefined
  }));
}

function deserializeCalendarEvents(events) {
  return Array.isArray(events)
    ? events
        .map((event) => {
          try {
            return normalizeLocalEvent(event);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
}

async function refreshCalendar(force = false) {
  const cached = state.cache.calendar;
  const calendarUrl = state.settings.calendarUrl.trim();
  const cacheFresh = cached && Date.now() - Date.parse(cached.fetchedAt || 0) < CALENDAR_CACHE_MS;

  if (!force && cacheFresh) {
    calendarEvents = deserializeCalendarEvents(cached.events);
    renderAgenda();
    return;
  }

  if (!calendarUrl) {
    calendarEvents = [];
    renderAgenda();
    return;
  }

  if (!backend.calendar) {
    calendarEvents = deserializeCalendarEvents(cached?.events);
    renderAgenda();
    showToast("Para atualizar o Google Agenda localmente, rode node server.js.");
    return;
  }

  elements.calendarRefresh.disabled = true;
  elements.calendarRefresh.textContent = "Atualizando…";
  try {
    const response = await apiFetch(
      "./api/calendar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: calendarUrl })
      },
      { token: false }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Não foi possível ler a agenda.");
    }
    const rawIcs = await response.text();
    const rangeStart = startOfDay(new Date());
    const rangeEnd = endOfDay(addCalendarDays(rangeStart, 7));
    const parsed = parseIcs(rawIcs, { timeZone: APP_CONFIG.timezone, rangeStart, rangeEnd });
    calendarEvents = parsed.events;
    state.cache.calendar = {
      fetchedAt: new Date().toISOString(),
      events: serializeCalendarEvents(parsed.events)
    };
    await persistState({ sync: false, touch: false });
    if (!parsed.events.length && parsed.totalBlocks) showToast("A agenda respondeu, mas não há eventos nesta semana.");
  } catch (error) {
    calendarEvents = deserializeCalendarEvents(cached?.events);
    showToast(error instanceof Error ? error.message : "Falha ao atualizar a agenda.");
  } finally {
    elements.calendarRefresh.disabled = false;
    elements.calendarRefresh.textContent = "↻ Atualizar";
    renderAgenda();
  }
}

function allAgendaEvents() {
  const local = state.events.map((event) => ({
    ...event,
    start: new Date(event.start),
    end: new Date(event.end),
    source: "local",
    readOnly: false
  }));
  const rangeStart = startOfDay(new Date());
  const rangeEnd = endOfDay(addCalendarDays(rangeStart, 7));
  return [...local, ...calendarEvents]
    .filter((event) => event.end >= rangeStart && event.start <= rangeEnd)
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, DATE_LOCALE));
}

function folderForId(id) {
  return APP_CONFIG.folders.find((folder) => folder.id === String(id)) || APP_CONFIG.folders[0];
}

function eventColor(event) {
  const tones = {
    rose: "#a96780",
    lilac: "#8d6a9f",
    blue: "#5f789a",
    sand: "#9c754d",
    slate: "#657285",
    green: "#66816c",
    sky: "#5e8790",
    yellow: "#a88745",
    plum: "#7b617d",
    gray: "#787878"
  };
  return tones[folderForId(event.categoryId).tone] || "#8f5f72";
}

function dayHeading(date) {
  const today = getDateKey();
  const tomorrow = getDateKey(addCalendarDays(new Date(), 1));
  const key = getDateKey(date);
  if (key === today) return "Hoje";
  if (key === tomorrow) return "Amanhã";
  return new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long" }).format(date);
}

function renderAgenda() {
  const events = allAgendaEvents();
  elements.agendaTimeline.replaceChildren();
  const grouped = new Map();

  for (const event of events) {
    const key = getDateKey(event.start);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }

  for (const [key, dayEvents] of grouped.entries()) {
    const date = new Date(`${key}T12:00:00`);
    const section = document.createElement("section");
    section.className = "timeline-day";
    const heading = document.createElement("div");
    heading.className = "timeline-day-title";
    const title = document.createElement("h3");
    title.textContent = dayHeading(date);
    const dateLabel = document.createElement("span");
    dateLabel.textContent = new Intl.DateTimeFormat(DATE_LOCALE, { day: "2-digit", month: "long" }).format(date);
    heading.append(title, dateLabel);

    const list = document.createElement("div");
    list.className = "timeline-events";
    for (const event of dayEvents) {
      const row = document.createElement("article");
      row.className = "timeline-event";
      row.style.setProperty("--event-color", eventColor(event));

      const time = document.createElement("span");
      time.className = "event-time";
      time.textContent = formatEventTime(event);
      const dot = document.createElement("span");
      dot.className = "event-dot";
      dot.setAttribute("aria-hidden", "true");
      const body = document.createElement("div");
      body.className = "event-body";
      const eventTitle = document.createElement("strong");
      eventTitle.textContent = event.title;
      const meta = document.createElement("small");
      const category = event.source === "local" ? folderForId(event.categoryId).label : state.settings.calendarName;
      meta.textContent = [event.location, category].filter(Boolean).join(" · ");
      body.append(eventTitle, meta);
      const source = document.createElement("span");
      source.className = "event-source";
      source.textContent = event.source === "local" ? "Painel" : "Google";
      row.append(time, dot, body, source);

      if (event.source === "local") {
        const deleteButton = document.createElement("button");
        deleteButton.className = "event-delete";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", `Excluir ${event.title}`);
        deleteButton.addEventListener("click", () => deleteEvent(event.id));
        row.append(deleteButton);
      }

      list.append(row);
    }

    section.append(heading, list);
    elements.agendaTimeline.append(section);
  }

  elements.agendaEmpty.hidden = events.length > 0;
  updateNextEvent(events);
  updateDigest();
}

function updateNextEvent(events = allAgendaEvents()) {
  const now = new Date();
  const next = events.find((event) => event.end > now);

  window.clearInterval(countdownTimer);
  if (!next) {
    elements.agendaNextTitle.textContent = "Nenhum compromisso próximo";
    elements.agendaNextMeta.textContent = "Seu dia tem espaço para respirar.";
    elements.agendaCountdown.hidden = true;
    elements.nextEventTitle.textContent = "Agenda livre por enquanto";
    elements.nextEventCopy.textContent = "Crie um evento ou conecte seu iCal.";
    return;
  }

  const update = () => {
    const current = new Date();
    const diff = next.start - current;
    elements.agendaNextTitle.textContent = next.title;
    elements.agendaNextMeta.textContent = `${formatEventTime(next)}${next.location ? ` · ${next.location}` : ""}`;
    elements.nextEventTitle.textContent = next.title;

    if (diff <= 0 && next.end > current) {
      elements.agendaCountdown.hidden = false;
      elements.agendaCountdown.textContent = "Acontecendo agora";
      elements.nextEventCopy.textContent = "Em andamento";
      return;
    }

    const minutes = Math.max(0, Math.round(diff / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const remainingMinutes = minutes % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (!days && remainingMinutes) parts.push(`${remainingMinutes}min`);
    const countdown = `Em ${parts.join(" ") || "instantes"}`;
    elements.agendaCountdown.hidden = false;
    elements.agendaCountdown.textContent = countdown;
    elements.nextEventCopy.textContent = `${countdown.toLowerCase()} · ${formatEventTime(next)}`;
  };

  update();
  countdownTimer = window.setInterval(update, 60000);
}

function openEventDialog() {
  const now = new Date();
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  elements.eventForm.reset();
  elements.eventDate.value = getDateKey(now);
  elements.eventStart.value = `${String(nextHour.getHours()).padStart(2, "0")}:00`;
  elements.eventEnd.value = `${String((nextHour.getHours() + 1) % 24).padStart(2, "0")}:00`;
  elements.eventOpenGoogle.checked = true;
  elements.eventDialog.showModal();
  requestAnimationFrame(() => elements.eventTitle.focus());
}

function toggleAllDayFields() {
  const disabled = elements.eventAllDay.checked;
  elements.eventStart.disabled = disabled;
  elements.eventEnd.disabled = disabled;
}

async function saveEvent() {
  const title = elements.eventTitle.value.trim();
  const date = elements.eventDate.value;
  if (!title || !date) {
    showToast("Preencha o título e a data do evento.");
    return;
  }

  const allDay = elements.eventAllDay.checked;
  const start = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${elements.eventStart.value || "09:00"}:00`);
  let end = allDay ? addCalendarDays(start, 1) : new Date(`${date}T${elements.eventEnd.value || "10:00"}:00`);
  if (!allDay && end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);

  const event = {
    id: randomId("event"),
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    categoryId: elements.eventCategory.value || "00",
    location: elements.eventLocation.value.trim(),
    description: elements.eventDescription.value.trim(),
    source: "local",
    createdAt: new Date().toISOString()
  };

  state.events.push(event);
  await persistState();
  renderAgenda();
  elements.eventDialog.close();
  showToast("Evento salvo no banco do painel.");

  if (elements.eventOpenGoogle.checked) {
    const popup = window.open(buildGoogleCalendarUrl(event, APP_CONFIG.timezone), "_blank", "noopener,noreferrer");
    if (!popup) showToast("O navegador bloqueou o Google Agenda. Use o botão novamente permitindo pop-ups.");
  }
}

async function deleteEvent(id) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  if (!window.confirm(`Excluir “${event.title}” do painel?`)) return;
  state.events = state.events.filter((item) => item.id !== id);
  await persistState();
  renderAgenda();
  showToast("Evento removido do painel.");
}

function populateDestinationControls() {
  elements.fileDestination.replaceChildren();
  elements.eventCategory.replaceChildren();
  for (const folder of APP_CONFIG.folders) {
    const fileOption = document.createElement("option");
    fileOption.value = folder.id;
    fileOption.textContent = `${folder.icon} ${folder.id} — ${folder.label}`;
    elements.fileDestination.append(fileOption);

    const eventOption = fileOption.cloneNode(true);
    elements.eventCategory.append(eventOption);
  }
  elements.fileDestination.value = "00";
  elements.eventCategory.value = "01";

  for (const folder of APP_CONFIG.folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = `${folder.icon} ${folder.label}`;
    elements.fileFilter.append(option);
  }
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function fileIcon(mime = "", name = "") {
  const normalized = `${mime} ${name}`.toLowerCase();
  if (normalized.includes("pdf")) return "📕";
  if (normalized.includes("image")) return "🖼️";
  if (normalized.includes("video")) return "🎬";
  if (normalized.includes("audio")) return "🎵";
  if (normalized.includes("word") || normalized.includes("document") || normalized.match(/\.docx?$/)) return "📘";
  if (normalized.includes("sheet") || normalized.includes("excel") || normalized.match(/\.xlsx?$/)) return "📗";
  if (normalized.includes("presentation") || normalized.match(/\.pptx?$/)) return "📙";
  if (normalized.includes("zip") || normalized.includes("compressed")) return "🗜️";
  return "📄";
}

async function updateStorageEstimate() {
  const estimate = await getStorageEstimate();
  if (!estimate?.quota) {
    elements.storageEstimate.textContent = "Banco local disponível neste navegador.";
    return;
  }
  const available = Math.max(0, estimate.quota - (estimate.usage || 0));
  elements.storageEstimate.textContent = `${formatBytes(available)} livres no armazenamento local estimado.`;
}

function setSelectedFile(file) {
  selectedUploadFile = file || null;
  elements.selectedFile.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "Nenhum arquivo selecionado";
}

async function uploadFile(event) {
  event.preventDefault();
  const file = selectedUploadFile || elements.fileInput.files?.[0];
  if (!file) {
    showToast("Escolha um arquivo antes de salvar.");
    return;
  }

  const destinationId = elements.fileDestination.value;
  const note = elements.fileNote.value.trim();
  elements.uploadSubmit.disabled = true;
  elements.uploadProgress.hidden = false;

  try {
    let savedRemotely = false;
    if (backend.files && file.size <= CLOUD_FILE_LIMIT) {
      const form = new FormData();
      form.set("file", file);
      form.set("destinationId", destinationId);
      form.set("note", note);
      const response = await apiFetch("./api/upload", { method: "POST", body: form });
      if (response.ok) {
        savedRemotely = true;
      } else if (![401, 403, 413, 503].includes(response.status)) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Falha no upload.");
      }
    }

    if (!savedRemotely) {
      await putLocalFile({
        id: randomId("file"),
        name: file.name,
        destinationId,
        note,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
        storage: "browser",
        blob: file
      });
    }

    elements.uploadForm.reset();
    elements.fileDestination.value = destinationId;
    elements.fileNote.value = "";
    setSelectedFile(null);
    await refreshFiles();
    await updateStorageEstimate();
    showToast(savedRemotely ? "Arquivo guardado no armazenamento privado." : "Arquivo guardado no banco local deste navegador.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Não foi possível salvar o arquivo.");
  } finally {
    elements.uploadSubmit.disabled = false;
    elements.uploadProgress.hidden = true;
  }
}

async function refreshFiles() {
  localFiles = await listLocalFiles();
  backendFiles = [];

  if (backend.files) {
    try {
      const response = await apiFetch("./api/files", { cache: "no-store" });
      if (response.ok) backendFiles = await response.json();
      else if ([401, 403].includes(response.status)) backend.files = false;
    } catch {
      // A biblioteca local continua funcionando.
    }
  }

  renderFiles();
}

function renderFiles() {
  const filter = elements.fileFilter.value;
  const combined = [...backendFiles.map((item) => ({ ...item, storage: item.storage || "server" })), ...localFiles]
    .filter((item) => filter === "all" || item.destinationId === filter)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  elements.fileList.replaceChildren();

  for (const file of combined) {
    const item = document.createElement("li");
    item.className = "file-item";
    const icon = document.createElement("span");
    icon.className = "file-type-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = fileIcon(file.mimeType, file.name);
    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const meta = document.createElement("small");
    const folder = folderForId(file.destinationId);
    meta.textContent = `${folder.icon} ${folder.label} · ${formatBytes(file.sizeBytes)} · ${file.storage === "browser" ? "neste navegador" : "arquivo privado"}${file.note ? ` · ${file.note}` : ""}`;
    info.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "file-actions";
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "↗";
    openButton.title = "Abrir ou baixar";
    openButton.setAttribute("aria-label", `Abrir ${file.name}`);
    openButton.addEventListener("click", () => openFile(file));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "Excluir";
    deleteButton.setAttribute("aria-label", `Excluir ${file.name}`);
    deleteButton.addEventListener("click", () => removeFile(file));
    actions.append(openButton, deleteButton);
    item.append(icon, info, actions);
    elements.fileList.append(item);
  }

  elements.filesEmpty.hidden = combined.length > 0;
}

async function openFile(file) {
  try {
    let blob;
    if (file.storage === "browser") {
      const record = await getLocalFile(file.id);
      blob = record?.blob;
    } else {
      const response = await apiFetch(`./api/file?id=${encodeURIComponent(file.id)}`);
      if (!response.ok) throw new Error("Arquivo indisponível.");
      blob = await response.blob();
    }

    if (!blob) throw new Error("Arquivo não encontrado.");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
  }
}

async function removeFile(file) {
  if (!window.confirm(`Excluir “${file.name}”?`)) return;
  try {
    if (file.storage === "browser") {
      await deleteLocalFile(file.id);
    } else {
      const response = await apiFetch(`./api/files?id=${encodeURIComponent(file.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível excluir o arquivo.");
    }
    await refreshFiles();
    await updateStorageEstimate();
    showToast("Arquivo excluído.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Falha ao excluir.");
  }
}

function relativeTime(iso) {
  const date = new Date(iso);
  const minutes = Math.round((date - new Date()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(DATE_LOCALE, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function strictNewsFilter(items, topic) {
  return items.filter((item) => {
    const haystack = `${item.title} ${item.source || ""}`.toLocaleLowerCase(DATE_LOCALE);
    return topic.requiredTerms.some((term) => haystack.includes(term.toLocaleLowerCase(DATE_LOCALE)));
  });
}

function renderNewsLoading() {
  elements.newsGrid.replaceChildren();
  for (const topic of APP_CONFIG.newsTopics) {
    const column = document.createElement("article");
    column.className = "news-column";
    const header = document.createElement("div");
    header.className = "news-column-header";
    const icon = document.createElement("span");
    icon.textContent = topic.icon;
    const title = document.createElement("h3");
    title.textContent = topic.label;
    header.append(icon, title);
    column.append(header);
    for (let index = 0; index < 3; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "news-skeleton";
      column.append(skeleton);
    }
    elements.newsGrid.append(column);
  }
}

async function refreshNews(force = false) {
  renderNewsLoading();
  elements.newsRefresh.disabled = true;
  elements.newsRefresh.textContent = "Atualizando…";
  const results = {};

  for (const topic of APP_CONFIG.newsTopics) {
    const cached = state.cache.news?.[topic.id];
    if (!force && cached && Date.now() - Date.parse(cached.fetchedAt || 0) < NEWS_CACHE_MS) {
      results[topic.id] = cached.items;
      continue;
    }

    if (!backend.news) {
      results[topic.id] = cached?.items || [];
      continue;
    }

    try {
      const url = new URL("./api/news", location.href);
      url.searchParams.set("q", topic.query);
      url.searchParams.set("limit", "10");
      const response = await apiFetch(url.pathname + url.search, { cache: "no-store" }, { token: false });
      if (!response.ok) throw new Error("Radar indisponível");
      const data = await response.json();
      const filtered = strictNewsFilter(data.items || [], topic).slice(0, 5);
      results[topic.id] = filtered;
      state.cache.news[topic.id] = { fetchedAt: new Date().toISOString(), items: filtered };
    } catch {
      results[topic.id] = cached?.items || [];
    }
  }

  await persistState({ sync: false, touch: false });
  renderNews(results);
  elements.newsRefresh.disabled = false;
  elements.newsRefresh.textContent = "↻ Atualizar notícias";
}

function renderNews(results = {}) {
  elements.newsGrid.replaceChildren();
  for (const topic of APP_CONFIG.newsTopics) {
    const column = document.createElement("article");
    column.className = "news-column";
    const header = document.createElement("div");
    header.className = "news-column-header";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = topic.icon;
    const title = document.createElement("h3");
    title.textContent = topic.label;
    header.append(icon, title);
    column.append(header);
    const list = document.createElement("ul");
    list.className = "news-list";
    const items = results[topic.id] || state.cache.news?.[topic.id]?.items || [];

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "panel-note";
      empty.textContent = backend.news ? "Nenhuma manchete realmente relacionada apareceu agora." : "Ligue a antena com node server.js para atualizar.";
      column.append(empty);
    } else {
      for (const item of items) {
        const row = document.createElement("li");
        row.className = "news-item";
        const link = document.createElement("a");
        link.href = item.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const headline = document.createElement("strong");
        headline.textContent = item.title;
        const meta = document.createElement("small");
        meta.textContent = [item.source, item.publishedAt ? relativeTime(item.publishedAt) : ""].filter(Boolean).join(" · ");
        link.append(headline, meta);
        row.append(link);
        list.append(row);
      }
      column.append(list);
    }

    elements.newsGrid.append(column);
  }
}

function motivationForToday() {
  const dateNumber = Number(getDateKey().replaceAll("-", ""));
  const todayEvents = allAgendaEvents().filter((event) => getDateKey(event.start) === getDateKey());
  if (todayEvents.length >= 7) return "Seu dia está cheio. Entre um compromisso e outro, deixe dois minutos para respirar — isso também é parte do plano.";
  return APP_CONFIG.motivationalPhrases[dateNumber % APP_CONFIG.motivationalPhrases.length];
}

function digestNewsItems() {
  return APP_CONFIG.newsTopics
    .map((topic) => {
      const item = state.cache.news?.[topic.id]?.items?.[0];
      return item ? { topic: topic.label, title: item.title } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function buildDigest() {
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const dateText = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const todayEvents = allAgendaEvents().filter((event) => getDateKey(event.start) === getDateKey()).slice(0, 5);
  const pending = state.inbox.filter((item) => !item.done).length;
  const headlines = digestNewsItems();
  const weatherText = currentWeather
    ? `Em ${currentWeather.city}, agora faz ${currentWeather.temperature} graus, com ${weatherDescription(currentWeather.code)}. A máxima chega a ${currentWeather.max} e a mínima fica em ${currentWeather.min} graus${currentWeather.rainChance ? `, com ${currentWeather.rainChance}% de chance de chuva` : ""}.`
    : "A previsão do tempo ainda não conseguiu atualizar.";
  const agendaText = todayEvents.length
    ? `Hoje você tem ${todayEvents.length} ${todayEvents.length === 1 ? "compromisso" : "compromissos"}. ${todayEvents
        .map((event) => `${formatEventTime(event)}, ${event.title}`)
        .join("; ")}.`
    : "Sua agenda está livre hoje, pelo menos por enquanto.";
  const inboxText = pending ? `Há ${pending} ${pending === 1 ? "item" : "itens"} esperando organização na Entrada.` : "Sua Entrada está leve.";
  const newsText = headlines.length
    ? `No seu radar: ${headlines.map((item) => `${item.topic}: ${item.title}`).join("; ")}.`
    : "O radar de ballet, ginástica rítmica e faculdade ainda não trouxe novas manchetes.";
  const motivation = motivationForToday();
  return {
    title: `${greeting}, Mirna`,
    visible: `${weatherText} ${agendaText} ${inboxText} ${newsText}`,
    spoken: `${greeting}, Mirna. Hoje é ${dateText}. ${weatherText} ${agendaText} ${inboxText} ${newsText} Foco do dia: ${motivation}`,
    motivation
  };
}

function updateDigest() {
  const digest = buildDigest();
  elements.digestTitle.textContent = digest.title;
  elements.digestCopy.textContent = digest.visible;
  elements.motivationCopy.textContent = digest.motivation;
}

function choosePortugueseVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "pt-br" && /female|luciana|francisca|maria/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.toLowerCase() === "pt-br") ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("pt")) ||
    null
  );
}

async function speakDigest({ automatic = false } = {}) {
  if (!("speechSynthesis" in window)) {
    showToast("Este navegador não oferece leitura em voz alta.");
    return;
  }
  const digest = buildDigest();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(digest.spoken);
  utterance.lang = "pt-BR";
  utterance.rate = 0.95;
  utterance.pitch = 1.02;
  const voice = choosePortugueseVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
  if (automatic) {
    state.lastSpokenDate = getDateKey();
    await persistState({ sync: false });
  }
}

function prepareAutomaticSpeech() {
  if (!state.settings.autoSpeak || state.lastSpokenDate === getDateKey()) return;
  const handler = () => {
    document.removeEventListener("pointerdown", handler);
    speakDigest({ automatic: true });
  };
  document.addEventListener("pointerdown", handler, { once: true });
}

function openSettings(focusCalendar = false) {
  elements.settingsCity.value = state.settings.city;
  elements.settingsAutoSpeak.checked = state.settings.autoSpeak;
  elements.settingsCalendarName.value = state.settings.calendarName;
  elements.settingsCalendarUrl.value = state.settings.calendarUrl;
  elements.settingsCloudToken.value = state.settings.cloudToken;
  elements.settingsDialog.showModal();
  requestAnimationFrame(() => (focusCalendar ? elements.settingsCalendarUrl : elements.settingsCity).focus());
}

async function saveSettings() {
  const previousCity = state.settings.city;
  const previousCalendarUrl = state.settings.calendarUrl;
  state.settings.city = elements.settingsCity.value.trim() || APP_CONFIG.defaultCity;
  state.settings.autoSpeak = elements.settingsAutoSpeak.checked;
  state.settings.calendarName = elements.settingsCalendarName.value.trim() || "Agenda da Mirna";
  state.settings.calendarUrl = elements.settingsCalendarUrl.value.trim();
  state.settings.cloudToken = elements.settingsCloudToken.value.trim();
  if (state.settings.city !== previousCity) state.cache.weather = null;
  if (state.settings.calendarUrl !== previousCalendarUrl) state.cache.calendar = null;
  await persistState();
  elements.settingsDialog.close();
  await detectBackend();
  await Promise.all([fetchWeather(true), refreshCalendar(true), syncStateFromBackend(), refreshFiles()]);
  prepareAutomaticSpeech();
  showToast("Configurações salvas somente para o seu painel.");
}

function exportState() {
  const safeState = structuredClone(state);
  safeState.settings.calendarUrl = "";
  safeState.settings.cloudToken = "";
  safeState.cache = { weather: null, calendar: null, news: {} };
  const payload = {
    app: APP_CONFIG.appName,
    version: 2,
    exportedAt: new Date().toISOString(),
    note: "Links secretos, token e arquivos binários não fazem parte desta cópia.",
    data: safeState
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `painel-da-mirna-${getDateKey()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Cópia de segurança exportada sem credenciais privadas.");
}

async function importState(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const candidate = parsed?.data ?? parsed;
    const secrets = {
      calendarUrl: state.settings.calendarUrl,
      cloudToken: state.settings.cloudToken
    };
    state = normalizeState(candidate);
    state.settings = { ...state.settings, ...secrets };
    await persistState();
    renderAllDynamicContent();
    await Promise.all([fetchWeather(true), refreshCalendar(true)]);
    showToast("Dados restaurados com sucesso.");
  } catch {
    showToast("Não foi possível importar esse arquivo.");
  } finally {
    elements.importData.value = "";
  }
}

function renderAllDynamicContent() {
  renderFolders(elements.folderSearch.value);
  renderChecklist(elements.dailyChecklist, APP_CONFIG.dailyTasks, "daily");
  renderChecklist(elements.weeklyChecklist, APP_CONFIG.weeklyTasks, "weekly");
  updateDailyProgress();
  renderInbox();
  renderAgenda();
  renderFiles();
  renderNews();
  applyTheme();
  updateDigest();
  updateBackendStatus();
}

function bindEvents() {
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.settingsOpen.addEventListener("click", () => openSettings());
  elements.calendarSettingsOpen.addEventListener("click", () => openSettings(true));
  elements.settingsSave.addEventListener("click", saveSettings);
  elements.speakDigest.addEventListener("click", () => speakDigest());
  elements.refreshDigest.addEventListener("click", async () => {
    await Promise.all([fetchWeather(true), refreshCalendar(true)]);
    updateDigest();
    showToast("Seu briefing foi atualizado.");
  });
  elements.eventOpen.addEventListener("click", openEventDialog);
  elements.eventAllDay.addEventListener("change", toggleAllDayFields);
  elements.eventSave.addEventListener("click", saveEvent);
  elements.calendarRefresh.addEventListener("click", () => refreshCalendar(true));
  elements.newsRefresh.addEventListener("click", () => refreshNews(true));
  elements.folderSearch.addEventListener("input", (event) => renderFolders(event.target.value));
  elements.resetDaily.addEventListener("click", () => resetChecklist("daily"));
  elements.resetWeekly.addEventListener("click", () => resetChecklist("weekly"));
  elements.exportData.addEventListener("click", exportState);
  elements.importData.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importState(file);
  });
  elements.captureInput.addEventListener("input", () => {
    elements.captureCounter.textContent = `${elements.captureInput.value.length}/280`;
  });
  elements.captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.captureInput.value.trim();
    if (!text) return;
    state.inbox.push({ id: randomId("note"), text, createdAt: new Date().toISOString(), done: false });
    elements.captureForm.reset();
    elements.captureCounter.textContent = "0/280";
    renderInbox();
    updateDigest();
    await persistState();
    showToast("Anotação guardada no banco da Entrada.");
  });

  elements.fileInput.addEventListener("change", () => setSelectedFile(elements.fileInput.files?.[0] || null));
  elements.uploadForm.addEventListener("submit", uploadFile);
  elements.fileFilter.addEventListener("change", renderFiles);
  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  }
  elements.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) setSelectedFile(file);
  });

  window.addEventListener("online", async () => {
    await detectBackend();
    updateBackendStatus();
  });
  window.addEventListener("offline", updateBackendStatus);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && ["https:", "http:"].includes(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

function startBackgroundRefresh() {
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshCalendar().catch(() => {});
  }, CALENDAR_CACHE_MS);
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshNews().catch(() => {});
  }, NEWS_CACHE_MS);
  window.setInterval(() => {
    if (document.visibilityState === "visible") fetchWeather().catch(() => {});
  }, WEATHER_CACHE_MS);
}

async function init() {
  await loadState();
  applyStaticCopy();
  populateDestinationControls();
  renderVision();
  bindEvents();
  renderAllDynamicContent();
  await updateStorageEstimate();
  await detectBackend();
  await syncStateFromBackend();
  await Promise.all([fetchWeather(), refreshCalendar(), refreshFiles(), refreshNews()]);
  updateDigest();
  prepareAutomaticSpeech();
  registerServiceWorker();
  startBackgroundRefresh();
}

init().catch((error) => {
  console.error(error);
  setConnectionLabel("Falha ao iniciar", "offline");
  showToast("O painel encontrou um erro ao iniciar. Recarregue a página.");
});
