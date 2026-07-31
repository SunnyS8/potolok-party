const db = require('./db');

const crmAdapter = { name: 'local', active: false };

function init() {
  if (process.env.BITRIX24_WEBHOOK) {
    crmAdapter.name = 'bitrix24';
    crmAdapter.active = true;
    console.log('CRM: Bitrix24 подключен');
  } else if (process.env.MEGACRM_API_KEY) {
    crmAdapter.name = 'megacrm';
    crmAdapter.active = true;
    console.log('CRM: MegaCRM подключен');
  } else {
    console.log('CRM: локальное хранение (JSON)');
  }
}

async function createLead(leadData) {
  const local = db.saveLead(leadData);

  if (crmAdapter.active) {
    try {
      if (crmAdapter.name === 'bitrix24') await pushToBitrix24(leadData);
      if (crmAdapter.name === 'megacrm') await pushToMegaCRM(leadData);
    } catch (err) {
      console.error('CRM push error:', err.message);
    }
  }

  db.trackEvent('lead_created', { leadId: local.id, source: leadData.source });
  return local;
}

async function createDeal(leadId, dealData) {
  const lead = db.getLeadById(leadId);
  if (!lead) throw new Error('Лид не найден');

  const deal = db.saveDeal({ leadId, ...dealData, status: 'negotiation' });

  db.saveComment('deal', deal.id, 'system', 'Сделка создана из лида #' + leadId);
  db.saveComment('lead', leadId, 'system', 'Создана сделка #' + deal.id + ' (' + (dealData.ceilingType || 'потолок') + ')');

  if (crmAdapter.active) {
    try {
      if (crmAdapter.name === 'bitrix24') await pushDealToBitrix24(lead, dealData);
    } catch (err) {
      console.error('CRM deal push error:', err.message);
    }
  }

  db.updateLead(leadId, { status: 'deal', dealId: deal.id });
  db.trackEvent('deal_created', { dealId: deal.id, leadId });
  return deal;
}

async function createTask(taskData) {
  const task = db.saveTask(taskData);

  if (crmAdapter.active && crmAdapter.name === 'bitrix24') {
    try {
      await pushTaskToBitrix24(taskData);
    } catch (err) {
      console.error('CRM task push error:', err.message);
    }
  }

  db.trackEvent('task_created', { taskId: task.id, type: taskData.type });
  return task;
}

async function updateDealStatus(dealId, status) {
  const deal = db.updateDeal(dealId, { status });
  if (deal) {
    const labels = {
      negotiation: 'Переговоры', measurement_scheduled: 'Замер назначен',
      measurement_done: 'Замер выполнен', won: 'Выиграна', lost: 'Потеряна',
    };
    db.saveComment('deal', dealId, 'system', 'Статус изменён: ' + (labels[status] || status));
    db.trackEvent('deal_status_changed', { dealId, status });
    if (status === 'measurement_scheduled') {
      createReminderTask(deal);
    }
    if (status === 'won' || status === 'lost') {
      db.updateLead(deal.leadId, { status: status === 'won' ? 'won' : 'lost' });
    }
  }
  return deal;
}

async function pushToBitrix24(data) {
  const webhook = process.env.BITRIX24_WEBHOOK;
  const fields = {
    TITLE: `Заявка: ${data.name || 'без имени'}`,
    NAME: data.name || '',
    PHONE: [{ VALUE: data.phone || '', VALUE_TYPE: 'WORK' }],
    SOURCE_ID: data.source === 'chat' ? 'WEB' : 'CALLBACK',
    COMMENTS: `Тип потолка: ${data.ceilingType || '—'}\nПлощадь: ${data.area ? data.area + ' м²' : '—'}\n${data.notes || ''}`,
  };
  const res = await fetch(`${webhook}/crm.lead.add.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

async function pushDealToBitrix24(lead, dealData) {
  const webhook = process.env.BITRIX24_WEBHOOK;
  const fields = {
    TITLE: `Сделка: ${lead.name || 'без имени'} — ${dealData.ceilingType || 'потолок'}`,
    CONTACT_ID: lead.bitrixContactId || 0,
    STAGE_ID: 'NEW',
    CURRENCY_ID: 'RUB',
    OPPORTUNITY: dealData.estimatedPrice || 0,
    COMMENTS: `Площадь: ${dealData.area || '—'} м²\nОпции: ${(dealData.options || []).join(', ')}`,
  };
  const res = await fetch(`${webhook}/crm.deal.add.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

async function pushTaskToBitrix24(taskData) {
  const webhook = process.env.BITRIX24_WEBHOOK;
  const fields = {
    TITLE: taskData.title,
    DESCRIPTION: taskData.description || '',
    RESPONSIBLE_ID: taskData.responsibleId || 1,
    DEADLINE: taskData.dueDate || null,
  };
  const res = await fetch(`${webhook}/tasks.task.add.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

async function pushToMegaCRM(data) {
  const apiKey = process.env.MEGACRM_API_KEY;
  const baseUrl = process.env.MEGACRM_BASE_URL || 'https://api.megacrm.ru/v1';
  const res = await fetch(`${baseUrl}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({
      name: data.name,
      phone: data.phone,
      comment: `Тип потолка: ${data.ceilingType || '—'}, Площадь: ${data.area || '—'} м²`,
      source: data.source,
    }),
  });
  return res.json();
}

function createReminderTask(deal) {
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.saveTask({
    dealId: deal.id,
    type: 'reminder',
    title: `Напомнить о замере по сделке #${deal.id}`,
    dueDate,
    done: false,
  });
}

module.exports = { init, createLead, createDeal, createTask, updateDealStatus, getDeals: db.getDeals, getTasks: db.getTasks, getLeads: db.getLeads, updateLead: db.updateLead };
