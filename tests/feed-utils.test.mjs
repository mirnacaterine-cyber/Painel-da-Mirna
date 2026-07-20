import test from "node:test";
import assert from "node:assert/strict";
import { fetchCalendarIcs, fetchNewsItems } from "../server/feed-utils.js";

function withMockFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = original;
    });
}

test("faz parse do RSS e limpa o sufixo da fonte", async () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[Festival de ballet reúne companhias - Jornal da Dança]]></title>
      <link>https://news.google.com/articles/abc</link>
      <source>Jornal da Dança</source>
      <pubDate>Mon, 20 Jul 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Uma notícia sobre ballet.</p>]]></description>
    </item>
  </channel></rss>`;

  await withMockFetch(async (url, options) => {
    assert.equal(new URL(url).hostname, "news.google.com");
    assert.match(options.headers["User-Agent"], /Painel da Mirna/);
    return new Response(xml, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  }, async () => {
    const items = await fetchNewsItems("ballet", 5);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Festival de ballet reúne companhias");
    assert.equal(items[0].source, "Jornal da Dança");
    assert.equal(items[0].description, "Uma notícia sobre ballet.");
  });
});

test("recusa proxy de agenda fora do Google", async () => {
  await assert.rejects(
    () => fetchCalendarIcs("https://exemplo.com/private.ics"),
    (error) => error.status === 403 && /Google Agenda/.test(error.message)
  );
});

test("segue redirecionamento seguro e devolve iCal", async () => {
  let calls = 0;
  const source = "https://calendar.google.com/calendar/ical/agenda/private-token/basic.ics";
  await withMockFetch(async (url) => {
    calls += 1;
    if (calls === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://calendar.google.com/calendar/ical/agenda/private-token/novo.ics" }
      });
    }
    assert.equal(String(url), "https://calendar.google.com/calendar/ical/agenda/private-token/novo.ics");
    return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR", { status: 200 });
  }, async () => {
    const ics = await fetchCalendarIcs(source);
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.equal(calls, 2);
  });
});

test("traduz falha de rede para mensagem amigável", async () => {
  await withMockFetch(async () => {
    throw new TypeError("fetch failed");
  }, async () => {
    await assert.rejects(
      () => fetchNewsItems("ginástica rítmica", 5),
      (error) => error.status === 502 && /antena não conseguiu alcançar o Google News/.test(error.message)
    );
  });
});
