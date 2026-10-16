// Демо-режим: сервер на вымышленных кандидатах, без ключа GigaChat и без .env.
// Реальный candidates.json не открывается и не изменяется:
// первый запуск копирует demo/candidates.demo.json в demo/candidates.local.json (в .gitignore).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEMO_SRC = path.join(ROOT, "demo", "candidates.demo.json");
const DEMO_LOCAL = path.join(ROOT, "demo", "candidates.local.json");

if (!process.env.CANDIDATES_FILE) {
  if (!fs.existsSync(DEMO_LOCAL)) fs.copyFileSync(DEMO_SRC, DEMO_LOCAL);
  process.env.CANDIDATES_FILE = DEMO_LOCAL;
}
process.env.APP_TOKEN = "demo-token";

const PORT = Number(process.env.PORT) || 3000;
console.log("[demo] база:", path.relative(ROOT, process.env.CANDIDATES_FILE));
console.log("[demo] токен: demo-token");
console.log("[demo] http://localhost:" + PORT + "/?token=demo-token");

require("./server.js");
