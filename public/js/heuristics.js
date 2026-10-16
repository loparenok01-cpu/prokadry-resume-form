// Эвристический разбор резюме (7 полей), без DOM-зависимостей.
// Работает и в браузере (classic script подключается перед script.js),
// и в Node — тесты подключают через require() без eval-маркеров script.js.

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

const DUTY_SKILL_MAP = [
  [/кадров[а-яё]*\s+делопроизводств|оформление\s+при[её]ма\s+на\s+работу/i, "Кадровое делопроизводство"],
  [/трудов[а-яё]*\s+кни/i, "Трудовые книжки"],
  [/трудов[а-яё]*\s+договор/i, "Трудовые договоры и соглашения"],
  [/штатн[а-яё]*\s+расписани/i, "Штатное расписание"],
  [/график[а-яё]*\s+отпуск/i, "Графики отпусков"],
  [/табел[а-яё]*\s+уч[её]та\s+рабочего\s+времени/i, "Табель учета рабочего времени"],
  [/личн[а-яё]*\s+дел/i, "Личные дела сотрудников"],
  [/воинск[а-яё]*\s+уч[её]т/i, "Воинский учет"],
  [/подсч[её]т[а-яё]*\s+стажа|начислен[а-яё]*\s+стажа/i, "Подсчет стажа"],
  [/(?:СЗВ[-\s]?Р|ЕФС[-\s]?1)/i, "Кадровая отчетность СЗВ-Р/ЕФС-1"],
  [/1\s*[СC]\s*[:\-]?\s*ЗУП/i, "1С:ЗУП"],
  [/ЕКАСУТР/i, "ЕКАСУТР"],
  [/суммированн[а-яё]*\s+уч[её]т/i, "Суммированный учет рабочего времени"],
  [/командиров/i, "Командировки"],
  [/локальн[а-яё]*\s+акт/i, "Локальные нормативные акты"],
  [/должностн[а-яё]*\s+инструкц/i, "Должностные инструкции"],
  [/справ[а-яё]+\s+с\s+места\s+работы/i, "Справки с места работы"],
  [/(?:карточк[а-яё]*\s+формы\s+)?Т[-\s]?2\b/i, "Кадровые карточки Т-2"],
];

function generalizeDuties(text) {
  const out = [];
  for (const [re, label] of DUTY_SKILL_MAP) {
    if (re.test(text)) out.push(label);
  }
  return out;
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
  const merged = [];
  const seen = new Set();
  for (const skill of [...generalizeDuties(text), ...found]) {
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(skill);
  }
  return merged
    .filter(
      (s) =>
        !merged.some(
          (t) => t !== s && t.toLowerCase().includes(s.toLowerCase())
        )
    )
    .slice(0, 20)
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

const EXP_PERIOD_RE =
  /^((?:\d{1,2}[\/.](?:19|20)\d{2})|(?:19|20)\d{2})\s*[-–—]\s*((?:\d{1,2}[\/.](?:19|20)\d{2})|(?:19|20)\d{2}|наст\.?(?:\s+врем[яи])?|по\s*наст\.?|present|сейчас)\s*$/i;
const EXP_DUTY_RE = /^(?:\d{1,2}[.)]\s+|[-–—•]\s+)/;

function periodKey(p) {
  const s = String(p || "").trim();
  if (/^(?:(?:по\s*)?наст|present|сейчас)/i.test(s)) return 99999;
  let m = s.match(/^(\d{1,2})[\/.]((?:19|20)\d{2})/);
  if (m) return Number(m[2]) + (Math.min(Number(m[1]), 12) - 1) / 12;
  m = s.match(/((?:19|20)\d{2})/);
  if (m) return Number(m[1]) + 0.99;
  return 0;
}

function yearOf(p) {
  const m = String(p || "").match(/((?:19|20)\d{2})/);
  return m ? Number(m[1]) : null;
}

function normPeriod(p) {
  const s = String(p || "").trim();
  if (/^(?:(?:по\s*)?наст|present|сейчас)/i.test(s)) return "наст.";
  return s;
}

function clipChars(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/[\s,;:.]+$/, "") + "…";
}

function stripParens(s) {
  return String(s || "")
    .replace(/[(][^)]*[)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function placesWord(n) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "место работы";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "места работы";
  return "мест работы";
}

function parseExperienceEntries(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^опыт(?:\s+работы)?\s*[:：]?\s*$/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return [];
  const entries = [];
  let cur = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (isSectionEnd(line)) {
      if (cur) {
        entries.push(cur);
        cur = null;
      }
      break;
    }
    const pm = line.match(EXP_PERIOD_RE);
    if (pm) {
      if (cur) entries.push(cur);
      cur = { start: pm[1], end: pm[2], org: "", position: "", duties: [] };
      continue;
    }
    if (!cur) continue;
    if (EXP_DUTY_RE.test(line)) {
      cur.duties.push(line);
      continue;
    }
    if (!cur.org) {
      cur.org = line;
      continue;
    }
    if (!cur.position && !/:\s*$/.test(line)) {
      cur.position = line;
      continue;
    }
    cur.duties.push(line);
  }
  if (cur) entries.push(cur);
  return entries.filter((e) => e.org || e.position || e.duties.length);
}

function condenseExperienceEntries(entries) {
  const nowYear = new Date().getFullYear();
  const sorted = [...entries].sort((a, b) => periodKey(b.end) - periodKey(a.end));
  const recent = sorted.filter((e) => periodKey(e.end) >= nowYear - 10);
  const head = recent.length ? recent.slice(0, 4) : sorted.slice(0, 3);
  const rest = sorted.filter((e) => !head.includes(e));
  const out = head.map((e) => {
    const period = `${normPeriod(e.start)}–${normPeriod(e.end)}`;
    const position = clipChars(stripParens(e.position), 60);
    const org = clipChars(e.org, 70);
    const parts = [position, org].filter(Boolean);
    return parts.length ? `${period}: ${parts.join(", ")}` : period;
  });
  if (rest.length) {
    const starts = rest.map((e) => yearOf(e.start)).filter((y) => y !== null);
    const ends = rest.map((e) => yearOf(e.end)).filter((y) => y !== null);
    const from = starts.length ? Math.min(...starts) : null;
    const to = ends.length ? Math.max(...ends) : null;
    const range =
      from === null ? "" : ` (${from}${to !== null && to !== from ? "–" + to : ""})`;
    out.push(`ранее: ${rest.length} ${placesWord(rest.length)}${range}`);
  }
  return out.join("; ");
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
  const simple = raw
    .split(/;\s*/)
    .map((s) => s.trim().replace(/[,;.]+$/, ""))
    .filter(Boolean)
    .join(", ");
  return simple.slice(0, 300);
}

function extractEducation(lines) {
  const patterns = [
    /образование\s*[:：]\s*(.*)$/i,
    /^образование$/i,
    /^образование\s*\/\s*квалификация\s*[:：]\s*(.*)$/i,
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
      if (/^должность\s*[:：]/i.test(lines[j])) break;
      parts.push(lines[j].replace(/[,;]\s*$/, ""));
    }
    const block = parts.join("; ");
    if (block.length > best.length) best = block;
  }
  if (!best) return "";
  return condenseEducation(best) || best;
}

const SECTION_TITLE_RE =
  /^(?:краткие|личные|основные|общие|дополнительные|анкетные)\s+(?:сведения|информация|данные)|^резюме/i;

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
  for (let i = nameIdx + 1; i <= nameIdx + 6 && i < lines.length; i++) {
    const line = lines[i];
    if (isSectionEnd(line) || SECTION_TITLE_RE.test(line)) break;
    if (looksLikeOrg(line)) continue;
    if (looksLikePosition(line)) return line;
  }
  const position = labeledBlock(lines, [
    /^должность\s*[:：]\s*(.*)$/i,
    /^должность$/i,
  ]);
  if (position) {
    for (const seg of position
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (looksLikeOrg(seg)) continue;
      if (looksLikePosition(seg)) return cleanRest(seg);
    }
  }
  return "";
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

function looksLikeOrg(line) {
  if (!line) return false;
  if (/["«»„“”]/.test(line)) return true;
  if (/^(?:ООО|ЗАО|ПАО|АО|ИП|МУП|ГУП|ФГУП|АНО|НАО|НКО|ОПО)(?![а-яё])/i.test(line))
    return true;
  if (
    /^(?:учреждени|предприяти|организаци|компани|министерств|администрац|бюро|институт|университет|академи|фабрик|завод|центр|управлени|проект)/i.test(
      line
    )
  )
    return true;
  return line.length > 60;
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
  const entries = parseExperienceEntries(lines);
  if (entries.length >= 2) return condenseExperienceEntries(entries);
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
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    splitSections,
    looksLikePosition,
    looksLikeOrg,
    extractByHeuristics,
    extractStructuredData,
  };
}
