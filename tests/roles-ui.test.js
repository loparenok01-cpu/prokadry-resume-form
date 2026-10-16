// Проверка двух средних строк аудита:
// 1) Экспорт/список только под авторизацией: без токена панель и список скрыты,
//    с токеном — видны, экспорт JSON отдаёт массив.
// 2) Локальный режим: предупреждение о ПДн в бейдже, кнопка очистки
//    удаляет ключ localStorage.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const { chromium } = require("playwright-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3000";
const TOKEN = process.env.APP_TOKEN || "";
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

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  // ===== 1. Аноним без токена (сервер работает) =====
  const ctx1 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const anon = await ctx1.newPage();
  await anon.goto(BASE, { waitUntil: "networkidle" });
  await anon.waitForFunction(() => {
    const n = document.getElementById("storageNote");
    return n && n.textContent.includes("нужен токен");
  });

  ok("аноним: панель экспорта скрыта", !(await anon.locator("#exportJson").isVisible()));
  ok("аноним: экспорт CSV скрыт", !(await anon.locator("#exportCsv").isVisible()));
  ok("аноним: тулбар (поиск) скрыт", !(await anon.locator(".candidates-toolbar").isVisible()));
  ok("аноним: список кандидатов скрыт", !(await anon.locator("#candidateList").isVisible()));
  const badgeAnon = await anon.locator("#storageNote").textContent();
  ok("аноним: бейдж «нужен токен»", badgeAnon.includes("нужен токен"), badgeAnon);
  ok("аноним: кнопка «Ввести токен» видна", await anon.locator("#tokenBtn").isVisible());

  // ===== 2. С токеном =====
  await anon.goto(BASE + "/?token=" + encodeURIComponent(TOKEN), {
    waitUntil: "networkidle",
  });
  await anon.waitForFunction(() => {
    const n = document.getElementById("storageNote");
    return n && n.textContent.includes("сервер (candidates.json)");
  });
  ok("с токеном: панель экспорта видна", await anon.locator("#exportJson").isVisible());
  ok("с токеном: поиск виден", await anon.locator("#candidateSearch").isVisible());
  ok("с токеном: список виден", await anon.locator("#candidateList").isVisible());
  const [download] = await Promise.all([
    anon.waitForEvent("download"),
    anon.click("#exportJson"),
  ]);
  const filePath = await download.path();
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {}
  ok("с токеном: экспорт JSON работает (массив)", Array.isArray(parsed), typeof parsed);
  await ctx1.close();

  // ===== 3. Локальный режим (/api недоступен) =====
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx2.route("**/api/**", (route) => route.abort());
  await ctx2.addInitScript((seed) => {
    localStorage.setItem("prokadry-candidates", seed);
  }, JSON.stringify([
    {
      id: "seed-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      rawText: "Сидоров Сидор\nТелефон: +7 900 111-22-33",
      structured: { name: "Сидоров Сидор" },
    },
  ]));
  const local = await ctx2.newPage();
  local.on("dialog", (d) => d.accept());
  await local.goto(BASE, { waitUntil: "domcontentloaded" });
  await local.waitForFunction(() => {
    const n = document.getElementById("storageNote");
    return n && n.textContent.includes("localStorage");
  });

  const badgeLocal = await local.locator("#storageNote").textContent();
  ok("локальный: предупреждение о ПДн в бейдже", badgeLocal.includes("ПДн"), badgeLocal);
  ok("локальный: экспорт скрыт", !(await local.locator("#exportJson").isVisible()));
  ok("локальный: поиск виден", await local.locator("#candidateSearch").isVisible());
  ok(
    "локальный: список виден (есть запись)",
    (await local.locator("#candidateList li:not(.candidate-empty)").count()) > 0
  );
  ok("локальный: кнопка «Очистить локальные данные» видна", await local.locator("#clearLocalBtn").isVisible());

  await local.click("#clearLocalBtn");
  await local.waitForFunction(
    () => document.querySelectorAll("#candidateList li:not(.candidate-empty)").length === 0
  );
  const keyAfter = await local.evaluate(() => localStorage.getItem("prokadry-candidates"));
  ok("после очистки ключ prokadry-candidates удалён", keyAfter === null, keyAfter);
  const listText = await local.textContent("#candidateList");
  ok("после очистки список пуст", listText.includes("Кандидатов пока нет"), listText);
  await ctx2.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
