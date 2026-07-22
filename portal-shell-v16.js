import { authReady, currentUser, logout, subscribeSync, syncNow } from "./auth-client-v18.js";

await authReady;

const MAIN_KEY = "painel-da-mirna:v1";
const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const TEACHER_KEY = "painel-da-mirna:teacher:v1";
const ATELIER_KEY = "atelie-da-mirna:v3";
const FACULTY_KEY = "painel-da-mirna:faculty:v1";
const PAGE = document.body.dataset.portalPage || "home";
const safe = (value, fallback = {}) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const user = currentUser();

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = "/auth-shell-v18.css?release=19.0";
document.head.append(style);

const routes = [
  ["Principal", [["home", "/", "⌂", "Meu dia"], ["agenda", "/agenda/", "▦", "Agenda"], ["aulas", "/aulas/", "🩰", "Aulas & Dança"]]],
  ["Projetos", [["faculdade", "/faculdade/", "🎓", "Faculdade"], ["arquivos", "/arquivos/", "▣", "Arquivos & Notas"], ["escola", "/escola/", "◇", "Minha Escola"]]],
  ["Sistema", [["configuracoes", "/configuracoes/", "⚙", "Configurações"]]]
];

function navMarkup() {
  return routes.map(([label, items]) => `<div class="portal-nav-group"><div class="portal-nav-label">${label}</div>${items.map(([id, href, icon, name]) => `<a class="portal-link${id === PAGE ? " is-active" : ""}" href="${href}" data-portal-route="${id}"${id === PAGE ? ' aria-current="page"' : ""}><span class="portal-link-icon" aria-hidden="true">${icon}</span><span>${name}</span></a>`).join("")}</div>`).join("");
}

function initials(name) {
  return String(name || "M").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function resolveTheme() {
  const state = safe(localStorage.getItem(MAIN_KEY), {});
  const choice = state.theme || "system";
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return choice === "system" ? (dark ? "dark" : "light") : choice;
}

function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme();
}

function setTheme(value) {
  const state = safe(localStorage.getItem(MAIN_KEY), {});
  state.theme = value;
  localStorage.setItem(MAIN_KEY, JSON.stringify(state));
  applyTheme();
}

function mentorMessage() {
  const workspace = safe(localStorage.getItem(WORKSPACE_KEY), {});
  const teacher = safe(localStorage.getItem(TEACHER_KEY), {});
  const atelier = safe(localStorage.getItem(ATELIER_KEY), {});
  const faculty = safe(localStorage.getItem(FACULTY_KEY), {});
  const today = new Date().toISOString().slice(0, 10);
  const pending = (workspace.cards || []).filter((card) => card.column !== "done").length;
  const lessons = (teacher.lessons || []).filter((lesson) => lesson.date >= today && lesson.status !== "cancelled");
  const school = (atelier.dreamSteps || []).filter((step) => !step.done).length;
  const studies = (faculty.subjects || []).length;
  const messages = [];
  if (lessons.some((item) => !item.objective || !item.structure)) messages.push("Há aulas futuras pedindo objetivo ou sequência. Comece pela próxima, não por todas.");
  if (pending > 8) messages.push("O planejamento está com muitas frentes abertas. Escolha três prioridades e deixe o restante em espera.");
  if (school > 4) messages.push("O projeto da escola tem vários passos em aberto. Concluir um pequeno passo vale mais que criar cinco novos.");
  if (!studies) messages.push("A área da Faculdade ainda está sem disciplinas cadastradas. Organizar o semestre deixa os prazos mais visíveis.");
  return messages[0] || "O sistema está organizado. Preserve espaço entre compromissos e revise apenas o que realmente muda o dia.";
}

function accountMarkup() {
  if (!user) {
    return `<div class="portal-account portal-account-local"><span class="portal-account-avatar">M</span><span class="portal-account-copy"><strong>Modo local</strong><small>Dados neste dispositivo</small><em data-status="local">Sem sincronização</em></span><a class="portal-account-login" href="/login/?next=${encodeURIComponent(location.pathname)}">Entrar</a></div>`;
  }
  return `<div class="portal-account"><span class="portal-account-avatar">${initials(user.name)}</span><span class="portal-account-copy"><strong>${user.name || "Mirna"}</strong><small>${user.email || ""}</small><em id="portal-sync-status">Sincronizando...</em></span><button id="portal-sync-now" type="button" aria-label="Sincronizar agora">↻</button><button id="portal-logout" type="button" aria-label="Sair do Ateliê">→</button></div>`;
}

function build() {
  applyTheme();
  document.body.classList.add("portal-ready");
  document.body.insertAdjacentHTML("afterbegin", `<a class="portal-skip" href="#conteudo-principal">Pular para o conteúdo</a><aside class="portal-sidebar" aria-label="Navegação principal"><a class="portal-brand" href="/"><span class="portal-brand-mark" aria-hidden="true">🌷</span><span class="portal-brand-copy"><strong>Ateliê da Mirna</strong><small>Vida centralizada</small></span></a><nav class="portal-nav">${navMarkup()}</nav><div class="portal-sidebar-foot"><button class="portal-side-action" id="portal-mentor-open" type="button"><span class="portal-link-icon">✦</span><span>Mentora</span></button><button class="portal-side-action" id="portal-theme-toggle" type="button"><span class="portal-link-icon">☾</span><span>Alternar tema</span></button>${accountMarkup()}<div class="portal-online" id="portal-online"><i></i><span>Online</span></div></div></aside><div class="portal-mobile-bar"><button class="portal-menu-button" id="portal-menu" type="button" aria-label="Abrir navegação">☰</button><span class="portal-mobile-title">Ateliê da Mirna</span><button class="portal-mobile-action" id="portal-mobile-mentor" type="button" aria-label="Abrir mentora">✦</button></div><div class="portal-overlay" id="portal-overlay"></div><aside class="portal-mentor" aria-label="Mentora do Ateliê"><div class="portal-mentor-head"><div><p class="portal-eyebrow">Mentora</p><h2>Um passo de cada vez</h2></div><button class="portal-close" id="portal-mentor-close" type="button" aria-label="Fechar mentora">×</button></div><div class="portal-mentor-message" id="portal-mentor-message"></div><div class="portal-mentor-links"><a href="/agenda/"><span>Organizar agenda</span><span>›</span></a><a href="/aulas/"><span>Preparar próxima aula</span><span>›</span></a><a href="/escola/"><span>Revisar projeto da escola</span><span>›</span></a></div></aside><div class="portal-toast" id="portal-global-toast" role="status" aria-live="polite"></div>`);

  const openMenu = (value) => document.body.classList.toggle("portal-menu-open", Boolean(value));
  const openMentor = (value) => {
    document.body.classList.toggle("portal-mentor-open", Boolean(value));
    if (value) document.querySelector("#portal-mentor-message").textContent = mentorMessage();
  };

  document.querySelector("#portal-menu")?.addEventListener("click", () => openMenu(true));
  document.querySelector("#portal-mentor-open")?.addEventListener("click", () => openMentor(true));
  document.querySelector("#portal-mobile-mentor")?.addEventListener("click", () => openMentor(true));
  document.querySelector("#portal-mentor-close")?.addEventListener("click", () => openMentor(false));
  document.querySelector("#portal-overlay")?.addEventListener("click", () => { openMenu(false); openMentor(false); });
  document.querySelector("#portal-theme-toggle")?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  document.querySelector("#portal-logout")?.addEventListener("click", logout);
  document.querySelector("#portal-sync-now")?.addEventListener("click", async () => {
    const button = document.querySelector("#portal-sync-now");
    button.disabled = true;
    try { await syncNow(); } finally { button.disabled = false; }
  });

  document.querySelectorAll("a[data-portal-route], .portal-mentor-links a").forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      event.preventDefault();
      openMenu(false);
      openMentor(false);
      location.assign(href);
    });
  });

  subscribeSync(({ status }) => {
    const label = document.querySelector("#portal-sync-status");
    if (!label) return;
    label.textContent = status === "syncing" ? "Sincronizando..." : status === "error" ? "Falha ao sincronizar" : status === "local" ? "Somente neste dispositivo" : "Tudo sincronizado";
    label.dataset.status = status;
  });

  const updateOnline = () => {
    const element = document.querySelector("#portal-online");
    const online = navigator.onLine;
    element?.classList.toggle("offline", !online);
    if (element) element.querySelector("span").textContent = online ? "Online" : "Offline";
  };
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const state = safe(localStorage.getItem(MAIN_KEY), {});
    if ((state.theme || "system") === "system") applyTheme();
  });
  window.__mirnaPortal = {
    page: PAGE,
    user,
    mode: user ? "cloud" : "local",
    routes: routes.flatMap(([, items]) => items.map(([id, href, , name]) => ({ id, href, name }))),
    toast(message) {
      const element = document.querySelector("#portal-global-toast");
      if (!element) return;
      element.textContent = message;
      element.classList.add("show");
      setTimeout(() => element.classList.remove("show"), 2500);
    },
    refreshMentor() {
      const element = document.querySelector("#portal-mentor-message");
      if (element) element.textContent = mentorMessage();
    }
  };
}

build();