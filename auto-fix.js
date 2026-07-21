import { resolveSpotifyContent, spotifyTypeLabel } from "./spotify.js";

const WORKSPACE = "painel-da-mirna:workspace:v3";
const PROFILE = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const LOCATION_KEY = "painel-da-mirna:auto-location:v2";
const DEFAULT_CITY = "Marechal Cândido Rondon, Paraná";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("painel-da-mirna-workspace") : null;
let desiredView;
let protecting = false;
let lastDay = dayKey();
let timer;

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }
function state() { return safeJson(localStorage.getItem(WORKSPACE)) || null; }
function publish(next) {
  next.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE, JSON.stringify(next));
  channel?.postMessage(next);
}
function text(selector, value) {
  const element = document.querySelector(selector);
  if (element && value != null) element.textContent = value;
}
function capitalize(value) { const textValue = String(value || ""); return textValue ? textValue[0].toUpperCase() + textValue.slice(1) : textValue; }
function weatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌧️";
}
function browserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocalização indisponível"));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: "Localização atual", savedAt: Date.now() }),
      reject,
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 6 * 60 * 60 * 1000 }
    );
  });
}
function preferredCity() {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !/(painel|mirna|weather|clima|cidade)/i.test(key)) continue;
    const value = safeJson(localStorage.getItem(key));
    const city = value?.city || value?.cidade || value?.weatherCity || value?.settings?.city;
    if (typeof city === "string" && city.trim()) return city.trim();
  }
  return DEFAULT_CITY;
}
async function refreshWeather(force = false) {
  let location = safeJson(localStorage.getItem(LOCATION_KEY));
  const fresh = location?.savedAt && Date.now() - location.savedAt < 12 * 60 * 60 * 1000;
  if (force || !fresh) {
    try { location = await browserLocation(); localStorage.setItem(LOCATION_KEY, JSON.stringify(location)); }
    catch { location = null; }
  }
  const url = new URL("/api/weather", window.location.href);
  if (location?.latitude != null && location?.longitude != null) {
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    url.searchParams.set("label", location.label || "Localização atual");
  } else url.searchParams.set("city", preferredCity());
  try {
    const response = await fetch(url.pathname + url.search, { cache: "no-store" });
    if (!response.ok) throw new Error("Clima indisponível");
    const weather = await response.json();
    text("#mirna-auto-weather", `${weatherIcon(weather.current?.code)} ${weather.current?.temperature}° · sensação ${weather.current?.feelsLike}°`);
    text("#mirna-auto-location", `${weather.location?.label || preferredCity()} · máx. ${weather.today?.max}° · ${weather.today?.rainChance || 0}% chuva`);
    return true;
  } catch {
    text("#mirna-auto-weather", "Previsão indisponível");
    text("#mirna-auto-location", preferredCity());
    return false;
  }
}
function alignSpotify() {
  const current = state();
  if (!current) return;
  const resolved = resolveSpotifyContent(current.spotify?.contentUrl);
  const playable = resolved?.kind === "embed" ? resolved.canonicalUrl : "";
  if (current.spotify?.profileUrl !== PROFILE || current.spotify?.contentUrl !== playable) {
    publish({ ...current, spotify: { profileUrl: PROFILE, contentUrl: playable } });
  }
  text("#mirna-auto-spotify", playable ? `${capitalize(spotifyTypeLabel(resolved.type))} pronta` : "Perfil atual conectado");
  const detail = document.querySelector("#mirna-auto-spotify")?.nextElementSibling;
  if (detail) detail.textContent = playable ? "Player preservado automaticamente" : "Conta da Mirna · escolha uma playlist para tocar";
}
function countCalendarFeeds() {
  const urls = new Set();
  const pattern = /https:\/\/(?:calendar\.google\.com|calendar\.googleusercontent\.com)\/[^\s"'<>]+/gi;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !/(painel|mirna|calendar|agenda)/i.test(key)) continue;
    const raw = localStorage.getItem(key) || "";
    for (const url of raw.match(pattern) || []) if (/\/calendar\/ical\/|\.ics/i.test(url)) urls.add(url);
  }
  return urls.size;
}
function renderCounts() {
  const current = state();
  if (!current) return;
  const today = dayKey();
  const todayCount = (current.events || []).filter((item) => item.date === today).length + (current.cards || []).filter((item) => item.dueDate === today && item.column !== "done").length;
  const notes = (current.cards || []).filter((item) => item.autoSource === "current-notes" || item.column !== "done").length;
  const feeds = countCalendarFeeds();
  text("#mirna-auto-calendar", `${todayCount} ${todayCount === 1 ? "item hoje" : "itens hoje"}`);
  text("#mirna-auto-calendar-detail", feeds ? `${feeds} ${feeds === 1 ? "agenda conectada" : "agendas conectadas"}` : "Eventos locais e tarefas ativos");
  text("#mirna-auto-notes", `${notes} ${notes === 1 ? "nota alinhada" : "notas alinhadas"}`);
}
async function refreshCloud() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = response.ok ? await response.json() : null;
    if (health?.database && health?.files) {
      text("#mirna-auto-cloud", "Neon + Blob ativos");
      text("#mirna-auto-cloud-detail", "Banco e arquivos conectados");
      return true;
    }
    if (health?.database) {
      text("#mirna-auto-cloud", "Neon conectado");
      text("#mirna-auto-cloud-detail", "Banco online ativo");
      return true;
    }
  } catch {}
  text("#mirna-auto-cloud", "Banco local ativo");
  text("#mirna-auto-cloud-detail", "O navegador continua protegido");
  return false;
}
function rememberView() {
  const current = state();
  if (!current) return;
  desiredView = { selectedDate: current.selectedDate, cursorDate: current.cursorDate, calendarView: current.calendarView, day: dayKey() };
}
function protectView() {
  if (protecting || !desiredView) return;
  const current = state();
  if (!current) return;
  const today = dayKey();
  if (lastDay !== today) {
    lastDay = today;
    desiredView = { selectedDate: today, cursorDate: today, calendarView: current.calendarView, day: today };
    return;
  }
  const wasForcedToToday = current.selectedDate === today && desiredView.selectedDate !== today;
  if (!wasForcedToToday) return;
  protecting = true;
  publish({ ...current, selectedDate: desiredView.selectedDate, cursorDate: desiredView.cursorDate, calendarView: desiredView.calendarView });
  window.setTimeout(() => { protecting = false; }, 50);
}
function scheduleProtection() { window.setTimeout(protectView, 80); }
async function refreshAll(forceLocation = false) {
  text("#mirna-sync-status", "Alinhando localização, agenda, notas, Spotify e bancos…");
  document.querySelector("#mirna-sync-dot")?.classList.add("is-working");
  alignSpotify();
  renderCounts();
  await Promise.all([refreshWeather(forceLocation), refreshCloud()]);
  renderCounts();
  text("#mirna-sync-status", "Tudo alinhado automaticamente.");
  text("#mirna-sync-last", `Última atualização: ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`);
  document.querySelector("#mirna-sync-dot")?.classList.remove("is-working");
}
async function init() {
  const started = Date.now();
  while ((!window.__mirnaWorkspace || !document.querySelector("#mirna-auto-sync")) && Date.now() - started < 16000) await new Promise((resolve) => setTimeout(resolve, 80));
  rememberView();
  alignSpotify();
  await refreshAll();
  document.addEventListener("click", (event) => {
    if (event.target.closest("#ws-calendar-prev,#ws-calendar-next,#ws-calendar-today,[data-calendar-view],[data-date]")) window.setTimeout(rememberView, 0);
  });
  document.querySelector("#mirna-sync-now")?.addEventListener("click", () => refreshAll(true));
  window.addEventListener("storage", (event) => { if (event.key === WORKSPACE) { scheduleProtection(); window.setTimeout(() => { alignSpotify(); renderCounts(); }, 100); } });
  channel?.addEventListener("message", () => { scheduleProtection(); window.setTimeout(() => { alignSpotify(); renderCounts(); }, 100); });
  window.addEventListener("online", () => refreshAll());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshAll(); });
  timer = window.setInterval(() => { protectView(); alignSpotify(); renderCounts(); }, 20000);
  window.__mirnaAutoFix = { refresh: () => refreshAll(true), protectView };
}
init().catch(() => {});
window.addEventListener("beforeunload", () => { window.clearInterval(timer); channel?.close(); });
