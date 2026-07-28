# Потолок Пати — AI-ассистент для потолочной компании

ИИ-помощник для приёма заявок, расчёта смет и автоматизации продаж.

**Состав:**
- Чат-бот на сайте (приём лидов, квалификация, запись на замер)
- Калькулятор смет (тип полотна, свет, профили, карнизы, ниши, допработы)
- Панель менеджера (CRM, сделки, задачи, аналитика)
- Ассистент менеджера (шаблоны сообщений, FAQ)
- Интеграция с Bitrix24 / MegaCRM
- Экспорт отчётов (CSV)

**Стек:** Node.js, Express, OpenAI SDK (Hubris), JSON-хранилище

## Безопасность

- **Rate limiting:** 100 запросов/мин на API, 30 запросов/мин на чат
- **Аутентификация:** опциональный `AUTH_TOKEN` в `.env` для доступа к панели менеджера и CRM API

## Быстрый старт

```bash
git clone https://github.com/ваш-аккаунт/potolok-party.git
cd potolok-paty
npm install
# На Windows PowerShell / Git Bash
cp .env.example .env
# В командной строке Windows (cmd.exe)
copy .env.example .env
# отредактировать .env — вставить ключ Hubris при необходимости
npm start
```

Открыть `http://localhost:3000`

## Демонстрация на Потолок Party

Для локальной презентации в демо-режиме, когда нужны примеры заказов, менеджер и монтажник сразу доступны:

```bash
npm run demo
```

Откройте `http://localhost:3000/qr.html?demo` и переходите в нужный режим:
- Менеджер: `http://localhost:3000/manager.html?demo`
- Монтажник: `http://localhost:3000/installer.html?demo`
- Калькулятор: `http://localhost:3000/calculator.html`

## Деплой на Render

1. Залить код на GitHub
2. На render.com → New Web Service → выбрать репозиторий
3. Build Command: `npm install`
4. Start Command: `node server/index.js`
5. В секретах добавить переменные из `.env.example`
6. Deploy

## Переменные окружения

| Переменная | Обязательно | Описание |
|---|---|---|
| HUBRIS_API_KEY | да | Ключ Hubris (sk-gw-...) |
| HUBRIS_BASE_URL | да | https://api.hubris.pw/v1 |
| HUBRIS_MODEL | да | hubris/free |
| AUTH_TOKEN | нет | Токен для панели менеджера и CRM API |
| PORT | нет | 3000 по умолчанию |
| BITRIX24_WEBHOOK | нет | Для интеграции с Bitrix24 |
| MEGACRM_API_KEY | нет | Для интеграции с MegaCRM |
| SMTP_* | нет | Для email-уведомлений |
| TELEGRAM_BOT_TOKEN | нет | Для Telegram-уведомлений |
