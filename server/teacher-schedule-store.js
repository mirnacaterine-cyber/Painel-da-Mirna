let sqlClientPromise;
let schemaPromise;

function appError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value, max = 500, fallback = "") {
  return String(value ?? fallback).replace(/\r/g, "").trim().slice(0, max);
}

function optionalText(value, max = 500) {
  const normalized = text(value, max);
  return normalized || null;
}

function booleanValue(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "false" || value === 0) return false;
  if (value === "true" || value === 1) return true;
  return fallback;
}

function weekdayValue(value) {
  const weekday = Number(value);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw appError("Dia da semana inválido.");
  }
  return weekday;
}

function timeValue(value) {
  const normalized = text(value, 5);
  if (!normalized) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) throw appError("Horário inválido.");
  return normalized;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw appError("Banco Neon ainda não foi conectado ao projeto.", 503);
  if (!sqlClientPromise) {
    sqlClientPromise = import("@neondatabase/serverless").then(({ neon }) => neon(process.env.DATABASE_URL));
  }
  return sqlClientPromise;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = await getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_teacher_schedules (
          id TEXT PRIMARY KEY,
          group_id TEXT REFERENCES mirna_teacher_groups(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          weekday SMALLINT NOT NULL,
          start_time TEXT,
          end_time TEXT,
          location TEXT,
          objective TEXT,
          structure TEXT,
          music_url TEXT,
          materials TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          source TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_schedules_weekday_idx ON mirna_teacher_schedules(active, weekday, start_time)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_schedules_group_idx ON mirna_teacher_schedules(group_id)`;
    })();
  }
  return schemaPromise;
}

function normalize(row) {
  return {
    id: row.id,
    groupId: row.group_id || "",
    title: row.title,
    weekday: Number(row.weekday),
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    location: row.location || "",
    objective: row.objective || "",
    structure: row.structure || "",
    musicUrl: row.music_url || "",
    materials: row.materials || "",
    active: Boolean(row.active),
    source: row.source || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function scheduleData(data = {}) {
  const title = text(data.title, 160);
  if (!title) throw appError("Informe o nome da rotina.");
  const startTime = timeValue(data.startTime);
  const endTime = timeValue(data.endTime);
  if ((startTime && !endTime) || (!startTime && endTime)) {
    throw appError("Informe início e fim, ou deixe os dois horários vazios.");
  }
  return {
    groupId: optionalText(data.groupId, 120),
    title,
    weekday: weekdayValue(data.weekday),
    startTime,
    endTime,
    location: optionalText(data.location, 180),
    objective: optionalText(data.objective, 1200),
    structure: optionalText(data.structure, 5000),
    musicUrl: optionalText(data.musicUrl, 500),
    materials: optionalText(data.materials, 2000),
    active: booleanValue(data.active, true),
    source: optionalText(data.source, 80)
  };
}

export async function createTeacherScheduleStore() {
  await ensureSchema();
  const sql = await getSql();

  return {
    async list() {
      const rows = await sql`
        SELECT * FROM mirna_teacher_schedules
        ORDER BY active DESC, weekday ASC, start_time ASC NULLS LAST, title ASC
      `;
      return rows.map(normalize);
    },

    async create(id, input) {
      const data = scheduleData(input);
      const rows = await sql`
        INSERT INTO mirna_teacher_schedules (
          id, group_id, title, weekday, start_time, end_time, location,
          objective, structure, music_url, materials, active, source, created_at, updated_at
        ) VALUES (
          ${id}, ${data.groupId}, ${data.title}, ${data.weekday}, ${data.startTime}, ${data.endTime},
          ${data.location}, ${data.objective}, ${data.structure}, ${data.musicUrl}, ${data.materials},
          ${data.active}, ${data.source}, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          group_id=EXCLUDED.group_id,
          title=EXCLUDED.title,
          weekday=EXCLUDED.weekday,
          start_time=EXCLUDED.start_time,
          end_time=EXCLUDED.end_time,
          location=EXCLUDED.location,
          objective=EXCLUDED.objective,
          structure=EXCLUDED.structure,
          music_url=EXCLUDED.music_url,
          materials=EXCLUDED.materials,
          active=EXCLUDED.active,
          source=EXCLUDED.source,
          updated_at=NOW()
        RETURNING *
      `;
      return normalize(rows[0]);
    },

    async update(id, input) {
      const data = scheduleData(input);
      const rows = await sql`
        UPDATE mirna_teacher_schedules SET
          group_id=${data.groupId}, title=${data.title}, weekday=${data.weekday},
          start_time=${data.startTime}, end_time=${data.endTime}, location=${data.location},
          objective=${data.objective}, structure=${data.structure}, music_url=${data.musicUrl},
          materials=${data.materials}, active=${data.active}, source=${data.source}, updated_at=NOW()
        WHERE id=${id}
        RETURNING *
      `;
      return rows[0] ? normalize(rows[0]) : null;
    },

    async remove(id) {
      const rows = await sql`DELETE FROM mirna_teacher_schedules WHERE id=${id} RETURNING id`;
      return Boolean(rows[0]);
    }
  };
}
