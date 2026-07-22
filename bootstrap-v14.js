const RELEASE = "14.0";
const RELEASE_KEY = `painel-da-mirna:release:${RELEASE}`;
const report = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setHeaderStatus(text, isError = false) {
  const element = document.querySelector("#connection-status");
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("offline", isError);
}

function record(name, state, detail = "") {
  const row = { name, state, detail, at: new Date().toISOString() };
  report.push(row);
  window.dispatchEvent(new CustomEvent("mirna:module-status", { detail: row }));
}

async function waitFor(test, timeout = 4500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (test()) return true;
    } catch {
      // O módulo ainda está montando a interface.
    }
    await delay(60);
  }
  return false;
}

async function load(name, path, test, timeout = 4500) {
  record(name, "loading");
  try {
    await import(`${path}?release=${RELEASE}`);
    if (test && !(await waitFor(test, timeout))) {
      throw new Error("o módulo carregou, mas não terminou de montar a interface");
    }
    record(name, "ready");
    return true;
  } catch (error) {
    record(name, "error", String(error?.message || error));
    return false;
  }
}

async function refreshOfflineLayer() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return false;
  try {
    const alreadyRefreshed = sessionStorage.getItem(RELEASE_KEY) === "done";
    if (!alreadyRefreshed) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      await navigator.serviceWorker.register(`/sw-v14.js?release=${RELEASE}`, { scope: "/" });
      sessionStorage.setItem(RELEASE_KEY, "done");
      const url = new URL(location.href);
      url.searchParams.set("release", RELEASE);
      location.replace(url.toString());
      return true;
    }
    await navigator.serviceWorker.register(`/sw-v14.js?release=${RELEASE}`, { scope: "/" });
  } catch (error) {
    record("Cache offline", "warning", String(error?.message || error));
  }
  return false;
}

async function loadVisibleExperience() {
  setHeaderStatus("Abrindo Ateliê…");

  const [atelierReady, sidebarReady] = await Promise.all([
    load("Ateliê", "/atelier.js", () => window.__mirnaAtelier && document.querySelector("#atelie")),
    load("Navbar", "/sidebar-v7.js", () => document.querySelector(".mirna-sidebar-v7"))
  ]);

  if (!atelierReady) {
    setHeaderStatus("Ateliê precisa de atenção", true);
    return false;
  }

  await load("Migração da professora", "/teacher-migration-v1.js", () => window.__mirnaTeacherMigration, 3000);
  const teacherReady = await load(
    "Fluxo da professora",
    "/teacher-workflow-v1.js",
    () => window.__mirnaTeacher && document.querySelector("#teacher-workflow"),
    5000
  );

  if (teacherReady) {
    await load(
      "Rotinas recorrentes",
      "/teacher-recurring-v1.js",
      () => window.__mirnaTeacherRecurring && document.querySelector("#teacher-recurring"),
      5000
    );
  }

  if (sidebarReady) {
    await load("Navegação do Ateliê", "/atelier-nav.js", () => window.__mirnaAtelierNav, 3500);
  }

  setHeaderStatus(teacherReady ? "Ateliê v14 pronto" : "Ateliê parcial", !teacherReady);
  return teacherReady;
}

async function loadBackgroundModules() {
  const workspaceReady = await load(
    "Planejador",
    "/workspace.js",
    () => window.__mirnaWorkspace && document.querySelector("#workspace-root"),
    7000
  );

  let dataHubReady = false;
  if (workspaceReady) {
    dataHubReady = await load(
      "Central de dados",
      "/data-hub.js",
      () => window.__mirnaDataHub && document.querySelector("#mirna-data-hub"),
      7000
    );
  }

  if (dataHubReady) {
    await load("Proteção da agenda", "/calendar-guard-v1.js", () => window.__mirnaCalendarGuard, 3000);
    await load("Agenda", "/calendar-v6.js", () => window.__mirnaCalendarV6, 7000);
  }

  await load("Runtime", "/runtime-v5.js", () => window.__mirnaRuntimeV5, 4000);
  if (dataHubReady) {
    await load(
      "Diagnóstico",
      "/diagnostics-v1.js",
      () => window.__mirnaDiagnostics && document.querySelector("#system-diagnostics"),
      6000
    );
  }
}

async function boot() {
  window.__mirnaBoot = {
    release: RELEASE,
    report: () => structuredClone(report),
    retry: () => location.reload()
  };

  if (await refreshOfflineLayer()) return;

  const visibleReady = await loadVisibleExperience();
  window.dispatchEvent(new CustomEvent("mirna:visible-ready", { detail: { release: RELEASE, visibleReady } }));

  loadBackgroundModules()
    .catch((error) => record("Módulos de fundo", "error", String(error?.message || error)))
    .finally(() => window.dispatchEvent(new CustomEvent("mirna:boot-complete", { detail: { release: RELEASE, report } })));
}

boot().catch((error) => {
  record("Inicialização", "error", String(error?.message || error));
  setHeaderStatus("Modo local", true);
});
