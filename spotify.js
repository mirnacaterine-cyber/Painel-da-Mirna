const SPOTIFY_HOST = "open.spotify.com";
const EMBEDDABLE_TYPES = new Set(["track", "album", "playlist", "artist", "show", "episode"]);
const COMPACT_TYPES = new Set(["track", "episode"]);

function safeSegment(value) {
  const segment = String(value || "").trim();
  return /^[A-Za-z0-9._-]{1,160}$/.test(segment) ? segment : "";
}

export function parseSpotifyReference(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  if (input.toLowerCase().startsWith("spotify:")) {
    const [, rawType, rawId] = input.split(":");
    const type = String(rawType || "").toLowerCase();
    const id = safeSegment(rawId);
    return type && id ? { type, id } : null;
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== SPOTIFY_HOST) return null;

  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.toLowerCase().startsWith("intl-"));
  if (segments.length < 2) return null;

  const type = String(segments[0] || "").toLowerCase();
  const id = safeSegment(decodeURIComponent(segments[1] || ""));
  return type && id ? { type, id } : null;
}

export function normalizeSpotifyProfileUrl(value) {
  const reference = parseSpotifyReference(value);
  if (!reference || reference.type !== "user") return "";
  return `https://${SPOTIFY_HOST}/user/${encodeURIComponent(reference.id)}`;
}

export function resolveSpotifyContent(value) {
  const reference = parseSpotifyReference(value);
  if (!reference) return null;

  if (reference.type === "user") {
    return {
      kind: "profile",
      type: "user",
      id: reference.id,
      canonicalUrl: `https://${SPOTIFY_HOST}/user/${encodeURIComponent(reference.id)}`
    };
  }

  if (!EMBEDDABLE_TYPES.has(reference.type)) return null;

  const canonicalUrl = `https://${SPOTIFY_HOST}/${reference.type}/${encodeURIComponent(reference.id)}`;
  return {
    kind: "embed",
    type: reference.type,
    id: reference.id,
    canonicalUrl,
    embedUrl: `https://${SPOTIFY_HOST}/embed/${reference.type}/${encodeURIComponent(reference.id)}?utm_source=generator&theme=0`,
    compact: COMPACT_TYPES.has(reference.type),
    height: COMPACT_TYPES.has(reference.type) ? 152 : 352
  };
}

export function buildSpotifyEmbed(value) {
  const content = resolveSpotifyContent(value);
  return content?.kind === "embed" ? content : null;
}

export function spotifyTypeLabel(type) {
  const labels = {
    track: "faixa",
    album: "álbum",
    playlist: "playlist",
    artist: "artista",
    show: "podcast",
    episode: "episódio",
    user: "perfil"
  };
  return labels[type] || "conteúdo";
}
