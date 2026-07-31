(function() {
  const SESSION_KEY = 'potolok_session';
  let sessionId = localStorage.getItem(SESSION_KEY) || '';

  const styles = document.createElement('style');
  styles.textContent = `
:root { --bg-base: #F5F5F7; --text-primary: #1F2933; --text-secondary: #6B7280; --surface-card: #FFFFFF; --border-light: #E5E7EB; --border-medium: #CBD2D9; --accent-primary: #2563EB; --accent-success: #16A34A; --accent-error: #DC2626; --accent-warning: #F59E0B; --hover-primary: #1D4ED8; --disabled-bg: #E5E7EB; --disabled-text: #9CA3AF; }
.chat-toggle { position:fixed; bottom:24px; right:24px; width:52px; height:52px; background:var(--accent-primary); color:#fff; border:none; cursor:pointer; border-radius:8px; font-size:22px; z-index:9999; transition:all 0.2s; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(37,99,235,0.25); }
.chat-toggle:hover { background:var(--hover-primary); box-shadow:0 6px 16px rgba(37,99,235,0.35); }
.chat-toggle .badge { position:absolute; top:-4px; right:-4px; width:18px; height:18px; background:var(--accent-error); border-radius:9px; font-size:10px; display:flex; align-items:center; justify-content:center; display:none; color:#fff; font-weight:600; font-family:'Inter',sans-serif; }

.chat-panel { position:fixed; bottom:88px; right:24px; width:380px; height:540px; background:var(--surface-card); border:1px solid var(--border-light); border-radius:10px; display:none; flex-direction:column; z-index:9998; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.08); animation:slideUp 0.2s ease; }
@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
.chat-panel.open { display:flex; }

.chat-header { background:var(--accent-primary); color:#fff; padding:1rem 1.2rem; display:flex; align-items:center; justify-content:space-between; }
.chat-header-info { display:flex; align-items:center; gap:0.6rem; }
.chat-avatar { width:32px; height:32px; background:rgba(255,255,255,0.15); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:600; }
.chat-header-title { font-weight:500; font-size:0.9rem; }
.chat-header-sub { font-size:0.7rem; text-transform:uppercase; font-weight:600; opacity:0.7; letter-spacing:0.05em; }
.chat-close { background:none; border:none; color:#fff; font-size:1.2rem; cursor:pointer; opacity:0.7; transition:opacity 0.2s; padding:0; line-height:1; }
.chat-close:hover { opacity:1; }

.chat-messages { flex:1; overflow-y:auto; padding:1rem; display:flex; flex-direction:column; gap:0.5rem; background:var(--surface-card); }
.msg { max-width:88%; padding:0.65rem 0.9rem; font-size:0.875rem; line-height:1.5; word-wrap:break-word; white-space:pre-wrap; }
.msg.bot { align-self:flex-start; background:var(--bg-base); border:1px solid var(--border-light); color:var(--text-primary); border-radius:8px; }
.msg.user { align-self:flex-end; background:var(--accent-primary); color:#fff; border-radius:8px; }
.msg.system { align-self:center; background:transparent; color:var(--text-secondary); font-size:0.75rem; text-align:center; max-width:100%; }

.chat-input-area { padding:0.75rem 1rem; border-top:1px solid var(--border-light); display:flex; gap:0.5rem; background:var(--surface-card); }
.chat-input { flex:1; padding:0.6rem 0.75rem; border:1px solid var(--border-medium); border-radius:6px; font-size:0.875rem; outline:none; background:var(--surface-card); color:var(--text-primary); font-family:'Inter',sans-serif; }
.chat-input:focus { border-color:var(--accent-primary); box-shadow:0 0 0 3px rgba(37,99,235,0.1); }
.chat-input::placeholder { color:var(--text-secondary); }
.chat-send { width:36px; height:36px; background:var(--accent-primary); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; justify-content:center; transition:all 0.2s; flex-shrink:0; }
.chat-send:hover { background:var(--hover-primary); }
.chat-send:disabled { opacity:0.4; cursor:default; }

.chat-actions { padding:0.5rem 1rem; border-top:1px solid var(--border-light); display:flex; gap:0.4rem; flex-wrap:wrap; background:var(--surface-card); }
.chat-action-btn { padding:0.35rem 0.75rem; border:1px solid var(--border-light); background:var(--surface-card); color:var(--accent-primary); border-radius:6px; font-size:0.75rem; cursor:pointer; transition:all 0.2s; white-space:nowrap; font-weight:500; }
.chat-action-btn:hover { border-color:var(--accent-primary); background:#EFF6FF; }

.typing { display:flex; gap:3px; padding:0.65rem 0.9rem; align-items:center; background:var(--bg-base); border-radius:8px; border:1px solid var(--border-light); }
.typing span { width:6px; height:6px; background:var(--accent-primary); border-radius:3px; animation:bounce 1.2s infinite; }
.typing span:nth-child(2) { animation-delay:0.2s; }
.typing span:nth-child(3) { animation-delay:0.4s; }
@keyframes bounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-4px); } }

@media (max-width:480px) {
  .chat-panel { width:calc(100vw - 24px); right:12px; bottom:86px; height:calc(100vh - 130px); }
}
`;
  document.head.appendChild(styles);

  const toggle = document.createElement('button');
  toggle.className = 'chat-toggle';
  toggle.id = 'chatToggle';
  toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="badge" id="chatBadge">1</span>';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'chat-panel';
  panel.id = 'chatPanel';
  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <div class="chat-avatar">AI</div>
        <div>
          <div class="chat-header-title">Потолок Пати</div>
          <div class="chat-header-sub">ИИ-помощник</div>
        </div>
      </div>
      <button class="chat-close" id="chatClose">✕</button>
    </div>
    <div class="chat-messages" id="chatMessages">
      <div class="msg bot">Здравствуйте! Я ИИ-помощник компании «Потолок Пати».

Могу помочь с выбором потолка, рассказать о ценах или вызвать замерщика. Что вас интересует?</div>
    </div>
    <div class="chat-actions" id="chatActions">
      <button class="chat-action-btn" data-msg="Мне нужен расчёт">Мне нужен расчёт</button>
      <button class="chat-action-btn" data-msg="Скажите цену">Скажите цену</button>
      <button class="chat-action-btn" data-msg="Заказать замер">Заказать замер</button>
      <button class="chat-action-btn" data-msg="Позвоните мне">Позвоните мне</button>
    </div>
    <div class="chat-input-area">
      <input class="chat-input" id="chatInput" placeholder="Напишите сообщение..." maxlength="500">
      <button class="chat-send" id="chatSend">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  const messages = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  const closeBtn = document.getElementById('chatClose');
  const badge = document.getElementById('chatBadge');
  const actions = document.getElementById('chatActions');

  let isOpen = false;
  let isLoading = false;

  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    badge.style.display = 'none';
    if (isOpen) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    panel.classList.remove('open');
  });

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    scrollBottom();
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg bot typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(div);
    scrollBottom();
  }

  function hideTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (isLoading || !text.trim()) return;
    isLoading = true;
    sendBtn.disabled = true;
    input.disabled = true;

    addMessage('user', text.trim());
    input.value = '';
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId })
      });
      const data = await res.json();
      sessionId = data.sessionId;
      localStorage.setItem(SESSION_KEY, sessionId);
      hideTyping();
      addMessage('bot', data.reply);

      if (data.readyToOrder) {
        setTimeout(() => showLeadForm(), 500);
      }
    } catch (err) {
      hideTyping();
      addMessage('bot', 'Извините, ошибка связи. Попробуйте ещё раз.');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      input.disabled = false;
      if (isOpen) input.focus();
    }
  }

  function showLeadForm(title) {
    const existing = document.getElementById('leadFormWidget');
    if (existing) return;

    const form = document.createElement('div');
    form.id = 'leadFormWidget';
    form.style.cssText = 'padding:0.75rem 1rem;border-top:1px solid var(--border-light);background:var(--surface-card);display:flex;flex-direction:column;gap:0.5rem;';
    form.innerHTML = `
      <div style="font-size:1rem;font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;">${title || 'Заявка на замер'}</div>
      <input type="text" id="wfName" placeholder="Имя" style="padding:0.5rem 0.75rem;border:1px solid var(--border-medium);border-radius:6px;font-size:0.875rem;outline:none;background:var(--surface-card);color:var(--text-primary);font-family:'Inter',sans-serif;">
      <input type="tel" id="wfPhone" placeholder="Телефон" style="padding:0.5rem 0.75rem;border:1px solid var(--border-medium);border-radius:6px;font-size:0.875rem;outline:none;background:var(--surface-card);color:var(--text-primary);font-family:'Inter',sans-serif;">
      <select id="wfCeiling" style="padding:0.5rem 0.75rem;border:1px solid var(--border-medium);border-radius:6px;font-size:0.875rem;outline:none;background:var(--surface-card);color:var(--text-primary);font-family:'Inter',sans-serif;">
        <option value="">— Тип потолка —</option>
        <option>Матовый ПВХ</option>
        <option>Глянцевый ПВХ</option>
        <option>Сатиновый ПВХ</option>
        <option>Тканевый</option>
        <option>Двухуровневый</option>
      </select>
      <button id="wfSubmit" style="padding:0.55rem;background:var(--accent-primary);color:#fff;border:none;border-radius:6px;font-weight:500;font-size:0.875rem;cursor:pointer;font-family:'Inter',sans-serif;">Отправить</button>
    `;
    const inputArea = panel.querySelector('.chat-input-area');
    inputArea.parentNode.insertBefore(form, inputArea);

    document.getElementById('wfSubmit').addEventListener('click', async () => {
      const name = document.getElementById('wfName').value.trim();
      const phone = document.getElementById('wfPhone').value.trim();
      const ceiling = document.getElementById('wfCeiling').value;
      if (!name || !phone) { alert('Заполните имя и телефон'); return; }

      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, ceilingType: ceiling, source: 'chat' })
      });
      const data = await res.json();
      if (data.ok) {
        form.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--accent-success);font-weight:600;font-size:0.85rem;">Спасибо! Мы свяжемся с вами.</div>';
        setTimeout(() => { if (form.parentNode) form.remove(); }, 3000);
      }
    });
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(input.value);
  });
  sendBtn.addEventListener('click', () => sendMessage(input.value));

  actions.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-action-btn');
    if (!btn) return;
    const msg = btn.dataset.msg;
    if (msg === 'Заказать замер' || msg === 'Позвоните мне') {
      addMessage('user', msg);
      addMessage('bot', msg === 'Позвоните мне'
        ? 'Оставьте телефон — и мы перезвоним в течение 15 минут.'
        : 'Оставьте контакты, и мы договоримся о бесплатном замере.');
      showLeadForm();
      return;
    }
    sendMessage(msg);
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'openChatBtn' || e.target.closest('#openChatBtn')) {
      e.preventDefault();
      isOpen = true;
      panel.classList.add('open');
      badge.style.display = 'none';
      input.focus();
    }
  });

  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(SESSION_KEY, sessionId);
  }
})();
