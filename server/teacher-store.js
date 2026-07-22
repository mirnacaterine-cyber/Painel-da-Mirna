let sqlClientPromise;
let schemaPromise;

const RESOURCE_NAMES = new Set(["groups", "students", "lessons", "attendance", "observations"]);
const ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);
const LESSON_STATUSES = new Set(["draft", "planned", "completed", "cancelled"]);

function appError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value, max = 500, fallback = "") {
  const normalized = String(value ?? fallback).replace(/\r/g, "").trim();
  return normalized.slice(0, max);
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

function dateValue(value) {
  const normalized = text(value, 10);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw appError("Data inválida.");
  return normalized;
}

function timeValue(value) {
  const normalized = text(value, 5);
  if (!normalized) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) throw appError("Horário inválido.");
  return normalized;
}

function colorValue(value) {
  const normalized = text(value, 7, "#8f5f72");
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#8f5f72";
}

function idValue(value, label = "Registro") {
  const normalized = text(value, 120);
  if (!normalized) throw appError(`${label} não informado.`);
  return normalized;
}

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
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
        CREATE TABLE IF NOT EXISTS mirna_teacher_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          level TEXT,
          age_group TEXT,
          location TEXT,
          weekday SMALLINT,
          start_time TEXT,
          end_time TEXT,
          color TEXT NOT NULL DEFAULT '#8f5f72',
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_teacher_students (
          id TEXT PRIMARY KEY,
          group_id TEXT REFERENCES mirna_teacher_groups(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          birth_date DATE,
          guardian_name TEXT,
          guardian_contact TEXT,
          focus TEXT,
          notes TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_teacher_lessons (
          id TEXT PRIMARY KEY,
          group_id TEXT REFERENCES mirna_teacher_groups(id) ON DELETE SET NULL,
          calendar_event_id TEXT,
          title TEXT NOT NULL,
          lesson_date DATE NOT NULL,
          start_time TEXT,
          end_time TEXT,
          objective TEXT,
          structure TEXT,
          music_url TEXT,
          materials TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          post_notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_teacher_attendance (
          id TEXT PRIMARY KEY,
          lesson_id TEXT NOT NULL REFERENCES mirna_teacher_lessons(id) ON DELETE CASCADE,
          student_id TEXT NOT NULL REFERENCES mirna_teacher_students(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'present',
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (lesson_id, student_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_teacher_observations (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL REFERENCES mirna_teacher_students(id) ON DELETE CASCADE,
          lesson_id TEXT REFERENCES mirna_teacher_lessons(id) ON DELETE SET NULL,
          category TEXT,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_students_group_idx ON mirna_teacher_students(group_id)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_lessons_date_idx ON mirna_teacher_lessons(lesson_date, start_time)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_lessons_group_idx ON mirna_teacher_lessons(group_id)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_attendance_lesson_idx ON mirna_teacher_attendance(lesson_id)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_teacher_observations_student_idx ON mirna_teacher_observations(student_id, created_at DESC)`;
    })();
  }
  return schemaPromise;
}

function normalizeGroup(row) {
  return {
    id: row.id,
    name: row.name,
    level: row.level || "",
    ageGroup: row.age_group || "",
    location: row.location || "",
    weekday: row.weekday == null ? null : Number(row.weekday),
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    color: row.color || "#8f5f72",
    active: Boolean(row.active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeStudent(row) {
  return {
    id: row.id,
    groupId: row.group_id || "",
    name: row.name,
    birthDate: dateOnly(row.birth_date),
    guardianName: row.guardian_name || "",
    guardianContact: row.guardian_contact || "",
    focus: row.focus || "",
    notes: row.notes || "",
    active: Boolean(row.active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeLesson(row) {
  return {
    id: row.id,
    groupId: row.group_id || "",
    calendarEventId: row.calendar_event_id || "",
    title: row.title,
    date: dateOnly(row.lesson_date),
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    objective: row.objective || "",
    structure: row.structure || "",
    musicUrl: row.music_url || "",
    materials: row.materials || "",
    status: row.status || "draft",
    postNotes: row.post_notes || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeAttendance(row) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    status: row.status || "present",
    note: row.note || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeObservation(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    lessonId: row.lesson_id || "",
    category: row.category || "",
    content: row.content,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function normalizeResource(resource, row) {
  if (resource === "groups") return normalizeGroup(row);
  if (resource === "students") return normalizeStudent(row);
  if (resource === "lessons") return normalizeLesson(row);
  if (resource === "attendance") return normalizeAttendance(row);
  if (resource === "observations") return normalizeObservation(row);
  return row;
}

function validateResource(resource) {
  if (!RESOURCE_NAMES.has(resource)) throw appError("Recurso da professora inválido.");
  return resource;
}

function groupData(data = {}) {
  const name = text(data.name, 120);
  if (!name) throw appError("Informe o nome da turma.");
  const weekday = data.weekday === "" || data.weekday == null ? null : Number(data.weekday);
  if (weekday != null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw appError("Dia da semana inválido.");
  return {
    name,
    level: optionalText(data.level, 100),
    ageGroup: optionalText(data.ageGroup, 100),
    location: optionalText(data.location, 160),
    weekday,
    startTime: timeValue(data.startTime),
    endTime: timeValue(data.endTime),
    color: colorValue(data.color),
    active: booleanValue(data.active, true)
  };
}

function studentData(data = {}) {
  const name = text(data.name, 120);
  if (!name) throw appError("Informe o nome da aluna.");
  return {
    groupId: optionalText(data.groupId, 120),
    name,
    birthDate: dateValue(data.birthDate),
    guardianName: optionalText(data.guardianName, 140),
    guardianContact: optionalText(data.guardianContact, 180),
    focus: optionalText(data.focus, 500),
    notes: optionalText(data.notes, 3000),
    active: booleanValue(data.active, true)
  };
}

function lessonData(data = {}) {
  const title = text(data.title, 160);
  const date = dateValue(data.date);
  if (!title) throw appError("Informe o título da aula.");
  if (!date) throw appError("Informe a data da aula.");
  const status = text(data.status, 20, "draft");
  if (!LESSON_STATUSES.has(status)) throw appError("Estado da aula inválido.");
  return {
    groupId: optionalText(data.groupId, 120),
    calendarEventId: optionalText(data.calendarEventId, 180),
    title,
    date,
    startTime: timeValue(data.startTime),
    endTime: timeValue(data.endTime),
    objective: optionalText(data.objective, 1200),
    structure: optionalText(data.structure, 5000),
    musicUrl: optionalText(data.musicUrl, 500),
    materials: optionalText(data.materials, 2000),
    status,
    postNotes: optionalText(data.postNotes, 5000)
  };
}

function attendanceData(data = {}) {
  const lessonId = idValue(data.lessonId, "Aula");
  const studentId = idValue(data.studentId, "Aluna");
  const status = text(data.status, 20, "present");
  if (!ATTENDANCE_STATUSES.has(status)) throw appError("Estado de presença inválido.");
  return { lessonId, studentId, status, note: optionalText(data.note, 500) };
}

function observationData(data = {}) {
  const studentId = idValue(data.studentId, "Aluna");
  const content = text(data.content, 4000);
  if (!content) throw appError("Escreva a observação.");
  return {
    studentId,
    lessonId: optionalText(data.lessonId, 120),
    category: optionalText(data.category, 80),
    content
  };
}

export async function createTeacherStore() {
  await ensureSchema();
  const sql = await getSql();

  return {
    async snapshot() {
      const [groups, students, lessons, attendance, observations] = await Promise.all([
        sql`SELECT * FROM mirna_teacher_groups ORDER BY active DESC, name ASC`,
        sql`SELECT * FROM mirna_teacher_students ORDER BY active DESC, name ASC`,
        sql`SELECT * FROM mirna_teacher_lessons ORDER BY lesson_date DESC, start_time ASC, created_at DESC LIMIT 1000`,
        sql`SELECT * FROM mirna_teacher_attendance ORDER BY updated_at DESC LIMIT 5000`,
        sql`SELECT * FROM mirna_teacher_observations ORDER BY created_at DESC LIMIT 3000`
      ]);
      return {
        groups: groups.map(normalizeGroup),
        students: students.map(normalizeStudent),
        lessons: lessons.map(normalizeLesson),
        attendance: attendance.map(normalizeAttendance),
        observations: observations.map(normalizeObservation),
        syncedAt: new Date().toISOString()
      };
    },

    async create(resource, id, input) {
      validateResource(resource);
      if (resource === "groups") {
        const data = groupData(input);
        const rows = await sql`
          INSERT INTO mirna_teacher_groups (id,name,level,age_group,location,weekday,start_time,end_time,color,active,created_at,updated_at)
          VALUES (${id},${data.name},${data.level},${data.ageGroup},${data.location},${data.weekday},${data.startTime},${data.endTime},${data.color},${data.active},NOW(),NOW())
          RETURNING *
        `;
        return normalizeGroup(rows[0]);
      }
      if (resource === "students") {
        const data = studentData(input);
        const rows = await sql`
          INSERT INTO mirna_teacher_students (id,group_id,name,birth_date,guardian_name,guardian_contact,focus,notes,active,created_at,updated_at)
          VALUES (${id},${data.groupId},${data.name},${data.birthDate},${data.guardianName},${data.guardianContact},${data.focus},${data.notes},${data.active},NOW(),NOW())
          RETURNING *
        `;
        return normalizeStudent(rows[0]);
      }
      if (resource === "lessons") {
        const data = lessonData(input);
        const rows = await sql`
          INSERT INTO mirna_teacher_lessons (id,group_id,calendar_event_id,title,lesson_date,start_time,end_time,objective,structure,music_url,materials,status,post_notes,created_at,updated_at)
          VALUES (${id},${data.groupId},${data.calendarEventId},${data.title},${data.date},${data.startTime},${data.endTime},${data.objective},${data.structure},${data.musicUrl},${data.materials},${data.status},${data.postNotes},NOW(),NOW())
          RETURNING *
        `;
        return normalizeLesson(rows[0]);
      }
      if (resource === "attendance") {
        const data = attendanceData(input);
        const rows = await sql`
          INSERT INTO mirna_teacher_attendance (id,lesson_id,student_id,status,note,created_at,updated_at)
          VALUES (${id},${data.lessonId},${data.studentId},${data.status},${data.note},NOW(),NOW())
          ON CONFLICT (lesson_id,student_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,updated_at=NOW()
          RETURNING *
        `;
        return normalizeAttendance(rows[0]);
      }
      const data = observationData(input);
      const rows = await sql`
        INSERT INTO mirna_teacher_observations (id,student_id,lesson_id,category,content,created_at,updated_at)
        VALUES (${id},${data.studentId},${data.lessonId},${data.category},${data.content},NOW(),NOW())
        RETURNING *
      `;
      return normalizeObservation(rows[0]);
    },

    async update(resource, id, input) {
      validateResource(resource);
      idValue(id);
      if (resource === "groups") {
        const data = groupData(input);
        const rows = await sql`
          UPDATE mirna_teacher_groups SET name=${data.name},level=${data.level},age_group=${data.ageGroup},location=${data.location},weekday=${data.weekday},start_time=${data.startTime},end_time=${data.endTime},color=${data.color},active=${data.active},updated_at=NOW()
          WHERE id=${id} RETURNING *
        `;
        return rows[0] ? normalizeGroup(rows[0]) : null;
      }
      if (resource === "students") {
        const data = studentData(input);
        const rows = await sql`
          UPDATE mirna_teacher_students SET group_id=${data.groupId},name=${data.name},birth_date=${data.birthDate},guardian_name=${data.guardianName},guardian_contact=${data.guardianContact},focus=${data.focus},notes=${data.notes},active=${data.active},updated_at=NOW()
          WHERE id=${id} RETURNING *
        `;
        return rows[0] ? normalizeStudent(rows[0]) : null;
      }
      if (resource === "lessons") {
        const data = lessonData(input);
        const rows = await sql`
          UPDATE mirna_teacher_lessons SET group_id=${data.groupId},calendar_event_id=${data.calendarEventId},title=${data.title},lesson_date=${data.date},start_time=${data.startTime},end_time=${data.endTime},objective=${data.objective},structure=${data.structure},music_url=${data.musicUrl},materials=${data.materials},status=${data.status},post_notes=${data.postNotes},updated_at=NOW()
          WHERE id=${id} RETURNING *
        `;
        return rows[0] ? normalizeLesson(rows[0]) : null;
      }
      if (resource === "attendance") {
        const data = attendanceData(input);
        const rows = await sql`
          UPDATE mirna_teacher_attendance SET lesson_id=${data.lessonId},student_id=${data.studentId},status=${data.status},note=${data.note},updated_at=NOW()
          WHERE id=${id} RETURNING *
        `;
        return rows[0] ? normalizeAttendance(rows[0]) : null;
      }
      const data = observationData(input);
      const rows = await sql`
        UPDATE mirna_teacher_observations SET student_id=${data.studentId},lesson_id=${data.lessonId},category=${data.category},content=${data.content},updated_at=NOW()
        WHERE id=${id} RETURNING *
      `;
      return rows[0] ? normalizeObservation(rows[0]) : null;
    },

    async remove(resource, id) {
      validateResource(resource);
      idValue(id);
      let rows;
      if (resource === "groups") rows = await sql`DELETE FROM mirna_teacher_groups WHERE id=${id} RETURNING id`;
      else if (resource === "students") rows = await sql`DELETE FROM mirna_teacher_students WHERE id=${id} RETURNING id`;
      else if (resource === "lessons") rows = await sql`DELETE FROM mirna_teacher_lessons WHERE id=${id} RETURNING id`;
      else if (resource === "attendance") rows = await sql`DELETE FROM mirna_teacher_attendance WHERE id=${id} RETURNING id`;
      else rows = await sql`DELETE FROM mirna_teacher_observations WHERE id=${id} RETURNING id`;
      return Boolean(rows[0]);
    },

    normalizeResource
  };
}
