import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalStore } from "../server/local-store.js";

test("SQLite salva estado e arquivos nos destinos da Mirna", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "painel-mirna-"));
  const store = await createLocalStore(root);
  try {
    const payload = {
      updatedAt: "2026-07-20T12:00:00.000Z",
      inbox: [{ id: "n1", text: "Separar músicas da aula", done: false }]
    };
    await store.putState("mirna-dashboard", payload, payload.updatedAt);
    const storedState = await store.getState("mirna-dashboard");
    assert.deepEqual(storedState.payload, payload);

    const file = new File(["material da aula"], "planejamento-ballet.txt", { type: "text/plain" });
    const saved = await store.saveFile({
      id: "file-1",
      destinationId: "01",
      note: "Aula da turma avançada",
      file
    });
    assert.equal(saved.destinationId, "01");
    assert.equal(saved.sizeBytes, file.size);

    const list = await store.listFiles();
    assert.equal(list.length, 1);
    const downloaded = await store.getFile("file-1");
    assert.equal(downloaded.body.toString("utf8"), "material da aula");
    assert.equal(await store.deleteFile("file-1"), true);
    assert.equal((await store.listFiles()).length, 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("SQLite recusa destino inexistente", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "painel-mirna-"));
  const store = await createLocalStore(root);
  try {
    const file = new File(["x"], "x.txt", { type: "text/plain" });
    await assert.rejects(
      () => store.saveFile({ id: "file-x", destinationId: "66", note: "", file }),
      (error) => error.status === 400 && /Destino/.test(error.message)
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
