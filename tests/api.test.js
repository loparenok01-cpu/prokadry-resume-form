// API-тесты хранилища кандидатов.
// Запускает выделенный экземпляр сервера: порт TEST_PORT (3210),
// временная база tests/candidates-api-test.json (в git не попадает) — реальный
// candidates.json не изменяется (проверяется хэшем до/после).
// Перед завершением сервер останавливается, временные файлы удаляются.
require("dotenv").config();
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.TEST_PORT) || 3210;
const BASE = "http://127.0.0.1:" + PORT;
const TEST_DB = path.join(__dirname, "candidates-api-test.json");
const REAL_DB = path.join(ROOT, "candidates.json");

let pass = 0;
let fail = 0;

const H = { "Content-Type": "application/json" };
if (process.env.APP_TOKEN) H.Authorization = "Bearer " + process.env.APP_TOKEN;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function sha(p) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

function startServer() {
  return spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      CANDIDATES_FILE: TEST_DB,
      // изоляция от возможного tokens.json в репозитории — только APP_TOKEN
      TOKENS_FILE: path.join(__dirname, "tokens-none.json"),
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || "1000",
    },
    stdio: "ignore",
  });
}

async function waitHealth(child, base = BASE) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return "exit:" + child.exitCode;
    try {
      const r = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return "ok";
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return "timeout";
}

async function run() {
  if (!(await portFree(PORT))) {
    throw new Error("порт " + PORT + " занят посторонним процессом");
  }
  const realBefore = sha(REAL_DB);
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + ".tmp"); } catch {}

  const child = startServer();
  const health = await waitHealth(child);
  if (health !== "ok") throw new Error("тест-сервер не поднялся: " + health);

  try {
    // 0. Авторизация
    const noAuth = await fetch(BASE + "/api/candidates");
    ok("GET без токена -> 401", noAuth.status === 401, noAuth.status);
    const badAuth = await fetch(BASE + "/api/candidates", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    ok("GET с неверным токеном -> 401", badAuth.status === 401, badAuth.status);

    // 1. Создание
    const created = await fetch(BASE + "/api/candidates", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        rawText: "Тест Тестов\nТелефон: +7 900 000-00-00",
        structured: { name: "Тест Тестов", skills: "тестирование" },
      }),
    });
    ok("POST создание -> 201", created.status === 201, created.status);
    const item = await created.json();
    ok("есть id и createdAt", Boolean(item.id && item.createdAt), item);

    // 2. Пустой rawText -> 400
    const bad = await fetch(BASE + "/api/candidates", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ rawText: "  " }),
    });
    ok("POST пустой -> 400", bad.status === 400, bad.status);

    // 3. Список
    const listRes = await fetch(BASE + "/api/candidates", { headers: H });
    const list = await listRes.json();
    ok("GET список -> массив", listRes.ok && Array.isArray(list), typeof list);
    ok("созданная запись в списке", list.some((c) => c.id === item.id));

    // 4. Поиск
    const found = await (
      await fetch(BASE + "/api/candidates?q=" + encodeURIComponent("Тест Тестов"), {
        headers: H,
      })
    ).json();
    ok("поиск по имени находит", Array.isArray(found) && found.some((c) => c.id === item.id));
    const missing = await (
      await fetch(BASE + "/api/candidates?q=" + encodeURIComponent("НесуществующийXYZ"), {
        headers: H,
      })
    ).json();
    ok("пустой поиск -> []", Array.isArray(missing) && missing.length === 0, missing.length);

    // 5. Редактирование
    const put = await fetch(BASE + "/api/candidates/" + item.id, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({
        rawText: "Тест Тестов (обновлён)",
        structured: { name: "Тест Тестов", salary: "100000" },
      }),
    });
    const updated = await put.json();
    ok("PUT -> 200", put.status === 200, put.status);
    ok("rawText обновлён", updated.rawText === "Тест Тестов (обновлён)", updated.rawText);
    ok("salary обновлён", updated.structured.salary === "100000", updated.structured);

    // 6. 404 для несуществующего id
    const put404 = await fetch(BASE + "/api/candidates/no-such-id", {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ rawText: "x" }),
    });
    ok("PUT несуществующий -> 404", put404.status === 404, put404.status);

    // 7. Удаление
    const del = await fetch(BASE + "/api/candidates/" + item.id, {
      method: "DELETE",
      headers: H,
    });
    ok("DELETE -> 200", del.status === 200, del.status);
    const after = await (
      await fetch(BASE + "/api/candidates", { headers: H })
    ).json();
    ok("записи больше нет", !after.some((c) => c.id === item.id));
    const delAgain = await fetch(BASE + "/api/candidates/" + item.id, {
      method: "DELETE",
      headers: H,
    });
    ok("повторный DELETE -> 404", delAgain.status === 404, delAgain.status);

    // 8. Публичная отправка без токена (для кандидатов)
    const pub = await fetch(BASE + "/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Публичный Тест" }),
    });
    ok("POST без токена -> 201 (форма открыта)", pub.status === 201, pub.status);
    const pubItem = await pub.json();
    await fetch(BASE + "/api/candidates/" + pubItem.id, {
      method: "DELETE",
      headers: H,
    });
    // 9. Security-заголовки, cap длины q, CSP (строка 14 аудита)
    const rootRes = await fetch(BASE + "/");
    ok(
      "GET / -> X-Content-Type-Options: nosniff",
      rootRes.headers.get("x-content-type-options") === "nosniff",
      rootRes.headers.get("x-content-type-options")
    );
    ok(
      "GET / -> X-Frame-Options: DENY",
      rootRes.headers.get("x-frame-options") === "DENY",
      rootRes.headers.get("x-frame-options")
    );
    ok(
      "GET / -> без X-Powered-By",
      !rootRes.headers.get("x-powered-by"),
      rootRes.headers.get("x-powered-by")
    );
    ok(
      "GET / -> есть Referrer-Policy",
      Boolean(rootRes.headers.get("referrer-policy")),
      rootRes.headers.get("referrer-policy")
    );
    ok(
      "GET / -> CSP включён",
      Boolean(rootRes.headers.get("content-security-policy")),
      rootRes.headers.get("content-security-policy")
    );
    ok(
      "GET / -> HSTS не добавляется на http",
      !rootRes.headers.get("strict-transport-security"),
      rootRes.headers.get("strict-transport-security")
    );
    const fwd = await fetch(BASE + "/api/health", {
      headers: { "x-forwarded-proto": "https" },
    });
    ok(
      "X-Forwarded-Proto: https -> HSTS",
      Boolean(fwd.headers.get("strict-transport-security")),
      fwd.headers.get("strict-transport-security")
    );
    const presRes = await fetch(BASE + "/presentation");
    ok(
      "GET /presentation -> без CSP (инлайн-код)",
      presRes.ok && !presRes.headers.get("content-security-policy"),
      { status: presRes.status, csp: presRes.headers.get("content-security-policy") }
    );
    const longQ = await fetch(
      BASE + "/api/candidates?q=" + encodeURIComponent("x".repeat(301)),
      { headers: H }
    );
    ok("q длинее 200 -> 400", longQ.status === 400, longQ.status);
    const okQ = await fetch(
      BASE + "/api/candidates?q=" + encodeURIComponent("Тест"),
      { headers: H }
    );
    ok("q в пределах лимита работает", okQ.status === 200, okQ.status);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + ".tmp"); } catch {}
  }

  // 10. Изоляция: прод-база не тронута
  const realAfter = sha(REAL_DB);
  ok("реальный candidates.json не изменился", realBefore === realAfter, {
    before: realBefore,
    after: realAfter,
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
