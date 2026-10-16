require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const https = require("https");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const { randomUUID, createHash, timingSafeEqual } = require("crypto");

const ROOT = path.join(__dirname, "..");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const AUTH_KEY = process.env.GIGACHAT_AUTH_KEY || "";
const SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const MODEL = process.env.GIGACHAT_MODEL || "GigaChat-2-Pro";
const OAUTH_URL =
  process.env.GIGACHAT_OAUTH_URL ||
  "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const API_URL =
  process.env.GIGACHAT_API_URL ||
  "https://api.giga.chat/v1/chat/completions";
const CA_PATH = process.env.GIGACHAT_CA_BUNDLE
  ? path.resolve(process.env.GIGACHAT_CA_BUNDLE)
  : path.join(ROOT, "certs", "russian_trusted_root_ca_pem.crt");
const APP_TOKEN = process.env.APP_TOKEN || "";

// Нативный TLS: задайте TLS_CERT_FILE и TLS_KEY_FILE (PEM) — сервер поднимется
// по https. Без них — http; на публичном контуре TLS терминирует reverse-proxy
// (Caddy/nginx), см. docs/ПРОМЫШЛЕННАЯ.md.
const TLS_CERT_FILE = process.env.TLS_CERT_FILE
  ? path.resolve(process.env.TLS_CERT_FILE)
  : "";
const TLS_KEY_FILE = process.env.TLS_KEY_FILE
  ? path.resolve(process.env.TLS_KEY_FILE)
  : "";
const useTls = Boolean(
  TLS_CERT_FILE &&
    TLS_KEY_FILE &&
    fs.existsSync(TLS_CERT_FILE) &&
    fs.existsSync(TLS_KEY_FILE)
);

const MAX_TEXT_LENGTH = 60000;
const REQUEST_TIMEOUT_MS = 60000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 10;
const RATE_WINDOW_MS = 60000;

let caList = null;
if (fs.existsSync(CA_PATH)) {
  caList = [fs.readFileSync(CA_PATH), ...tls.rootCertificates];
}

const tlsAgent = new https.Agent({ ca: caList, keepAlive: true });

function httpsJson(url, { method = "POST", headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(body
            ? { "Content-Length": Buffer.byteLength(body) }
            : {}),
        },
        agent: tlsAgent,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let tokenCache = { token: "", expiresAt: 0 };

async function getAccessToken(force = false) {
  if (
    !force &&
    tokenCache.token &&
    Date.now() < tokenCache.expiresAt - 60000
  ) {
    return tokenCache.token;
  }
  if (!AUTH_KEY) throw new Error("GIGACHAT_AUTH_KEY is not set");

  const doRequest = (url) =>
    httpsJson(url, {
      headers: {
        Authorization: "Basic " + AUTH_KEY,
        RqUID: randomUUID(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "ProkadryBot/1.0",
      },
      body: "scope=" + encodeURIComponent(SCOPE),
    });

  const res = await doRequest(OAUTH_URL);
  if (res.status !== 200 || !res.data || !res.data.access_token) {
    const hint =
      res.data && res.data.error_description
        ? res.data.error_description
        : `HTTP ${res.status}`;
    throw new Error("oauth failed: " + hint);
  }
  tokenCache = {
    token: res.data.access_token,
    expiresAt:
      typeof res.data.expires_at === "number"
        ? res.data.expires_at
        : Date.now() + 25 * 60 * 1000,
  };
  return tokenCache.token;
}

const SYSTEM_PROMPT = [
  "Ты — точный парсер резюме кандидатов.",
  "Извлеки из переданного текста резюме JSON ровно с 7 полями:",
  'name — ФИО кандидата;',
  "desiredPosition — желаемая должность или цель (например «Цель: Бухгалтер»);",
  "salary — желаемая зарплата или вилка;",
  "skills — ключевые навыки через запятую; если отдельного раздела навыков нет — обобщи типовые обязанности в 10–18 навыков (не перечисляй текст обязанностей);",
  "experience — краткий опыт: до 4 самых свежих мест работы в формате «период: должность, организация», места через точку с запятой; остальные — одной строкой вида «ранее: N мест работы (годы)»; однотипные обязанности не перечисляй;",
  "education — краткое образование (вуз, специальность, год) через запятую;",
  "contacts — контакты через запятую (телефон, email, telegram).",
  "Все значения — строки на русском языке.",
  "Если поле отсутствует в тексте — верни пустую строку, ничего не выдумывай.",
  "Ответь ТОЛЬКО одним JSON-объектом без markdown-блоков и пояснений.",
].join("\n");

function parseModelJson(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("empty model response");
  }
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  const obj = JSON.parse(text.slice(start, end + 1));
  const pick = (key) => (typeof obj[key] === "string" ? obj[key].trim().slice(0, 4000) : "");
  return {
    name: pick("name"),
    desiredPosition: pick("desiredPosition"),
    salary: pick("salary"),
    skills: pick("skills"),
    experience: pick("experience"),
    education: pick("education"),
    contacts: pick("contacts"),
  };
}

async function chatOnce(token, userText) {
  const res = await httpsJson(API_URL, {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "ProkadryBot/1.0",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
    }),
  });
  return res;
}

async function extractWithGigaChat(text) {
  let token = await getAccessToken();
  let res = await chatOnce(token, text);
  if (res.status === 401) {
    token = await getAccessToken(true);
    res = await chatOnce(token, text);
  }
  if (res.status !== 200 || !res.data) {
    const hint =
      res.data && res.data.error && res.data.error.message
        ? res.data.error.message
        : `HTTP ${res.status}`;
    throw new Error("chat failed: " + hint);
  }
  const choice =
    res.data.choices && res.data.choices[0] ? res.data.choices[0] : null;
  if (!choice) throw new Error("chat returned no choices");
  if (choice.finish_reason === "blacklist") {
    throw new Error("content filtered by blacklist");
  }
  return parseModelJson(choice.message && choice.message.content);
}

const app = express();
app.use(express.json({ limit: "600kb" }));

// ===== Security-заголовки (helmet) =====
// Глобально — без CSP и HSTS: /presentation состоит из инлайн-байткода,
// а HSTS выставляется только на защищённом соединении (см. ниже).
app.use(
  helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: false,
    xFrameOptions: { action: "deny" },
  })
);
// Строгий CSP для приложения и API; презентация инлайн-кодовая — вне CSP.
const appCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});
app.use((req, res, next) => {
  if (req.path === "/presentation" || req.path === "/presentation.html") {
    return next();
  }
  return appCsp(req, res, next);
});
// HSTS — только когда соединение уже защищено (нативный TLS или reverse-proxy
// с X-Forwarded-Proto: https); на чистом http заголовок не добавляется.
app.use((req, res, next) => {
  const secure =
    req.secure || req.headers["x-forwarded-proto"] === "https";
  if (secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
});

function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function requireAuth(req, res, next) {
  if (!APP_TOKEN) {
    return res.status(503).json({ error: "APP_TOKEN is not set" });
  }
  const header = String(req.headers.authorization || "");
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !safeEqual(provided, APP_TOKEN)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function createRateLimiter(name, max, windowMs) {
  const buckets = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, hits] of buckets) {
      const alive = hits.filter((t) => now - t < windowMs);
      if (alive.length) buckets.set(key, alive);
      else buckets.delete(key);
    }
  }, windowMs);
  if (sweep.unref) sweep.unref();
  return function rateLimit(req, res, next) {
    const ip = (req.socket && req.socket.remoteAddress) || "unknown";
    const key = ip + "|" + name;
    const now = Date.now();
    let hits = buckets.get(key);
    if (!hits) {
      hits = [];
      buckets.set(key, hits);
    }
    while (hits.length && now - hits[0] >= windowMs) hits.shift();
    if (hits.length >= max) {
      const wait = Math.ceil((windowMs - (now - hits[0])) / 1000);
      res.set("Retry-After", String(wait));
      return res
        .status(429)
        .json({ error: "rate limit exceeded, retry in " + wait + "s" });
    }
    hits.push(now);
    next();
  };
}

const extractLimiter = createRateLimiter("extract", RATE_LIMIT_MAX, RATE_WINDOW_MS);
const postCandidateLimiter = createRateLimiter(
  "post-candidate",
  RATE_LIMIT_MAX,
  RATE_WINDOW_MS
);

const STATIC_FILES = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/index.html": ["public/index.html", "text/html; charset=utf-8"],
  "/css/style.css": ["public/css/style.css", "text/css; charset=utf-8"],
  "/js/script.js": ["public/js/script.js", "text/javascript; charset=utf-8"],
  "/js/heuristics.js": ["public/js/heuristics.js", "text/javascript; charset=utf-8"],
  // legacy-пути (старые ссылки/кэш) — ведут на те же файлы
  "/style.css": ["public/css/style.css", "text/css; charset=utf-8"],
  "/script.js": ["public/js/script.js", "text/javascript; charset=utf-8"],
  "/heuristics.js": ["public/js/heuristics.js", "text/javascript; charset=utf-8"],
  "/presentation": ["public/presentation.html", "text/html; charset=utf-8"],
  "/presentation.html": ["public/presentation.html", "text/html; charset=utf-8"],
};

app.get(Object.keys(STATIC_FILES), (req, res) => {
  const [file, type] = STATIC_FILES[req.path];
  res.type(type);
  res.sendFile(path.join(ROOT, file));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ai: Boolean(AUTH_KEY),
    model: MODEL,
    cert: Boolean(caList),
    auth: Boolean(APP_TOKEN),
  });
});

// ===== Хранилище кандидатов (candidates.json) =====

const CANDIDATES_FILE = process.env.CANDIDATES_FILE
  ? path.resolve(process.env.CANDIDATES_FILE)
  : path.join(ROOT, "candidates.json");
const STRUCTURED_KEYS = [
  "name",
  "desiredPosition",
  "salary",
  "skills",
  "experience",
  "education",
  "contacts",
];

let candidates = [];
try {
  const loaded = JSON.parse(fs.readFileSync(CANDIDATES_FILE, "utf8"));
  if (Array.isArray(loaded)) {
    candidates = loaded.filter((c) => c && typeof c === "object" && c.rawText);
  }
} catch {
  candidates = [];
}

function saveCandidatesFile() {
  const tmp = CANDIDATES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(candidates, null, 2), "utf8");
  fs.renameSync(tmp, CANDIDATES_FILE);
}

function coerceStructured(s) {
  const out = {};
  for (const k of STRUCTURED_KEYS) {
    out[k] =
      s && typeof s[k] === "string" ? s[k].trim().slice(0, 4000) : "";
  }
  return out;
}

function candidateHaystack(c) {
  return [c.rawText || "", ...STRUCTURED_KEYS.map((k) => (c.structured || {})[k] || "")]
    .join(" ")
    .toLowerCase();
}

function findCandidate(id) {
  return candidates.find((c) => c.id === id);
}

app.get("/api/candidates", requireAuth, (req, res) => {
  let list = candidates;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length > 200) {
    return res.status(400).json({ error: "query too long (max 200)" });
  }
  // регистронезависимый поиск — как и локальный фильтр в script.js
  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((c) => candidateHaystack(c).includes(qq));
  }
  res.json(list);
});

app.post("/api/candidates", postCandidateLimiter, (req, res) => {
  const body = req.body || {};
  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
  if (!rawText) return res.status(400).json({ error: "rawText is required" });
  if (rawText.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: "text is too long" });
  }
  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    rawText,
    structured: coerceStructured(body.structured),
  };
  candidates.unshift(item);
  saveCandidatesFile();
  res.status(201).json(item);
});

app.put("/api/candidates/:id", requireAuth, (req, res) => {
  const item = findCandidate(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const body = req.body || {};
  if (typeof body.rawText === "string" && body.rawText.trim()) {
    const raw = body.rawText.trim();
    if (raw.length > MAX_TEXT_LENGTH) {
      return res.status(413).json({ error: "text is too long" });
    }
    item.rawText = raw;
  }
  if (body.structured && typeof body.structured === "object") {
    item.structured = coerceStructured(body.structured);
  }
  item.updatedAt = new Date().toISOString();
  saveCandidatesFile();
  res.json(item);
});

app.delete("/api/candidates/:id", requireAuth, (req, res) => {
  const idx = candidates.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  candidates.splice(idx, 1);
  saveCandidatesFile();
  res.json({ ok: true });
});

app.post("/api/extract", extractLimiter, async (req, res) => {
  const text = req.body && req.body.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res
      .status(413)
      .json({ error: "text is too long (max " + MAX_TEXT_LENGTH + ")" });
  }
  if (!AUTH_KEY) {
    return res.status(503).json({ error: "GIGACHAT_AUTH_KEY is not set" });
  }
  try {
    const data = await extractWithGigaChat(text.trim());
    return res.json(data);
  } catch (err) {
    console.error("[extract] 502:", err && err.message ? err.message : err);
    return res.status(502).json({ error: "extract failed" });
  }
});

app.use((req, res) => res.status(404).end());

function logListen() {
  console.log(
    `Prokadry server: ${useTls ? "https" : "http"}://${HOST}:${PORT} (AI=${AUTH_KEY ? "on" : "off"}, cert=${caList ? "ok" : "missing"}, model=${MODEL}, tls=${useTls ? "on" : "off"})`
  );
}

if ((TLS_CERT_FILE || TLS_KEY_FILE) && !useTls) {
  console.warn(
    "[tls] TLS_CERT_FILE/TLS_KEY_FILE заданы, но файлы не найдены — сервер запущен по HTTP"
  );
}

if (useTls) {
  https
    .createServer(
      {
        cert: fs.readFileSync(TLS_CERT_FILE),
        key: fs.readFileSync(TLS_KEY_FILE),
      },
      app
    )
    .listen(PORT, HOST, logListen);
} else {
  app.listen(PORT, HOST, logListen);
}
