# СИС — калькулятор натяжных потолков и стен

Один продукт: смета на натяжной потолок, бесшовные стены (СИС) или комплекс «потолок + стены» (скидка 12%) за 15 секунд. В конце расчёта — компактная форма заявки (имя, телефон).

**Стек:** Node.js, Express, SQLite (Node 22+), vanilla-фронтенд (без сборки), jsdom для тестов фронтенда.

## Состав

- `/` — калькулятор смет (React-бандл заменён на vanilla-приложение)
  - Шаги: тип работ → размеры → опции → итог (live-пересчёт, sticky-итог)
  - Скачивание сметы в PDF
  - Форма заявки → `/api/lead` (уведомления email/Telegram, передача в Bitrix24/MegaCRM — опционально)
- API:
  - `GET /api/prices` — прайс
  - `POST /api/calculator` — потолок
  - `POST /api/walls/calculate` — стены (быстрый и детальный режимы)
  - `POST /api/calculator/combined` — комплекс
  - `POST /api/export/pdf`, `POST /api/walls/export/pdf` — PDF-смета
  - `POST /api/lead` — заявка
  - `GET /api/health` — проверка

Всё остальное (роли, CRM, чат-бот, аналитика, лендинги) из продукта вырезано.

## Быстрый старт

```bash
npm install
copy .env.example .env
npm start
```

Открыть `http://localhost:3000`

## Тесты

```bash
npm test
```

Проверяют расчётные API (потолок/стены/комплекс), заявку, PDF и полный сценарий фронтенда в jsdom (выбор типа, размеры, опции, итог, PDF, отправка заявки).

## Деплой на Render

1. Залить код на GitHub
2. render.com → New → Blueprint → выбрать репозиторий (используется `render.yaml`)
3. Тариф `starter` — persistent disk `/var/data` (данные не теряются при перезапуске)
4. В секретах: `HUBRIS_API_KEY`, `HUBRIS_MODEL` (или `OPENAI_API_KEY`), `NOTIFY_EMAIL`
5. Deploy

## Переменные окружения

| Переменная | Обязательно | Описание |
|---|---|---|
| HUBRIS_API_KEY | нет | Ключ Hubris (sk-gw-...) |
| HUBRIS_BASE_URL | нет | https://api.hubris.pw/v1 |
| HUBRIS_MODEL | нет | Модель Hubris (не `hubris/free`) |
| OPENAI_API_KEY | нет | Запасной провайдер |
| PORT | нет | 3000 по умолчанию |
| DATA_DIR | нет | Путь к папке с данными (SQLite) |
| NOTIFY_EMAIL | нет | Email для уведомлений о заявках |
| SMTP_* | нет | Настройки SMTP |
| TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID | нет | Уведомления в Telegram |
| BITRIX24_WEBHOOK / MEGACRM_API_KEY | нет | Передача заявок в CRM |