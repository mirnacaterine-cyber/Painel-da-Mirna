const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfoldLines(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function unescapeIcs(value = "") {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseProperty(line) {
  const separator = line.indexOf(":");
  if (separator < 0) return null;

  const left = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawName, ...rawParams] = left.split(";");
  const params = {};

  for (const parameter of rawParams) {
    const equals = parameter.indexOf("=");
    if (equals < 0) continue;
    params[parameter.slice(0, equals).toUpperCase()] = parameter.slice(equals + 1).replace(/^"|"$/g, "");
  }

  return { name: rawName.toUpperCase(), params, value };
}

function partsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );
}

function zonedDateToUtc(year, month, day, hour, minute, second, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = partsInTimeZone(new Date(guess), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const difference = desired - represented;
    if (difference === 0) break;
    guess += difference;
  }

  return new Date(guess);
}

function parseCompactParts(value) {
  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
    utc: Boolean(match[7]),
    hasTime: Boolean(match[4])
  };
}

function parseIcsDate(value, params = {}, fallbackTimeZone = "America/Sao_Paulo") {
  const compact = parseCompactParts(value);
  if (!compact) return null;

  const allDay = params.VALUE === "DATE" || !compact.hasTime;
  if (allDay) {
    return {
      date: new Date(compact.year, compact.month - 1, compact.day, 0, 0, 0, 0),
      allDay: true,
      timeZone: fallbackTimeZone
    };
  }

  if (compact.utc) {
    return {
      date: new Date(Date.UTC(compact.year, compact.month - 1, compact.day, compact.hour, compact.minute, compact.second)),
      allDay: false,
      timeZone: "UTC"
    };
  }

  const timeZone = params.TZID || fallbackTimeZone;
  try {
    return {
      date: zonedDateToUtc(
        compact.year,
        compact.month,
        compact.day,
        compact.hour,
        compact.minute,
        compact.second,
        timeZone
      ),
      allDay: false,
      timeZone
    };
  } catch {
    return {
      date: new Date(compact.year, compact.month - 1, compact.day, compact.hour, compact.minute, compact.second),
      allDay: false,
      timeZone: fallbackTimeZone
    };
  }
}

function parseRule(value = "") {
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.split("="))
      .filter(([key, item]) => key && item)
      .map(([key, item]) => [key.toUpperCase(), item])
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}

function addYears(date, years) {
  const next = new Date(date);
  const month = next.getMonth();
  next.setFullYear(next.getFullYear() + years);
  if (next.getMonth() !== month) next.setDate(0);
  return next;
}

function dateStamp(date, allDay = false) {
  if (allDay) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return date.toISOString();
}

function occurrenceMatchesExdate(date, exdates, allDay) {
  const stamp = dateStamp(date, allDay);
  return exdates.some((item) => dateStamp(item.date, allDay || item.allDay) === stamp);
}

function buildOccurrence(event, start) {
  const duration = Math.max(0, event.end.getTime() - event.start.getTime());
  const end = new Date(start.getTime() + duration);
  return {
    ...event,
    id: `${event.id}:${start.toISOString()}`,
    recurrenceId: event.id,
    start,
    end
  };
}

function expandRecurringEvent(event, rangeStart, rangeEnd, fallbackTimeZone) {
  if (!event.rrule) return [event];

  const rule = parseRule(event.rrule);
  const frequency = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const countLimit = rule.COUNT ? Math.max(1, Number(rule.COUNT)) : Infinity;
  const untilInfo = rule.UNTIL ? parseIcsDate(rule.UNTIL, {}, fallbackTimeZone) : null;
  const until = untilInfo?.date || null;
  const byDay = String(rule.BYDAY || "")
    .split(",")
    .map((code) => code.replace(/^[+-]?\d+/, ""))
    .filter((code) => DAY_CODES.includes(code));

  const occurrences = [];
  let generated = 0;
  const hardLimit = 1500;

  const addIfVisible = (candidate) => {
    if (until && candidate > until) return false;
    generated += 1;
    if (generated > countLimit || generated > hardLimit) return false;
    if (!occurrenceMatchesExdate(candidate, event.exdates, event.allDay)) {
      const occurrence = buildOccurrence(event, candidate);
      if (occurrence.end >= rangeStart && occurrence.start <= rangeEnd) occurrences.push(occurrence);
    }
    return generated < countLimit;
  };

  if (frequency === "WEEKLY" && byDay.length) {
    const cursor = new Date(event.start);
    cursor.setHours(event.start.getHours(), event.start.getMinutes(), event.start.getSeconds(), event.start.getMilliseconds());
    const searchEnd = until && until < rangeEnd ? until : rangeEnd;
    let daysChecked = 0;

    while (cursor <= searchEnd && daysChecked < hardLimit * 7 && generated < countLimit) {
      const dayCode = DAY_CODES[cursor.getDay()];
      const daysSinceStart = Math.floor((new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()) - new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate())) / 86400000);
      const weekOffset = Math.floor(daysSinceStart / 7);
      if (daysSinceStart >= 0 && weekOffset % interval === 0 && byDay.includes(dayCode)) {
        if (!addIfVisible(new Date(cursor))) break;
      }
      cursor.setDate(cursor.getDate() + 1);
      daysChecked += 1;
    }

    return occurrences;
  }

  let candidate = new Date(event.start);
  while (candidate <= rangeEnd && generated < countLimit && generated < hardLimit) {
    if (!addIfVisible(new Date(candidate))) break;

    if (frequency === "DAILY") candidate = addDays(candidate, interval);
    else if (frequency === "WEEKLY") candidate = addDays(candidate, 7 * interval);
    else if (frequency === "MONTHLY") candidate = addMonths(candidate, interval);
    else if (frequency === "YEARLY") candidate = addYears(candidate, interval);
    else break;
  }

  return occurrences;
}

function parseEventBlock(lines, fallbackTimeZone) {
  const properties = new Map();
  const exdates = [];

  for (const line of lines) {
    const property = parseProperty(line);
    if (!property) continue;

    if (property.name === "EXDATE") {
      for (const rawDate of property.value.split(",")) {
        const parsed = parseIcsDate(rawDate, property.params, fallbackTimeZone);
        if (parsed) exdates.push(parsed);
      }
      continue;
    }

    if (!properties.has(property.name)) properties.set(property.name, property);
  }

  const startProperty = properties.get("DTSTART");
  if (!startProperty) return null;
  const startInfo = parseIcsDate(startProperty.value, startProperty.params, fallbackTimeZone);
  if (!startInfo) return null;

  const endProperty = properties.get("DTEND");
  const endInfo = endProperty ? parseIcsDate(endProperty.value, endProperty.params, fallbackTimeZone) : null;
  const defaultDuration = startInfo.allDay ? 86400000 : 3600000;
  const end = endInfo?.date || new Date(startInfo.date.getTime() + defaultDuration);
  const uid = unescapeIcs(properties.get("UID")?.value || `${startInfo.date.toISOString()}-${properties.get("SUMMARY")?.value || "evento"}`);

  return {
    id: uid,
    uid,
    title: unescapeIcs(properties.get("SUMMARY")?.value || "Compromisso"),
    location: unescapeIcs(properties.get("LOCATION")?.value || ""),
    description: unescapeIcs(properties.get("DESCRIPTION")?.value || ""),
    start: startInfo.date,
    end,
    allDay: startInfo.allDay,
    timeZone: startInfo.timeZone,
    rrule: properties.get("RRULE")?.value || "",
    exdates,
    source: "google",
    readOnly: true
  };
}

export function parseIcs(raw, options = {}) {
  const fallbackTimeZone = options.timeZone || "America/Sao_Paulo";
  const rangeStart = options.rangeStart || new Date(Date.now() - 86400000);
  const rangeEnd = options.rangeEnd || addDays(rangeStart, 35);
  const lines = unfoldLines(raw);
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.push(line);
  }

  const events = [];
  const errors = [];

  for (const block of blocks) {
    try {
      const event = parseEventBlock(block, fallbackTimeZone);
      if (!event) continue;
      for (const occurrence of expandRecurringEvent(event, rangeStart, rangeEnd, fallbackTimeZone)) {
        if (occurrence.end >= rangeStart && occurrence.start <= rangeEnd) events.push(occurrence);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Evento não reconhecido.");
    }
  }

  events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, "pt-BR"));
  return { events, errors, totalBlocks: blocks.length };
}

export function normalizeLocalEvent(event) {
  return {
    ...event,
    start: new Date(event.start),
    end: new Date(event.end),
    source: event.source || "local",
    readOnly: Boolean(event.readOnly)
  };
}

function formatGoogleDate(date, allDay) {
  if (allDay) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "T",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

export function buildGoogleCalendarUrl(event, timeZone = "America/Sao_Paulo") {
  const start = new Date(event.start);
  let end = new Date(event.end);
  if (event.allDay && end <= start) end = addDays(start, 1);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Compromisso",
    dates: `${formatGoogleDate(start, event.allDay)}/${formatGoogleDate(end, event.allDay)}`,
    ctz: timeZone
  });

  if (event.location) params.set("location", event.location);
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function formatEventTime(event, locale = "pt-BR") {
  if (event.allDay) return "Dia todo";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(event.start));
}

export function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addCalendarDays(date, amount) {
  return addDays(date, amount);
}
