import { APP_CONFIG } from "./app-config.js";

const STORAGE_KEY = "painel-da-mirna:v1";
const DATE_LOCALE = "pt-BR";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const elements = {
  brandEyebrow: $("#brand-eyebrow"),
  brandName: $("#brand-name"),
  appSubtitle: $("#app-subtitle"),
  todayLabel: $("#today-label"),
  todayDate: $("#today-date"),
  footerYear: $("#footer-year"),
  folderGrid: $("#folder-grid"),
  folderEmpty: $("#folder-empty"),
  folderSearch: $("#folder-search"),
  dailyChecklist: $("#daily-checklist"),
  weeklyChecklist: $("#weekly-checklist"),
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
  visionGrid: $("#vision-grid"),
  themeToggle: $("#theme-toggle"),
  connectionStatus: $("#connection-status"),
  exportData: $("#export-data"),
  importData: $("#import-data"),
  toast: $("#toast"),
  folderTemplate: $("#folder-card-template"),
  checkTemplate: $("#check-item-template"),
  inboxTemplate: $("#inbox-item-template")
};

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
    version: 1,
    dayKey: getDateKey(),
    weekKey: getWeekKey(),
    daily: {},
    weekly: {},
    inbox: [],
    theme: "system"
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
    inbox: Array.isArray(candidate.inbox) ? candidate.inbox.filter(isValidInboxItem) : []
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
  return normalized;
}

function isValidInboxItem(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.text === "string" &&
    typeof item.createdAt === "string"
  );
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return createInitialState();
  }
}

let state = loadState();
let toastTimer;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
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

function renderFolders(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase(DATE_LOCALE);
  const folders = APP_CONFIG.folders.filter((folder) => {
    const haystack = `${folder.id} ${folder.label} ${folder.description}`.toLocaleLowerCase(DATE_LOCALE);
    return haystack.includes(normalizedQuery);
  });

  elements.folderGrid.replaceChildren();

  for (const folder of folders) {
    const card = elements.folderTemplate.content.firstElementChild.cloneNode(true);
    card.href = folder.href;
    card.dataset.tone = folder.tone;
    card.dataset.sensitive = String(Boolean(folder.sensitive));
    card.setAttribute("aria-label", `Abrir ${folder.label} no Google Drive`);
    $(".folder-icon", card).textContent = folder.icon;
    $(".folder-number", card).textContent = folder.id;
    $("h3", card).textContent = folder.label;
    $("p", card).textContent = folder.description;
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
    const id = `${stateKey}-${index}`;

    input.id = id;
    input.checked = Boolean(state[stateKey][index]);
    label.textContent = task;

    input.addEventListener("change", () => {
      state[stateKey][index] = input.checked;
      saveState();
      if (stateKey === "daily") updateDailyProgress();
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

  const today = getDateKey();
  const itemDay = getDateKey(date);
  const time = new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);

  if (itemDay === today) return `Hoje, ${time}`;
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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

    check.addEventListener("change", () => {
      entry.done = check.checked;
      saveState();
      renderInbox();
    });

    deleteButton.addEventListener("click", () => {
      state.inbox = state.inbox.filter((itemEntry) => itemEntry.id !== entry.id);
      saveState();
      renderInbox();
      showToast("Anotação removida.");
    });

    elements.inboxList.append(item);
  }

  const pendingCount = state.inbox.filter((item) => !item.done).length;
  elements.inboxCount.textContent = String(pendingCount);
  elements.inboxCount.setAttribute("aria-label", `${pendingCount} itens pendentes`);
  elements.emptyInbox.hidden = state.inbox.length > 0;
}

function resetChecklist(key, container, tasks) {
  state[key] = {};
  saveState();
  renderChecklist(container, tasks, key);
  if (key === "daily") updateDailyProgress();
  showToast(key === "daily" ? "Revisão diária reiniciada." : "Revisão semanal reiniciada.");
}

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = resolved;
  elements.themeToggle.innerHTML = `<span aria-hidden="true">${resolved === "dark" ? "☀" : "☾"}</span>`;
  elements.themeToggle.setAttribute("aria-label", resolved === "dark" ? "Usar tema claro" : "Usar tema escuro");
}

function toggleTheme() {
  const currentResolved = document.documentElement.dataset.theme;
  state.theme = currentResolved === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

function exportState() {
  const payload = {
    app: APP_CONFIG.appName,
    exportedAt: new Date().toISOString(),
    data: state
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
  showToast("Cópia de segurança exportada.");
}

async function importState(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const candidate = parsed?.data ?? parsed;
    state = normalizeState(candidate);
    saveState();
    renderAllDynamicContent();
    showToast("Dados restaurados com sucesso.");
  } catch {
    showToast("Não foi possível importar esse arquivo.");
  } finally {
    elements.importData.value = "";
  }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  elements.connectionStatus.textContent = online ? "Online" : "Offline";
  elements.connectionStatus.classList.toggle("offline", !online);
}

function renderAllDynamicContent() {
  renderFolders(elements.folderSearch.value);
  renderChecklist(elements.dailyChecklist, APP_CONFIG.dailyTasks, "daily");
  renderChecklist(elements.weeklyChecklist, APP_CONFIG.weeklyTasks, "weekly");
  updateDailyProgress();
  renderInbox();
  applyTheme();
}

function bindEvents() {
  elements.folderSearch.addEventListener("input", (event) => renderFolders(event.target.value));
  elements.resetDaily.addEventListener("click", () => resetChecklist("daily", elements.dailyChecklist, APP_CONFIG.dailyTasks));
  elements.resetWeekly.addEventListener("click", () => resetChecklist("weekly", elements.weeklyChecklist, APP_CONFIG.weeklyTasks));
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.exportData.addEventListener("click", exportState);
  elements.importData.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importState(file);
  });

  elements.captureInput.addEventListener("input", () => {
    elements.captureCounter.textContent = `${elements.captureInput.value.length}/280`;
  });

  elements.captureForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = elements.captureInput.value.trim();
    if (!text) return;

    state.inbox.push({
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      text,
      createdAt: new Date().toISOString(),
      done: false
    });
    saveState();
    elements.captureForm.reset();
    elements.captureCounter.textContent = "0/280";
    renderInbox();
    showToast("Anotação guardada na Entrada.");
  });

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // O painel continua funcionando normalmente sem cache offline.
    });
  }
}

applyStaticCopy();
renderVision();
bindEvents();
renderAllDynamicContent();
updateConnectionStatus();
registerServiceWorker();
