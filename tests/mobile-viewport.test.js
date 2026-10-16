// Проверка viewport-метатега: на мобильной эмуляции ширина лейаута = 375 (а не ~980)
const path = require("path");
const { chromium } = require("playwright-core");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    deviceScaleFactor: 2,
  });

  await page.goto(BASE, { waitUntil: "networkidle" });

  const hasMeta = await page.evaluate(
    () => Boolean(document.querySelector('meta[name="viewport"]'))
  );
  const layoutWidth = await page.evaluate(
    () => document.documentElement.clientWidth
  );

  ok("meta viewport присутствует", hasMeta);
  ok("ширина лейаута = 375 (не ~980)", layoutWidth === 375, layoutWidth);

  await page.screenshot({ path: path.join(__dirname, "mobile-375.png") });
  console.log("скриншот: tests/mobile-375.png");

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
