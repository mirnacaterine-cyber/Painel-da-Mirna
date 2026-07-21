const SIDEBAR_STATE_KEY = "painel-da-mirna:sidebar-v6";
const NAV_ITEMS = [
  { group: "Hoje", id: "top", icon: "⌂", label: "Início" },
  { group: "Hoje", id: "mirna-auto-sync", icon: "✦", label: "Meu dia" },
  { group: "Planejamento", id: "planejador", icon: "▦", label: "Calendário" },
  { group: "Planejamento", id: "kanban", icon: "▤", label: "Kanban" },
  { group: "Organização", id: "entrada", icon: "＋", label: "Entrada" },
  { group: "Organização", id: "hub-notes-card", icon: "✎", label: "Notas" },
  { group: "Organização", id: "hub-files-card", icon: "▣", label: "Arquivos" },
  { group: "Conexões", id: "hub-calendar-card", icon: "◫", label: "Agenda Google" },
  { group: "Conexões", id: "spotify", icon: "♫", label: "Spotify" },
  { group: "Vida da Mirna", id: "acesso-rapido", icon: "◇", label: "Áreas" },
  { group: "Vida da Mirna", id: "revisoes", icon: "✓", label: "Revisões" },
  { group: "Vida da Mirna", id: "visao", icon: "◎", label: "Visão" },
  { group: "Sistema", id: "backup", icon: "⇩", label: "Backup" }
];

let sidebar;
let overlay;
let settingsSheet;
let observer;
let mutationObserver;
let collapsed = false;
let mobileOpen = false;

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function savedState() {
  return safeJson(localStorage.getItem(SIDEBAR_STATE_KEY), {});
}

function persistState() {
  localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ collapsed }));
}

function ensureSectionIds() {
  const review = document.querySelector(".review-grid");
  if (review && !review.id) review.id = "revisoes";
  const vision = document.querySelector("#vision-title")?.closest("section");
  if (vision && !vision.id) vision.id = "visao";
  const backup = document.querySelector(".utility-panel");
  if (backup && !backup.id) backup.id = "backup";
  const hero = document.querySelector(".hero");
  if (hero && !hero.id) hero.id = "inicio";
  for (const element of document.querySelectorAll("section, article[id]")) {
    element.style.scrollMarginTop = "86px";
  }
}

function installStyles() {
  if (document.querySelector("#mirna-sidebar-v6-styles")) return;
  const style = document.createElement("style");
  style.id = "mirna-sidebar-v6-styles";
  style.textContent = `
    :root{--mirna-sidebar-width:278px;--mirna-sidebar-collapsed:86px}
    body.mirna-sidebar-ready{padding-left:var(--mirna-sidebar-width);transition:padding-left .35s cubic-bezier(.2,.8,.2,1)}
    body.mirna-sidebar-ready.sidebar-collapsed{padding-left:var(--mirna-sidebar-collapsed)}
    body.mirna-sidebar-ready .site-header{left:var(--mirna-sidebar-width);width:calc(100% - var(--mirna-sidebar-width));transition:left .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1)}
    body.mirna-sidebar-ready.sidebar-collapsed .site-header{left:var(--mirna-sidebar-collapsed);width:calc(100% - var(--mirna-sidebar-collapsed))}
    .mirna-sidebar{position:fixed;inset:0 auto 0 0;width:var(--mirna-sidebar-width);z-index:1300;display:flex;flex-direction:column;background:color-mix(in srgb,var(--surface,#fffdfb) 94%,#f4e9ed 6%);border-right:1px solid var(--line,rgba(72,54,63,.12));box-shadow:16px 0 48px rgba(65,42,53,.08);backdrop-filter:blur(22px);transition:width .35s cubic-bezier(.2,.8,.2,1),transform .35s cubic-bezier(.2,.8,.2,1)}
    .sidebar-collapsed .mirna-sidebar{width:var(--mirna-sidebar-collapsed)}
    .mirna-sidebar-head{display:flex;align-items:center;gap:12px;padding:20px 18px 15px;min-height:74px;border-bottom:1px solid var(--line,rgba(72,54,63,.1))}.mirna-sidebar-logo{display:grid;place-items:center;flex:0 0 42px;height:42px;border-radius:15px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent,#8f5f72) 18%,white),color-mix(in srgb,var(--accent,#8f5f72) 8%,white));box-shadow:0 12px 28px color-mix(in srgb,var(--accent,#8f5f72) 16%,transparent);font-size:1.25rem}.mirna-sidebar-brand{min-width:0;display:grid}.mirna-sidebar-brand strong{font-size:.95rem}.mirna-sidebar-brand small{color:var(--muted,#756a70);font-size:.72rem}.sidebar-collapsed .mirna-sidebar-brand{opacity:0;width:0;overflow:hidden}.mirna-sidebar-collapse{margin-left:auto;width:34px;height:34px;border:0;border-radius:11px;background:transparent;color:inherit;cursor:pointer;font-size:1.1rem;transition:transform .2s ease,background .2s ease}.mirna-sidebar-collapse:hover{background:color-mix(in srgb,var(--accent,#8f5f72) 10%,transparent)}.sidebar-collapsed .mirna-sidebar-collapse{transform:rotate(180deg)}
    .mirna-sidebar-scroll{flex:1;overflow:auto;padding:12px 11px 18px;scrollbar-width:thin}.mirna-nav-group{display:grid;gap:4px;margin:8px 0 16px}.mirna-nav-group-title{padding:0 12px 6px;color:var(--muted,#756a70);font-size:.65rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase;white-space:nowrap;transition:opacity .2s}.sidebar-collapsed .mirna-nav-group-title{opacity:0;height:4px;padding:0}.mirna-nav-link{position:relative;display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 12px;border-radius:14px;color:var(--text,#332b30);text-decoration:none;font-size:.86rem;font-weight:700;overflow:hidden;transition:transform .2s ease,background .2s ease,color .2s ease,box-shadow .2s ease}.mirna-nav-link::before{content:"";position:absolute;inset:5px auto 5px 0;width:3px;border-radius:999px;background:var(--accent,#8f5f72);transform:scaleY(0);transition:transform .2s ease}.mirna-nav-link:hover{transform:translateX(3px);background:color-mix(in srgb,var(--accent,#8f5f72) 8%,transparent)}.mirna-nav-link.is-active{background:linear-gradient(100deg,color-mix(in srgb,var(--accent,#8f5f72) 15%,transparent),color-mix(in srgb,var(--accent,#8f5f72) 5%,transparent));box-shadow:0 10px 24px color-mix(in srgb,var(--accent,#8f5f72) 10%,transparent)}.mirna-nav-link.is-active::before{transform:scaleY(1)}.mirna-nav-icon{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:10px;background:color-mix(in srgb,var(--accent,#8f5f72) 8%,transparent);font-size:.98rem}.mirna-nav-label{white-space:nowrap;transition:opacity .2s}.sidebar-collapsed .mirna-nav-label{opacity:0;width:0;overflow:hidden}.sidebar-collapsed .mirna-nav-link{justify-content:center;padding-inline:8px}.sidebar-collapsed .mirna-nav-link:hover{transform:translateY(-2px)}
    .mirna-sidebar-foot{display:grid;gap:8px;padding:12px;border-top:1px solid var(--line,rgba(72,54,63,.1))}.mirna-sidebar-action{display:flex;align-items:center;gap:12px;min-height:44px;border:0;border-radius:14px;padding:8px 12px;background:transparent;color:inherit;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;text-align:left;transition:background .2s,transform .2s}.mirna-sidebar-action:hover{background:color-mix(in srgb,var(--accent,#8f5f72) 9%,transparent);transform:translateY(-1px)}.sidebar-collapsed .mirna-sidebar-action{justify-content:center}.sidebar-collapsed .mirna-sidebar-action span:last-child{display:none}.mirna-sidebar-status{display:flex;align-items:center;gap:8px;padding:5px 12px;color:var(--muted,#756a70);font-size:.7rem}.mirna-sidebar-status i{width:8px;height:8px;border-radius:50%;background:#73a87d;box-shadow:0 0 0 4px rgba(115,168,125,.12)}.sidebar-collapsed .mirna-sidebar-status span{display:none}
    .mirna-mobile-menu{display:none;width:42px;height:42px;border:1px solid var(--line,rgba(72,54,63,.12));border-radius:13px;background:var(--surface,#fffdfb);color:inherit;font-size:1.15rem;cursor:pointer}.mirna-sidebar-overlay{position:fixed;inset:0;z-index:1290;background:rgba(31,23,27,.38);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .3s}.mirna-settings-sheet{position:fixed;inset:18px 18px 18px auto;z-index:1500;width:min(440px,calc(100vw - 36px));border:1px solid var(--line,rgba(72,54,63,.14));border-radius:26px;background:var(--surface,#fffdfb);box-shadow:0 28px 80px rgba(48,31,39,.2);transform:translateX(calc(100% + 40px));opacity:0;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .25s;overflow:auto}.mirna-settings-sheet.is-open{transform:none;opacity:1}.mirna-settings-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:12px;padding:22px;background:color-mix(in srgb,var(--surface,#fffdfb) 94%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--line,rgba(72,54,63,.1))}.mirna-settings-head h2{margin:3px 0 0;font:700 1.65rem/1.05 Georgia,"Times New Roman",serif}.mirna-settings-close{width:38px;height:38px;border:0;border-radius:12px;background:color-mix(in srgb,var(--accent,#8f5f72) 8%,transparent);cursor:pointer;font-size:1.25rem}.mirna-settings-body{display:grid;gap:12px;padding:20px}.mirna-setting-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;border:1px solid var(--line,rgba(72,54,63,.1));border-radius:18px;padding:14px;background:color-mix(in srgb,var(--surface,#fffdfb) 94%,var(--accent,#8f5f72) 6%);cursor:pointer;text-align:left;color:inherit}.mirna-setting-card:hover{transform:translateY(-2px)}.mirna-setting-card strong{display:block}.mirna-setting-card small{display:block;color:var(--muted,#756a70);margin-top:3px}.mirna-setting-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:color-mix(in srgb,var(--accent,#8f5f72) 10%,transparent)}
    body.mirna-settings-open .mirna-sidebar-overlay,body.mirna-mobile-nav-open .mirna-sidebar-overlay{opacity:1;pointer-events:auto}
    @media(max-width:1080px){body.mirna-sidebar-ready,body.mirna-sidebar-ready.sidebar-collapsed{padding-left:0}body.mirna-sidebar-ready .site-header,body.mirna-sidebar-ready.sidebar-collapsed .site-header{left:0;width:100%}.mirna-sidebar{width:min(310px,86vw);transform:translateX(-105%)}body.mirna-mobile-nav-open .mirna-sidebar{transform:none}.mirna-sidebar-collapse{display:none}.mirna-mobile-menu{display:grid;place-items:center}.sidebar-collapsed .mirna-sidebar{width:min(310px,86vw)}.sidebar-collapsed .mirna-sidebar-brand,.sidebar-collapsed .mirna-nav-label{opacity:1;width:auto}.sidebar-collapsed .mirna-nav-group-title{opacity:1;height:auto;padding:0 12px 6px}.sidebar-collapsed .mirna-nav-link,.sidebar-collapsed .mirna-sidebar-action{justify-content:flex-start;padding-inline:12px}.sidebar-collapsed .mirna-sidebar-action span:last-child{display:inline}.sidebar-collapsed .mirna-sidebar-status span{display:inline}}
    @media(max-width:560px){.mirna-settings-sheet{inset:10px;width:calc(100vw - 20px);border-radius:22px}.mirna-settings-head{padding:18px}.mirna-settings-body{padding:14px}}
    @media(prefers-reduced-motion:reduce){.mirna-sidebar,.mirna-settings-sheet,.mirna-sidebar-overlay,body.mirna-sidebar-ready{transition:none}.mirna-nav-link:hover,.mirna-setting-card:hover{transform:none}}
  `;
  document.head.append(style);
}

function groupItems() {
  const groups = new Map();
  for (const item of NAV_ITEMS) {
    if (!document.getElementById(item.id)) continue;
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  return groups;
}

function navMarkup() {
  return [...groupItems()].map(([group, items]) => `
    <nav class="mirna-nav-group" aria-label="${group}">
      <div class="mirna-nav-group-title">${group}</div>
      ${items.map((item) => `<a class="mirna-nav-link" href="#${item.id}" data-nav-target="${item.id}" title="${item.label}"><span class="mirna-nav-icon" aria-hidden="true">${item.icon}</span><span class="mirna-nav-label">${item.label}</span></a>`).join("")}
    </nav>`).join("");
}

function buildSidebar() {
  sidebar = document.createElement("aside");
  sidebar.className = "mirna-sidebar";
  sidebar.setAttribute("aria-label", "Navegação principal do Painel da Mirna");
  sidebar.innerHTML = `
    <div class="mirna-sidebar-head">
      <div class="mirna-sidebar-logo" aria-hidden="true">🌷</div>
      <div class="mirna-sidebar-brand"><strong>Painel da Mirna</strong><small>Vida centralizada</small></div>
      <button class="mirna-sidebar-collapse" type="button" aria-label="Recolher menu">‹</button>
    </div>
    <div class="mirna-sidebar-scroll">${navMarkup()}</div>
    <div class="mirna-sidebar-foot">
      <button class="mirna-sidebar-action" id="mirna-open-settings" type="button"><span class="mirna-nav-icon" aria-hidden="true">⚙</span><span>Configurações</span></button>
      <div class="mirna-sidebar-status"><i></i><span id="mirna-sidebar-status-text">Sistema online</span></div>
    </div>`;
  document.body.prepend(sidebar);

  overlay = document.createElement("div");
  overlay.className = "mirna-sidebar-overlay";
  overlay.setAttribute("aria-hidden", "true");
  document.body.append(overlay);
}

function buildSettingsSheet() {
  settingsSheet = document.createElement("aside");
  settingsSheet.className = "mirna-settings-sheet";
  settingsSheet.setAttribute("aria-label", "Configurações rápidas");
  settingsSheet.innerHTML = `
    <div class="mirna-settings-head"><div><p class="eyebrow">Atalhos do sistema</p><h2>Configurações</h2></div><button class="mirna-settings-close" type="button" aria-label="Fechar">×</button></div>
    <div class="mirna-settings-body">
      <button class="mirna-setting-card" data-settings-target="hub-calendar-card" type="button"><span class="mirna-setting-icon">◫</span><span><strong>Google Agenda</strong><small>Conectar, testar e atualizar agendas</small></span><span>›</span></button>
      <button class="mirna-setting-card" data-settings-target="spotify" type="button"><span class="mirna-setting-icon">♫</span><span><strong>Spotify</strong><small>Perfil e playlist do painel</small></span><span>›</span></button>
      <button class="mirna-setting-card" data-settings-target="hub-files-card" type="button"><span class="mirna-setting-icon">▣</span><span><strong>Banco e arquivos</strong><small>Neon, Blob, token e biblioteca</small></span><span>›</span></button>
      <button class="mirna-setting-card" data-settings-target="hub-notes-card" type="button"><span class="mirna-setting-icon">✎</span><span><strong>Notas</strong><small>Criar, editar e sincronizar</small></span><span>›</span></button>
      <button class="mirna-setting-card" id="mirna-refresh-calendar" type="button"><span class="mirna-setting-icon">↻</span><span><strong>Atualizar agenda agora</strong><small>Testar todas as conexões sem mudar a aba</small></span><span>›</span></button>
      <button class="mirna-setting-card" id="mirna-toggle-theme" type="button"><span class="mirna-setting-icon">☾</span><span><strong>Alternar tema</strong><small>Claro ou escuro</small></span><span>›</span></button>
    </div>`;
  document.body.append(settingsSheet);
}

function addMobileButton() {
  const headerActions = document.querySelector(".header-actions");
  if (!headerActions || headerActions.querySelector(".mirna-mobile-menu")) return;
  const button = document.createElement("button");
  button.className = "mirna-mobile-menu";
  button.type = "button";
  button.setAttribute("aria-label", "Abrir menu");
  button.textContent = "☰";
  headerActions.prepend(button);
  button.addEventListener("click", () => setMobileOpen(!mobileOpen));
}

function setCollapsed(value) {
  collapsed = Boolean(value);
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  persistState();
}

function setMobileOpen(value) {
  mobileOpen = Boolean(value);
  document.body.classList.toggle("mirna-mobile-nav-open", mobileOpen);
}

function setSettingsOpen(value) {
  document.body.classList.toggle("mirna-settings-open", Boolean(value));
  settingsSheet?.classList.toggle("is-open", Boolean(value));
}

function scrollToTarget(id) {
  const target = document.getElementById(id);
  if (!target) return;
  setMobileOpen(false);
  setSettingsOpen(false);
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

function bindEvents() {
  sidebar.querySelector(".mirna-sidebar-collapse")?.addEventListener("click", () => setCollapsed(!collapsed));
  sidebar.querySelector("#mirna-open-settings")?.addEventListener("click", () => setSettingsOpen(true));
  sidebar.addEventListener("click", (event) => {
    const link = event.target.closest("[data-nav-target]");
    if (!link) return;
    event.preventDefault();
    scrollToTarget(link.dataset.navTarget);
  });
  settingsSheet.querySelector(".mirna-settings-close")?.addEventListener("click", () => setSettingsOpen(false));
  settingsSheet.addEventListener("click", (event) => {
    const target = event.target.closest("[data-settings-target]");
    if (target) scrollToTarget(target.dataset.settingsTarget);
  });
  settingsSheet.querySelector("#mirna-refresh-calendar")?.addEventListener("click", async () => {
    const button = settingsSheet.querySelector("#mirna-refresh-calendar");
    button.setAttribute("disabled", "");
    await window.__mirnaCalendarV6?.syncNow?.();
    button.removeAttribute("disabled");
    setSettingsOpen(false);
    scrollToTarget("hub-calendar-card");
  });
  settingsSheet.querySelector("#mirna-toggle-theme")?.addEventListener("click", () => document.querySelector("#theme-toggle")?.click());
  overlay.addEventListener("click", () => { setMobileOpen(false); setSettingsOpen(false); });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setMobileOpen(false); setSettingsOpen(false); }
  });
}

function installScrollSpy() {
  observer?.disconnect();
  const links = [...sidebar.querySelectorAll("[data-nav-target]")];
  const targets = links.map((link) => document.getElementById(link.dataset.navTarget)).filter(Boolean);
  observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.navTarget === visible.target.id));
  }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.01, 0.2, 0.5] });
  targets.forEach((target) => observer.observe(target));
}

function rebuildNavigation() {
  ensureSectionIds();
  const scroll = sidebar?.querySelector(".mirna-sidebar-scroll");
  if (!scroll) return;
  const current = scroll.innerHTML;
  const next = navMarkup();
  if (current !== next) scroll.innerHTML = next;
  installScrollSpy();
}

async function refreshSystemStatus() {
  const text = sidebar?.querySelector("#mirna-sidebar-status-text");
  if (!text) return;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = response.ok ? await response.json() : null;
    text.textContent = health?.database && health?.files ? "Neon + Blob online" : navigator.onLine ? "Modo local ativo" : "Offline";
  } catch {
    text.textContent = navigator.onLine ? "Painel online" : "Offline";
  }
}

async function waitForModules() {
  const startedAt = Date.now();
  while ((!document.querySelector("#workspace-root") || !document.querySelector("#mirna-data-hub")) && Date.now() - startedAt < 18000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function init() {
  installStyles();
  await waitForModules();
  ensureSectionIds();
  collapsed = Boolean(savedState().collapsed);
  buildSidebar();
  buildSettingsSheet();
  addMobileButton();
  document.body.classList.add("mirna-sidebar-ready");
  setCollapsed(collapsed);
  bindEvents();
  rebuildNavigation();
  refreshSystemStatus();

  mutationObserver = new MutationObserver(() => rebuildNavigation());
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("online", refreshSystemStatus);
  window.addEventListener("offline", refreshSystemStatus);
  window.__mirnaSidebarV6 = { open: () => setMobileOpen(true), settings: () => setSettingsOpen(true), go: scrollToTarget };
}

init().catch(() => {});
window.addEventListener("beforeunload", () => {
  observer?.disconnect();
  mutationObserver?.disconnect();
});