// Тест rate limit: POST /api/extract и POST /api/candidates (10/мин -> 429).
// Используются пустые тела: валидация отвечает 400 ДО вызова GigaChat и записи в базу.
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

const postExtract = () =>
  fetch(BASE + "/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
const postCandidate = () =>
  fetch(BASE + "/api/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

(async () => {
  // 1. extract: первые 10 пустых -> 400 (лимит пускает, ИИ не вызывается)
  const s1 = [];
  for (let i = 0; i < 10; i++) s1.push((await postExtract()).status);
  ok("extract: первые 10 -> 400 (без вызова ИИ)", s1.every((s) => s === 400), s1);

  // 2. extract: 11-й -> 429 + Retry-After + тело
  const r11 = await postExtract();
  const retryAfter = r11.headers.get("retry-after");
  let body11 = null;
  try {
    body11 = await r11.json();
  } catch (e) {}
  ok("extract: 11-й -> 429", r11.status === 429, r11.status);
  ok("extract: Retry-After > 0", Number(retryAfter) > 0, retryAfter);
  ok(
    "extract: тело о лимите",
    Boolean(body11 && body11.error && /rate limit/.test(body11.error)),
    body11
  );

  // 3. Другие ручки лимитом не задеты
  const h = await fetch(BASE + "/api/health");
  ok("health вне лимита -> 200", h.status === 200, h.status);
  const g = await fetch(BASE + "/api/candidates");
  ok("GET списка вне лимита -> 401 (не 429)", g.status === 401, g.status);

  // 4. candidates POST: 10 пустых -> 400 (не пишут в базу), 11-й -> 429
  const s2 = [];
  for (let i = 0; i < 10; i++) s2.push((await postCandidate()).status);
  ok("candidates POST: первые 10 -> 400", s2.every((s) => s === 400), s2);
  const r2 = await postCandidate();
  ok("candidates POST: 11-й -> 429", r2.status === 429, r2.status);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
