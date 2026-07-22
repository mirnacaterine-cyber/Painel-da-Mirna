import { APP_CONFIG } from "./app-config.js";

const smartStyle = document.createElement("link");
smartStyle.rel = "stylesheet";
smartStyle.href = "/home-smart-v18.css?release=18.0";
document.head.append(smartStyle);

const MAIN_KEY = "painel-da-mirna:v1";
const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const TEACHER_KEY = "painel-da-mirna:teacher:v1";
const ATELIER_KEY = "atelie-da-mirna:v3";
const FACULTY_KEY = "painel-da-mirna:faculty:v1";
const $ = (selector) => document.querySelector(selector);
const safe = (value, fallback = {}) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const uid = (prefix) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

function weekKey(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return dateKey(local);
}

function baseState() {
  return { version: 2, dayKey: dateKey(), weekKey: weekKey(), daily: {}, weekly: {}, inbox: [], theme: "system" };
}

function loadMain() {
  const value = { ...baseState(), ...safe(localStorage.getItem(MAIN_KEY), {}) };
  if (value.dayKey !== dateKey()) { value.dayKey = dateKey(); value.daily = {}; }
  if (value.weekKey !== weekKey()) { value.weekKey = weekKey(); value.weekly = {}; }
  value.inbox = Array.isArray(value.inbox) ? value.inbox : [];
  return value;
}

function loadWorkspace() {
  const value = safe(localStorage.getItem(WORKSPACE_KEY), {});
  return { ...value, events: Array.isArray(value.events) ? value.events : [], cards: Array.isArray(value.cards) ? value.cards : [], notes: Array.isArray(value.notes) ? value.notes : [] };
}

let state = loadMain();
let captureMode = "auto";
const saveMain = () => localStorage.setItem(MAIN_KEY, JSON.stringify(state));
const saveWorkspace = (workspace) => {
  workspace.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  window.dispatchEvent(new StorageEvent("storage", { key: WORKSPACE_KEY, newValue: JSON.stringify(workspace) }));
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function metrics() {
  const workspace = loadWorkspace();
  const teacher = safe(localStorage.getItem(TEACHER_KEY), {});
  const atelier = safe(localStorage.getItem(ATELIER_KEY), {});
  const faculty = safe(localStorage.getItem(FACULTY_KEY), {});
  const today = dateKey();
  const upcomingEvents = workspace.events.filter((item) => item.date >= today).sort((a, b) => `${a.date}${a.start || ""}`.localeCompare(`${b.date}${b.start || ""}`));
  const openCards = workspace.cards.filter((item) => item.column !== "done");
  const lessons = (teacher.lessons || []).filter((item) => item.date >= today && item.status !== "cancelled");
  return {
    workspace,
    teacher,
    atelier,
    faculty,
    upcomingEvents,
    openCards,
    lessons,
    school: (atelier.dreamSteps || []).filter((item) => !item.done),
    notes: workspace.notes || []
  };
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function daysUntil(value) {
  if (!value) return Infinity;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date(`${dateKey()}T12:00:00`);
  return Math.round((target - today) / 86400000);
}

function smartPriorities() {
  const m = metrics();
  const now = new Date();
  const today = dateKey(now);
  const items = [];
  const overdue = m.openCards.filter((card) => card.dueDate && card.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (overdue) items.push({ icon: "!", tone: "rose", title: overdue.title, copy: `Atrasada desde ${formatDate(overdue.dueDate)}. Resolva ou escolha uma nova data.`, href: "/agenda/" });

  const todayEvents = m.upcomingEvents.filter((event) => event.date === today);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nextToday = todayEvents.find((event) => {
    if (!event.start) return true;
    const [hour, minute] = event.start.split(":").map(Number);
    return hour * 60 + minute >= currentMinutes;
  });
  if (nextToday) items.push({ icon: "◷", tone: "blue", title: nextToday.title, copy: `${nextToday.start || "Hoje"}${nextToday.location ? ` · ${nextToday.location}` : ""}`, href: "/agenda/" });

  const unprepared = m.lessons.find((lesson) => !lesson.objective || !lesson.structure || !lesson.materials);
  if (unprepared) items.push({ icon: "🩰", tone: "lilac", title: `Preparar: ${unprepared.title || "próxima aula"}`, copy: `${formatDate(unprepared.date)} · complete objetivo, sequência e materiais.`, href: "/aulas/" });

  const facultyDue = m.openCards.filter((card) => String(card.category) === "02" && card.dueDate && daysUntil(card.dueDate) >= 0 && daysUntil(card.dueDate) <= 3).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (facultyDue) items.push({ icon: "🎓", tone: "gold", title: facultyDue.title, copy: daysUntil(facultyDue.dueDate) === 0 ? "Prazo hoje." : `Prazo em ${daysUntil(facultyDue.dueDate)} dia(s).`, href: "/faculdade/" });

  if (items.length < 3 && m.openCards.length) {
    const priority = [...m.openCards].sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high") || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))[0];
    if (!items.some((item) => item.title === priority.title)) items.push({ icon: "✓", tone: "sage", title: priority.title, copy: priority.dueDate ? `Prazo ${formatDate(priority.dueDate)}.` : "Escolha um momento para concluir.", href: "/agenda/" });
  }

  if (!items.length) items.push({ icon: "✦", tone: "sage", title: "Seu dia está leve", copy: "Use este espaço para uma prioridade importante ou uma pausa de verdade.", href: "/agenda/" });
  return items.slice(0, 4);
}

function ensureSmartBrief() {
  if ($("#home-smart-brief")) return;
  const section = document.createElement("section");
  section.id = "home-smart-brief";
  section.className = "home-smart-brief";
  section.innerHTML = `<div class="home-smart-head"><div><p class="portal-eyebrow">Agora importa</p><h2>Seu dia em poucas escolhas</h2></div><span id="home-smart-summary"></span></div><div class="home-smart-grid" id="home-smart-grid"></div>`;
  const firstSection = document.querySelector(".home-section");
  firstSection?.before(section);
}

function renderSmartBrief() {
  ensureSmartBrief();
  const items = smartPriorities();
  $("#home-smart-summary").textContent = `${items.length} foco${items.length === 1 ? "" : "s"} sugerido${items.length === 1 ? "" : "s"}`;
  $("#home-smart-grid").innerHTML = items.map((item, index) => `<a class="home-smart-item tone-${item.tone}" href="${item.href}"><span class="home-smart-number">${String(index + 1).padStart(2, "0")}</span><span class="home-smart-icon">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.copy)}</small></span><b aria-hidden="true">→</b></a>`).join("");
}

function renderAreas() {
  const m = metrics();
  const areas = [
    ["/agenda/", "▦", "Agenda & Planejamento", `${m.upcomingEvents.length} eventos · ${m.openCards.length} tarefas`, "Calendário e Kanban sem misturar com o restante do sistema."],
    ["/aulas/", "🩰", "Aulas & Dança", `${m.lessons.length} próximas aulas · ${(m.teacher.students || []).length} alunas`, "Rotinas, planejamento, chamada, evolução e produções."],
    ["/faculdade/", "🎓", "Faculdade", `${(m.faculty.subjects || []).length} disciplinas`, "Trabalhos, provas, leituras e prazos do semestre."],
    ["/arquivos/", "▣", "Arquivos & Notas", `${m.notes.length} notas`, "Biblioteca, notas e documentos organizados por área."],
    ["/escola/", "◇", "Minha Escola", `${m.school.length} passos abertos`, "Missão, valores, fundo financeiro, estrutura e roadmap."],
    ["/configuracoes/", "⚙", "Configurações", "Integrações e segurança", "Agenda Google, Spotify, backup, tema e diagnóstico."]
  ];
  $("#home-area-grid").innerHTML = areas.map(([href, icon, title, metric, copy], index) => `<a class="home-area home-area-${index + 1}" href="${href}"><div class="home-area-top"><span class="home-area-icon" aria-hidden="true">${icon}</span><span class="home-area-metric">${metric}</span></div><div><h3>${title}</h3><p>${copy}</p></div><span class="home-area-link">Abrir área →</span></a>`).join("");
}

function renderDaily() {
  const list = $("#home-daily-list");
  list.innerHTML = APP_CONFIG.dailyTasks.map((task, index) => `<label class="home-check${state.daily[index] ? " done" : ""}"><input type="checkbox" data-daily="${index}"${state.daily[index] ? " checked" : ""}><span>${task}</span></label>`).join("");
  const total = APP_CONFIG.dailyTasks.length;
  const done = APP_CONFIG.dailyTasks.reduce((count, _, index) => count + Number(Boolean(state.daily[index])), 0);
  const percent = total ? Math.round(done / total * 100) : 0;
  $("#home-progress-label").textContent = `${done}/${total} cuidados`;
  $("#home-progress-bar").style.width = `${percent}%`;
  $("#home-progress-message").textContent = ["Comece com um passo pequeno.", "Você já abriu espaço para o dia.", "O essencial está entrando no eixo.", "Mais da metade — continue com gentileza.", "Quase lá. Falta só um cuidado.", "Feito. Agora respira e segue leve."][Math.min(done, 5)];
}

function renderAgendaSummary() {
  const m = metrics();
  const next = m.upcomingEvents[0];
  $("#home-next-title").textContent = next ? next.title : "Agenda livre";
  $("#home-next-copy").textContent = next ? `${next.date.split("-").reverse().join("/")}${next.start ? ` · ${next.start}` : ""}${next.notes ? ` · ${next.notes}` : ""}` : "Nenhum compromisso futuro encontrado.";
  const pending = m.openCards.slice(0, 3);
  $("#home-pending-list").innerHTML = pending.length ? pending.map((card) => `<div class="home-mini-item"><div><strong>${escapeHtml(card.title)}</strong><small>${card.dueDate ? card.dueDate.split("-").reverse().join("/") : "Sem prazo"}</small></div><span>${card.priority === "high" ? "Importante" : ""}</span></div>`).join("") : '<div class="home-empty">Nenhuma tarefa pendente.</div>';
}

function renderInbox() {
  const pending = state.inbox.filter((item) => !item.done);
  $("#home-inbox-count").textContent = String(pending.length);
  const sorted = [...state.inbox].sort((a, b) => Number(Boolean(a.done)) - Number(Boolean(b.done)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $("#home-inbox-list").innerHTML = sorted.length ? sorted.slice(0, 6).map((item) => `<div class="home-inbox-item"><div><strong${item.done ? ' style="text-decoration:line-through"' : ""}>${escapeHtml(item.text)}</strong><small>${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div><div class="home-inbox-actions"><button type="button" data-inbox-toggle="${item.id}" aria-label="${item.done ? "Reabrir" : "Concluir"}">${item.done ? "↺" : "✓"}</button><button type="button" data-inbox-delete="${item.id}" aria-label="Excluir">×</button></div></div>`).join("") : '<div class="home-empty">A Entrada está leve. Que delícia.</div>';
}

function nextWeekday(dayIndex) {
  const date = new Date();
  const distance = (dayIndex - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + distance);
  return dateKey(date);
}

function parseDateFromText(text) {
  const lower = text.toLocaleLowerCase("pt-BR");
  const date = new Date();
  if (/\bhoje\b/.test(lower)) return dateKey(date);
  if (/\bdepois de amanh[ãa]\b/.test(lower)) { date.setDate(date.getDate() + 2); return dateKey(date); }
  if (/\bamanh[ãa]\b/.test(lower)) { date.setDate(date.getDate() + 1); return dateKey(date); }
  const explicit = lower.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (explicit) {
    const year = explicit[3] ? Number(explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : new Date().getFullYear();
    return `${year}-${String(Number(explicit[2])).padStart(2, "0")}-${String(Number(explicit[1])).padStart(2, "0")}`;
  }
  const weekdays = [[0, "domingo"], [1, "segunda"], [2, "terca|terça"], [3, "quarta"], [4, "quinta"], [5, "sexta"], [6, "sabado|sábado"]];
  for (const [index, pattern] of weekdays) if (new RegExp(`\\b(?:${pattern})(?:-feira)?\\b`).test(lower)) return nextWeekday(index);
  return "";
}

function parseTimeFromText(text) {
  const match = text.match(/(?:\b(?:as|às)\s*)?\b([01]?\d|2[0-3])(?:[:h]([0-5]\d))?\s*h?\b/i);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2] || 0)).padStart(2, "0")}`;
}

function categoryFromText(text) {
  const lower = text.toLocaleLowerCase("pt-BR");
  if (/faculdade|prova|trabalho|seminario|seminário|disciplina|anatomia|metodologia/.test(lower)) return "02";
  if (/aula|ballet|bale|balé|dan[çc]a|gr|ginastica|ginástica|turma|aluna/.test(lower)) return "01";
  if (/viagem|show|festival|passagem|hotel/.test(lower)) return "06";
  if (/casa|casinha|mercado|cozinha|limpeza/.test(lower)) return "05";
  return "00";
}

function parseCapture(text) {
  const lower = text.toLocaleLowerCase("pt-BR");
  const date = parseDateFromText(text);
  const time = parseTimeFromText(text);
  const eventWords = /\b(aula|prova|consulta|reuniao|reunião|missa|compromisso|show|viagem|ensaio|apresentacao|apresentação)\b/;
  const noteWords = /\b(ideia|pensamento|referencia|referência|anotar|lembrar de pesquisar)\b/;
  let intent = noteWords.test(lower) ? "note" : (eventWords.test(lower) || time ? "event" : "task");
  if (!date && intent === "event") intent = "note";
  return { intent, date, time, category: categoryFromText(text), title: text.trim() };
}

function ensureCaptureAssistant() {
  if ($("#home-capture-assistant")) return;
  const footer = document.querySelector(".home-capture > div");
  const assistant = document.createElement("div");
  assistant.id = "home-capture-assistant";
  assistant.className = "home-capture-assistant";
  assistant.innerHTML = `<div><span class="home-capture-spark">✦</span><span><strong id="home-capture-kind">Anotação</strong><small id="home-capture-detail">Escreva naturalmente. Eu organizo para você.</small></span></div><div class="home-capture-modes" role="group" aria-label="Tipo do registro"><button type="button" data-capture-mode="auto" class="is-active">Auto</button><button type="button" data-capture-mode="task">Tarefa</button><button type="button" data-capture-mode="event">Evento</button><button type="button" data-capture-mode="note">Nota</button></div>`;
  footer?.before(assistant);
  assistant.addEventListener("click", (event) => {
    const button = event.target.closest("[data-capture-mode]");
    if (!button) return;
    captureMode = button.dataset.captureMode;
    assistant.querySelectorAll("[data-capture-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
    updateCaptureSuggestion();
  });
}

function updateCaptureSuggestion() {
  ensureCaptureAssistant();
  const text = $("#home-capture-input").value.trim();
  const parsed = parseCapture(text);
  const intent = captureMode === "auto" ? parsed.intent : captureMode;
  const labels = { task: "Tarefa", event: "Evento", note: "Anotação" };
  $("#home-capture-kind").textContent = labels[intent];
  const pieces = [];
  if (parsed.date) pieces.push(formatDate(parsed.date));
  if (parsed.time && intent === "event") pieces.push(parsed.time);
  $("#home-capture-detail").textContent = text ? (pieces.length ? pieces.join(" · ") : intent === "task" ? "Vai para o Kanban." : intent === "event" ? "Inclua uma data para criar o evento." : "Fica guardada na Entrada.") : "Escreva naturalmente. Eu organizo para você.";
  const submit = document.querySelector("#home-capture-form button[type=submit]");
  submit.textContent = intent === "task" ? "Criar tarefa" : intent === "event" ? "Criar evento" : "Guardar nota";
}

function saveCapture(text) {
  const parsed = parseCapture(text);
  const intent = captureMode === "auto" ? parsed.intent : captureMode;
  const workspace = loadWorkspace();
  if (intent === "event" && parsed.date) {
    workspace.events.push({ id: uid("event"), title: parsed.title, date: parsed.date, start: parsed.time, end: "", category: parsed.category, notes: "Criado pela Entrada inteligente", createdAt: new Date().toISOString() });
    saveWorkspace(workspace);
    return "Evento criado na Agenda.";
  }
  if (intent === "task") {
    workspace.cards.push({ id: uid("card"), title: parsed.title, dueDate: parsed.date, notes: "Criado pela Entrada inteligente", category: parsed.category, column: "next", priority: /urgente|importante|prova/i.test(text) ? "high" : "medium", createdAt: new Date().toISOString() });
    saveWorkspace(workspace);
    return "Tarefa criada no Kanban.";
  }
  state.inbox.push({ id: uid("inbox"), text, createdAt: new Date().toISOString(), done: false });
  saveMain();
  return intent === "event" ? "Faltou uma data; guardei como anotacao." : "Anotacao guardada na Entrada.";
}

function renderAll() {
  $("#home-greeting").textContent = `${greeting()}, ${APP_CONFIG.ownerName}`;
  $("#home-date").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  renderSmartBrief();
  renderAreas();
  renderDaily();
  renderAgendaSummary();
  renderInbox();
  updateCaptureSuggestion();
}

$("#home-daily-list").addEventListener("change", (event) => {
  const input = event.target.closest("[data-daily]");
  if (!input) return;
  state.daily[input.dataset.daily] = input.checked;
  saveMain();
  renderDaily();
});
$("#home-reset-daily").onclick = () => { state.daily = {}; saveMain(); renderDaily(); };
$("#home-capture-input").addEventListener("input", (event) => {
  $("#home-capture-counter").textContent = `${event.target.value.length}/280`;
  updateCaptureSuggestion();
});
$("#home-capture-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#home-capture-input");
  const text = input.value.trim();
  if (!text) return;
  const result = saveCapture(text);
  event.target.reset();
  captureMode = "auto";
  document.querySelectorAll("[data-capture-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.captureMode === "auto"));
  $("#home-capture-counter").textContent = "0/280";
  renderAll();
  window.__mirnaPortal?.toast(result);
});
$("#home-inbox-list").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-inbox-toggle]");
  const remove = event.target.closest("[data-inbox-delete]");
  if (toggle) {
    const item = state.inbox.find((value) => value.id === toggle.dataset.inboxToggle);
    if (item) item.done = !item.done;
  }
  if (remove) state.inbox = state.inbox.filter((value) => value.id !== remove.dataset.inboxDelete);
  saveMain();
  renderInbox();
});
$("#home-organize").onclick = () => {
  const priorities = smartPriorities().slice(0, 3).map((item) => item.title);
  window.__mirnaPortal?.toast(`Hoje: ${priorities.join(" · ")}`);
};
window.addEventListener("storage", () => { state = loadMain(); renderAll(); });
renderAll();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw-v16.js?release=18.0", { scope: "/" }).catch(() => {});
