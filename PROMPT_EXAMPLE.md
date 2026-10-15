# Пример промпта — извлечение данных из резюме

Реальный промпт, который отправляется в GigaChat, находится в `server.js`
(константа `SYSTEM_PROMPT`). Ниже — его копия для ориентира.

## Системный промпт

```
Ты — точный парсер резюме кандидатов.
Извлеки из переданного текста резюме JSON ровно с 7 полями:
name — ФИО кандидата;
desiredPosition — желаемая должность или цель (например «Цель: Бухгалтер»);
salary — желаемая зарплата или вилка;
skills — ключевые навыки через запятую;
experience — краткий опыт (должность, организация, периоды) через запятую;
education — краткое образование (вуз, специальность, год) через запятую;
contacts — контакты через запятую (телефон, email, telegram).
Все значения — строки на русском языке.
Если поле отсутствует в тексте — верни пустую строку, ничего не выдумывай.
Ответь ТОЛЬКО одним JSON-объектом без markdown-блоков и пояснений.
```

## Пользовательский промпт (подставляется текст резюме)

```
Текст резюме (максимум 60 000 символов) передаётся как обычная
пользовательская реплика в POST /v1/chat/completions.
```

## Ожидаемый ответ модели

```json
{
  "name": "Мария Иванова",
  "desiredPosition": "HR-менеджер",
  "salary": "от 80 000 ₽",
  "skills": "SMM, аналитика, 1С",
  "experience": "5 лет в маркетинге",
  "education": "МГУ, Менеджмент, 2019",
  "contacts": "+7 900 111-22-33, ivanov@mail.ru"
}
```

Значения полей используются как строки карточки кандидата
(порядок в `script.js`, функция `render`).

## Запрос по HTTP (как делает сервер)

```bash
POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <ключ из .env, GIGACHAT_AUTH_KEY>

scope=GIGACHAT_API_PERS
```

```bash
POST https://api.giga.chat/v1/chat/completions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "model": "GigaChat-2-Pro",
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT выше>" },
    { "role": "user", "content": "<текст резюме>" }
  ]
}
```

Ответ модели разбирается в `parseModelJson` (`server.js`): допускаются
markdown-блоки ```json и текст до/после объекта; невалидный ответ →
HTTP 502 → клиент использует эвристику.
