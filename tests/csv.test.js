// Тест CSV-инъекции: unit (csvCell) + сквозной (экспорт из браузера, download)
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE = "http://localhost:3000";
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

// --- Часть 1: unit-тест csvCell (вырезка из script.js) ---
const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "script.js"), "utf8");
const start = src.indexOf("function csvCell");
const end = src.indexOf("function exportJson");
if (start < 0 || end < 0) throw new Error("markers not found");
eval(src.slice(start, end));

ok("=SUM обезврежен", csvCell("=SUM(A1)") === '"\'=SUM(A1)"', csvCell("=SUM(A1)"));
ok("+7 900... обезврежен", csvCell("+7 900 111-22-33") === '"\'+7 900 111-22-33"', csvCell("+7 900 111-22-33"));
ok("-5 обезврежен", csvCell("-5") === '"\'-5"', csvCell("-5"));
ok("@handle обезврежен", csvCell("@handle") === '"\'@handle"', csvCell("@handle"));
ok("ведущие пробелы обезврежены", csvCell("  =x") === '"\'  =x"', csvCell("  =x"));
ok("обычный текст без изменений", csvCell("Иванова Мария") === '"Иванова Мария"', csvCell("Иванова Мария"));
ok("дата без апострофа", csvCell("2024-01-15") === '"2024-01-15"', csvCell("2024-01-15"));
ok("кавычки экранируются как раньше", csvCell('a"b') === '"a""b"', csvCell('a"b'));
ok('ячейка не начинается с "пассивно-опасного" комбайн-примера', !csvCell("=1+1").startsWith('"='), csvCell("=1+1"));

// --- Часть 2: сквозной тест — кандидат с формулой -> экспорт CSV в браузере ---
(async () => {
  const evilName = '=HYPERLINK("http://evil.example";"клик")';
  const evilRaw = "=1+1";
  const phone = "+7 900 111-22-33";

  // создание кандидата (публичный POST, лимит не мешает: 1 запрос)
  let created;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(BASE + "/api/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: evilRaw + " тест",
        structured: { name: evilName, salary: phone },
      }),
    });
    if (r.status === 429) {
      console.log("...ожидание окна rate limit (61с)...");
      await new Promise((res) => setTimeout(res, 61000));
      continue;
    }
    if (r.status !== 201) throw new Error("POST -> " + r.status);
    created = await r.json();
    break;
  }

  const { chromium } = require("playwright-core");
  const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });

  await page.goto(BASE + "/?token=" + encodeURIComponent(process.env.APP_TOKEN), {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#candidateList li").length > 1,
    { timeout: 10000 }
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#exportCsv"),
  ]);
  const tmpPath = await download.path();
  const content = fs.readFileSync(tmpPath, "utf8");

  ok("CSV начинается с BOM", content.charCodeAt(0) === 0xfeff, content.charCodeAt(0));
  ok('имя-формула взята в апостроф: "\'=HYPERLINK', content.includes('"\'=HYPERLINK'), content.slice(0, 120));
  ok('опасной формы "=HYPERLINK в файле нет', !content.includes('"=HYPERLINK'));
  ok('rawText =1+1 обезврежен', content.includes('"\'=1+1'), content.slice(0, 200));
  ok('телефон +7 взят в апостроф', content.includes('"\'+7'), '"\'+7');
  ok("обычные ячейки не пострадали", content.includes('"Создан"'));
  ok('ссылка внутри кавычек экранирована', content.includes('"\'=HYPERLINK(""http://evil.example""'));

  await browser.close();

  // очистка тестовой записи
  await fetch(BASE + "/api/candidates/" + created.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + process.env.APP_TOKEN },
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
