// Проверка строки 9 аудита: наружу уходит обобщённый {"error":"extract failed"},
// детали ошибки GigaChat — только в серверный лог.
// Сервер поднимается с GIGACHAT_OAUTH_URL=https://127.0.0.1:9/oauth —
// соединение отклоняется мгновенно, внешних запросов нет.
require("dotenv").config();
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.TEST_PORT) || 3211;
const BASE = "http://127.0.0.1:" + PORT;
const TEST_DB = path.join(__dirname, "candidates-error502-test.json");

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function waitHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

(async () => {
  if (!(await portFree(PORT))) {
    throw new Error("порт " + PORT + " занят посторонним процессом");
  }
  try { fs.unlinkSync(TEST_DB); } catch {}

  let log = "";
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      CANDIDATES_FILE: TEST_DB,
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || "1000",
      GIGACHAT_OAUTH_URL: "https://127.0.0.1:9/oauth",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (c) => (log += c));
  child.stderr.on("data", (c) => (log += c));

  if (!(await waitHealth())) {
    child.kill();
    throw new Error("тест-сервер не поднялся на порту " + PORT);
  }

  let status = 0;
  let raw = "";
  try {
    const res = await fetch(BASE + "/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Иванов Иван, 5 лет опыта" }),
    });
    status = res.status;
    raw = await res.text();
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + ".tmp"); } catch {}
  }

  ok("POST /api/extract (обрыв OAuth) -> 502", status === 502, status);

  let body = null;
  try { body = JSON.parse(raw); } catch {}
  ok("тело: {\"error\":\"extract failed\"}", body && body.error === "extract failed", raw);

  const leaked = raw.match(/oauth failed|ECONNREFUSED|error_description|connect |HTTP \d|127\.0\.0\.1/gi);
  ok("наружу не утекают детали (oauth failed/ECONNREFUSED/error_description/HTTP)", !leaked, leaked && raw);

  ok(
    "детали видны в серверном логе (ECONNREFUSED)",
    /ECONNREFUSED|oauth failed/.test(log),
    log.slice(-300)
  );

  ok("temp-база удалена", !fs.existsSync(TEST_DB));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
