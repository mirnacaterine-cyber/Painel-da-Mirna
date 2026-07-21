const DESTINATION_IDS = new Set(["00", "01", "02", "03", "04", "05", "06", "07", "08", "99"]);
let sqlClientPromise;
let schemaPromise;

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

function safeDisplayName(value) {
  return String(value || "arquivo").replace(/[\r\n]/g, " ").trim().slice(0, 180) || "arquivo";
}

async function getSql() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("Banco Neon ainda não foi conectado ao projeto."), { status: 503 });
  }
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
        CREATE TABLE IF NOT EXISTS mirna_app_state (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          client_updated_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS mirna_files (
          id TEXT PRIMARY KEY,
          destination_id TEXT NOT NULL,
          name TEXT NOT NULL,
          blob_pathname TEXT NOT NULL,
          blob_url TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`ALTER TABLE mirna_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_files_destination_idx ON mirna_files(destination_id)`;
      await sql`CREATE INDEX IF NOT EXISTS mirna_files_created_idx ON mirna_files(created_at DESC)`;
    })();
  }
  return schemaPromise;
}

function normalizeFileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    destinationId: row.destination_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    note: row.note || "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at || row.created_at).toISOString(),
    storage: "server"
  };
}

export async function createCloudStore() {
  await ensureSchema();
  const sql = await getSql();

  return {
    mode: "vercel",
    maxUploadBytes: 4 * 1024 * 1024,

    async getState(id) {
      const rows = await sql`
        SELECT id, payload, client_updated_at, updated_at
        FROM mirna_app_state
        WHERE id = ${id}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        payload: row.payload,
        clientUpdatedAt: row.client_updated_at ? new Date(row.client_updated_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString()
      };
    },

    async putState(id, payload, clientUpdatedAt) {
      const serialized = JSON.stringify(payload);
      const rows = await sql`
        INSERT INTO mirna_app_state (id, payload, client_updated_at, updated_at)
        VALUES (${id}, CAST(${serialized} AS jsonb), ${clientUpdatedAt || null}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          client_updated_at = EXCLUDED.client_updated_at,
          updated_at = NOW()
        RETURNING id, payload, client_updated_at, updated_at
      `;
      const row = rows[0];
      return {
        id: row.id,
        payload: row.payload,
        clientUpdatedAt: row.client_updated_at ? new Date(row.client_updated_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString()
      };
    },

    async listFiles() {
      const rows = await sql`
        SELECT id, destination_id, name, mime_type, size_bytes, note, created_at, updated_at
        FROM mirna_files
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 500
      `;
      return rows.map(normalizeFileRow);
    },

    async saveFile({ id, destinationId, note, file }) {
      if (!DESTINATION_IDS.has(destinationId)) {
        throw Object.assign(new Error("Destino de arquivo inválido."), { status: 400 });
      }
      if (file.size > this.maxUploadBytes) {
        throw Object.assign(new Error("Na nuvem, esta versão aceita arquivos de até 4 MB. Arquivos maiores continuam disponíveis no banco local."), { status: 413 });
      }

      let blobSdk;
      try {
        blobSdk = await import("@vercel/blob");
      } catch {
        throw Object.assign(new Error("Vercel Blob ainda não foi conectado ao projeto."), { status: 503 });
      }

      const datePrefix = new Date().toISOString().slice(0, 7);
      const pathname = `mirna/${destinationId}/${datePrefix}/${id}-${cleanFilename(file.name)}`;
      const blob = await blobSdk.put(pathname, file, {
        access: "private",
        addRandomSuffix: false
      });
      const rows = await sql`
        INSERT INTO mirna_files (
          id, destination_id, name, blob_pathname, blob_url, mime_type,
          size_bytes, note, created_at, updated_at
        )
        VALUES (
          ${id}, ${destinationId}, ${safeDisplayName(file.name)}, ${blob.pathname}, ${blob.url},
          ${file.type || "application/octet-stream"}, ${file.size}, ${String(note || "").slice(0, 180)}, NOW(), NOW()
        )
        RETURNING id, destination_id, name, mime_type, size_bytes, note, created_at, updated_at
      `;
      return normalizeFileRow(rows[0]);
    },

    async updateFile(id, { destinationId, name, note }) {
      if (!DESTINATION_IDS.has(destinationId)) {
        throw Object.assign(new Error("Destino de arquivo inválido."), { status: 400 });
      }
      const rows = await sql`
        UPDATE mirna_files
        SET
          destination_id = ${destinationId},
          name = ${safeDisplayName(name)},
          note = ${String(note || "").slice(0, 180)},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, destination_id, name, mime_type, size_bytes, note, created_at, updated_at
      `;
      return normalizeFileRow(rows[0]);
    },

    async getFile(id) {
      const rows = await sql`
        SELECT id, destination_id, name, blob_pathname, mime_type, size_bytes, note, created_at, updated_at
        FROM mirna_files
        WHERE id = ${id}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      const { get } = await import("@vercel/blob");
      const result = await get(row.blob_pathname, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return {
        metadata: normalizeFileRow(row),
        body: result.stream,
        etag: result.blob?.etag || null
      };
    },

    async deleteFile(id) {
      const rows = await sql`SELECT blob_pathname FROM mirna_files WHERE id = ${id} LIMIT 1`;
      const row = rows[0];
      if (!row) return false;
      const { del } = await import("@vercel/blob");
      await del(row.blob_pathname);
      await sql`DELETE FROM mirna_files WHERE id = ${id}`;
      return true;
    }
  };
}