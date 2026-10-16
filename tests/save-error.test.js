// Тест сохранения резюме: ошибка сервера -> текст в форме + сообщение; успех -> очистка
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { chromium } = require("playwright-core");

const BASE = "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });

  // ИИ всегда 500 -> клиент молча уходит на эвристику, квота не тратится
  await page.route("**/api/extract", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
  );

  // Фаза 1: POST /api/candidates -> 500 (текст должен сохраниться)
  await page.route("**/api/candidates", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });

  await page.goto(BASE + "/?token=" + encodeURIComponent(process.env.APP_TOKEN), {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#storageNote", { timeout: 10000 });

  const text = "Иванов Тест Тестович\nОшибочный кандидат для проверки потери данных";
  await page.fill("#resumeText", text);
  await page.click("#resumeForm button[type='submit']");
  await page.waitForSelector("#formError:not([hidden])", { timeout: 8000 });

  const kept = await page.inputValue("#resumeText");
  const errText = await page.textContent("#formError");
  const btnEnabled = await page.isEnabled("#resumeForm button[type='submit']");
  const badge = await page.textContent("#storageNote");

  ok("показано сообщение «НЕ сохранено»", errText.includes("НЕ сохранено"), errText);
  ok("сообщение содержит код ошибки", errText.includes("HTTP 500"), errText);
  ok("введённый текст сохранился в форме", kept === text, kept.slice(0, 60));
  ok("кнопка снова активна", btnEnabled === true);
  ok("текст не потерян подсказкой в сообщении", errText.includes("не потерян"));

  // Фаза 2: сервер снова принимает -> успех, форма очищается
  await page.unroute("**/api/candidates");
  await page.click("#resumeForm button[type='submit']");
  await page.waitForFunction(() => document.getElementById("formError").hidden, {
    timeout: 8000,
  });
  const cleared = await page.inputValue("#resumeText");
  const errHidden = await page.getAttribute("#formError", "hidden");
  const badgeAfter = await page.textContent("#storageNote");
  ok("при успехе форма очищена", cleared === "", JSON.stringify(cleared));
  ok("сообщение об ошибке скрыто", errHidden !== null);
  ok("бейдж остался «сервер»", badgeAfter.includes("сервер"), badgeAfter);

  // Фаза 3: GET /api/candidates -> 500 -> бейдж честно сообщает про localStorage
  await page.route("**/api/candidates", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => (document.getElementById("storageNote").textContent || "").length > 0,
    { timeout: 8000 }
  );
  const badge500 = await page.textContent("#storageNote");
  ok(
    "при HTTP 500 от списка бейдж — localStorage",
    badge500.includes("localStorage"),
    badge500
  );

  await browser.close();

  // Очистка тестовой записи на сервере
  const token = process.env.APP_TOKEN;
  const list = await (
    await fetch(BASE + "/api/candidates", {
      headers: { Authorization: "Bearer " + token },
    })
  ).json();
  const victim = list.find((c) =>
    String(c.rawText || "").includes("Ошибочный кандидат для проверки")
  );
  if (victim) {
    await fetch(BASE + "/api/candidates/" + victim.id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
  }
  ok("тестовая запись удалена из базы", Boolean(victim), victim && victim.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
