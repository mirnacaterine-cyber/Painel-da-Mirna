import { resolveSpotifyContent } from "./spotify.js";

const WORKSPACE_KEY = "painel-da-mirna:workspace:v3";
const NOTES_KEY = "painel-da-mirna:notes:v1";
const TOKEN_KEY = "painel-da-mirna:cloud-token:v1";
const CALENDAR_KEY = "painel-da-mirna:calendar-connections:v1";
const NOTES_STATE_ID = "mirna-notes-v1";
const PROFILE_URL = "https://open.spotify.com/user/21qezo47xxwofexkvodibgt6i";
const DEFAULT_PLAYLIST = "https://open.spotify.com/playlist/1DgRQ20bvrC01pUtSR4yzC";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("painel-da-mirna-workspace") : null;

let restoring = false;
let syncTimer;
let notesTimer;

function safeJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function workspace() {
  return safeJson(localStorage.getItem(WORKSPACE_KEY), {}) || {};
}

function publish(next) {
  next.updatedAt = new Date().toISOString();
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  channel?.postMessage(next);
}

function noteTimestamp(note) {
  const parsed = Date.parse(note?.updatedAt || note?.createdAt || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeNotes(localNotes, remoteNotes) {
  const merged = new Map();
  for (const note of remoteNotes || []) if (note?.id) merged.set(note.id, note);
  for (const note of localNotes || []) {
    if (!note?.id) continue;
    const remote = merged.get(note.id);
    if (!remote || noteTimestamp(note) >= noteTimestamp(remote)) merged.set(note.id, note);
  }
  return [...merged.values()];
}

function storedNotes() {
  const notes = safeJson(localStorage.getItem(NOTES_KEY), []);
  return Array.isArray(notes) ? notes : [];
}

function saveStoredNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(Array.isArray(notes) ? notes : []));
}

function preserveNotes() {
  if (restoring) return;
  const current = workspace();
  const currentNotes = Array.isArray(current.notes) ? current.notes : [];
  const backup = storedNotes();

  if (currentNotes.length) {
    const merged = mergeNotes(currentNotes, backup);
    saveStoredNotes(merged);
    if (merged.length !== currentNotes.length) {
      restoring = true;
      publish({ ...current, notes: merged });
      window.setTimeout(() => { restoring = false; }, 50);
    }
    return;
  }

  if (backup.length) {
    restoring = true;
    publish({ ...current, notes: backup });
    window.setTimeout(() => { restoring = false; }, 50);
  }
}

function ensureSpotify() {
  const current = workspace();
  const resolved = resolveSpotifyContent(current.spotify?.contentUrl);
  if (resolved?.kind === "embed" && current.spotify?.profileUrl === PROFILE_URL) return;
  publish({
    ...current,
    spotify: { profileUrl: PROFILE_URL, contentUrl: DEFAULT_PLAYLIST }
  });
}

function token() {
  return localStorage.getItem(TOKEN_KEY)?.trim() || "";
}

async function syncNotesCloud() {
  const apiToken = token();
  if (!apiToken) return false;
  const headers = { "x-painel-token": apiToken, Accept: "application/json" };
  let notes = storedNotes();

  try {
    const response = await fetch(`/api/state?id=${encodeURIComponent(NOTES_STATE_ID)}`, {
      headers,
      cache: "no-store"
    });
    if (response.ok) {
      const remote = await response.json();
      notes = mergeNotes(notes, remote.payload?.notes || []);
      saveStoredNotes(notes);
      const current = workspace();
      if (JSON.stringify(current.notes || []) !== JSON.stringify(notes)) {
        publish({ ...current, notes });
      }
    } else if (response.status !== 404) {
      return false;
    }

    const saveResponse = await fetch("/api/state", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: NOTES_STATE_ID,
        payload: { notes },
        clientUpdatedAt: new Date().toISOString()
      })
    });
    return saveResponse.ok;
  } catch {
    return false;
  }
}

function scheduleCloudSync(delay = 800) {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncNotesCloud(), delay);
}

function refreshConnectedModules() {
  window.__mirnaAutoSync?.syncNow?.();
  window.__mirnaAutoFix?.refresh?.();
  window.__mirnaDataHub?.refreshCalendars?.();
  window.__mirnaDataHub?.refreshNotes?.();
}

async function init() {
  const started = Date.now();
  while (!window.__mirnaWorkspace && Date.now() - started < 16000) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  ensureSpotify();
  preserveNotes();
  await syncNotesCloud();

  window.addEventListener("storage", (event) => {
    if (event.key === WORKSPACE_KEY) {
      preserveNotes();
      ensureSpotify();
      scheduleCloudSync();
    }
    if (event.key === CALENDAR_KEY) refreshConnectedModules();
    if (event.key === TOKEN_KEY) scheduleCloudSync(50);
  });

  channel?.addEventListener("message", () => {
    preserveNotes();
    ensureSpotify();
    scheduleCloudSync();
  });

  notesTimer = window.setInterval(() => {
    preserveNotes();
    ensureSpotify();
  }, 10000);

  window.__mirnaRuntimeV5 = {
    preserveNotes,
    syncNotesCloud,
    refresh: refreshConnectedModules
  };
}

init().catch(() => {});
window.addEventListener("beforeunload", () => {
  window.clearInterval(notesTimer);
  window.clearTimeout(syncTimer);
  channel?.close();
});