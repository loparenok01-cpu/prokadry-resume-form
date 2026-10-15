require("dotenv").config();

const express = require("express");
const https = require("https");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
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
  : path.join(__dirname, "certs", "russian_trusted_root_ca_pem.crt");

const MAX_TEXT_LENGTH = 60000;
const REQUEST_TIMEOUT_MS = 60000;

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
  "skills — ключевые навыки через запятую;",
  "experience — краткий опыт (должность, организация, периоды) через запятую;",
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

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/script.js": ["script.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};

app.get(Object.keys(STATIC_FILES), (req, res) => {
  const [file, type] = STATIC_FILES[req.path];
  res.type(type);
  res.sendFile(path.join(__dirname, file));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ai: Boolean(AUTH_KEY),
    model: MODEL,
    cert: Boolean(caList),
  });
});

app.post("/api/extract", async (req, res) => {
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
    return res.status(502).json({ error: String(err.message || err) });
  }
});

app.use((req, res) => res.status(404).end());

app.listen(PORT, () => {
  console.log(
    `Prokadry server: http://localhost:${PORT} (AI=${AUTH_KEY ? "on" : "off"}, cert=${caList ? "ok" : "missing"}, model=${MODEL})`
  );
});
