const ATELIER_LINKS = [
  { pane: "today", icon: "🌷", label: "Meu dia" },
  { pane: "teacher", icon: "🩰", label: "Professora" },
  { pane: "students", icon: "👧", label: "Alunas" },
  { pane: "productions", icon: "🎭", label: "Produções" },
  { pane: "school", icon: "🏛", label: "Minha escola" },
  { pane: "mentor", icon: "✦", label: "Mentora" }
];

let observer;
let attempts = 0;

function linkMarkup(item) {
  return `<a class="ms7-link" href="#pane-${item.pane}" data-ms7-target="atelie" data-atelier-pane="${item.pane}" title="${item.label}"><span class="ms7-icon" aria-hidden="true">${item.icon}</span><span class="ms7-label">${item.label}</span></a>`;
}

function installAtelierGroup() {
  const sidebar = document.querySelector(".mirna-sidebar-v7");
  const scroll = sidebar?.querySelector(".ms7-scroll");
  if (!sidebar || !scroll || document.querySelector("#ms7-atelier-group")) return false;

  const group = document.createElement("nav");
  group.id = "ms7-atelier-group";
  group.className = "ms7-group";
  group.setAttribute("aria-label", "Ateliê da Mirna");
  group.innerHTML = `<div class="ms7-group-title">Ateliê</div>${ATELIER_LINKS.map(linkMarkup).join("")}`;

  const firstGroup = scroll.querySelector(".ms7-group");
  if (firstGroup) firstGroup.insertAdjacentElement("afterend", group);
  else scroll.prepend(group);

  const brand = sidebar.querySelector(".ms7-brand strong");
  const subtitle = sidebar.querySelector(".ms7-brand small");
  if (brand) brand.textContent = "Ateliê da Mirna";
  if (subtitle) subtitle.textContent = "Vida, aulas e sonho";
  sidebar.setAttribute("aria-label", "Navegação principal do Ateliê da Mirna");
  return true;
}

function installSettingsCards() {
  const body = document.querySelector(".ms7-settings-body");
  if (!body || body.querySelector("[data-atelier-settings-pane]")) return false;

  const fragment = document.createDocumentFragment();
  const cards = [
    { pane: "teacher", icon: "🩰", title: "Professora", detail: "Aulas, métodos e planejamento" },
    { pane: "students", icon: "👧", title: "Alunas", detail: "Presença e acompanhamento" },
    { pane: "school", icon: "🏛", title: "Minha escola", detail: "Roadmap, orçamento e identidade" }
  ];

  cards.forEach((card) => {
    const button = document.createElement("button");
    button.className = "ms7-setting";
    button.type = "button";
    button.dataset.atelierSettingsPane = card.pane;
    button.innerHTML = `<span class="ms7-icon">${card.icon}</span><span><strong>${card.title}</strong><small>${card.detail}</small></span><span>›</span>`;
    fragment.append(button);
  });
  body.prepend(fragment);
  return true;
}

function openPane(pane) {
  document.body.classList.remove("ms7-mobile-open", "ms7-settings-open");
  document.querySelector(".ms7-settings")?.classList.remove("is-open");
  window.__mirnaAtelier?.open?.(pane);
  document.querySelector("#atelie")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-atelier-pane]");
    const settings = event.target.closest("[data-atelier-settings-pane]");
    const pane = link?.dataset.atelierPane || settings?.dataset.atelierSettingsPane;
    if (!pane) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPane(pane);
  }, true);
}

function updateActiveLink() {
  const activePane = document.querySelector(".atelier-pane.active")?.id?.replace("pane-", "");
  document.querySelectorAll("[data-atelier-pane]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.atelierPane === activePane);
  });
}

function installObserver() {
  const root = document.querySelector("#atelie");
  if (!root || observer) return;
  observer = new MutationObserver(updateActiveLink);
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
  updateActiveLink();
}

function hydrate() {
  const sidebarReady = installAtelierGroup();
  const settingsReady = installSettingsCards();
  installObserver();
  attempts += 1;
  if ((sidebarReady || document.querySelector("#ms7-atelier-group")) && (settingsReady || document.querySelector("[data-atelier-settings-pane]")) && document.querySelector("#atelie")) {
    window.clearInterval(window.__mirnaAtelierNavTimer);
  }
  if (attempts > 80) window.clearInterval(window.__mirnaAtelierNavTimer);
}

function init() {
  bindEvents();
  hydrate();
  window.__mirnaAtelierNavTimer = window.setInterval(hydrate, 250);
  window.__mirnaAtelierNav = { open: openPane, refresh: hydrate };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

window.addEventListener("beforeunload", () => {
  window.clearInterval(window.__mirnaAtelierNavTimer);
  observer?.disconnect();
});
