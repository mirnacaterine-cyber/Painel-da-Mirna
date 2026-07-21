import { resolveSpotifyContent } from "./spotify.js";

const STORAGE_KEY = "painel-da-mirna:workspace:v3";
const PROFILE_URL = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const DATE_LOCALE = "pt-BR";

const CATEGORIES = {
  "00": { label: "Entrada", icon: "🌷", color: "#c68a9f" },
  "01": { label: "Ballet & GR", icon: "🩰", color: "#9a78aa" },
  "02": { label: "Faculdade", icon: "🎓", color: "#8299b6" },
  "03": { label: "Trabalho", icon: "💼", color: "#b3916b" },
  "05": { label: "Casinha", icon: "🏡", color: "#839b83" },
  "06": { label: "Viagens", icon: "✈️", color: "#74a2a9" },
  "07": { label: "Família", icon: "💛", color: "#c5a36a" },
  "08": { label: "Estudos & repertório", icon: "📚", color: "#806889" }
};

const COLUMNS = [
  { id: "ideas", label: "Ideias", color: "#b997aa" },
  { id: "next", label: "Próximos", color: "#8ea3bb" },
  { id: "doing", label: "Em andamento", color: "#c69b72" },
  { id: "waiting", label: "Aguardando", color: "#9a9689" },
  { id: "done", label: "Concluído", color: "#7f9a83" }
];

const PRIORITIES = {
  low: { label: "Leve", color: "#8fa68e" },
  medium: { label: "Normal", color: "#c5a36a" },
  high: { label: "Importante", color: "#c96f78" }
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const channel = "BroadcastChannel" in window ? new BroadcastChannel("painel-da-mirna-workspace") : null;

let state;
let root;
let eventDialog;
let cardDialog;
let draggedCardId = null;
let editingCardId = null;
let toastTimer;

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(12, 0, 0, 0);
  return start;
}

function uid(prefix) {
  return `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function defaultState() {
  const today = dateKey();
  return {
    version: 3,
    calendarView: "pop",
    cursorDate: today,
    selectedDate: today,
    events: [],
    cards: [],
    spotify: {
      profileUrl: PROFILE_URL,
      contentUrl: ""
    },
    updatedAt: new Date().toISOString()
  };
}

function normalizeState(candidate) {
  const base = defaultState();
  if (!candidate || typeof candidate !== "object") return base;
  const normalized = {
    ...base,
    ...candidate,
    events: Array.isArray(candidate.events) ? candidate.events.filter((item) => item && item.id && item.title && item.date) : [],
    cards: Array.isArray(candidate.cards) ? candidate.cards.filter((item) => item && item.id && item.title) : [],
    spotify: { ...base.spotify, ...(candidate.spotify || {}) }
  };
  if (!["month", "week", "pop"].includes(normalized.calendarView)) normalized.calendarView = "pop";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.cursorDate)) normalized.cursorDate = base.cursorDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.selectedDate)) normalized.selectedDate = base.selectedDate;
  normalized.spotify.profileUrl = PROFILE_URL;
  normalized.spotify.contentUrl = String(normalized.spotify.contentUrl || "");
  return normalized;
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return defaultState();
  }
}

function saveState({ broadcast = true } = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (broadcast) channel?.postMessage(state);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function category(id) {
  return CATEGORIES[String(id)] || CATEGORIES["00"];
}

function columnIndex(id) {
  return Math.max(0, COLUMNS.findIndex((column) => column.id === id));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function withTransition(callback) {
  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(callback);
  } else {
    callback();
  }
}

function loadStyles() {
  if (document.querySelector('link[data-workspace-style]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/workspace.css";
  link.dataset.workspaceStyle = "true";
  document.head.append(link);
}

function buildNavigation() {
  const actions = document.querySelector(".header-actions");
  if (!actions || actions.querySelector(".ws-nav-button")) return;
  const link = document.createElement("a");
  link.href = "#planejador";
  link.className = "ws-nav-button";
  link.innerHTML = "<span aria-hidden=\"true\">✦</span> Planejador";
  actions.prepend(link);
}

function optionMarkup(source, selected) {
  return Object.entries(source)
    .map(([id, item]) => `<option value="${escapeHtml(id)}"${id === selected ? " selected" : ""}>${escapeHtml(item.icon || "")} ${escapeHtml(item.label)}</option>`)
    .join("");
}

function buildRoot() {
  root = document.createElement("div");
  root.id = "workspace-root";
  root.innerHTML = `
    <section class="ws-section" id="planejador" aria-labelledby="ws-planner-title">
      <div class="ws-heading">
        <div>
          <p class="eyebrow">Planejamento vivo</p>
          <h2 id="ws-planner-title">Calendário do seu jeito</h2>
          <p>Alterne entre mês, semana e o modo Pop — só o que importa hoje, sem transformar a rotina em uma planilha infinita.</p>
        </div>
        <div class="ws-heading-actions">
          <button class="button button-ghost" id="ws-new-card" type="button">+ Tarefa</button>
          <button class="button button-primary" id="ws-new-event" type="button">+ Evento</button>
        </div>
      </div>

      <div class="ws-shell">
        <div class="ws-toolbar">
          <div class="ws-toolbar-group">
            <button class="ws-icon-button" id="ws-calendar-prev" type="button" aria-label="Período anterior">‹</button>
            <button class="ws-mini-button" id="ws-calendar-today" type="button">Hoje</button>
            <button class="ws-icon-button" id="ws-calendar-next" type="button" aria-label="Próximo período">›</button>
          </div>
          <strong class="ws-toolbar-title" id="ws-calendar-title"></strong>
          <div class="ws-segmented" aria-label="Modo do calendário">
            <button class="ws-view-button" data-calendar-view="month" type="button">Mês</button>
            <button class="ws-view-button" data-calendar-view="week" type="button">Semana</button>
            <button class="ws-view-button" data-calendar-view="pop" type="button">Pop</button>
          </div>
        </div>

        <div class="ws-calendar-layout">
          <aside class="ws-day-focus" id="ws-day-focus"></aside>
          <div class="ws-calendar-stage" id="ws-calendar-stage" aria-live="polite"></div>
        </div>
      </div>
    </section>

    <section class="ws-section" id="kanban" aria-labelledby="ws-kanban-title">
      <div class="ws-heading">
        <div>
          <p class="eyebrow">Fluxo visual</p>
          <h2 id="ws-kanban-title">Kanban da Mirna</h2>
          <p>Arraste os cartões, use as setas no celular e veja os prazos aparecerem automaticamente no calendário.</p>
        </div>
        <button class="button button-primary" id="ws-kanban-add" type="button">+ Nova tarefa</button>
      </div>
      <div class="ws-shell ws-kanban-shell">
        <div class="ws-kanban-scroll">
          <div class="ws-kanban-board" id="ws-kanban-board"></div>
        </div>
      </div>
    </section>

    <section class="ws-section" id="spotify" aria-labelledby="ws-spotify-title">
      <div class="ws-heading">
        <div>
          <p class="eyebrow">Trilha do dia</p>
          <h2 id="ws-spotify-title">Spotify no seu painel</h2>
          <p>Seu perfil fica sempre à mão; cole uma playlist, álbum, faixa, artista ou podcast para tocar aqui.</p>
        </div>
      </div>
      <div class="ws-shell ws-spotify-shell">
        <aside class="ws-spotify-profile">
          <div class="ws-spotify-logo"><span aria-hidden="true">♫</span> Spotify</div>
          <h3>Perfil da Mirna conectado</h3>
          <p>Abra seu perfil para escolher uma playlist ou continue ouvindo direto pelo aplicativo.</p>
          <a class="button" href="${PROFILE_URL}" target="_blank" rel="noopener noreferrer">Abrir meu perfil ↗</a>
        </aside>
        <div class="ws-spotify-player">
          <form class="ws-spotify-form" id="ws-spotify-form">
            <label class="sr-only" for="ws-spotify-url">Link do Spotify</label>
            <input id="ws-spotify-url" type="url" inputmode="url" placeholder="Cole uma playlist, álbum, faixa, artista ou podcast" />
            <button class="button button-primary" type="submit">Carregar</button>
          </form>
          <div class="ws-spotify-frame-wrap" id="ws-spotify-frame-wrap"></div>
        </div>
      </div>
    </section>

    <dialog class="ws-dialog" id="ws-event-dialog">
      <form class="ws-dialog-card" id="ws-event-form">
        <div class="ws-dialog-head">
          <div><h2>Novo evento</h2><p>Uma aula, compromisso, estudo ou pausa protegida.</p></div>
          <button class="ws-dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button>
        </div>
        <div class="ws-form-grid">
          <label class="ws-full">Título<input id="ws-event-title" maxlength="120" required placeholder="Ex.: Aula de Ballet — turma avançada" /></label>
          <label>Data<input id="ws-event-date" type="date" required /></label>
          <label>Área<select id="ws-event-category">${optionMarkup(CATEGORIES, "01")}</select></label>
          <label>Início<input id="ws-event-start" type="time" value="09:00" /></label>
          <label>Fim<input id="ws-event-end" type="time" value="10:00" /></label>
          <label class="ws-full">Observações<textarea id="ws-event-notes" maxlength="500" placeholder="Materiais, endereço, lembretes…"></textarea></label>
          <label class="ws-check-row"><input id="ws-event-to-kanban" type="checkbox" /><span>Também criar uma tarefa no Kanban</span></label>
        </div>
        <div class="ws-dialog-actions">
          <button class="button button-ghost" type="button" data-close-dialog>Cancelar</button>
          <button class="button button-primary" type="submit">Salvar evento</button>
        </div>
      </form>
    </dialog>

    <dialog class="ws-dialog" id="ws-card-dialog">
      <form class="ws-dialog-card" id="ws-card-form">
        <div class="ws-dialog-head">
          <div><h2 id="ws-card-dialog-title">Nova tarefa</h2><p>Do pensamento ao próximo movimento.</p></div>
          <button class="ws-dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button>
        </div>
        <div class="ws-form-grid">
          <label class="ws-full">Tarefa<input id="ws-card-title" maxlength="140" required placeholder="Ex.: separar músicas da aula de quinta" /></label>
          <label>Coluna<select id="ws-card-column">${COLUMNS.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}</select></label>
          <label>Área<select id="ws-card-category">${optionMarkup(CATEGORIES, "00")}</select></label>
          <label>Prazo<input id="ws-card-due" type="date" /></label>
          <label>Prioridade<select id="ws-card-priority">${Object.entries(PRIORITIES).map(([id, item]) => `<option value="${id}"${id === "medium" ? " selected" : ""}>${item.label}</option>`).join("")}</select></label>
          <label class="ws-full">Observações<textarea id="ws-card-notes" maxlength="500" placeholder="Próximo passo, material necessário…"></textarea></label>
        </div>
        <div class="ws-dialog-actions">
          <button class="button button-ghost" type="button" data-close-dialog>Cancelar</button>
          <button class="button button-primary" type="submit">Salvar tarefa</button>
        </div>
      </form>
    </dialog>
    <div class="ws-live" id="ws-live" aria-live="polite"></div>
  `;

  const hero = document.querySelector("main.page-shell .hero");
  if (hero) hero.after(root);
  else document.querySelector("main.page-shell")?.prepend(root);

  eventDialog = root.querySelector("#ws-event-dialog");
  cardDialog = root.querySelector("#ws-card-dialog");
}

function itemForEvent(event) {
  return {
    id: event.id,
    kind: "event",
    title: event.title,
    date: event.date,
    start: event.start || "",
    end: event.end || "",
    category: event.category || "00",
    notes: event.notes || ""
  };
}

function itemForCard(card) {
  return {
    id: card.id,
    kind: "task",
    title: card.title,
    date: card.dueDate,
    start: "",
    end: "",
    category: card.category || "00",
    notes: card.notes || "",
    done: card.column === "done"
  };
}

function calendarItemsForDate(key) {
  const events = state.events.filter((event) => event.date === key).map(itemForEvent);
  const tasks = state.cards.filter((card) => card.dueDate === key).map(itemForCard);
  return [...events, ...tasks].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    return String(a.start || "99:99").localeCompare(String(b.start || "99:99"));
  });
}

function calendarTitle() {
  const cursor = parseDateKey(state.cursorDate);
  if (state.calendarView === "month") {
    return new Intl.DateTimeFormat(DATE_LOCALE, { month: "long", year: "numeric" }).format(cursor);
  }
  if (state.calendarView === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    const formatter = new Intl.DateTimeFormat(DATE_LOCALE, { day: "2-digit", month: "short" });
    return `${formatter.format(start)} — ${formatter.format(end)}`;
  }
  return new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", day: "2-digit", month: "long" }).format(parseDateKey(state.selectedDate));
}

function renderDayFocus() {
  const selected = parseDateKey(state.selectedDate);
  const items = calendarItemsForDate(state.selectedDate);
  const focus = root.querySelector("#ws-day-focus");
  const weekday = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long" }).format(selected);
  const month = new Intl.DateTimeFormat(DATE_LOCALE, { month: "long" }).format(selected);

  focus.innerHTML = `
    <div class="ws-focus-date">
      <div><strong>${selected.getDate()}</strong><small>${escapeHtml(month)}</small></div>
    </div>
    <div class="ws-focus-copy">
      <h3>${escapeHtml(weekday)}</h3>
      <p>${items.length ? `${items.length} ${items.length === 1 ? "movimento" : "movimentos"} planejados` : "Um espaço bom para respirar ou criar algo novo."}</p>
    </div>
    <div class="ws-day-list">
      ${items.length ? items.slice(0, 6).map((item, index) => {
        const cat = category(item.category);
        const time = item.kind === "event" ? (item.start || "Dia todo") : (item.done ? "Concluída" : "Tarefa");
        return `<button class="ws-day-list-item" type="button" data-focus-item="${escapeHtml(item.id)}" data-kind="${item.kind}" style="--item-color:${cat.color};animation-delay:${index * 40}ms"><strong>${escapeHtml(item.title)}</strong><time>${escapeHtml(time)}</time></button>`;
      }).join("") : '<p class="ws-empty">Nenhum compromisso neste dia.</p>'}
    </div>
  `;

  focus.querySelectorAll("[data-focus-item]").forEach((button) => {
    button.addEventListener("click", () => focusItem(button.dataset.focusItem, button.dataset.kind));
  });
}

function renderMonth() {
  const cursor = parseDateKey(state.cursorDate);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const weekday = first.getDay() || 7;
  const gridStart = addDays(first, -(weekday - 1));
  let html = `<div class="ws-weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="ws-month-grid">`;

  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index);
    const key = dateKey(day);
    const items = calendarItemsForDate(key);
    const classes = ["ws-month-day"];
    if (day.getMonth() !== cursor.getMonth()) classes.push("is-other");
    if (key === dateKey()) classes.push("is-today");
    if (key === state.selectedDate) classes.push("is-selected");
    html += `<button class="${classes.join(" ")}" type="button" data-calendar-day="${key}">
      <span class="ws-day-number">${day.getDate()}</span>
      <span class="ws-day-dots">
        ${items.slice(0, 3).map((item) => `<span class="ws-day-chip" style="--chip-color:${category(item.category).color}">${escapeHtml(item.title)}</span>`).join("")}
        ${items.length > 3 ? `<span class="ws-day-more">+${items.length - 3}</span>` : ""}
      </span>
    </button>`;
  }
  return `${html}</div>`;
}

function renderWeek() {
  const start = startOfWeek(parseDateKey(state.cursorDate));
  let html = '<div class="ws-week-scroll"><div class="ws-week-grid">';
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(start, index);
    const key = dateKey(day);
    const items = calendarItemsForDate(key);
    html += `<section class="ws-week-day${key === dateKey() ? " is-today" : ""}" data-week-day="${key}">
      <button class="ws-week-head" type="button" data-calendar-day="${key}"><span>${escapeHtml(new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "short" }).format(day))}</span><strong>${day.getDate()}</strong></button>
      <div class="ws-week-events">
        ${items.length ? items.map((item, itemIndex) => `<button class="ws-week-card" type="button" data-focus-item="${escapeHtml(item.id)}" data-kind="${item.kind}" style="--item-color:${category(item.category).color};animation-delay:${itemIndex * 45}ms"><strong>${escapeHtml(item.title)}</strong><small>${item.kind === "event" ? escapeHtml(item.start || "Dia todo") : item.done ? "Concluída" : "Tarefa"}</small></button>`).join("") : '<p class="ws-empty">Livre</p>'}
      </div>
    </section>`;
  }
  return `${html}</div></div>`;
}

function renderPop() {
  const selected = parseDateKey(state.selectedDate);
  const items = calendarItemsForDate(state.selectedDate);
  const dateText = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "long", month: "long" }).format(selected);
  return `<div class="ws-pop-layout">
    <div class="ws-pop-hero">
      <div class="ws-pop-date"><strong>${selected.getDate()}</strong><div><b>${escapeHtml(dateText)}</b><span>${items.length ? `${items.length} itens no seu ritmo` : "Dia aberto"}</span></div></div>
      <button class="button button-primary" type="button" data-pop-add>+ Adicionar</button>
    </div>
    <div class="ws-pop-timeline">
      ${items.length ? items.map((item, index) => {
        const cat = category(item.category);
        return `<article class="ws-pop-item" style="--item-color:${cat.color};animation-delay:${index * 55}ms">
          <span class="ws-pop-time">${item.kind === "event" ? escapeHtml(item.start || "Todo dia") : item.done ? "Feita" : "Tarefa"}</span>
          <div><strong>${escapeHtml(item.title)}</strong><p>${cat.icon} ${escapeHtml(cat.label)}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p></div>
          <button class="ws-card-action" type="button" data-focus-item="${escapeHtml(item.id)}" data-kind="${item.kind}" aria-label="Abrir item">›</button>
        </article>`;
      }).join("") : '<p class="ws-empty">Nada marcado. Talvez seja um bom dia para uma pausa, uma aula bonita ou um passo pequeno.</p>'}
    </div>
  </div>`;
}

function bindCalendarStage() {
  root.querySelectorAll("[data-calendar-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.calendarDay;
      if (state.calendarView === "month") {
        const selected = parseDateKey(state.selectedDate);
        const cursor = parseDateKey(state.cursorDate);
        if (selected.getMonth() !== cursor.getMonth()) state.cursorDate = state.selectedDate;
      }
      saveState();
      withTransition(renderCalendar);
    });
  });
  root.querySelectorAll("[data-focus-item]").forEach((button) => {
    button.addEventListener("click", () => focusItem(button.dataset.focusItem, button.dataset.kind));
  });
  root.querySelector("[data-pop-add]")?.addEventListener("click", () => openEventDialog(state.selectedDate));
}

function renderCalendar() {
  root.querySelector("#ws-calendar-title").textContent = calendarTitle();
  root.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.calendarView === state.calendarView));
  });

  renderDayFocus();
  const stage = root.querySelector("#ws-calendar-stage");
  stage.classList.remove("is-switching");
  void stage.offsetWidth;
  stage.classList.add("is-switching");
  stage.innerHTML = state.calendarView === "month" ? renderMonth() : state.calendarView === "week" ? renderWeek() : renderPop();
  bindCalendarStage();
}

function focusItem(id, kind) {
  if (kind === "task") {
    const card = root.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    document.querySelector("#kanban")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (card) {
      card.animate([{ transform: "scale(1)" }, { transform: "scale(1.045)", boxShadow: "0 0 0 5px rgba(143,95,114,.2)" }, { transform: "scale(1)" }], { duration: 720, easing: "ease" });
    }
    return;
  }
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  const ok = window.confirm(`Excluir o evento “${event.title}”?`);
  if (!ok) return;
  state.events = state.events.filter((item) => item.id !== id);
  saveState();
  renderCalendar();
  showToast("Evento removido.");
}

function renderKanbanCard(card, index) {
  const cat = category(card.category);
  const priority = PRIORITIES[card.priority] || PRIORITIES.medium;
  const currentIndex = columnIndex(card.column);
  return `<article class="ws-kanban-card${card.column === "done" ? " is-done" : ""}" draggable="true" tabindex="0" data-card-id="${escapeHtml(card.id)}" style="animation-delay:${index * 35}ms">
    <div class="ws-card-top"><span class="ws-card-category">${cat.icon} ${escapeHtml(cat.label)}</span><span class="ws-card-priority" title="${escapeHtml(priority.label)}" style="--priority-color:${priority.color}"></span></div>
    <div class="ws-card-title">${escapeHtml(card.title)}</div>
    <div class="ws-card-meta"><span>${card.dueDate ? `📅 ${new Intl.DateTimeFormat(DATE_LOCALE, { day: "2-digit", month: "short" }).format(parseDateKey(card.dueDate))}` : "Sem prazo"}</span><span>${card.notes ? "📝" : ""}</span></div>
    <div class="ws-card-actions">
      <button class="ws-card-action" type="button" data-move-card="-1" ${currentIndex === 0 ? "disabled" : ""} aria-label="Mover para a esquerda">←</button>
      <button class="ws-card-action" type="button" data-edit-card aria-label="Editar tarefa">✎</button>
      <button class="ws-card-action" type="button" data-move-card="1" ${currentIndex === COLUMNS.length - 1 ? "disabled" : ""} aria-label="Mover para a direita">→</button>
      <button class="ws-card-action" type="button" data-delete-card aria-label="Excluir tarefa">×</button>
    </div>
  </article>`;
}

function renderKanban() {
  const board = root.querySelector("#ws-kanban-board");
  board.innerHTML = COLUMNS.map((column) => {
    const cards = state.cards.filter((card) => card.column === column.id);
    return `<section class="ws-kanban-column" data-column-id="${column.id}" style="--column-color:${column.color}">
      <header class="ws-column-head"><div class="ws-column-title"><span class="ws-column-dot"></span>${escapeHtml(column.label)}</div><span class="ws-column-count">${cards.length}</span></header>
      <div class="ws-column-list">${cards.map(renderKanbanCard).join("")}</div>
      <button class="ws-add-column" type="button" data-add-to-column="${column.id}">+ adicionar</button>
    </section>`;
  }).join("");

  board.querySelectorAll("[data-card-id]").forEach((cardElement) => {
    const id = cardElement.dataset.cardId;
    cardElement.addEventListener("dragstart", (event) => {
      draggedCardId = id;
      cardElement.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    });
    cardElement.addEventListener("dragend", () => {
      draggedCardId = null;
      cardElement.classList.remove("is-dragging");
      board.querySelectorAll(".is-over").forEach((item) => item.classList.remove("is-over"));
    });
    cardElement.querySelector("[data-edit-card]").addEventListener("click", () => openCardDialog(undefined, id));
    cardElement.querySelector("[data-delete-card]").addEventListener("click", () => deleteCard(id));
    cardElement.querySelectorAll("[data-move-card]").forEach((button) => button.addEventListener("click", () => moveCard(id, Number(button.dataset.moveCard), cardElement)));
  });

  board.querySelectorAll("[data-column-id]").forEach((columnElement) => {
    columnElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      columnElement.classList.add("is-over");
    });
    columnElement.addEventListener("dragleave", () => columnElement.classList.remove("is-over"));
    columnElement.addEventListener("drop", (event) => {
      event.preventDefault();
      columnElement.classList.remove("is-over");
      const id = draggedCardId || event.dataTransfer.getData("text/plain");
      moveCardTo(id, columnElement.dataset.columnId, columnElement);
    });
  });

  board.querySelectorAll("[data-add-to-column]").forEach((button) => button.addEventListener("click", () => openCardDialog(button.dataset.addToColumn)));
}

function moveCard(id, direction, sourceElement) {
  const card = state.cards.find((item) => item.id === id);
  if (!card) return;
  const nextIndex = Math.min(COLUMNS.length - 1, Math.max(0, columnIndex(card.column) + direction));
  moveCardTo(id, COLUMNS[nextIndex].id, sourceElement);
}

function moveCardTo(id, targetColumn, sourceElement) {
  const card = state.cards.find((item) => item.id === id);
  if (!card || card.column === targetColumn) return;
  const wasDone = card.column === "done";
  card.column = targetColumn;
  saveState();
  withTransition(() => {
    renderKanban();
    renderCalendar();
  });
  root.querySelector("#ws-live").textContent = `${card.title} movida para ${COLUMNS.find((column) => column.id === targetColumn)?.label}.`;
  if (!wasDone && targetColumn === "done") celebrate(sourceElement);
}

function deleteCard(id) {
  const card = state.cards.find((item) => item.id === id);
  if (!card || !window.confirm(`Excluir “${card.title}”?`)) return;
  state.cards = state.cards.filter((item) => item.id !== id);
  saveState();
  renderKanban();
  renderCalendar();
  showToast("Tarefa excluída.");
}

function celebrate(element) {
  const rect = element?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const colors = ["#c68a9f", "#8fa68e", "#c5a36a", "#8299b6", "#1ed760"];
  for (let index = 0; index < 16; index += 1) {
    const particle = document.createElement("span");
    particle.className = "ws-confetti";
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.setProperty("--confetti-color", colors[index % colors.length]);
    particle.style.setProperty("--x", `${(Math.random() - .5) * 180}px`);
    particle.style.setProperty("--y", `${-45 - Math.random() * 120}px`);
    document.body.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function openEventDialog(initialDate = state.selectedDate) {
  const form = root.querySelector("#ws-event-form");
  form.reset();
  root.querySelector("#ws-event-date").value = initialDate || dateKey();
  root.querySelector("#ws-event-start").value = "09:00";
  root.querySelector("#ws-event-end").value = "10:00";
  eventDialog.showModal();
  requestAnimationFrame(() => root.querySelector("#ws-event-title").focus());
}

function openCardDialog(column = "ideas", cardId = null) {
  editingCardId = cardId;
  const form = root.querySelector("#ws-card-form");
  form.reset();
  const card = cardId ? state.cards.find((item) => item.id === cardId) : null;
  root.querySelector("#ws-card-dialog-title").textContent = card ? "Editar tarefa" : "Nova tarefa";
  root.querySelector("#ws-card-column").value = card?.column || column || "ideas";
  root.querySelector("#ws-card-category").value = card?.category || "00";
  root.querySelector("#ws-card-priority").value = card?.priority || "medium";
  root.querySelector("#ws-card-title").value = card?.title || "";
  root.querySelector("#ws-card-due").value = card?.dueDate || state.selectedDate || "";
  root.querySelector("#ws-card-notes").value = card?.notes || "";
  cardDialog.showModal();
  requestAnimationFrame(() => root.querySelector("#ws-card-title").focus());
}

function saveEvent(event) {
  event.preventDefault();
  const title = root.querySelector("#ws-event-title").value.trim();
  const eventDate = root.querySelector("#ws-event-date").value;
  if (!title || !eventDate) return;
  const record = {
    id: uid("event"),
    title,
    date: eventDate,
    start: root.querySelector("#ws-event-start").value,
    end: root.querySelector("#ws-event-end").value,
    category: root.querySelector("#ws-event-category").value,
    notes: root.querySelector("#ws-event-notes").value.trim(),
    createdAt: new Date().toISOString()
  };
  state.events.push(record);
  if (root.querySelector("#ws-event-to-kanban").checked) {
    state.cards.push({
      id: uid("card"),
      title,
      column: "next",
      category: record.category,
      priority: "medium",
      dueDate: record.date,
      notes: record.notes,
      createdAt: new Date().toISOString()
    });
  }
  state.selectedDate = eventDate;
  state.cursorDate = eventDate;
  saveState();
  eventDialog.close();
  renderCalendar();
  renderKanban();
  showToast("Evento guardado no seu calendário.");
}

function saveCard(event) {
  event.preventDefault();
  const title = root.querySelector("#ws-card-title").value.trim();
  if (!title) return;
  const values = {
    title,
    column: root.querySelector("#ws-card-column").value,
    category: root.querySelector("#ws-card-category").value,
    priority: root.querySelector("#ws-card-priority").value,
    dueDate: root.querySelector("#ws-card-due").value,
    notes: root.querySelector("#ws-card-notes").value.trim()
  };
  if (editingCardId) {
    const card = state.cards.find((item) => item.id === editingCardId);
    if (card) Object.assign(card, values);
  } else {
    state.cards.push({ id: uid("card"), ...values, createdAt: new Date().toISOString() });
  }
  editingCardId = null;
  saveState();
  cardDialog.close();
  renderKanban();
  renderCalendar();
  showToast("Tarefa salva no Kanban.");
}

function renderSpotify() {
  const wrap = root.querySelector("#ws-spotify-frame-wrap");
  const input = root.querySelector("#ws-spotify-url");
  input.value = state.spotify.contentUrl;
  const content = resolveSpotifyContent(state.spotify.contentUrl);

  if (!state.spotify.contentUrl) {
    wrap.innerHTML = '<div class="ws-spotify-empty"><strong>Seu perfil já está conectado.</strong>Abra o perfil, escolha uma playlist e cole o link acima para ter o player completo dentro do painel.</div>';
    return;
  }

  if (!content) {
    wrap.innerHTML = '<div class="ws-spotify-empty"><strong>Esse link não parece ser do Spotify.</strong>Cole um link que comece com open.spotify.com.</div>';
    return;
  }

  if (content.kind === "profile") {
    wrap.innerHTML = '<div class="ws-spotify-empty"><strong>Perfil conectado com sucesso.</strong>O Spotify não oferece player para páginas de perfil. Abra seu perfil, escolha uma playlist, álbum ou faixa e cole o link acima.</div>';
    return;
  }

  wrap.innerHTML = `<iframe class="ws-spotify-frame" title="Player do Spotify" src="${escapeHtml(content.embedUrl)}" height="${content.height}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
}

function saveSpotify(event) {
  event.preventDefault();
  const value = root.querySelector("#ws-spotify-url").value.trim();
  const content = resolveSpotifyContent(value);
  if (value && !content) {
    showToast("Cole um link válido do Spotify.");
    return;
  }
  state.spotify.contentUrl = value;
  saveState();
  renderSpotify();
  showToast(content?.kind === "embed" ? "Player do Spotify carregado." : "Perfil do Spotify conectado.");
}

function shiftCalendar(direction) {
  const cursor = parseDateKey(state.cursorDate);
  if (state.calendarView === "month") state.cursorDate = dateKey(addMonths(cursor, direction));
  else if (state.calendarView === "week") state.cursorDate = dateKey(addDays(cursor, direction * 7));
  else {
    state.selectedDate = dateKey(addDays(parseDateKey(state.selectedDate), direction));
    state.cursorDate = state.selectedDate;
  }
  saveState();
  withTransition(renderCalendar);
}

function bindEvents() {
  root.querySelector("#ws-calendar-prev").addEventListener("click", () => shiftCalendar(-1));
  root.querySelector("#ws-calendar-next").addEventListener("click", () => shiftCalendar(1));
  root.querySelector("#ws-calendar-today").addEventListener("click", () => {
    state.cursorDate = dateKey();
    state.selectedDate = dateKey();
    saveState();
    withTransition(renderCalendar);
  });
  root.querySelectorAll("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => {
    state.calendarView = button.dataset.calendarView;
    if (state.calendarView === "pop") state.cursorDate = state.selectedDate;
    saveState();
    withTransition(renderCalendar);
  }));
  root.querySelector("#ws-new-event").addEventListener("click", () => openEventDialog());
  root.querySelector("#ws-new-card").addEventListener("click", () => openCardDialog("ideas"));
  root.querySelector("#ws-kanban-add").addEventListener("click", () => openCardDialog("ideas"));
  root.querySelector("#ws-event-form").addEventListener("submit", saveEvent);
  root.querySelector("#ws-card-form").addEventListener("submit", saveCard);
  root.querySelector("#ws-spotify-form").addEventListener("submit", saveSpotify);
  root.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  [eventDialog, cardDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCardDialog("ideas");
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      state = normalizeState(JSON.parse(event.newValue));
      renderAll();
    } catch {
      // Mantém o estado atual se outra aba gravar algo incompleto.
    }
  });

  channel?.addEventListener("message", (event) => {
    state = normalizeState(event.data);
    renderAll();
  });
}

function renderAll() {
  renderCalendar();
  renderKanban();
  renderSpotify();
}

function init() {
  if (document.querySelector("#workspace-root")) return;
  loadStyles();
  state = loadState();
  buildNavigation();
  buildRoot();
  bindEvents();
  renderAll();
  window.__mirnaWorkspace = {
    getState: () => structuredClone(state),
    addEvent: (event) => { state.events.push({ id: uid("event"), ...event }); saveState(); renderAll(); },
    addCard: (card) => { state.cards.push({ id: uid("card"), column: "ideas", priority: "medium", category: "00", ...card }); saveState(); renderAll(); }
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
