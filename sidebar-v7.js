const SIDEBAR_KEY = "painel-da-mirna:sidebar-v7";
const NAV_ITEMS = [
  ["Hoje", "top", "⌂", "Início"],
  ["Hoje", "mirna-auto-sync", "✦", "Meu dia"],
  ["Planejamento", "planejador", "▦", "Calendário"],
  ["Planejamento", "kanban", "▤", "Kanban"],
  ["Organização", "entrada", "+", "Entrada"],
  ["Organização", "hub-notes-card", "✎", "Notas"],
  ["Organização", "hub-files-card", "▣", "Arquivos"],
  ["Conexões", "hub-calendar-card", "◫", "Agenda Google"],
  ["Conexões", "spotify", "♫", "Spotify"],
  ["Vida da Mirna", "acesso-rapido", "◇", "Áreas"],
  ["Vida da Mirna", "revisoes", "✓", "Revisões"],
  ["Vida da Mirna", "visao", "◎", "Visão"],
  ["Sistema", "backup", "⇩", "Backup"]
];

let sidebar;
let settingsPanel;
let overlay;
let activeObserver;
let refreshTimer;
let collapsed = false;
let mobileOpen = false;

function safeJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureSectionIds() {
  const review = document.querySelector(".review-grid");
  if (review && !review.id) review.id = "revisoes";
  const vision = document.querySelector("#vision-title")?.closest("section");
  if (vision && !vision.id) vision.id = "visao";
  const backup = document.querySelector(".utility-panel");
  if (backup && !backup.id) backup.id = "backup";
  document.querySelectorAll("section[id],article[id],header[id]").forEach((element) => {
    element.style.scrollMarginTop = "92px";
  });
}

function installStyles() {
  if (document.querySelector("#mirna-sidebar-v7-style")) return;
  const style = document.createElement("style");
  style.id = "mirna-sidebar-v7-style";
  style.textContent = `
    :root{--mirna-sidebar-width:270px;--mirna-sidebar-mini:82px}
    body.mirna-sidebar-ready{padding-left:var(--mirna-sidebar-width)!important;transition:padding-left .3s cubic-bezier(.2,.8,.2,1)}
    body.mirna-sidebar-ready.mirna-sidebar-collapsed{padding-left:var(--mirna-sidebar-mini)!important}
    body.mirna-sidebar-ready .site-header{left:var(--mirna-sidebar-width)!important;width:calc(100% - var(--mirna-sidebar-width))!important;transition:left .3s,width .3s}
    body.mirna-sidebar-ready.mirna-sidebar-collapsed .site-header{left:var(--mirna-sidebar-mini)!important;width:calc(100% - var(--mirna-sidebar-mini))!important}
    .mirna-sidebar-v7{position:fixed;inset:0 auto 0 0;z-index:1700;width:var(--mirna-sidebar-width);display:flex;flex-direction:column;color:var(--text,#30282d);background:color-mix(in srgb,var(--surface,#fffdfb) 94%,#eadce2 6%);border-right:1px solid var(--line,rgba(70,50,60,.13));box-shadow:16px 0 55px rgba(64,41,52,.1);backdrop-filter:blur(22px);transition:width .3s cubic-bezier(.2,.8,.2,1),transform .3s cubic-bezier(.2,.8,.2,1)}
    .mirna-sidebar-collapsed .mirna-sidebar-v7{width:var(--mirna-sidebar-mini)}
    .ms7-head{display:flex;align-items:center;gap:11px;min-height:76px;padding:17px 14px;border-bottom:1px solid var(--line,rgba(70,50,60,.1))}.ms7-logo{display:grid;place-items:center;flex:0 0 43px;height:43px;border-radius:15px;background:linear-gradient(145deg,#f7e8ee,#ead5dd);box-shadow:0 10px 26px rgba(143,95,114,.18);font-size:1.3rem}.ms7-brand{display:grid;min-width:0}.ms7-brand strong{font-size:.94rem;white-space:nowrap}.ms7-brand small{color:var(--muted,#756a70);font-size:.7rem;white-space:nowrap}.mirna-sidebar-collapsed .ms7-brand{width:0;opacity:0;overflow:hidden}.ms7-collapse{margin-left:auto;width:34px;height:34px;border:0;border-radius:11px;background:transparent;color:inherit;font-size:1.15rem;cursor:pointer}.mirna-sidebar-collapsed .ms7-collapse{transform:rotate(180deg)}
    .ms7-scroll{flex:1;overflow:auto;padding:10px 10px 16px;scrollbar-width:thin}.ms7-group{display:grid;gap:4px;margin:8px 0 15px}.ms7-group-title{padding:0 11px 5px;color:var(--muted,#756a70);font-size:.63rem;font-weight:850;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.mirna-sidebar-collapsed .ms7-group-title{height:4px;padding:0;opacity:0;overflow:hidden}.ms7-link{position:relative;display:flex;align-items:center;gap:11px;min-height:43px;padding:7px 11px;border-radius:14px;color:inherit;text-decoration:none;font-size:.84rem;font-weight:760;transition:background .18s,transform .18s,box-shadow .18s;overflow:hidden}.ms7-link:hover{background:rgba(143,95,114,.09);transform:translateX(2px)}.ms7-link.is-active{background:linear-gradient(100deg,rgba(143,95,114,.17),rgba(143,95,114,.05));box-shadow:0 9px 24px rgba(143,95,114,.11)}.ms7-link.is-active:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:999px;background:var(--accent,#8f5f72)}.ms7-icon{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:10px;background:rgba(143,95,114,.08);font-size:.98rem}.ms7-label{white-space:nowrap}.mirna-sidebar-collapsed .ms7-label{width:0;opacity:0;overflow:hidden}.mirna-sidebar-collapsed .ms7-link{justify-content:center;padding-inline:7px}
    .ms7-foot{display:grid;gap:7px;padding:11px;border-top:1px solid var(--line,rgba(70,50,60,.1))}.ms7-action{display:flex;align-items:center;gap:11px;min-height:43px;border:0;border-radius:14px;padding:7px 11px;background:transparent;color:inherit;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;text-align:left}.ms7-action:hover{background:rgba(143,95,114,.09)}.mirna-sidebar-collapsed .ms7-action{justify-content:center}.mirna-sidebar-collapsed .ms7-action .ms7-label{display:none}.ms7-status{display:flex;align-items:center;gap:8px;padding:3px 11px;color:var(--muted,#756a70);font-size:.68rem}.ms7-status i{width:8px;height:8px;border-radius:50%;background:#70a47b;box-shadow:0 0 0 4px rgba(112,164,123,.13)}.mirna-sidebar-collapsed .ms7-status span{display:none}
    .ms7-mobile{display:none;position:fixed;z-index:1805;left:14px;top:14px;width:44px;height:44px;border:1px solid var(--line,rgba(70,50,60,.15));border-radius:14px;background:var(--surface,#fffdfb);color:inherit;box-shadow:0 10px 28px rgba(48,31,39,.15);font-size:1.15rem;cursor:pointer}.ms7-overlay{position:fixed;inset:0;z-index:1690;background:rgba(34,24,29,.42);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .25s}.ms7-settings{position:fixed;z-index:1900;inset:16px 16px 16px auto;width:min(430px,calc(100vw - 32px));border:1px solid var(--line,rgba(70,50,60,.14));border-radius:26px;background:var(--surface,#fffdfb);box-shadow:0 28px 84px rgba(48,31,39,.24);transform:translateX(calc(100% + 40px));opacity:0;transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .2s;overflow:auto}.ms7-settings.is-open{transform:none;opacity:1}.ms7-settings-head{position:sticky;top:0;display:flex;justify-content:space-between;gap:12px;padding:20px;background:color-mix(in srgb,var(--surface,#fffdfb) 94%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--line,rgba(70,50,60,.1));z-index:2}.ms7-settings-head h2{margin:3px 0 0;font:700 1.55rem/1.05 Georgia,serif}.ms7-close{width:38px;height:38px;border:0;border-radius:12px;background:rgba(143,95,114,.09);cursor:pointer;font-size:1.25rem}.ms7-settings-body{display:grid;gap:10px;padding:18px}.ms7-setting{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;border:1px solid var(--line,rgba(70,50,60,.1));border-radius:17px;padding:13px;background:rgba(143,95,114,.045);color:inherit;cursor:pointer;text-align:left}.ms7-setting strong,.ms7-setting small{display:block}.ms7-setting small{margin-top:3px;color:var(--muted,#756a70)}body.ms7-mobile-open .ms7-overlay,body.ms7-settings-open .ms7-overlay{opacity:1;pointer-events:auto}
    @media(max-width:820px){body.mirna-sidebar-ready,body.mirna-sidebar-ready.mirna-sidebar-collapsed{padding-left:0!important}body.mirna-sidebar-ready .site-header,body.mirna-sidebar-ready.mirna-sidebar-collapsed .site-header{left:0!important;width:100%!important}.mirna-sidebar-v7,.mirna-sidebar-collapsed .mirna-sidebar-v7{width:min(310px,86vw);transform:translateX(-105%)}body.ms7-mobile-open .mirna-sidebar-v7{transform:none}.ms7-mobile{display:grid;place-items:center}.ms7-collapse{display:none}.mirna-sidebar-collapsed .ms7-brand,.mirna-sidebar-collapsed .ms7-label{width:auto;opacity:1}.mirna-sidebar-collapsed .ms7-group-title{height:auto;padding:0 11px 5px;opacity:1}.mirna-sidebar-collapsed .ms7-link,.mirna-sidebar-collapsed .ms7-action{justify-content:flex-start;padding-inline:11px}.mirna-sidebar-collapsed .ms7-status span{display:inline}.site-header .brand{margin-left:48px}}
    @media(max-width:520px){.ms7-settings{inset:9px;width:calc(100vw - 18px);border-radius:22px}}
    @media(prefers-reduced-motion:reduce){.mirna-sidebar-v7,.ms7-settings,.ms7-overlay,body.mirna-sidebar-ready{transition:none}.ms7-link:hover{transform:none}}
  `;
  document.head.append(style);
}

function navMarkup() {
  const groups = new Map();
  for (const item of NAV_ITEMS) {
    const [group] = item;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups].map(([group, items]) => `
    <nav class="ms7-group" aria-label="${group}">
      <div class="ms7-group-title">${group}</div>
      ${items.map(([, id, icon, label]) => `<a class="ms7-link" href="#${id}" data-ms7-target="${id}" title="${label}"><span class="ms7-icon" aria-hidden="true">${icon}</span><span class="ms7-label">${label}</span></a>`).join("")}
    </nav>`).join("");
}

function buildUi() {
  document.querySelectorAll(".mirna-sidebar-v7,.ms7-mobile,.ms7-overlay,.ms7-settings").forEach((element) => element.remove());
  sidebar = document.createElement("aside");
  sidebar.className = "mirna-sidebar-v7";
  sidebar.setAttribute("aria-label", "Navegação principal do Painel da Mirna");
  sidebar.innerHTML = `<div class="ms7-head"><div class="ms7-logo" aria-hidden="true">🌷</div><div class="ms7-brand"><strong>Painel da Mirna</strong><small>Vida centralizada</small></div><button class="ms7-collapse" type="button" aria-label="Recolher menu">‹</button></div><div class="ms7-scroll">${navMarkup()}</div><div class="ms7-foot"><button class="ms7-action" id="ms7-open-settings" type="button"><span class="ms7-icon" aria-hidden="true">⚙</span><span class="ms7-label">Configurações</span></button><div class="ms7-status"><i></i><span id="ms7-status-text">Sistema online</span></div></div>`;
  document.body.prepend(sidebar);

  const mobileButton = document.createElement("button");
  mobileButton.className = "ms7-mobile";
  mobileButton.type = "button";
  mobileButton.setAttribute("aria-label", "Abrir menu lateral");
  mobileButton.textContent = "☰";
  document.body.append(mobileButton);

  overlay = document.createElement("div");
  overlay.className = "ms7-overlay";
  document.body.append(overlay);

  settingsPanel = document.createElement("aside");
  settingsPanel.className = "ms7-settings";
  settingsPanel.setAttribute("aria-label", "Configurações rápidas");
  settingsPanel.innerHTML = `<div class="ms7-settings-head"><div><p class="eyebrow">Atalhos do sistema</p><h2>Configurações</h2></div><button class="ms7-close" type="button" aria-label="Fechar">×</button></div><div class="ms7-settings-body"><button class="ms7-setting" data-ms7-settings-target="hub-calendar-card" type="button"><span class="ms7-icon">◫</span><span><strong>Google Agenda</strong><small>Conectar, testar e atualizar agendas</small></span><span>›</span></button><button class="ms7-setting" data-ms7-settings-target="spotify" type="button"><span class="ms7-icon">♫</span><span><strong>Spotify</strong><small>Perfil e playlist do painel</small></span><span>›</span></button><button class="ms7-setting" data-ms7-settings-target="hub-files-card" type="button"><span class="ms7-icon">▣</span><span><strong>Banco e arquivos</strong><small>Neon, Blob e biblioteca</small></span><span>›</span></button><button class="ms7-setting" data-ms7-settings-target="hub-notes-card" type="button"><span class="ms7-icon">✎</span><span><strong>Notas</strong><small>Criar, editar e sincronizar</small></span><span>›</span></button><button class="ms7-setting" id="ms7-refresh-calendar" type="button"><span class="ms7-icon">↻</span><span><strong>Atualizar agenda agora</strong><small>Testar todas as conexões</small></span><span>›</span></button><button class="ms7-setting" id="ms7-theme" type="button"><span class="ms7-icon">☾</span><span><strong>Alternar tema</strong><small>Claro ou escuro</small></span><span>›</span></button></div>`;
  document.body.append(settingsPanel);
  return mobileButton;
}

function setCollapsed(value) {
  collapsed = Boolean(value);
  document.body.classList.toggle("mirna-sidebar-collapsed", collapsed);
  localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ collapsed }));
}

function setMobile(value) {
  mobileOpen = Boolean(value);
  document.body.classList.toggle("ms7-mobile-open", mobileOpen);
}

function setSettings(value) {
  const open = Boolean(value);
  document.body.classList.toggle("ms7-settings-open", open);
  settingsPanel?.classList.toggle("is-open", open);
}

async function findTarget(id) {
  const started = Date.now();
  while (!document.getElementById(id) && Date.now() - started < 10000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return document.getElementById(id);
}

async function goTo(id) {
  setMobile(false);
  setSettings(false);
  const target = await findTarget(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

function refreshScrollSpy() {
  activeObserver?.disconnect();
  const links = [...sidebar.querySelectorAll("[data-ms7-target]")];
  const targets = links.map((link) => document.getElementById(link.dataset.ms7Target)).filter(Boolean);
  activeObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.ms7Target === visible.target.id));
  }, { rootMargin: "-18% 0px -68% 0px", threshold: [0.02, 0.25, 0.6] });
  targets.forEach((target) => activeObserver.observe(target));
}

function bindEvents(mobileButton) {
  sidebar.querySelector(".ms7-collapse")?.addEventListener("click", () => setCollapsed(!collapsed));
  sidebar.querySelector("#ms7-open-settings")?.addEventListener("click", () => setSettings(true));
  sidebar.addEventListener("click", (event) => {
    const link = event.target.closest("[data-ms7-target]");
    if (!link) return;
    event.preventDefault();
    goTo(link.dataset.ms7Target);
  });
  mobileButton.addEventListener("click", () => setMobile(!mobileOpen));
  overlay.addEventListener("click", () => { setMobile(false); setSettings(false); });
  settingsPanel.querySelector(".ms7-close")?.addEventListener("click", () => setSettings(false));
  settingsPanel.addEventListener("click", (event) => {
    const card = event.target.closest("[data-ms7-settings-target]");
    if (card) goTo(card.dataset.ms7SettingsTarget);
  });
  settingsPanel.querySelector("#ms7-refresh-calendar")?.addEventListener("click", async () => {
    await window.__mirnaCalendarV6?.syncNow?.();
    setSettings(false);
    goTo("hub-calendar-card");
  });
  settingsPanel.querySelector("#ms7-theme")?.addEventListener("click", () => document.querySelector("#theme-toggle")?.click());
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setMobile(false); setSettings(false); }
  });
}

async function refreshStatus() {
  const label = sidebar?.querySelector("#ms7-status-text");
  if (!label) return;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = response.ok ? await response.json() : null;
    label.textContent = health?.database && health?.files ? "Neon + Blob online" : navigator.onLine ? "Modo local ativo" : "Offline";
  } catch {
    label.textContent = navigator.onLine ? "Painel online" : "Offline";
  }
}

function init() {
  if (document.querySelector(".mirna-sidebar-v7")) return;
  installStyles();
  ensureSectionIds();
  collapsed = Boolean(safeJson(localStorage.getItem(SIDEBAR_KEY), {}).collapsed);
  const mobileButton = buildUi();
  document.body.classList.add("mirna-sidebar-ready");
  setCollapsed(collapsed);
  bindEvents(mobileButton);
  refreshScrollSpy();
  refreshStatus();
  let attempts = 0;
  refreshTimer = window.setInterval(() => {
    ensureSectionIds();
    refreshScrollSpy();
    attempts += 1;
    if (attempts >= 15) window.clearInterval(refreshTimer);
  }, 1000);
  window.__mirnaSidebarV7 = { open: () => setMobile(true), settings: () => setSettings(true), go: goTo };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

window.addEventListener("beforeunload", () => {
  window.clearInterval(refreshTimer);
  activeObserver?.disconnect();
});