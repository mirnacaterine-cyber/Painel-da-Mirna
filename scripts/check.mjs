import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

const required = [
  "index.html",
  "styles.css",
  "app.js",
  "app-config.js",
  "db.js",
  "calendar.js",
  "server.js",
  "server/handlers.js",
  "server/local-store.js",
  "server/cloud-store.js",
  "server/feed-utils.js",
  "database/schema.sql",
  "vercel.json",
  "manifest.webmanifest",
  "sw.js"
];
for (const name of required) await access(path.join(root, name));

const [html, app, css, config, server, envExample] = await Promise.all([
  read("index.html"),
  read("app.js"),
  read("styles.css"),
  read("app-config.js"),
  read("server.js"),
  read(".env.example")
]);

const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const duplicateIds = [...html.matchAll(/\sid="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((id, index, all) => all.indexOf(id) !== index);
assert.deepEqual(duplicateIds, [], `IDs duplicados no HTML: ${duplicateIds.join(", ")}`);

const referencedIds = [...app.matchAll(/\$\("#([^"]+)"\)/g)].map((match) => match[1]);
const missingIds = referencedIds.filter((id) => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `IDs usados no JS e ausentes no HTML: ${missingIds.join(", ")}`);

for (const modulePath of [...app.matchAll(/from\s+"(\.\/[^\"]+)"/g)].map((match) => match[1])) {
  await access(path.resolve(root, modulePath));
}

assert.match(html, /Content-Security-Policy/);
assert.match(html, /noindex, nofollow/);
assert.match(html, /id="agenda"/);
assert.match(html, /id="arquivos"/);
assert.match(html, /id="noticias"/);
assert.match(app, /indexedDB|dashboard-state-v2/);
assert.match(server, /127\.0\.0\.1/);
assert.match(server, /createLocalStore/);
assert.match(config, /Marechal Cândido Rondon/);
assert.match(config, /Ballet & Dança/);
assert.match(config, /Ginástica Rítmica/);
assert.match(config, /Faculdade · Direito & Dança/);
assert.match(envExample, /PAINEL_API_TOKEN=/);

const openBraces = (css.match(/\{/g) || []).length;
const closeBraces = (css.match(/\}/g) || []).length;
assert.equal(openBraces, closeBraces, "CSS com chaves desequilibradas");

const jsonFiles = ["package.json", "vercel.json", "manifest.webmanifest"];
for (const name of jsonFiles) JSON.parse(await read(name));

const forbiddenPatterns = [
  /calendar\.google\.com\/calendar\/ical\/[^"]*\/private-[a-f0-9]{16,}/i,
  /BLOB_READ_WRITE_TOKEN\s*=\s*[^.\s][^\n]*/i,
  /PAINEL_API_TOKEN\s*=\s*(?!troque-por)[^\n]+/i,
  /sk-ant-[a-z0-9_-]{20,}/i
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "data"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(?:js|mjs|html|css|json|sql|md|example)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

for (const filename of await sourceFiles(root)) {
  if (path.resolve(filename) === fileURLToPath(import.meta.url)) continue;
  const content = await readFile(filename, "utf8");
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(content), false, `Possível credencial privada em ${path.relative(root, filename)}`);
  }
}

console.log(`✓ ${required.length} arquivos essenciais encontrados`);
console.log(`✓ ${referencedIds.length} referências de interface conferidas`);
console.log("✓ agenda, banco, arquivos, notícias, clima e personalização presentes");
console.log("✓ nenhuma credencial privada detectada nos arquivos de código");
