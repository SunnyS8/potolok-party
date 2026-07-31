// Интеграции с внешними CRM: Bitrix24 (вебхук), MegaCRM (API) и Telegram.
// Каждая интеграция включается переменными окружения и не блокирует работу при недоступности.

const BITRIX24_WEBHOOK = process.env.BITRIX24_WEBHOOK; // https://<domain>.bitrix24.ru/rest/<user>/<token>/
const MEGACRM_BASE = process.env.MEGACRM_BASE_URL;     // https://<company>.megacrm.ru
const MEGACRM_API_KEY = process.env.MEGACRM_API_KEY;

function status() {
  return {
    bitrix24: { enabled: !!BITRIX24_WEBHOOK },
    megacrm: { enabled: !!(MEGACRM_BASE && MEGACRM_API_KEY) },
    telegram: { enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
    email: { enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) },
  };
}

function leadToPayload(data) {
  const productLabel = data.productType === 'walls'
    ? 'СИС (стены)'
    : data.productType === 'combined' ? 'Потолки + Стены' : 'Потолки';
  const wallInfo = data.hasWalls || data.productType === 'walls' || data.productType === 'combined'
    ? (data.wallArea ? 'Стены СИС: ' + data.wallArea + ' м²' : 'Стены СИС: да')
    : '';
  const ceilingInfo = data.productType !== 'walls'
    ? (data.ceilingType ? 'Тип: ' + data.ceilingType + (data.area ? ', ' + data.area + ' м²' : '') : (data.area ? 'Площадь: ' + data.area + ' м²' : ''))
    : '';
  const details = [ceilingInfo, wallInfo].filter(Boolean).join('. ');
  const lights = data.hasLights ? 'Светильники: да' : '';

  return {
    name: data.name || 'Без имени',
    phone: data.phone || '',
    email: data.email || '',
    source: data.source || 'сайт',
    product: productLabel,
    details: [details, lights].filter(Boolean).join('. '),
    comment: data.notes || '',
  };
}

async function sendBitrix24(data) {
  if (!BITRIX24_WEBHOOK) return { sent: false, reason: 'Bitrix24 не настроен' };

  const p = leadToPayload(data);
  const fields = {
    TITLE: 'Лид: ' + p.product + (p.name ? ' — ' + p.name : ''),
    NAME: p.name,
    PHONE: [{ VALUE: p.phone, VALUE_TYPE: 'WORK' }],
    EMAIL: [{ VALUE: p.email, VALUE_TYPE: 'WORK' }],
    SOURCE_DESCRIPTION: 'Флюкс: ' + p.source,
    COMMENTS: (p.details ? p.details + '\n' : '') + (p.comment || ''),
  };
  try {
    const res = await fetch(BITRIX24_WEBHOOK + 'crm.lead.add.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const body = await res.json();
    if (!res.ok || body.error) return { sent: false, reason: body.error_description || body.error || ('HTTP ' + res.status) };
    return { sent: true, crmId: body.result };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function sendMegaCRM(data) {
  if (!MEGACRM_BASE || !MEGACRM_API_KEY) return { sent: false, reason: 'MegaCRM не настроен' };

  const p = leadToPayload(data);
  const payload = {
    apiKey: MEGACRM_API_KEY,
    data: [{
      type: 'client',
      last_name: p.name,
      phones: [{ phone: p.phone, comment: '' }],
      emails: [{ email: p.email, comment: '' }],
      custom: {
        source: p.source,
        product: p.product,
        details: p.details,
        comment: p.comment,
      },
    }],
  };
  try {
    const res = await fetch(MEGACRM_BASE + '/api/clients?apiKey=' + encodeURIComponent(MEGACRM_API_KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) return { sent: false, reason: 'HTTP ' + res.status + ': ' + body.slice(0, 200) };
    return { sent: true, response: body.slice(0, 200) };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function sendToCrm(data) {
  const results = await Promise.all([
    sendBitrix24(data).catch(() => ({ sent: false, reason: 'bitrix24 error' })),
    sendMegaCRM(data).catch(() => ({ sent: false, reason: 'megacrm error' })),
  ]);
  const sent = results.filter(r => r.sent).map(r => r.crmId || r.response || 'ok');
  return { sentCount: sent.length, results };
}

module.exports = { sendToCrm, sendBitrix24, sendMegaCRM, status, leadToPayload };
