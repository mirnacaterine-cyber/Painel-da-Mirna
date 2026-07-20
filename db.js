const DB_NAME = "painel-da-mirna";
const DB_VERSION = 2;
const KV_STORE = "kv";
const FILE_STORE = "files";

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("Transação cancelada.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("Falha na transação.")), { once: true });
  });
}

export function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(KV_STORE)) {
          db.createObjectStore(KV_STORE, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(FILE_STORE)) {
          const files = db.createObjectStore(FILE_STORE, { keyPath: "id" });
          files.createIndex("destinationId", "destinationId", { unique: false });
          files.createIndex("createdAt", "createdAt", { unique: false });
        }
      });

      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Feche outras abas do Painel da Mirna e tente novamente.")), { once: true });
    });
  }

  return dbPromise;
}

export async function getValue(key, fallback = null) {
  const db = await openDatabase();
  const transaction = db.transaction(KV_STORE, "readonly");
  const result = await requestToPromise(transaction.objectStore(KV_STORE).get(key));
  await transactionDone(transaction);
  return result?.value ?? fallback;
}

export async function setValue(key, value) {
  const db = await openDatabase();
  const transaction = db.transaction(KV_STORE, "readwrite");
  transaction.objectStore(KV_STORE).put({ key, value, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
}

export async function deleteValue(key) {
  const db = await openDatabase();
  const transaction = db.transaction(KV_STORE, "readwrite");
  transaction.objectStore(KV_STORE).delete(key);
  await transactionDone(transaction);
}

export async function putLocalFile(fileRecord) {
  const db = await openDatabase();
  const transaction = db.transaction(FILE_STORE, "readwrite");
  transaction.objectStore(FILE_STORE).put(fileRecord);
  await transactionDone(transaction);
  return fileRecord;
}

export async function listLocalFiles() {
  const db = await openDatabase();
  const transaction = db.transaction(FILE_STORE, "readonly");
  const rows = await requestToPromise(transaction.objectStore(FILE_STORE).getAll());
  await transactionDone(transaction);
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getLocalFile(id) {
  const db = await openDatabase();
  const transaction = db.transaction(FILE_STORE, "readonly");
  const row = await requestToPromise(transaction.objectStore(FILE_STORE).get(id));
  await transactionDone(transaction);
  return row || null;
}

export async function deleteLocalFile(id) {
  const db = await openDatabase();
  const transaction = db.transaction(FILE_STORE, "readwrite");
  transaction.objectStore(FILE_STORE).delete(id);
  await transactionDone(transaction);
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
