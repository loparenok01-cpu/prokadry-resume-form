// Проверка @media (max-width:560px): нет горизонтального скролла на 375px,
// тулбар в две строки, правка кандидата целиком помещается
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
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

const hScroll = (page) =>
  page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    )
  );

(async () => {
  // Готовим тестового кандидата (публичный POST, без токена)
  const seed = await fetch(BASE + "/api/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawText:
        "Петров Пётр Петрович\nЖелаемая должность: Кладовщик\n" +
        "Ожидаемая зарплата: 40 000 — 55 000 ₽\n" +
        "Город: Москва\nТелефон: +7 999 123-45-67\n" +
        "Email: petrov@example.com\nКомментарий: моб-тест",
    }),
  });
  if (seed.status !== 201) throw new Error("seed POST " + seed.status);
  const seeded = await seed.json();

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    deviceScaleFactor: 2,
  });

  await page.goto(BASE + "/?token=" + encodeURIComponent(TOKEN), {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".candidate-actions button", { timeout: 5000 });

  // 1. Список: нет горизонтального скролла
  const swList = await hScroll(page);
  ok("список: горизонтального скролла нет (<=375)", swList <= 375, swList);

  // 2. Тулбар: поиск занимает строку целиком
  const inp = await page.locator("#candidateSearch").boundingBox();
  ok("тулбар: поиск на всю ширину (>250px)", inp && inp.width > 250, inp && inp.width);
  const csv = await page.locator("#exportCsv").boundingBox();
  ok(
    "тулбар: кнопка экспорта на второй строке",
    csv && inp && csv.y >= inp.y + inp.height - 1,
    csv && { csvY: csv.y, inpBottom: inp.y + inp.height }
  );

  await page.screenshot({ path: path.join(__dirname, "mobile-375-list.png") });
  console.log("скриншот: tests/mobile-375-list.png");

  // 3. Режим правки: открываем первого кандидата
  await page.locator(".candidate-actions button", { hasText: "Редактировать" }).first().click();
  await page.waitForSelector(".edit-raw", { timeout: 5000 });

  const swEdit = await hScroll(page);
  ok("правка: горизонтального скролла нет (<=375)", swEdit <= 375, swEdit);

  const b = await page.locator(".edit-row b").first().boundingBox();
  const f = await page.locator(".edit-row input").first().boundingBox();
  ok(
    "правка: лейбл отдельной строкой, поле ниже",
    b && f && f.y >= b.y + b.height - 1,
    b && f && { b: [b.y, b.height], f: [f.y] }
  );
  ok("правка: поле на всю ширину (>250px)", f && f.width > 250, f && f.width);

  await page.screenshot({ path: path.join(__dirname, "mobile-375-edit.png"), fullPage: false });
  console.log("скриншот: tests/mobile-375-edit.png");

  await browser.close();

  // Уборка тестового кандидата (нужен токен)
  const del = await fetch(BASE + "/api/candidates/" + seeded.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + TOKEN },
  });
  console.log("cleanup DELETE:", del.status);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
