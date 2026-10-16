// Хранение кандидатов: сервер (/api/candidates), при его отсутствии — localStorage.

const STORAGE_KEY = "prokadry-candidates";
const TOKEN_KEY = "prokadry-token";

(function captureToken() {
  try {
    const p = new URLSearchParams(window.location.search);
    const t = (p.get("token") || "").trim();
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
      p.delete("token");
      history.replaceState(
        null,
        "",
        window.location.pathname + (p.toString() ? "?" + p.toString() : "") + window.location.hash
      );
    }
  } catch (e) {}
})();

function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch (e) {
    return "";
  }
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}

function authAlert() {
  alert("Нет доступа: задайте APP_TOKEN в .env и откройте страницу с ?token=ВАШ_ТОКЕН");
}
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
let listStatus = "";
let lastSaveError = "";
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
    const r = await fetch("/api/health", { cache: "no-store" });
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
      const r = await fetch(url, {
        cache: "no-store",
        headers: authHeaders(),
      });
      if (r.ok) {
        listStatus = "ok";
        return await r.json();
      }
      if (r.status === 401 || r.status === 503) {
        listStatus = "unauthorized";
        return [];
      }
      // прочие ошибки сервера (500/502/…) — данные локальные, честно меняем бейдж
      serverMode = false;
    } catch {
      // сервер пропал — уходим в localStorage
      serverMode = false;
    }
  }
  listStatus = "off";
  let list = loadLocal();
  const s = (q || "").trim().toLowerCase();
  if (s) list = list.filter((c) => localHaystack(c).includes(s));
  return list;
}

async function addCandidate(rawText, structured) {
  lastSaveError = "";
  if (await detectServer()) {
    try {
      const r = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, structured }),
      });
      if (r.ok) return await r.json();
      if (r.status !== 404) {
        lastSaveError =
          r.status === 429
            ? "слишком много запросов, подождите минуту"
            : "ошибка сервера HTTP " + r.status;
        return null;
      }
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
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ rawText, structured }),
      });
      if (r.ok) return await r.json();
      if (r.status === 401 || r.status === 503) {
        authAlert();
        return null;
      }
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
        headers: authHeaders(),
      });
      if (r.ok) return true;
      if (r.status === 401 || r.status === 503) {
        authAlert();
        return false;
      }
      if (r.status !== 404) return false;
    } catch {
      serverMode = false;
    }
  }
  saveLocal(loadLocal().filter((c) => c.id !== id));
  return true;
}

function render(candidates) {
  const list = document.getElementById("candidateList");
  list.innerHTML = "";

  const note = document.getElementById("storageNote");
  if (note) {
    note.textContent =
      serverMode === false
        ? "Хранилище: localStorage (без сервера) — ПДн хранятся в этом браузере"
        : listStatus === "unauthorized"
          ? "Сервер: нужен токен APP_TOKEN"
          : "Хранилище: сервер (candidates.json)";

    const oldBtn = document.getElementById("tokenBtn");
    if (oldBtn) oldBtn.remove();
    const oldLogout = document.getElementById("logoutBtn");
    if (oldLogout) oldLogout.remove();
    if (serverMode !== false && listStatus === "unauthorized") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "tokenBtn";
      btn.className = "token-btn";
      btn.textContent = "Ввести токен";
      btn.addEventListener("click", () => {
        const t = window.prompt(
          "Введите APP_TOKEN из .env на сервере (значение строки APP_TOKEN):"
        );
        if (t && t.trim()) {
          try {
            sessionStorage.setItem(TOKEN_KEY, t.trim());
          } catch (e) {}
          refresh().then(() => {
            if (listStatus === "unauthorized") {
              alert("Токен не принят — проверьте значение APP_TOKEN");
            }
          });
        }
      });
      note.insertAdjacentElement("afterend", btn);
    } else if (serverMode !== false && listStatus === "ok") {
      const out = document.createElement("button");
      out.type = "button";
      out.id = "logoutBtn";
      out.className = "token-btn token-btn-logout";
      out.textContent = "Выйти";
      out.title = "Удалить токен из этой вкладки";
      out.addEventListener("click", () => {
        try {
          sessionStorage.removeItem(TOKEN_KEY);
        } catch (e) {}
        listStatus = "";
        refresh();
      });
      note.insertAdjacentElement("afterend", out);
    }

    const oldClear = document.getElementById("clearLocalBtn");
    if (oldClear) oldClear.remove();
    if (serverMode === false) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.id = "clearLocalBtn";
      clear.className = "token-btn token-btn-clear";
      clear.textContent = "Очистить локальные данные";
      clear.title = "Удалить кандидатов (ПДн) из localStorage этого браузера";
      clear.addEventListener("click", () => {
        if (!confirm("Удалить всех локальных кандидатов (ПДн) из браузера?")) return;
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        lastLoaded = [];
        refresh();
      });
      note.insertAdjacentElement("afterend", clear);
    }
  }

  const authorized = serverMode === true && listStatus === "ok";
  const toolbar = document.querySelector(".candidates-toolbar");
  if (toolbar) toolbar.hidden = serverMode === true && !authorized;
  const exportJsonBtn = document.getElementById("exportJson");
  const exportCsvBtn = document.getElementById("exportCsv");
  if (exportJsonBtn) exportJsonBtn.hidden = !authorized;
  if (exportCsvBtn) exportCsvBtn.hidden = !authorized;
  list.hidden = serverMode === true && !authorized;

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
  let s = String(value == null ? "" : value);
  if (/^\s*[+\-@=]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
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

  const errorBox = document.getElementById("formError");
  const button = e.target.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const structured = await extractStructuredData(text);
    const item = await addCandidate(text, structured);
    if (!item) {
      if (errorBox) {
        errorBox.textContent =
          "Резюме НЕ сохранено (" +
          (lastSaveError || "не удалось сохранить") +
          "). Ваш текст не потерян — попробуйте отправить ещё раз.";
        errorBox.hidden = false;
      }
      return;
    }
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    e.target.reset();
    editingId = null;
    await refresh();
  } catch (err) {
    if (errorBox) {
      errorBox.textContent =
        "Ошибка: " +
        (err && err.message ? err.message : err) +
        ". Ваш текст не потерян.";
      errorBox.hidden = false;
    }
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
