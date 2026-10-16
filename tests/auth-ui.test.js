// UI-проверка авторизации: бейдж без токена, кнопка «Ввести токен», ?token=
const { chromium } = require("playwright-core");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });

  // 1. Без токена: бейдж + кнопка, список пуст
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#storageNote", { timeout: 10000 });
  await page.waitForTimeout(500);
  const badge1 = await page.textContent("#storageNote");
  const btnVisible = await page.locator("#tokenBtn").isVisible();
  console.log("без токена -> бейдж:", JSON.stringify(badge1), "| кнопка видна:", btnVisible);

  // 2. Клик «Ввести токен» -> prompt -> верный токен
  page.once("dialog", async (dialog) => {
    console.log("prompt:", dialog.type(), "|", dialog.message().slice(0, 40) + "...");
    await dialog.accept(process.env.APP_TOKEN);
  });
  await page.click("#tokenBtn");
  await page.waitForTimeout(800);
  const badge2 = await page.textContent("#storageNote");
  const count2 = await page.locator("#candidateList li").count();
  const btnGone = (await page.locator("#tokenBtn").count()) === 0;
  const logoutVisible = await page.locator("#logoutBtn").isVisible();
  console.log("кнопка+верный токен -> бейдж:", JSON.stringify(badge2), "| записей:", count2, "| кнопка скрыта:", btnGone, "| «Выйти» видна:", logoutVisible);

  // 2b. Кнопка «Выйти»: токен стёрся, бейдж обратно «нужен токен»
  await page.click("#logoutBtn");
  await page.waitForTimeout(800);
  const badgeOut = await page.textContent("#storageNote");
  const tokenLeft = await page.evaluate(() => sessionStorage.getItem("prokadry-token"));
  console.log("после «Выйти» -> бейдж:", JSON.stringify(badgeOut), "| токен в памяти:", tokenLeft);

  // 3. Неверный токен: кнопка снова, alert «не принят»
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#tokenBtn", { timeout: 5000 });
  let alertMsg = "";
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "alert") {
      alertMsg = dialog.message();
      await dialog.accept();
    } else {
      await dialog.accept("wrong-token");
    }
  });
  await page.click("#tokenBtn");
  await page.waitForTimeout(1000);
  const badge3 = await page.textContent("#storageNote");
  page.removeAllListeners("dialog");
  console.log("неверный токен -> бейдж:", JSON.stringify(badge3), "| alert:", JSON.stringify(alertMsg.slice(0, 40)));

  await browser.close();
  const pass =
    badge1.includes("нужен токен") &&
    btnVisible &&
    badge2.includes("сервер") &&
    count2 > 1 &&
    btnGone &&
    logoutVisible &&
    badgeOut.includes("нужен токен") &&
    tokenLeft === null &&
    badge3.includes("нужен токен") &&
    alertMsg.includes("не принят");
  console.log(pass ? "UI-проверка пройдена" : "UI-проверка НЕ пройдена");
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
