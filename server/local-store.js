import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const DESTINATION_IDS = new Set(["00", "01", "02", "03", "04", "05", "06", "07", "08", "99"]);

function cleanFilename(value) {
  const normalized = String(value || "arquivo")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 160);
  return normalized || "arquivo";
}

function rowToFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    destinationId: row.destination_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    note: row.note || "",
    createdAt: row.created_at,
    storage: "server"
  };
}

export async function createLocalStore(projectRoot) {
  const dataRoot = path.join(projectRoot, "data");
  const uploadRoot = path.join(dataRoot, "uploads");
  await mkdir(uploadRoot, { recursive: true });

  const database = new DatabaseSync(path.join(dataRoot, "painel.sqlite"));
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      client_updated_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      destination_id TEXT NOT NULL,
      name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS files_destination_idx ON files(destination_id);
    CREATE INDEX IF NOT EXISTS files_created_idx ON files(created_at DESC);
  `);

  const getStateStatement = database.prepare("SELECT id, payload, client_updated_at, updated_at FROM app_state WHERE id = ?");
  const putStateStatement = database.prepare(`
    INSERT INTO app_state (id, payload, client_updated_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      client_updated_at = excluded.client_updated_at,
      updated_at = excluded.updated_at
  `);
  const listFilesStatement = database.prepare("SELECT * FROM files ORDER BY created_at DESC");
  const getFileStatement = database.prepare("SELECT * FROM files WHERE id = ?");
  const putFileStatement = database.prepare(`
    INSERT INTO files (id, destination_id, name, storage_path, mime_type, size_bytes, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteFileStatement = database.prepare("DELETE FROM files WHERE id = ?");

  return {
    mode: "local-server",
    maxUploadBytes: 50 * 1024 * 1024,

    async getState(id) {
      const row = getStateStatement.get(id);
      if (!row) return null;
      return {
        id: row.id,
        payload: JSON.parse(row.payload),
        clientUpdatedAt: row.client_updated_at,
        updatedAt: row.updated_at
      };
    },

    async putState(id, payload, clientUpdatedAt) {
      const updatedAt = new Date().toISOString();
      putStateStatement.run(id, JSON.stringify(payload), clientUpdatedAt || null, updatedAt);
      return { id, payload, clientUpdatedAt: clientUpdatedAt || null, updatedAt };
    },

    async listFiles() {
      return listFilesStatement.all().map(rowToFile);
    },

    async saveFile({ id, destinationId, note, file }) {
      if (!DESTINATION_IDS.has(destinationId)) throw Object.assign(new Error("Destino de arquivo inválido."), { status: 400 });
      if (file.size > this.maxUploadBytes) throw Object.assign(new Error("O arquivo ultrapassa 50 MB, limite do servidor local."), { status: 413 });

      const destinationRoot = path.join(uploadRoot, destinationId);
      await mkdir(destinationRoot, { recursive: true });
      const storedName = `${id}-${cleanFilename(file.name)}`;
      const storagePath = path.join(destinationRoot, storedName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(storagePath, buffer, { flag: "wx" });
      const createdAt = new Date().toISOString();
      putFileStatement.run(
        id,
        destinationId,
        file.name,
        storagePath,
        file.type || "application/octet-stream",
        file.size,
        note || "",
        createdAt
      );
      return rowToFile(getFileStatement.get(id));
    },

    async getFile(id) {
      const row = getFileStatement.get(id);
      if (!row) return null;
      const body = await readFile(row.storage_path);
      return { metadata: rowToFile(row), body };
    },

    async deleteFile(id) {
      const row = getFileStatement.get(id);
      if (!row) return false;
      await rm(row.storage_path, { force: true });
      deleteFileStatement.run(id);
      return true;
    },

    close() {
      database.close();
    }
  };
}
