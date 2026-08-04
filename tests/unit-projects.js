const projects = require('../server/projects.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); }
}

// временный проект
const p = projects.createProject({
  name: 'Квартира на Ленина 12',
  address: 'г. Москва, Ленина 12, кв. 45',
  customer: { name: 'Иван Петров', phone: '+79990001122' },
  pricingLevel: 'retail',
}, 'designer');
console.log('created id=' + p.id, 'status=' + p.status, 'role=' + p.role);

t('createProject возвращает id и status design', () => {
  if (!p.id) throw new Error('нет id');
  if (p.status !== 'design') throw new Error('status=' + p.status);
});

// add items
let res = projects.addItem(p.id, { type: 'wall', label: 'Стена 3,2 м × 2,6 м', qty: 8.3, unit: 'м²', price: 3590 }, 'designer');
const itemId = res.item.id;
t('addItem добавляет позицию и пересчитывает totals.retail', () => {
  const it = res.item;
  if (!it.id) throw new Error('нет id позиции');
  if (res.project.totals.retail < 8.3 * 3590) throw new Error('totals не посчитан: ' + res.project.totals.retail);
});

t('recalcTotals считает дилерскую и себестоимость', () => {
  const pr = projects.getProject(p.id);
  if (pr.totals.distributor > pr.totals.retail) throw new Error('дилерская выше розницы');
  if (pr.totals.cost > pr.totals.distributor) throw new Error('себестоимость выше дилерской');
});

t('designer может перевести design → quoted', () => {
  const pr = projects.transitionStatus(p.id, 'quoted', 'designer');
  if (pr.status !== 'quoted') throw new Error('status=' + pr.status);
});

t('designer НЕ может перевести quoted → paid', () => {
  let threw = false;
  try { projects.transitionStatus(p.id, 'paid', 'designer'); } catch (e) { threw = true; }
  if (!threw) throw new Error('должно было отказать');
});

t('client может перевести quoted → paid', () => {
  const pr = projects.transitionStatus(p.id, 'paid', 'client');
  if (pr.status !== 'paid') throw new Error('status=' + pr.status);
});

t('client НЕ может откатить paid → quoted', () => {
  let threw = false;
  try { projects.transitionStatus(p.id, 'quoted', 'client'); } catch (e) { threw = true; }
  if (!threw) throw new Error('должно было отказать');
});

t('designer может вернуть quoted → design (правки)', () => {
  const pr = projects.transitionStatus(p.id, 'quoted', 'manager');
  if (pr.status !== 'quoted') throw new Error('status=' + pr.status);
  const pr2 = projects.transitionStatus(p.id, 'design', 'designer');
  if (pr2.status !== 'design') throw new Error('status=' + pr2.status);
  projects.transitionStatus(p.id, 'quoted', 'designer');
});

t('manager может двигать вперёд quoted → paid', () => {
  const pr = projects.transitionStatus(p.id, 'paid', 'manager');
  if (pr.status !== 'paid') throw new Error('status=' + pr.status);
});

t('manager может двигать вперёд paid → supply', () => {
  const pr = projects.transitionStatus(p.id, 'supply', 'manager');
  if (pr.status !== 'supply') throw new Error('status=' + pr.status);
});

t('dealer может перевести supply → install', () => {
  const pr = projects.transitionStatus(p.id, 'install', 'dealer');
  if (pr.status !== 'install') throw new Error('status=' + pr.status);
});

t('installer может сдать install → done', () => {
  const pr = projects.transitionStatus(p.id, 'done', 'installer');
  if (pr.status !== 'done') throw new Error('status=' + pr.status);
});

t('installer может откатить done → install (возврат)', () => {
  const pr = projects.transitionStatus(p.id, 'install', 'installer');
  if (pr.status !== 'install') throw new Error('status=' + pr.status);
});

t('скачок design → done невозможен (только соседние)', () => {
  const p2 = projects.createProject({ name: 'Проверка скачка', customer: { phone: '+1' } }, 'manager');
  let threw = false;
  try { projects.transitionStatus(p2.id, 'done', 'manager'); } catch (e) { threw = true; }
  if (!threw) throw new Error('должно было отказать (скачок)');
  projects.deleteProject(p2.id, 'manager');
});

t('history записывает переходы', () => {
  const pr = projects.getProject(p.id);
  if (!pr.history || pr.history.length < 6) throw new Error('history.len=' + (pr.history && pr.history.length));
});

t('listProjects фильтрует по статусу', () => {
  const list = projects.listProjects('manager', { status: 'install' });
  if (!list.some(x => x.id === p.id)) throw new Error('проект не найден по статусу');
});

t('listProjects ограничивает роль — монтажник видит только назначенные', () => {
  const pr = projects.getProject(p.id);
  projects.updateProject(p.id, { assigned: { ...pr.assigned, installer: 'Монтажник 2' } }, 'manager');
  const visible = projects.listProjects('installer', {});
  if (!visible.some(x => x.id === p.id)) throw new Error('назначенный монтажник не увидел проект');
  const dealerView = projects.listProjects('dealer', {});
  if (dealerView.some(x => x.id === p.id)) throw new Error('дилер увидел чужой проект');
  projects.updateProject(p.id, { assigned: { ...pr.assigned, installer: '' } }, 'manager');
});

t('deleteProject только manager', () => {
  let threw = false;
  try { projects.deleteProject(p.id, 'designer'); } catch (e) { threw = true; }
  if (!threw) throw new Error('должно было отказать');
  if (projects.deleteProject(p.id, 'manager') !== true) throw new Error('не удалён');
  if (projects.getProject(p.id)) throw new Error('проект остался');
});

t('stats возвращает счётчики', () => {
  const s = projects.stats();
  if (typeof s.total !== 'number') throw new Error('нет total');
});

console.log('\nРЕЗУЛЬТАТ: ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);