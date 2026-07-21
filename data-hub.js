import {
  putLocalFile,
  listLocalFiles,
  getLocalFile,
  deleteLocalFile
} from "./db.js";
import { resolveSpotifyContent } from "./spotify.js";

const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const CALENDAR_KEY = "painel-da-mirna:calendar-connections:v1";
const TOKEN_KEY = "painel-da-mirna:cloud-token:v1";
const DEFAULT_PLAYLIST = "https://open.spotify.com/playlist/1DgRQ20bvrC01pUtSR4yzC";
const PROFILE_URL = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const CHANNEL_NAME = "painel-da-mirna-workspace";
const DESTINATIONS = [
  ["00", "🌷 Painel & Entrada"],
  ["01", "🩰 Ballet, GR & Aulas"],
  ["02", "🎓 Faculdade"],
  ["03", "💼 Trabalho & Financeiro"],
  ["04", "🔐 Documentos Pessoais"],
  ["05", "🏡 Casinha compartilhada"],
  ["06", "✈️ Viagens & Festivais"],
  ["07", "💛 Família & Memórias"],
  ["08", "📚 Livros, Cursos & Referências"],
  ["99", "🗄️ Arquivo Histórico"]
];

const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
let hub;
let selectedFile = null;
let remoteFiles = [];
let localFiles = [];
let notes = [];
let calendarConnections = [];

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function uid(prefix) {
  return `${prefix}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function workspaceState() {
  return safeJson(localStorage.getItem(WORKSPACE_KEY), {}) || {};
}

function publishWorkspace(next) {
  next.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  channel?.postMessage(next);
}

function findTokenInObject(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6 || value == null || typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /^(cloudToken|painel_api_token|apiToken)$/i.test(key) && child.trim()) return child.trim();
    if (child && typeof child === "object") {
      const nested = findTokenInObject(child, depth + 1, seen);
      if (nested) return nested;
    }
  }
  return "";
}

function cloudToken() {
  const direct = localStorage.getItem(TOKEN_KEY)?.trim();
  if (direct) return direct;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !/(painel|mirna|token|cloud)/i.test(key)) continue;
    const token = findTokenInObject(safeJson(localStorage.getItem(key)));
    if (token) return token;
  }
  return "";
}

function authHeaders(extra = {}) {
  const token = cloudToken();
  return token ? { ...extra, "x-painel-token": token } : extra;
}

function ensureStyles() {
  if (document.querySelector("#mirna-data-hub-styles")) return;
  const style = document.createElement("style");
  style.id = "mirna-data-hub-styles";
  style.textContent = `
    .mirna-data-hub{max-width:1180px;margin:46px auto 72px;animation:hubIn .55s cubic-bezier(.2,.8,.2,1) both}
    .hub-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:20px}.hub-heading h2{margin:3px 0 7px;font:700 clamp(2rem,4vw,3.4rem)/1.03 Georgia,"Times New Roman",serif}.hub-heading p{margin:0;color:var(--muted,#756a70)}
    .hub-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.hub-card{border:1px solid var(--line,rgba(72,54,63,.12));border-radius:26px;background:var(--surface,#fffdfb);box-shadow:var(--shadow-soft,0 16px 42px rgba(73,49,61,.07));overflow:hidden}.hub-card-wide{grid-column:1/-1}.hub-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 22px 17px;border-bottom:1px solid var(--line,rgba(72,54,63,.1))}.hub-card-head h3{margin:2px 0 5px;font-size:1.25rem}.hub-card-head p{margin:0;color:var(--muted,#756a70);font-size:.9rem}.hub-badge{border-radius:999px;padding:7px 10px;background:color-mix(in srgb,var(--accent,#8f5f72) 10%,transparent);font-size:.72rem;font-weight:800;white-space:nowrap}.hub-body{padding:20px 22px}.hub-form{display:grid;gap:12px}.hub-form-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.hub-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hub-form label{display:grid;gap:6px;color:var(--muted,#756a70);font-size:.78rem;font-weight:700}.hub-form input,.hub-form select,.hub-form textarea{width:100%;border:1px solid var(--line,rgba(72,54,63,.14));border-radius:14px;padding:12px 13px;background:var(--bg-soft,#fffaf7);color:var(--text,#332b30);font:inherit}.hub-form textarea{resize:vertical}.hub-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.hub-mini{border:1px solid var(--line,rgba(72,54,63,.12));background:transparent;color:inherit;border-radius:10px;padding:7px 9px;cursor:pointer}.hub-mini:hover{background:color-mix(in srgb,var(--accent,#8f5f72) 9%,transparent)}
    .hub-secret-list,.hub-file-list,.hub-note-list{display:grid;gap:10px;margin-top:15px}.hub-secret-item,.hub-file-item,.hub-note-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line,rgba(72,54,63,.1));border-radius:16px;padding:13px;background:color-mix(in srgb,var(--surface,#fffdfb) 94%,var(--accent,#8f5f72) 6%)}.hub-secret-item strong,.hub-file-item strong,.hub-note-item strong{display:block}.hub-secret-item small,.hub-file-item small,.hub-note-item small{display:block;color:var(--muted,#756a70);margin-top:3px}.hub-status{margin-top:12px;color:var(--muted,#756a70);font-size:.82rem}.hub-status.is-ok{color:#4f7d5b}.hub-status.is-error{color:#a33f52}.hub-empty{padding:18px;text-align:center;border:1px dashed var(--line,rgba(72,54,63,.16));border-radius:16px;color:var(--muted,#756a70)}
    .hub-drop{display:grid;place-items:center;min-height:132px;border:1.5px dashed color-mix(in srgb,var(--accent,#8f5f72) 38%,transparent);border-radius:18px;background:color-mix(in srgb,var(--accent,#8f5f72) 6%,transparent);cursor:pointer;text-align:center;padding:18px}.hub-drop.is-drag{transform:scale(1.01);background:color-mix(in srgb,var(--accent,#8f5f72) 12%,transparent)}.hub-drop strong{display:block;margin-bottom:4px}.hub-file-icon{font-size:1.4rem}.hub-note-body{white-space:pre-wrap;line-height:1.45;margin-top:7px;color:var(--muted,#756a70)}
    .hub-callout{border-left:3px solid var(--accent,#8f5f72);padding:10px 12px;background:color-mix(in srgb,var(--accent,#8f5f72) 6%,transparent);border-radius:0 12px 12px 0;color:var(--muted,#756a70);font-size:.82rem;margin-top:12px}.hub-cloud-token{margin-top:12px;padding-top:12px;border-top:1px solid var(--line,rgba(72,54,63,.1))}.hub-keep-link{color:inherit;font-weight:750}.hub-edit-fields{display:grid;gap:7px}.hub-edit-fields input,.hub-edit-fields select{border:1px solid var(--line,rgba(72,54,63,.14));border-radius:10px;padding:8px;background:var(--bg-soft,#fffaf7);color:inherit}.hub-spinner{display:inline-block;width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:hubSpin .7s linear infinite;vertical-align:-2px;margin-right:6px}
    @keyframes hubIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes hubSpin{to{transform:rotate(360deg)}}
    @media(max-width:820px){.hub-grid{grid-template-columns:1fr}.hub-card-wide{grid-column:auto}.hub-heading{align-items:flex-start;flex-direction:column}.hub-form-grid,.hub-form-row{grid-template-columns:1fr}.hub-secret-item,.hub-file-item,.hub-note-item{grid-template-columns:1fr}.hub-actions .button{flex:1}}
  `;
  document.head.append(style);
}

function buildHub() {
  if (document.querySelector("#mirna-data-hub")) return document.querySelector("#mirna-data-hub");
  const workspaceRoot = document.querySelector("#workspace-root");
  if (!workspaceRoot) return null;
  const section = document.createElement("section");
  section.id = "mirna-data-hub";
  section.className = "mirna-data-hub";
  section.innerHTML = `
    <div class="hub-heading">
      <div><p class="eyebrow">Dados conectados</p><h2>Agenda, arquivos e notas no mesmo lugar</h2><p>As integrações ficam automáticas depois da primeira autorização.</p></div>
      <button class="button button-ghost" id="hub-refresh-all" type="button">↻ Atualizar tudo</button>
    </div>
    <div class="hub-grid">
      <article class="hub-card" id="hub-calendar-card">
        <header class="hub-card-head"><div><p class="mini-label">Google Agenda</p><h3>Agendas conectadas</h3><p>O endereço secreto fica somente neste navegador.</p></div><span class="hub-badge" id="hub-calendar-count">0</span></header>
        <div class="hub-body">
          <form class="hub-form" id="hub-calendar-form">
            <div class="hub-form-grid"><label>Nome da agenda<input id="hub-calendar-name" maxlength="50" value="Pessoal" /></label><label>Cor<input id="hub-calendar-color" type="color" value="#8f5f72" /></label></div>
            <label>Endereço secreto iCal<input id="hub-calendar-url" type="password" autocomplete="off" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" /></label>
            <div class="hub-actions"><button class="button button-primary" type="submit">Salvar e sincronizar</button><button class="button button-ghost" id="hub-calendar-toggle" type="button">Mostrar link</button></div>
          </form>
          <div class="hub-secret-list" id="hub-calendar-list"></div>
          <p class="hub-status" id="hub-calendar-status">Cole uma vez; depois a atualização ocorre automaticamente.</p>
          <div class="hub-callout">Como o link dá acesso de leitura à agenda, ele não é colocado no GitHub nem enviado a uma IA.</div>
        </div>
      </article>

      <article class="hub-card" id="hub-notes-card">
        <header class="hub-card-head"><div><p class="mini-label">Notas</p><h3>Notas atuais</h3><p>CRUD completo com sincronização pelo banco do painel.</p></div><span class="hub-badge" id="hub-note-count">0</span></header>
        <div class="hub-body">
          <form class="hub-form" id="hub-note-form">
            <input type="hidden" id="hub-note-id" />
            <label>Título<input id="hub-note-title" maxlength="140" required placeholder="Ex.: Ideias para a aula de sábado" /></label>
            <label>Nota<textarea id="hub-note-body" rows="4" maxlength="5000" required placeholder="Escreva aqui…"></textarea></label>
            <div class="hub-actions"><button class="button button-primary" type="submit">Salvar nota</button><button class="button button-ghost" id="hub-note-cancel" type="button" hidden>Cancelar edição</button><a class="button button-ghost hub-keep-link" href="https://keep.google.com" target="_blank" rel="noopener noreferrer">Abrir Google Keep ↗</a></div>
          </form>
          <div class="hub-note-list" id="hub-note-list"></div>
          <div class="hub-callout">Google Keep via API só funciona em ambientes Google Workspace empresariais com autorização administrativa. Para a conta pessoal, estas notas ficam no Neon e no navegador.</div>
        </div>
      </article>

      <article class="hub-card hub-card-wide" id="hub-files-card">
        <header class="hub-card-head"><div><p class="mini-label">Drive interno</p><h3>Arquivos do Painel</h3><p>Salvar, baixar, renomear, mover e excluir usando Neon + Blob, com cópia local automática.</p></div><span class="hub-badge" id="hub-file-count">0</span></header>
        <div class="hub-body">
          <form class="hub-form" id="hub-upload-form">
            <label class="hub-drop" id="hub-drop" for="hub-file-input"><span><span class="hub-file-icon">⇧</span><strong>Escolher ou soltar um arquivo</strong><small id="hub-selected-file">Nenhum arquivo selecionado</small></span></label>
            <input id="hub-file-input" type="file" hidden />
            <div class="hub-form-grid"><label>Destino<select id="hub-file-destination">${DESTINATIONS.map(([id,label]) => `<option value="${id}">${label}</option>`).join("")}</select></label><label>Observação<input id="hub-file-note" maxlength="180" placeholder="Ex.: material da aula iniciante" /></label></div>
            <div class="hub-actions"><button class="button button-primary" type="submit">Salvar arquivo</button><button class="button button-ghost" id="hub-files-refresh" type="button">↻ Recarregar</button></div>
          </form>
          <details class="hub-cloud-token"><summary>Chave privada da nuvem</summary><div class="hub-form-row" style="margin-top:10px"><input id="hub-cloud-token" type="password" autocomplete="off" placeholder="PAINEL_API_TOKEN" /><button class="button button-ghost" id="hub-token-save" type="button">Salvar neste navegador</button></div></details>
          <p class="hub-status" id="hub-file-status">Preparando biblioteca…</p>
          <div class="hub-file-list" id="hub-file-list"></div>
        </div>
      </article>
    </div>
  `;
  const spotify = workspaceRoot.querySelector("#spotify");
  if (spotify) spotify.insertAdjacentElement("afterend", section);
  else workspaceRoot.append(section);
  hub = section;
  return section;
}

function ensureSpotifyPlaylist() {
  const current = workspaceState();
  if (!current || typeof current !== "object") return;
  const resolved = resolveSpotifyContent(current.spotify?.contentUrl);
  if (resolved?.kind === "embed") return;
  publishWorkspace({ ...current, spotify: { profileUrl: PROFILE_URL, contentUrl: DEFAULT_PLAYLIST } });
}

function validCalendarUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["calendar.google.com", "calendar.googleusercontent.com"].includes(url.hostname) && (/\/calendar\/ical\//i.test(url.pathname) || /\.ics$/i.test(url.pathname));
  } catch { return false; }
}

function loadCalendars() {
  const saved = safeJson(localStorage.getItem(CALENDAR_KEY), []);
  calendarConnections = Array.isArray(saved) ? saved.filter((item) => item?.url && validCalendarUrl(item.url)) : [];
}

function saveCalendars() {
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(calendarConnections));
  window.dispatchEvent(new StorageEvent("storage", { key: CALENDAR_KEY, newValue: JSON.stringify(calendarConnections) }));
}

function maskedCalendar(url) {
  try {
    const parsed = new URL(url);
    const suffix = parsed.pathname.split("/").pop() || "basic.ics";
    return `${parsed.hostname}/…/${suffix}`;
  } catch { return "link protegido"; }
}

function renderCalendars() {
  const list = hub.querySelector("#hub-calendar-list");
  hub.querySelector("#hub-calendar-count").textContent = String(calendarConnections.length);
  if (!calendarConnections.length) {
    list.innerHTML = '<div class="hub-empty">Nenhuma agenda conectada neste navegador.</div>';
    return;
  }
  list.innerHTML = calendarConnections.map((item) => `
    <div class="hub-secret-item" data-calendar-id="${escapeHtml(item.id)}">
      <div><strong><span style="color:${escapeHtml(item.color)}">●</span> ${escapeHtml(item.name)}</strong><small>${escapeHtml(maskedCalendar(item.url))}</small></div>
      <div class="hub-actions"><button class="hub-mini" data-calendar-remove="${escapeHtml(item.id)}" type="button">Remover</button></div>
    </div>
  `).join("");
}

function notesState() {
  const current = workspaceState();
  notes = Array.isArray(current.notes) ? current.notes : [];
  return current;
}

function saveNotes() {
  const current = workspaceState();
  publishWorkspace({ ...current, notes });
  window.__mirnaAutoFix?.refresh?.();
}

function renderNotes() {
  notesState();
  const list = hub.querySelector("#hub-note-list");
  hub.querySelector("#hub-note-count").textContent = String(notes.length);
  if (!notes.length) {
    list.innerHTML = '<div class="hub-empty">Nenhuma nota ainda.</div>';
    return;
  }
  list.innerHTML = [...notes].sort((a,b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))).map((note) => `
    <article class="hub-note-item" data-note-id="${escapeHtml(note.id)}">
      <div><strong>${escapeHtml(note.title)}</strong><div class="hub-note-body">${escapeHtml(note.body)}</div><small>Atualizada ${new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(note.updatedAt || note.createdAt))}</small></div>
      <div class="hub-actions"><button class="hub-mini" data-note-edit="${escapeHtml(note.id)}" type="button">Editar</button><button class="hub-mini" data-note-delete="${escapeHtml(note.id)}" type="button">Excluir</button></div>
    </article>
  `).join("");
}

function localFileId(record) {
  return record.remoteId || record.id;
}

function mergedFiles() {
  const map = new Map();
  for (const file of remoteFiles) map.set(file.id, { ...file, remoteId: file.id, storage: "cloud" });
  for (const file of localFiles) {
    const key = localFileId(file);
    map.set(key, { ...map.get(key), ...file, remoteId: file.remoteId || map.get(key)?.remoteId, storage: file.remoteId ? "both" : file.storage || "local" });
  }
  return [...map.values()].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function fileIcon(file) {
  const type = String(file.mimeType || file.blob?.type || "");
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📕";
  if (type.startsWith("audio/")) return "🎧";
  if (type.startsWith("video/")) return "🎬";
  return "📎";
}

function renderFiles() {
  const files = mergedFiles();
  hub.querySelector("#hub-file-count").textContent = String(files.length);
  const list = hub.querySelector("#hub-file-list");
  if (!files.length) {
    list.innerHTML = '<div class="hub-empty">Nenhum arquivo salvo ainda.</div>';
    return;
  }
  list.innerHTML = files.map((file) => `
    <article class="hub-file-item" data-file-key="${escapeHtml(localFileId(file))}">
      <div class="hub-edit-fields"><strong>${fileIcon(file)} ${escapeHtml(file.name)}</strong><small>${escapeHtml(formatBytes(file.sizeBytes || file.blob?.size))} · destino ${escapeHtml(file.destinationId || "00")} · ${file.storage === "both" ? "local + nuvem" : file.storage === "cloud" ? "nuvem" : "local"}</small>${file.note ? `<small>${escapeHtml(file.note)}</small>` : ""}</div>
      <div class="hub-actions"><button class="hub-mini" data-file-download="${escapeHtml(localFileId(file))}" type="button">Baixar</button><button class="hub-mini" data-file-edit="${escapeHtml(localFileId(file))}" type="button">Atualizar</button><button class="hub-mini" data-file-delete="${escapeHtml(localFileId(file))}" type="button">Excluir</button></div>
    </article>
  `).join("");
}

async function fetchRemoteFiles() {
  if (!cloudToken()) return [];
  const response = await fetch("/api/files", { headers: authHeaders({ Accept: "application/json" }), cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "A nuvem não respondeu.");
  return response.json();
}

async function refreshFiles() {
  const status = hub.querySelector("#hub-file-status");
  status.className = "hub-status";
  status.innerHTML = '<span class="hub-spinner"></span>Atualizando biblioteca…';
  try {
    localFiles = await listLocalFiles();
    try { remoteFiles = await fetchRemoteFiles(); }
    catch (error) { remoteFiles = []; if (cloudToken()) throw error; }
    renderFiles();
    status.textContent = cloudToken() ? "Biblioteca local e nuvem alinhadas." : "Arquivos salvos localmente. Informe o token para usar Neon + Blob.";
    status.classList.add("is-ok");
  } catch (error) {
    renderFiles();
    status.textContent = error.message || "Não foi possível atualizar os arquivos.";
    status.classList.add("is-error");
  }
}

async function uploadFile(event) {
  event.preventDefault();
  if (!selectedFile) return;
  const status = hub.querySelector("#hub-file-status");
  status.innerHTML = '<span class="hub-spinner"></span>Salvando arquivo…';
  const destinationId = hub.querySelector("#hub-file-destination").value;
  const note = hub.querySelector("#hub-file-note").value.trim();
  const localId = uid("file");
  const createdAt = new Date().toISOString();
  let remoteId = "";
  try {
    if (cloudToken()) {
      const form = new FormData();
      form.set("file", selectedFile);
      form.set("destinationId", destinationId);
      form.set("note", note);
      const response = await fetch("/api/upload", { method:"POST", headers:authHeaders(), body:form });
      if (response.ok) remoteId = (await response.json()).id || "";
      else {
        const payload = await response.json().catch(() => ({}));
        if (response.status !== 413) throw new Error(payload.message || "Falha ao enviar para a nuvem.");
      }
    }
    await putLocalFile({ id: localId, remoteId, destinationId, name: selectedFile.name, mimeType:selectedFile.type || "application/octet-stream", sizeBytes:selectedFile.size, note, createdAt, storage:remoteId ? "both" : "local", blob:selectedFile });
    selectedFile = null;
    hub.querySelector("#hub-file-input").value = "";
    hub.querySelector("#hub-selected-file").textContent = "Nenhum arquivo selecionado";
    hub.querySelector("#hub-file-note").value = "";
    await refreshFiles();
  } catch (error) {
    status.textContent = error.message || "Não foi possível salvar o arquivo.";
    status.classList.add("is-error");
  }
}

function findMergedFile(key) {
  return mergedFiles().find((file) => localFileId(file) === key || file.id === key);
}

async function downloadFile(key) {
  const record = findMergedFile(key);
  if (!record) return;
  let blob = record.blob;
  if (!blob && record.id) {
    const response = await fetch(`/api/file?id=${encodeURIComponent(record.remoteId || record.id)}`, { headers:authHeaders(), cache:"no-store" });
    if (!response.ok) throw new Error("Não foi possível baixar o arquivo.");
    blob = await response.blob();
  }
  if (!blob) {
    const local = await getLocalFile(record.id);
    blob = local?.blob;
  }
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = record.name || "arquivo";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function deleteFileEverywhere(key) {
  const record = findMergedFile(key);
  if (!record || !window.confirm(`Excluir “${record.name}”?`)) return;
  if (record.id && record.blob) await deleteLocalFile(record.id);
  const remoteId = record.remoteId || (record.storage === "cloud" ? record.id : "");
  if (remoteId && cloudToken()) {
    const response = await fetch(`/api/files?id=${encodeURIComponent(remoteId)}`, { method:"DELETE", headers:authHeaders() });
    if (!response.ok && response.status !== 404) throw new Error("Não foi possível excluir da nuvem.");
  }
  await refreshFiles();
}

async function editFileMetadata(key) {
  const record = findMergedFile(key);
  if (!record) return;
  const newName = window.prompt("Novo nome do arquivo:", record.name);
  if (newName == null || !newName.trim()) return;
  const newNote = window.prompt("Observação:", record.note || "");
  if (newNote == null) return;
  const destinationId = window.prompt("Destino (00, 01, 02, 03, 04, 05, 06, 07, 08 ou 99):", record.destinationId || "00");
  if (destinationId == null || !DESTINATIONS.some(([id]) => id === destinationId)) return;

  if (record.id && record.blob) await putLocalFile({ ...record, id:record.id, name:newName.trim(), note:newNote.trim(), destinationId });
  const remoteId = record.remoteId || (record.storage === "cloud" ? record.id : "");
  if (remoteId && cloudToken()) {
    const response = await fetch("/api/files", {
      method:"PATCH",
      headers:authHeaders({ "Content-Type":"application/json" }),
      body:JSON.stringify({ id:remoteId, name:newName.trim(), note:newNote.trim(), destinationId })
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Não foi possível atualizar na nuvem.");
  }
  await refreshFiles();
}

function bindHubEvents() {
  const calendarUrl = hub.querySelector("#hub-calendar-url");
  hub.querySelector("#hub-calendar-toggle").addEventListener("click", () => {
    calendarUrl.type = calendarUrl.type === "password" ? "url" : "password";
  });
  hub.querySelector("#hub-calendar-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const url = calendarUrl.value.trim();
    if (!validCalendarUrl(url)) {
      hub.querySelector("#hub-calendar-status").textContent = "Use o Endereço secreto em formato iCal do Google Agenda.";
      hub.querySelector("#hub-calendar-status").className = "hub-status is-error";
      return;
    }
    calendarConnections.push({ id:uid("calendar"), name:hub.querySelector("#hub-calendar-name").value.trim() || "Agenda", color:hub.querySelector("#hub-calendar-color").value, url });
    saveCalendars();
    calendarUrl.value = "";
    renderCalendars();
    hub.querySelector("#hub-calendar-status").textContent = "Agenda salva. Sincronização iniciada.";
    hub.querySelector("#hub-calendar-status").className = "hub-status is-ok";
    window.__mirnaAutoFix?.refresh?.();
  });
  hub.querySelector("#hub-calendar-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-remove]");
    if (!button) return;
    calendarConnections = calendarConnections.filter((item) => item.id !== button.dataset.calendarRemove);
    saveCalendars();
    renderCalendars();
    window.__mirnaAutoFix?.refresh?.();
  });

  hub.querySelector("#hub-note-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = hub.querySelector("#hub-note-id").value;
    const title = hub.querySelector("#hub-note-title").value.trim();
    const body = hub.querySelector("#hub-note-body").value.trim();
    if (!title || !body) return;
    const existing = notes.find((note) => note.id === id);
    if (existing) Object.assign(existing, { title, body, updatedAt:new Date().toISOString() });
    else notes.push({ id:uid("note"), title, body, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    saveNotes();
    event.target.reset();
    hub.querySelector("#hub-note-id").value = "";
    hub.querySelector("#hub-note-cancel").hidden = true;
    renderNotes();
  });
  hub.querySelector("#hub-note-cancel").addEventListener("click", () => {
    hub.querySelector("#hub-note-form").reset();
    hub.querySelector("#hub-note-id").value = "";
    hub.querySelector("#hub-note-cancel").hidden = true;
  });
  hub.querySelector("#hub-note-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-note-edit]");
    const remove = event.target.closest("[data-note-delete]");
    if (edit) {
      const note = notes.find((item) => item.id === edit.dataset.noteEdit);
      if (!note) return;
      hub.querySelector("#hub-note-id").value = note.id;
      hub.querySelector("#hub-note-title").value = note.title;
      hub.querySelector("#hub-note-body").value = note.body;
      hub.querySelector("#hub-note-cancel").hidden = false;
      hub.querySelector("#hub-note-title").focus();
    }
    if (remove) {
      const note = notes.find((item) => item.id === remove.dataset.noteDelete);
      if (!note || !window.confirm(`Excluir “${note.title}”?`)) return;
      notes = notes.filter((item) => item.id !== note.id);
      saveNotes();
      renderNotes();
    }
  });

  const fileInput = hub.querySelector("#hub-file-input");
  const drop = hub.querySelector("#hub-drop");
  const choose = (file) => {
    selectedFile = file || null;
    hub.querySelector("#hub-selected-file").textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "Nenhum arquivo selecionado";
  };
  fileInput.addEventListener("change", () => choose(fileInput.files?.[0]));
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("is-drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
  drop.addEventListener("drop", (event) => { event.preventDefault(); drop.classList.remove("is-drag"); choose(event.dataTransfer.files?.[0]); });
  hub.querySelector("#hub-upload-form").addEventListener("submit", uploadFile);
  hub.querySelector("#hub-files-refresh").addEventListener("click", refreshFiles);
  hub.querySelector("#hub-token-save").addEventListener("click", () => {
    const value = hub.querySelector("#hub-cloud-token").value.trim();
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
    hub.querySelector("#hub-cloud-token").value = "";
    refreshFiles();
    window.__mirnaAutoFix?.refresh?.();
  });
  hub.querySelector("#hub-file-list").addEventListener("click", async (event) => {
    const download = event.target.closest("[data-file-download]");
    const edit = event.target.closest("[data-file-edit]");
    const remove = event.target.closest("[data-file-delete]");
    try {
      if (download) await downloadFile(download.dataset.fileDownload);
      if (edit) await editFileMetadata(edit.dataset.fileEdit);
      if (remove) await deleteFileEverywhere(remove.dataset.fileDelete);
    } catch (error) {
      const status = hub.querySelector("#hub-file-status");
      status.textContent = error.message || "Não foi possível concluir a ação.";
      status.className = "hub-status is-error";
    }
  });
  hub.querySelector("#hub-refresh-all").addEventListener("click", async () => {
    ensureSpotifyPlaylist();
    window.__mirnaAutoFix?.refresh?.();
    await refreshFiles();
    renderNotes();
    renderCalendars();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === WORKSPACE_KEY) renderNotes();
    if (event.key === CALENDAR_KEY) { loadCalendars(); renderCalendars(); }
  });
  channel?.addEventListener("message", () => renderNotes());
}

async function init() {
  const started = Date.now();
  while (!document.querySelector("#workspace-root") && Date.now() - started < 16000) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (!document.querySelector("#workspace-root")) return;
  ensureStyles();
  buildHub();
  ensureSpotifyPlaylist();
  loadCalendars();
  renderCalendars();
  renderNotes();
  bindHubEvents();
  await refreshFiles();
  window.__mirnaDataHub = { refreshFiles, refreshCalendars: () => { loadCalendars(); renderCalendars(); }, refreshNotes: renderNotes };
}

init().catch((error) => console.error("Falha ao iniciar central de dados", error));