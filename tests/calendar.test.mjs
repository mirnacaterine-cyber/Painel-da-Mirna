import test from "node:test";
import assert from "node:assert/strict";
import { buildGoogleCalendarUrl, parseIcs } from "../calendar.js";

const RANGE_START = new Date("2026-07-20T00:00:00-03:00");
const RANGE_END = new Date("2026-08-10T23:59:59-03:00");

function parse(body) {
  return parseIcs(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`, {
    timeZone: "America/Sao_Paulo",
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END
  });
}

test("interpreta UTC, TZID, dia inteiro e line unfolding", () => {
  const result = parse([
    "BEGIN:VEVENT",
    "UID:tz-event",
    "DTSTART;TZID=America/Sao_Paulo:20260721T083000",
    "DTEND;TZID=America/Sao_Paulo:20260721T100000",
    "SUMMARY:Estudo de Direito — UNIOESTE",
    "DESCRIPTION:Bloco protegido para revisar",
    " prazos e avisos.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:utc-event",
    "DTSTART:20260722T150000Z",
    "DTEND:20260722T160000Z",
    "SUMMARY:Aula de Ballet",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:all-day",
    "DTSTART;VALUE=DATE:20260723",
    "DTEND;VALUE=DATE:20260724",
    "SUMMARY:Festival de Dança",
    "END:VEVENT"
  ].join("\r\n"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.totalBlocks, 3);
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].start.toISOString(), "2026-07-21T11:30:00.000Z");
  assert.equal(result.events[0].description, "Bloco protegido para revisarprazos e avisos.");
  assert.equal(result.events[1].start.toISOString(), "2026-07-22T15:00:00.000Z");
  assert.equal(result.events[2].allDay, true);
  assert.equal(result.events[2].title, "Festival de Dança");
});

test("expande recorrência semanal com BYDAY, COUNT e EXDATE", () => {
  const result = parse([
    "BEGIN:VEVENT",
    "UID:gr-aulas",
    "DTSTART;TZID=America/Sao_Paulo:20260721T110000",
    "DTEND;TZID=America/Sao_Paulo:20260721T120000",
    "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6",
    "EXDATE;TZID=America/Sao_Paulo:20260728T110000",
    "SUMMARY:GR e Ballet",
    "END:VEVENT"
  ].join("\r\n"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.events.length, 5);
  assert.deepEqual(
    result.events.map((event) => event.start.toISOString()),
    [
      "2026-07-21T14:00:00.000Z",
      "2026-07-23T14:00:00.000Z",
      "2026-07-30T14:00:00.000Z",
      "2026-08-04T14:00:00.000Z",
      "2026-08-06T14:00:00.000Z"
    ]
  );
});

test("expande recorrência mensal e respeita UNTIL", () => {
  const result = parse([
    "BEGIN:VEVENT",
    "UID:mensal",
    "DTSTART;TZID=America/Sao_Paulo:20260731T090000",
    "DTEND;TZID=America/Sao_Paulo:20260731T100000",
    "RRULE:FREQ=MONTHLY;UNTIL=20260930T235959Z",
    "SUMMARY:Planejamento da escola de ballet",
    "END:VEVENT"
  ].join("\r\n"));

  assert.equal(result.events.length, 1, "a janela de teste termina antes da segunda ocorrência");
  assert.equal(result.events[0].title, "Planejamento da escola de ballet");
});

test("gera URL preenchida do Google Agenda sem expor credenciais", () => {
  const url = new URL(buildGoogleCalendarUrl({
    title: "Aula de Ballet — avançado",
    start: "2026-07-25T13:00:00-03:00",
    end: "2026-07-25T14:30:00-03:00",
    allDay: false,
    location: "Martin Luther",
    description: "Separar músicas e materiais"
  }));

  assert.equal(url.hostname, "calendar.google.com");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Aula de Ballet — avançado");
  assert.equal(url.searchParams.get("ctz"), "America/Sao_Paulo");
  assert.equal(url.searchParams.get("location"), "Martin Luther");
});
