const auth = require('../server/auth.js');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// Менеджер по ключу (AUTH_TOKEN не настроен → вход открыт, ключ demo)
const m = auth.loginByKey('manager', 'demo');
t('manager вход по ключу demo', m.ok === true && m.role === 'manager' && m.page === '/manager.html', JSON.stringify(m));
t('manager получает роль по токену', auth.getRole(m.token) === 'manager');

// Неверный ключ при настроенном AUTH_TOKEN
process.env.AUTH_TOKEN = 'secret123';
const bad = auth.loginByKey('manager', 'wrong');
t('manager с неверным ключом отклонён', bad.ok === false, JSON.stringify(bad));
const good = auth.loginByKey('manager', 'secret123');
t('manager с верным ключом принят', good.ok === true, JSON.stringify(good));
delete process.env.AUTH_TOKEN;

// Телефонные роли
const d = auth.loginByPhone('designer', '+79991234567', '0000');
t('designer вход по телефону+0000', d.ok === true && d.role === 'designer' && d.page === '/designer.html', JSON.stringify(d));
t('designer роль по токену', auth.getRole(d.token) === 'designer');

const i = auth.loginByPhone('installer', '+79995554433', '0000');
t('installer вход', i.ok === true && i.role === 'installer');

const c = auth.loginByPhone('client', '+79990001122', '0000');
t('client вход', c.ok === true && c.role === 'client');

// Неверный код
const w = auth.loginByPhone('client', '+79990001122', '1234');
t('неверный код отклонён', w.ok === false, JSON.stringify(w));

// Короткий телефон
const s = auth.loginByPhone('client', '123', '0000');
t('короткий телефон отклонён', s.ok === false, JSON.stringify(s));

// Менеджер не входит по телефону
const mp = auth.loginByPhone('manager', '+79990001122', '0000');
t('manager по телефону отклонён', mp.ok === false, JSON.stringify(mp));

// designer не входит по ключу
const dk = auth.loginByKey('designer', 'demo');
t('designer по ключу отклонён', dk.ok === false, JSON.stringify(dk));

// Сессии и проекты для роли
const list = auth.projectsForRole(m.token);
t('projectsForRole менеджера видит проекты', list.role === 'manager' && Array.isArray(list.projects), 'role=' + list.role);

const listInst = auth.projectsForRole(i.token);
t('projectsForRole монтажника (не назначен — не видит чужих)', listInst.role === 'installer', JSON.stringify(listInst.role));

// logout
t('logout удаляет сессию', auth.logout(m.token).ok === true && auth.getRole(m.token) === null);

console.log('\nРЕЗУЛЬТАТ: ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);