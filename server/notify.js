const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmailNotification(data) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'SMTP not configured' };

  const to = process.env.NOTIFY_EMAIL || process.env.SMTP_USER;
  if (!to) return { sent: false, reason: 'No recipient email' };

  const subject = `🔔 Новая заявка: ${data.name || 'без имени'}`;
  const text = `
Новая заявка с сайта «Потолок Пати»

Имя: ${data.name || '—'}
Телефон: ${data.phone || '—'}
Email: ${data.email || '—'}
Источник: ${data.source || 'сайт'}
Тип потолка: ${data.ceilingType || '—'}
Площадь: ${data.area ? data.area + ' м²' : '—'}
Светильники: ${data.hasLights ? 'Да' : 'Нет/Не указано'}
Комментарий: ${data.notes || '—'}

Дата: ${new Date().toLocaleString('ru-RU')}
  `.trim();

  try {
    await t.sendMail({ from: process.env.SMTP_USER, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendTelegramNotification(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'Telegram not configured' };

  const text = `
🔔 <b>Новая заявка</b>
👤 ${data.name || '—'}
📞 ${data.phone || '—'}
📧 ${data.email || '—'}
📐 Тип: ${data.ceilingType || '—'}
📏 Площадь: ${data.area ? data.area + ' м²' : '—'}
💡 Свет: ${data.hasLights ? 'Да' : 'Нет'}
📝 ${data.notes || '—'}
  `.trim();

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const ok = res.ok;
    return { sent: ok, reason: ok ? '' : await res.text() };
  } catch (err) {
    console.error('Telegram error:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function notifyAll(data) {
  const results = await Promise.all([
    sendEmailNotification(data).catch(() => ({ sent: false })),
    sendTelegramNotification(data).catch(() => ({ sent: false })),
  ]);
  return results;
}

module.exports = { sendEmailNotification, sendTelegramNotification, notifyAll };
