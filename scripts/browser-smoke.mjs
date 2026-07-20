import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROMIUM || "/usr/bin/chromium";
const debugPort = Number(process.env.DEBUG_PORT || 9444);
const profile = `/tmp/painel-mirna-next-chrome-${process.pid}`;
const outputDir = process.env.OUTPUT_DIR || path.join(root, ".artifacts");
const bundlePath = `/tmp/painel-mirna-browser-${process.pid}.js`;
await Promise.all([mkdir(profile, { recursive: true }), mkdir(outputDir, { recursive: true })]);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} terminou com ${code}: ${stderr || stdout}`));
    });
  });
}

await run(path.join(root, "node_modules", ".bin", "esbuild"), [
  path.join(root, "app.js"),
  "--bundle",
  "--format=iife",
  "--target=chrome110",
  `--outfile=${bundlePath}`,
  "--log-level=warning"
]);

const [sourceHtml, css, bundle] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "styles.css"), "utf8"),
  readFile(bundlePath, "utf8")
]);

const fetchStub = `
<script>
(() => {
  const stores = new Map();
  const storeMeta = new Map();
  const ensureStore = (name, keyPath = name === "kv" ? "key" : "id") => {
    if (!stores.has(name)) stores.set(name, new Map());
    if (!storeMeta.has(name)) storeMeta.set(name, { keyPath });
    return stores.get(name);
  };
  const makeRequest = (producer) => {
    const request = new EventTarget();
    request.result = undefined;
    request.error = null;
    setTimeout(() => {
      try {
        request.result = producer();
        request.dispatchEvent(new Event("success"));
      } catch (error) {
        request.error = error;
        request.dispatchEvent(new Event("error"));
      }
    }, 0);
    return request;
  };
  const makeStore = (name) => {
    const rows = ensureStore(name);
    const keyPath = storeMeta.get(name)?.keyPath || "id";
    return {
      createIndex() { return {}; },
      get(key) { return makeRequest(() => rows.get(key)); },
      getAll() { return makeRequest(() => [...rows.values()]); },
      put(value) { rows.set(value[keyPath], value); return makeRequest(() => value[keyPath]); },
      delete(key) { rows.delete(key); return makeRequest(() => undefined); },
      clear() { rows.clear(); return makeRequest(() => undefined); }
    };
  };
  const database = {
    objectStoreNames: { contains(name) { return stores.has(name); } },
    createObjectStore(name, options = {}) {
      ensureStore(name, options.keyPath || "id");
      return makeStore(name);
    },
    transaction(name) {
      const transaction = new EventTarget();
      transaction.error = null;
      transaction.objectStore = () => makeStore(name);
      setTimeout(() => transaction.dispatchEvent(new Event("complete")), 12);
      return transaction;
    },
    close() {}
  };
  const fakeIndexedDb = {
    open() {
      const request = new EventTarget();
      request.result = database;
      request.error = null;
      setTimeout(() => {
        request.dispatchEvent(new Event("upgradeneeded"));
        setTimeout(() => request.dispatchEvent(new Event("success")), 0);
      }, 0);
      return request;
    }
  };
  try {
    Object.defineProperty(window, "indexedDB", { value: fakeIndexedDb, configurable: true });
  } catch {
    window.indexedDB = fakeIndexedDb;
  }

  const publishedAt = new Date().toISOString();
  window.fetch = async (input, options = {}) => {
    const rawInput = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawInput, "http://127.0.0.1:4242/");
    if (url.pathname.endsWith("/api/health")) {
      return Response.json({ ok: true, reachable: true, mode: "preview", database: false, files: false, news: true, calendar: false, requiresToken: false });
    }
    if (url.hostname === "geocoding-api.open-meteo.com") {
      return Response.json({ results: [{ name: "Marechal Cândido Rondon", admin1: "Paraná", latitude: -24.557, longitude: -54.057 }] });
    }
    if (url.hostname === "api.open-meteo.com") {
      return Response.json({
        current: { temperature_2m: 22.4, apparent_temperature: 22.1, weather_code: 1 },
        daily: { weather_code: [1], temperature_2m_max: [26.2], temperature_2m_min: [15.8], precipitation_probability_max: [18] }
      });
    }
    if (url.pathname.endsWith("/api/news")) {
      const query = (url.searchParams.get("q") || "").toLowerCase();
      let item = { title: "Festival de ballet reúne novas companhias brasileiras", source: "Radar da Dança" };
      if (query.includes("rítmica") || query.includes("rhythmic")) item = { title: "Ginástica rítmica brasileira abre nova temporada de competições", source: "Esporte em Movimento" };
      if (query.includes("unioeste") || query.includes("direito")) item = { title: "UNIOESTE divulga calendário acadêmico e atividades de Direito", source: "Portal Universitário" };
      return Response.json({ ok: true, items: [{ ...item, link: "https://news.google.com/", publishedAt, description: item.title }], fetchedAt: publishedAt });
    }
    if (url.pathname.endsWith("/api/calendar")) return Response.json({ ok: false, message: "Agenda não configurada na prévia." }, { status: 503 });
    return new Response("Não disponível na prévia", { status: 404 });
  };
})();
</script>`;

let previewHtml = sourceHtml
  .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>\s*/i, "")
  .replace(/<link\s+rel="stylesheet"[^>]*>\s*/i, "")
  .replace(/<script\s+type="module"\s+src="\.\/app\.js"><\/script>\s*/i, "")
  .replace("</head>", `<style>${css.replace(/<\/style/gi, "<\\/style")}</style></head>`)
  .replace("</body>", `${fetchStub}<script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body>`);

const browser = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,1100",
  "--allow-file-access-from-files",
  `file://${path.join(root, "index.html")}`
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chromium ainda está iniciando.
    }
    await sleep(100);
  }
  throw new Error("O Chromium não abriu a página de teste.");
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || "Exceção sem descrição");
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || "erro").join(" "));
  }
});

function command(method, params = {}) {
  const id = ++sequence;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Falha ao avaliar script no navegador.");
  }
  return result.result?.value;
}

async function waitFor(predicate, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`Boolean(${predicate})`)) return;
    await sleep(160);
  }
  throw new Error(`Tempo excedido aguardando ${label}.`);
}

async function injectPreview() {
  const frameTree = await command("Page.getFrameTree");
  await command("Page.setDocumentContent", { frameId: frameTree.frameTree.frame.id, html: previewHtml });
  await waitFor('document.readyState === "complete" && document.querySelector("#connection-status")?.textContent !== "Preparando…" && document.querySelectorAll("#folder-grid .folder-card").length >= 9 && document.querySelectorAll("#daily-checklist .check-item").length >= 5', "inicialização do painel", 25000);
}

async function screenshot(filename, width, height) {
  const result = await command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width, height, scale: 1 }
  });
  await writeFile(`${outputDir}/${filename}`, Buffer.from(result.data, "base64"));
}

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Console.enable");
  await injectPreview();

  const initial = await evaluate(`({
    title: document.title,
    origin: location.origin,
    connection: document.querySelector("#connection-status")?.textContent,
    hasAgenda: Boolean(document.querySelector("#agenda")),
    hasUpload: Boolean(document.querySelector("#upload-form")),
    hasNews: Boolean(document.querySelector("#noticias")),
    hasDigest: Boolean(document.querySelector("#speak-digest"))
  })`);
  console.log("Estado inicial da prévia:", initial);
  if (!initial.title.includes("Painel da Mirna") || !initial.hasAgenda || !initial.hasUpload || !initial.hasNews || !initial.hasDigest || initial.connection === "Falha ao iniciar") {
    throw new Error(`Estrutura principal incompleta: ${JSON.stringify(initial)}`);
  }

  const marker = String(Date.now()).slice(-7);
  const captureText = `Preparar repertório de Ballet ${marker}`;
  const eventText = `Ensaio pessoal de Ballet ${marker}`;
  const fileName = `planejamento-ballet-${marker}.txt`;

  await evaluate(`(() => {
    const input = document.querySelector("#capture-input");
    input.value = ${JSON.stringify(captureText)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#capture-form button[type=submit]").click();
  })()`);
  await waitFor(`document.querySelector("#inbox-list")?.textContent.includes(${JSON.stringify(captureText)})`, "salvamento da Entrada");

  await evaluate(`(() => {
    document.querySelector("#event-open").click();
    document.querySelector("#event-title").value = ${JSON.stringify(eventText)};
    document.querySelector("#event-date").value = "2026-07-22";
    document.querySelector("#event-start").value = "17:30";
    document.querySelector("#event-end").value = "18:30";
    document.querySelector("#event-location").value = "Casa";
    document.querySelector("#event-open-google").checked = false;
    document.querySelector("#event-save").click();
  })()`);
  await waitFor(`document.querySelector("#agenda-timeline")?.textContent.includes(${JSON.stringify(eventText)})`, "salvamento do evento");

  await evaluate(`(() => {
    const file = new File(["Planejamento de aula e repertório"], ${JSON.stringify(fileName)}, { type: "text/plain", lastModified: Date.now() });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.querySelector("#file-input");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#file-destination").value = "01";
    document.querySelector("#upload-form").requestSubmit();
  })()`);
  await waitFor(`document.querySelector("#file-list")?.textContent.includes(${JSON.stringify(fileName)})`, "salvamento do arquivo", 20000);

  await evaluate('document.querySelector("#settings-open").click()');
  await waitFor('document.querySelector("#settings-dialog")?.open === true', "abertura das configurações");
  await evaluate('document.querySelector("#settings-dialog").close()');

  await evaluate('window.scrollTo(0, 0); document.querySelector("#toast")?.classList.remove("visible")');
  await sleep(350);
  await screenshot("painel-da-mirna-v2-desktop.png", 1440, 1100);
  await sleep(700);

  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await sleep(900);
  await screenshot("painel-da-mirna-v2-mobile.png", 390, 844);

  const persisted = await evaluate(`({
    capture: document.querySelector("#inbox-list")?.textContent.includes(${JSON.stringify(captureText)}),
    file: document.querySelector("#file-list")?.textContent.includes(${JSON.stringify(fileName)}),
    event: document.querySelector("#agenda-timeline")?.textContent.includes(${JSON.stringify(eventText)}),
    viewport: [innerWidth, innerHeight],
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    measuredOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`);
  const clipsHorizontalOverflow = [persisted.htmlOverflowX, persisted.bodyOverflowX]
    .some((value) => value === "hidden" || value === "clip");
  if (!persisted.capture || !persisted.file || !persisted.event || !clipsHorizontalOverflow) {
    throw new Error(`Persistência ou política de responsividade falhou: ${JSON.stringify(persisted)}`);
  }

  const fatalErrors = consoleErrors.filter((message) => !/service worker|favicon/i.test(message));
  if (fatalErrors.length) throw new Error(`Erros de console: ${fatalErrors.join(" | ")}`);
  console.log(`✓ página e módulos carregados (${initial.connection}; origem ${initial.origin})`);
  console.log("✓ Entrada, evento e arquivo foram salvos no banco da interface");
  console.log("✓ configurações abrem e layout móvel não cria rolagem horizontal");
  console.log("✓ screenshots desktop e mobile geradas");
} finally {
  try { ws.close(); } catch {}
  browser.kill("SIGTERM");
  await sleep(300);
  await Promise.all([
    rm(profile, { recursive: true, force: true }),
    rm(bundlePath, { force: true })
  ]);
}
