const MAX_NEWS_QUERY = 180;

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function stripTags(value = "") {
  return decodeXml(String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function stripSourceSuffix(title, source) {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

export async function fetchNewsItems(query, limit = 10) {
  const safeQuery = String(query || "").trim().slice(0, MAX_NEWS_QUERY);
  if (!safeQuery) throw Object.assign(new Error("Assunto de notícias ausente."), { status: 400 });

  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", safeQuery);
  url.searchParams.set("hl", "pt-BR");
  url.searchParams.set("gl", "BR");
  url.searchParams.set("ceid", "BR:pt-419");

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Painel da Mirna; personal dashboard) AppleWebKit/537.36 Chrome/126 Safari/537.36"
      },
      signal: AbortSignal.timeout(12000)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const message = timedOut
      ? "O Google News demorou para responder. Tente atualizar o radar daqui a pouco."
      : "A antena não conseguiu alcançar o Google News agora. Confira a internet e tente novamente.";
    throw Object.assign(new Error(message), { status: 502, cause: error });
  }

  if (!response.ok) {
    throw Object.assign(new Error(`O radar de notícias respondeu com ${response.status}.`), { status: 502 });
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, Math.min(30, Math.max(1, Number(limit) || 10)))
    .map((match) => {
      const block = match[1];
      const source = tagValue(block, "source");
      const rawTitle = stripTags(tagValue(block, "title"));
      return {
        title: stripSourceSuffix(rawTitle, source),
        link: tagValue(block, "link"),
        source,
        publishedAt: tagValue(block, "pubDate") || null,
        description: stripTags(tagValue(block, "description")).slice(0, 280)
      };
    })
    .filter((item) => item.title && /^https?:\/\//i.test(item.link));

  return items;
}

function validateCalendarUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw Object.assign(new Error("O endereço iCal não é válido."), { status: 400 });
  }

  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com") {
    throw Object.assign(new Error("Por segurança, apenas endereços iCal do Google Agenda são aceitos."), { status: 403 });
  }

  if (!url.pathname.includes("/calendar/ical/") && !url.pathname.endsWith(".ics")) {
    throw Object.assign(new Error("Use o Endereço secreto em formato iCal, terminado em basic.ics."), { status: 400 });
  }

  return url;
}

export async function fetchCalendarIcs(rawUrl) {
  let currentUrl = validateCalendarUrl(rawUrl);

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    let response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Painel da Mirna; personal dashboard) AppleWebKit/537.36 Chrome/126 Safari/537.36"
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      const message = timedOut
        ? "O Google Agenda demorou para responder. Tente atualizar novamente."
        : "A antena não conseguiu alcançar o Google Agenda agora. Confira a internet e tente novamente.";
      throw Object.assign(new Error(message), { status: 502, cause: error });
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) {
        throw Object.assign(new Error("O Google redirecionou a agenda mais vezes do que o esperado."), { status: 502 });
      }
      currentUrl = validateCalendarUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      const message = response.status === 404 || response.status === 410
        ? "Esse link iCal parece expirado ou revogado. Gere um novo endereço secreto no Google Agenda."
        : `O Google Agenda respondeu com erro ${response.status}.`;
      throw Object.assign(new Error(message), { status: 502 });
    }

    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw Object.assign(new Error("O endereço respondeu, mas não trouxe um calendário iCal válido."), { status: 502 });
    }
    return text;
  }

  throw Object.assign(new Error("Não foi possível carregar a agenda."), { status: 502 });
}
