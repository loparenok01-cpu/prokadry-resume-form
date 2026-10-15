// Хранение кандидатов: сервер (/api/candidates), при его отсутствии — localStorage.

const STORAGE_KEY = "prokadry-candidates";
const STRUCTURED_FIELDS = [
  ["name", "Имя"],
  ["desiredPosition", "Желаемая должность"],
  ["salary", "Зарплата"],
  ["skills", "Навыки"],
  ["experience", "Опыт"],
  ["education", "Образование"],
  ["contacts", "Контакты"],
];
let serverMode = null;
let currentQuery = "";
let editingId = null;
let lastLoaded = [];

function loadLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    let changed = false;
    for (const c of list) {
      if (c && typeof c === "object" && !c.id) {
        c.id = localId();
        c.createdAt = c.createdAt || new Date().toISOString();
        changed = true;
      }
    }
    if (changed) saveLocal(list);
    return list;
  } catch {
    return [];
  }
}

function saveLocal(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function localId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

async function detectServer() {
  if (serverMode !== null) return serverMode;
  try {
    const r = await fetch("/api/candidates", { cache: "no-store" });
    serverMode = r.ok;
  } catch {
    serverMode = false;
  }
  return serverMode;
}

function localHaystack(c) {
  return [c.rawText || "", ...STRUCTURED_FIELDS.map(([k]) => (c.structured || {})[k] || "")]
    .join(" ")
    .toLowerCase();
}

async function fetchCandidates(q) {
  if (await detectServer()) {
    try {
      const url = q
        ? "/api/candidates?q=" + encodeURIComponent(q)
        : "/api/candidates";
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {
      // сервер пропал — уходим в localStorage
      serverMode = false;
    }
  }
  let list = loadLocal();
  const s = (q || "").trim().toLowerCase();
  if (s) list = list.filter((c) => localHaystack(c).includes(s));
  return list;
}

async function addCandidate(rawText, structured) {
  if (await detectServer()) {
    try {
      const r = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, structured }),
      });
      if (r.ok) return await r.json();
      if (r.status !== 404) return null;
    } catch {
      serverMode = false;
    }
  }
  const item = {
    id: localId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rawText,
    structured,
  };
  const list = loadLocal();
  list.unshift(item);
  saveLocal(list);
  return item;
}

async function updateCandidate(id, rawText, structured) {
  if (await detectServer()) {
    try {
      const r = await fetch("/api/candidates/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, structured }),
      });
      if (r.ok) return await r.json();
      if (r.status !== 404) return null;
    } catch {
      serverMode = false;
    }
  }
  const list = loadLocal();
  const item = list.find((c) => c.id === id);
  if (!item) return null;
  if (rawText) item.rawText = rawText;
  if (structured) item.structured = structured;
  item.updatedAt = new Date().toISOString();
  saveLocal(list);
  return item;
}

async function deleteCandidate(id) {
  if (await detectServer()) {
    try {
      const r = await fetch("/api/candidates/" + encodeURIComponent(id), {
        method: "DELETE",
      });
      if (r.ok) return true;
      if (r.status !== 404) return false;
    } catch {
      serverMode = false;
    }
  }
  saveLocal(loadLocal().filter((c) => c.id !== id));
  return true;
}

const SKILLS_DICT = [
  "Python", "JavaScript", "TypeScript", "Java", "C#", "C++", "PHP", "Go",
  "Rust", "Ruby", "Swift", "Kotlin", "SQL", "NoSQL", "PostgreSQL", "MySQL",
  "MongoDB", "Redis", "React", "Vue", "Angular", "Node.js", "Docker",
  "Kubernetes", "Git", "GitLab", "CI/CD", "Linux", "Windows", "REST API",
  "GraphQL", "Jira", "Confluence", "Agile", "Scrum", "Figma", "Photoshop",
  "Illustrator", "InDesign", "After Effects", "Premiere Pro", "Canva",
  "Excel", "Word", "PowerPoint", "Google Таблицы", "1С", "1С:Бухгалтерия",
  "Power BI", "Tableau", "Google Analytics", "Яндекс.Метрика", "Яндекс.Директ",
  "Google Ads", "SMM", "SEO", "контекстная реклама", "таргетированная реклама",
  "таргет", "контент-маркетинг", "контент маркетинг", "контент-менеджмент",
  "маркетинг", "маркетинговые исследования", "продажи", "переговоры",
  "холодные звонки", "воронки продаж", "B2B", "B2C", "управление командой",
  "рекрутинг", "подбор персонала", "кадровое делопроизводство", "ТК РФ",
  "документооборот", "делопроизводство", "бухгалтерия", "склад", "логистика",
  "закупки", "тендеры", "аналитика", "A/B тесты", "KPI", "тестирование",
  "автотесты", "Selenide", "Cypress", "коммуникация", "английский",
  "английский язык", "CRM", "amoCRM", "Bitrix24", "SAP", "WordPress",
  "Laravel", "Django", "Spring", "машинное обучение", "UX", "UI",
  "юзабилити", "копирайтинг", "e-mail рассылки", "email-рассылки",
  "TikTok", "Instagram", "Telegram-канал", "комьюнити-менеджмент", "PR",
];

const SECTION_SPLIT_RE =
  /((?:Опыт(?:\s+работы)?|Образование|Профессиональные\s+навыки|Ключевые\s+навыки|Навыки\s+и\s+компетенции|Курсы\s+и\s+тренинги|Дополнительная\s+информация(?:\s+о\s+себе)?|Контакты|ФИО|Телефон|Желаем[а-яё]+\s+(?:должность|позиция|зарплата|уровень\s+дохода)|Ожидаемая\s+зарплата|Зарплата|Вилка|Уровень\s+дохода|Цель(?:\s+резюме)?|Контактная\s+информация|Личная\s+информация|Профессиональные\s+качества|Личные\s+качества|Занятость|Дата\s+рождения|Семейное\s+положение|График\s+работы|Гражданство|Место\s+проживания|Переезд)\s*)[:：;]/g;

function splitSections(text) {
  return text
    .replace(
      /([^A-Za-zА-Яа-яЁё0-9]|^)((?:Опыт(?:\s+работы)?|Образование|Профессиональные\s+навыки|Ключевые\s+навыки|Навыки\s+и\s+компетенции|Курсы\s+и\s+тренинги|Дополнительная\s+информация(?:\s+о\s+себе)?|Контакты|ФИО|Телефон|Желаем[а-яё]+\s+(?:должность|позиция|зарплата|уровень\s+дохода)|Ожидаемая\s+зарплата|Зарплата|Вилка|Уровень\s+дохода|Цель(?:\s+резюме)?|Контактная\s+информация|Личная\s+информация|Профессиональные\s+качества|Личные\s+качества|Занятость|Дата\s+рождения|Семейное\s+положение|График\s+работы|Гражданство|Место\s+проживания|Переезд)\s*[:：;])/g,
      "$1\n$2"
    )
    .replace(SECTION_SPLIT_RE, "$1\n");
}

const SECTION_END_COLON_RE =
  /^(?:телефон|опыт(?:\s+работы)?|стаж|(?:профессиональные\s+|ключевые\s+)?навыки(?:\s+и\s+компетенции)?|email|e-?mail|почт[аы]|телеграм|telegram|фио|имя|кандидат|контакты|образование|о\s+себе|цель(?:\s+резюме)?|желаем[а-яё]+\s+(?:должность|позиция|зарплата|уровень\s+дохода)|(?:(?:о?жидаемая|желаемая)\s+)?зарплат[а-яё]*|уровень\s+дохода|вилка|доход|контактная\s+информация|личная\s+информация|профессиональные\s+качества|личные\s+качества|занятость|дата\s+рождения|семейное\s+положение|график\s+работы|гражданство|место\s+проживания|переезд)\s*[:：]/i;

const SECTION_END_BARE_RE =
  /^(?:телефон|образование|фио|контакты|(?:профессиональные|ключевые)\s+навыки|курсы\s+и\s+тренинги|желаем[а-яё]+\s+(?:должность|позиция|зарплата|уровень\s+дохода)|(?:(?:о?жидаемая|желаемая)\s+)?зарплат[а-яё]*|уровень\s+дохода|вилка|опыт(?:\s+работы)?|стаж|цель(?:\s+резюме)?|дополнительная\s+информация(?:\s+о\s+себе)?|о\s+себе|контактная\s+информация|личная\s+информация|профессиональные\s+качества|личные\s+качества|занятость|дата\s+рождения|семейное\s+положение|график\s+работы|гражданство|место\s+проживания|переезд)$/i;

const SECTION_END_NUM_RE = /^(?:опыт|стаж)\s+\d/i;

function isSectionEnd(line) {
  return (
    SECTION_END_COLON_RE.test(line) ||
    SECTION_END_BARE_RE.test(line) ||
    SECTION_END_NUM_RE.test(line)
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function yearsWord(n) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "год";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "года";
  return "лет";
}

function cleanRest(rest) {
  return rest
    .replace(
      /\s+(?:телефон|опыт(?:\s+работы)?|стаж|навыки|ключевые|email|e-?mail|почт[аы]|телеграм|telegram|фио|имя|кандидат|контакты)\s*[:：].*$/i,
      ""
    )
    .replace(/\.\s+[A-ZА-ЯЁ].*$/, "")
    .replace(/[.,;]\s*$/, "")
    .trim();
}

function labeledValue(lines, re) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      let rest = (m[1] || "").trim();
      if (rest) {
        rest = cleanRest(rest);
        if (rest) return rest;
      }
      if (lines[i + 1]) return lines[i + 1];
    }
  }
  return "";
}

function labeledBlock(lines, patterns) {
  for (let i = 0; i < lines.length; i++) {
    let rest = "";
    let hit = false;
    for (const re of patterns) {
      const m = lines[i].match(re);
      if (m) {
        hit = true;
        rest = (m[1] || "").trim();
        break;
      }
    }
    if (!hit) continue;
    const parts = [];
    if (rest) {
      rest = cleanRest(rest);
      if (rest) parts.push(rest);
    }
    for (let j = i + 1; j < lines.length; j++) {
      if (isSectionEnd(lines[j])) break;
      parts.push(lines[j].replace(/[,;]\s*$/, ""));
    }
    if (parts.length) return parts.join("; ");
  }
  return "";
}

function extractName(lines) {
  const labeled = labeledValue(lines, /^(?:фио|имя|кандидат)\s*[:：]\s*(.+)$/i);
  if (labeled) return labeled;
  for (const line of lines.slice(0, 5)) {
    if (
      /^(?:опыт|навыки|ключевые|профессионал|компьютерн|телефон|контакты|почт|e-?mail|теле|цель|желаем)/i.test(
        line
      )
    ) {
      continue;
    }
    const m = line.match(
      /^([А-ЯЁA-Z][а-яёa-z-]+(?:\s+[А-ЯЁA-Z][а-яёa-z-]+){1,2})(?:\s*[,;.(—–-]|\s*$)/
    );
    if (m) return m[1];
  }
  return "";
}

const SKILL_STOPWORDS = new Set([
  "опыт", "опыта", "работы", "работа", "ведения", "ведение", "владение",
  "владения", "знание", "знания", "знаний", "умение", "умения", "умений",
  "навык", "навыки", "навыков", "обеспечения", "обеспечение", "основа",
  "основы", "основ", "полного", "полные", "комплекса", "комплексный",
  "поддержки", "такие", "различных", "своей", "обязанности", "достижения",
  "должность", "должности", "организация", "организации", "период",
  "учебное", "заведение", "окончания", "форма", "обучения", "оценка",
  "личные", "качества", "сведения", "информация",
]);

function condenseFragments(raw) {
  const out = [];
  for (let part of raw.split(/[,;]|\.\s+|\s+и\s+/i)) {
    let f = part.trim().replace(/[.\s]+$/, "");
    f = f.replace(/^(?:опыт|знание|умение|навыки?|владение)\s+/i, "");
    let words = f.split(/\s+/).filter(Boolean);
    while (
      words.length &&
      (SKILL_STOPWORDS.has(words[0].toLowerCase().replace(/[^а-яёa-z0-9]/gi, "")) ||
        /^[а-яa-z]$/i.test(words[0]))
    ) {
      words.shift();
    }
    if (!words.length) continue;
    if (words.length === 1 && /^(?:.*(?:ой|ей|ый|ая|ое))$/i.test(words[0])) continue;
    if (words.length > 4) words = words.slice(0, 4);
    const item = words.join(" ").replace(/[.\s]+$/, "");
    if (item.length < 2) continue;
    const key = item.toLowerCase();
    if (!out.some((x) => x.k === key)) out.push({ k: key, v: item });
    if (out.length >= 20) break;
  }
  return out.map((x) => x.v).join(", ");
}

function extractSkills(lines, text) {
  const labeled = labeledBlock(lines, [
    /(?:профессиональные\s+|ключевые\s+)?навыки(?:\s+и\s+компетенции)?\s*[:：]\s*(.*)$/i,
    /^(?:(?:профессиональные|ключевые)\s+)?навыки(?:\s+и\s+компетенции)?$/i,
    /профессиональные\s+качества\s*[:：]\s*(.*)$/i,
    /^профессиональные\s+качества$/i,
  ]);
  if (labeled) return condenseFragments(labeled) || labeled;
  const found = [];
  for (const skill of SKILLS_DICT) {
    const re = new RegExp(
      `(^|[^A-Za-zА-Яа-яЁё0-9])${escapeRe(skill)}(?=$|[^A-Za-zА-Яа-яЁё0-9])`,
      "i"
    );
    if (re.test(text)) found.push(skill);
  }
  const uniq = [...new Set(found)];
  return uniq
    .filter(
      (s) =>
        !uniq.some(
          (t) => t !== s && t.toLowerCase().includes(s.toLowerCase())
        )
    )
    .join(", ");
}

function grab(raw, names) {
  const m = raw.match(
    new RegExp(`(?:^|[;\\n])\\s*(?:${names})\\s*[:：]\\s*([^;\\n]+)`, "i")
  );
  return m ? m[1].trim().replace(/[.\s]+$/, "") : "";
}

function condenseExperience(raw) {
  const position = grab(raw, "должность");
  const org = grab(raw, "организация");
  const periodRaw = grab(raw, "период\\s+работы");
  let period = periodRaw;
  const years = periodRaw.match(/((?:19|20)\d{2})\D+((?:19|20)\d{2}|наст[^;]*)/i);
  const dur = periodRaw.match(/\(([^)]+)\)/);
  if (years) {
    period = `${years[1]}–${years[2].trim()}${dur ? ` (${dur[1]})` : ""}`;
  }

  let duties = raw;
  const dutyStart = raw.match(/обязанности\s*[:：]\s*([\s\S]*)/i);
  if (dutyStart) {
    duties = dutyStart[1].replace(/\s*достижени\w*\s*[:：]\s*/gi, "; ");
  } else {
    const ach = raw.match(/достижени\w*\s*[:：]\s*([\s\S]*)/i);
    if (ach) duties = ach[1];
  }
  const fragments = (condenseFragments(duties) || "")
    .split(", ")
    .filter(Boolean)
    .slice(0, 8);

  const head = [position, org, period].filter(Boolean).join(", ");
  if (!fragments.length) return head;
  return head ? `${head}: ${fragments.join(", ")}` : fragments.join(", ");
}

function condenseEducation(raw) {
  const uni = grab(raw, "учебное\\s+заведение|вуз|университет");
  const faculty = grab(raw, "факультет");
  const spec = grab(raw, "специальность");
  const year = grab(raw, "год\\s+окончания|год\\s+выпуска");
  if (!uni && !faculty && !year && spec) return spec;
  const parts = [
    uni,
    faculty,
    spec && `Специальность: ${spec}`,
    year && `Окончание: ${year}`,
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return condenseFragments(raw);
}

function extractEducation(lines) {
  const patterns = [
    /образование\s*[:：]\s*(.*)$/i,
    /^образование$/i,
  ];
  let best = "";
  for (let i = 0; i < lines.length; i++) {
    let rest = "";
    let hit = false;
    for (const re of patterns) {
      const m = lines[i].match(re);
      if (m) {
        hit = true;
        rest = (m[1] || "").trim();
        break;
      }
    }
    if (!hit) continue;
    const parts = [];
    if (rest) {
      rest = cleanRest(rest);
      if (rest) parts.push(rest);
    }
    for (let j = i + 1; j < lines.length; j++) {
      if (isSectionEnd(lines[j])) break;
      parts.push(lines[j].replace(/[,;]\s*$/, ""));
    }
    const block = parts.join("; ");
    if (block.length > best.length) best = block;
  }
  if (!best) return "";
  return condenseEducation(best) || best;
}

function extractDesiredPosition(lines) {
  const labeled = labeledBlock(lines, [
    /^(?:желаем[а-яё]+\s+(?:должность|позиция))\s*[:：]\s*(.*)$/i,
    /^(?:желаем[а-яё]+\s+(?:должность|позиция))$/i,
  ]);
  if (labeled) {
    const first = labeled.split(";")[0].trim();
    return cleanRest(first);
  }
  const goal = labeledBlock(lines, [
    /^цель\s*[:：]\s*(.*)$/i,
    /^цель$/i,
  ]);
  if (goal) {
    const first = cleanRest(goal.split(";")[0].trim());
    if (looksLikePosition(first)) return first;
  }
  const name = extractName(lines);
  if (!name) return "";
  const nameIdx = lines.findIndex(
    (l) =>
      l === name ||
      l.startsWith(name) ||
      l.replace(/^(?:фио|имя|кандидат)\s*[:：]\s*/i, "") === name
  );
  if (nameIdx < 0) return "";
  const candidate = lines[nameIdx + 1];
  return looksLikePosition(candidate) ? candidate : "";
}

function looksLikePosition(line) {
  if (!line || line.length > 80) return false;
  if (/[:：;@]|\d{4,}/.test(line)) return false;
  if (
    /^(?:занятость|график|желаем|ожидаем|зарплат|телефон|e-?mail|почт|навык|опыт|стаж|образован|контакт|фио|город|дата|граждан|семейн|рекоменд|резюме|анкета|портфолио|о\s+себе|целев|должност)/i.test(
      line
    )
  )
    return false;
  if (!/^[А-ЯЁA-Z]/.test(line)) return false;
  if (line.split(/\s+/).length > 8) return false;
  return true;
}

function condenseSalary(raw) {
  const parts = [];
  for (const part of raw.split(/;|\n/)) {
    const p = part.trim();
    if (!p) continue;
    if (/^(?:(?:(?:о?жидаемая|желаемая)\s+)?(?:зарплат[а-яё]*|вилка|доход)|уровень\s+дохода)$/i.test(p)) continue;
    if (
      /^(?:цель(?:\s+резюме)?|о\s+себе|занятость|график(?:\s+работы)?)(?:\s*[:：]|\s|$)/i.test(
        p
      )
    )
      continue;
    if (!parts.includes(p)) parts.push(p);
    if (parts.length >= 3) break;
  }
  return parts.join(", ");
}

function extractSalary(lines, text) {
  const labeled = labeledBlock(lines, [
    /^(?:(?:(?:о?жидаемая|желаемая)\s+)?(?:зарплат[а-яё]*|вилка|доход)|желаем[а-яё]+\s+уровень\s+дохода|уровень\s+дохода)\s*[:：]\s*(.*)$/i,
    /^(?:(?:(?:о?жидаемая|желаемая)\s+)?(?:зарплат[а-яё]*|вилка|доход)|желаем[а-яё]+\s+уровень\s+дохода|уровень\s+дохода)$/i,
  ]);
  if (labeled) return condenseSalary(labeled);
  const m = text.match(
    /(?:(?:о?жидаемая|желаемая)\s+)?(?:зарплат[а-яё]*|желаем[а-яё]+\s+уровень\s+дохода|уровень\s+дохода|доход)\s*[:：]\s*([^\n.;]{3,60})/i
  );
  if (m) return condenseSalary(m[1]);
  return "";
}

function extractExperience(lines, text) {
  const labeled = labeledBlock(lines, [
    /^(?:опыт(?:\s+работы)?|стаж)\s*[:：]\s*(.*)$/i,
    /^(?:опыт(?:\s+работы)?|стаж)$/i,
  ]);
  if (labeled) return condenseExperience(labeled) || labeled;
  const m =
    text.match(/(\d+)\s*(?:лет|года|год)\s*(?:опыта|стажа|стаж)/i) ||
    text.match(/(?:стаж|опыт(?:\s+работы)?)\s*(?:[:：\s—–-]\s*)(\d+)\s*(?:лет|года|год)/i);
  if (m) return `${m[1]} ${yearsWord(Number(m[1]))} опыта`;
  const periods = [];
  const re = /((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|наст\.?|по\s*наст\.?|present|сейчас)/gi;
  let pm;
  while ((pm = re.exec(text)) !== null && periods.length < 3) {
    const p = `${pm[1]}–${pm[2]}`;
    if (!periods.includes(p)) periods.push(p);
  }
  return periods.join("; ");
}

function extractContacts(text) {
  const parts = [];
  const phoneText = text
    .split(/\r?\n/)
    .filter((l) => !/ИНН|БИК|(?:р|к)\.?\s*\/?\s*с\.?|сч[ёе]т/i.test(l))
    .join("\n");
  const phone = phoneText.match(
    /(?<!\d)(?:\+?7|8)[\s\-(]{0,3}(?:\d[\s\-)]{0,2}){9,10}(?!\d)/
  );
  if (phone) parts.push(phone[0].replace(/\s+/g, " ").trim());
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) parts.push(email[0]);
  const tg = text.match(/(?:телеграм|telegram)\s*[:：]\s*@?([\w\d_]{3,})/i);
  if (tg) parts.push("@" + tg[1]);
  else {
    const at = text.match(/(?:^|\s)@[\w\d_]{4,}/m);
    if (at) parts.push(at[0].trim());
  }
  return [...new Set(parts)].join(", ");
}

function extractByHeuristics(text) {
  const lines = splitSections(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    name: extractName(lines),
    desiredPosition: extractDesiredPosition(lines),
    salary: extractSalary(lines, text),
    skills: extractSkills(lines, text),
    experience: extractExperience(lines, text),
    education: extractEducation(lines),
    contacts: extractContacts(text),
  };
}

async function extractStructuredData(text) {
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        return {
          name: typeof data.name === "string" ? data.name : "",
          desiredPosition:
            typeof data.desiredPosition === "string" ? data.desiredPosition : "",
          salary: typeof data.salary === "string" ? data.salary : "",
          skills: typeof data.skills === "string" ? data.skills : "",
          experience: typeof data.experience === "string" ? data.experience : "",
          education: typeof data.education === "string" ? data.education : "",
          contacts: typeof data.contacts === "string" ? data.contacts : "",
        };
      }
    }
  } catch (err) {
    // сервер не запущен (статический режим) — используем эвристику
  }
  return extractByHeuristics(text);
}

function render(candidates) {
  const list = document.getElementById("candidateList");
  list.innerHTML = "";

  const note = document.getElementById("storageNote");
  if (note) {
    note.textContent = serverMode
      ? "Хранилище: сервер (candidates.json)"
      : "Хранилище: localStorage (без сервера)";
  }

  if (!candidates.length) {
    const empty = document.createElement("li");
    empty.className = "candidate-empty";
    empty.textContent = currentQuery ? "Ничего не найдено" : "Кандидатов пока нет";
    list.appendChild(empty);
    return;
  }

  candidates.forEach((candidate) => {
    const li = document.createElement("li");

    if (candidate.id === editingId) {
      renderEditView(li, candidate);
      list.appendChild(li);
      return;
    }

    const rawEl = document.createElement("div");
    rawEl.className = "candidate-raw";
    rawEl.textContent = candidate.rawText;
    li.appendChild(rawEl);

    const data = candidate.structured || {};
    if (STRUCTURED_FIELDS.some(([k]) => data[k])) {
      const structuredEl = document.createElement("div");
      structuredEl.className = "candidate-structured";
      STRUCTURED_FIELDS.forEach(([key, label]) => {
        const row = document.createElement("div");
        const b = document.createElement("b");
        b.textContent = label + ": ";
        row.appendChild(b);
        row.appendChild(document.createTextNode(data[key] || "—"));
        structuredEl.appendChild(row);
      });
      li.appendChild(structuredEl);
    }

    const actions = document.createElement("div");
    actions.className = "candidate-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Редактировать";
    editBtn.addEventListener("click", () => {
      editingId = candidate.id;
      render(lastLoaded);
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Удалить";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Удалить кандидата?")) return;
      await deleteCandidate(candidate.id);
      await refresh();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    li.appendChild(actions);

    list.appendChild(li);
  });
}

function renderEditView(li, candidate) {
  const data = candidate.structured || {};

  const rawLabel = document.createElement("label");
  rawLabel.className = "edit-raw-label";
  rawLabel.textContent = "Исходный текст";
  const rawArea = document.createElement("textarea");
  rawArea.className = "candidate-raw edit-raw";
  rawArea.rows = 5;
  rawArea.value = candidate.rawText;
  li.appendChild(rawLabel);
  li.appendChild(rawArea);

  const fieldsEl = document.createElement("div");
  fieldsEl.className = "candidate-structured edit-fields";
  const inputs = {};
  STRUCTURED_FIELDS.forEach(([key, label]) => {
    const row = document.createElement("label");
    row.className = "edit-row";
    const b = document.createElement("b");
    b.textContent = label + ": ";
    row.appendChild(b);
    const input = document.createElement("input");
    input.type = "text";
    input.value = data[key] || "";
    inputs[key] = input;
    row.appendChild(input);
    fieldsEl.appendChild(row);
  });
  li.appendChild(fieldsEl);

  const actions = document.createElement("div");
  actions.className = "candidate-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary";
  saveBtn.textContent = "Сохранить";
  saveBtn.addEventListener("click", async () => {
    const structured = {};
    STRUCTURED_FIELDS.forEach(([key]) => (structured[key] = inputs[key].value.trim()));
    const updated = await updateCandidate(candidate.id, rawArea.value.trim(), structured);
    if (updated) {
      editingId = null;
      await refresh();
    }
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Отмена";
  cancelBtn.addEventListener("click", () => {
    editingId = null;
    render(lastLoaded);
  });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  li.appendChild(actions);
}

async function refresh() {
  lastLoaded = await fetchCandidates(currentQuery);
  render(lastLoaded);
}

function downloadFile(name, type, content) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function csvCell(value) {
  return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
}

function exportJson() {
  downloadFile(
    "candidates.json",
    "application/json;charset=utf-8",
    JSON.stringify(lastLoaded, null, 2)
  );
}

function exportCsv() {
  const header = ["ID", "Создан", ...STRUCTURED_FIELDS.map(([, label]) => label), "Исходный текст"];
  const rows = lastLoaded.map((c) => {
    const s = c.structured || {};
    return [
      c.id,
      c.createdAt || "",
      ...STRUCTURED_FIELDS.map(([key]) => s[key] || ""),
      c.rawText || "",
    ]
      .map(csvCell)
      .join(";");
  });
  const csv = "\uFEFF" + header.map(csvCell).join(";") + "\r\n" + rows.join("\r\n");
  downloadFile("candidates.csv", "text/csv;charset=utf-8", csv);
}

document.getElementById("resumeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("resumeText").value.trim();
  if (!text) return;

  const button = e.target.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const structured = await extractStructuredData(text);
    await addCandidate(text, structured);
    e.target.reset();
    editingId = null;
    await refresh();
  } finally {
    button.disabled = false;
  }
});

let searchTimer = null;
document.getElementById("candidateSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentQuery = e.target.value.trim();
    editingId = null;
    refresh();
  }, 300);
});

document.getElementById("exportJson").addEventListener("click", exportJson);
document.getElementById("exportCsv").addEventListener("click", exportCsv);

refresh();
