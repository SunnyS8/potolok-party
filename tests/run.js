// Единый тестовый раннер: npm test
// Поднимает сервер на временной БД, прогоняет все тесты, гасит сервер.
// Требует: node >= 22 (fetch, WebSocket встроены).
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3999; // тестовый порт, не мешает основному демо на 3000
const BASE = `http://localhost:${PORT}`;
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-tests-'));

const SUITES = [
  'unit-projects.js',   // ядро: статусы, права, цены (без сервера)
  'unit-auth.js',       // вход по ролям (без сервера)
  'api-auth.js',        // /api/auth/* через HTTP
  'api-projects.js',    // CRUD проектов через HTTP
  'e2e-cycle.js',       // полный цикл всех ролей через HTTP
  'e2e-phase4.js',      // привязка client/installer/manager к проекту
];

let server = null;
let pass = 0, fail = 0, total = 0;

function log(line) {
  process.stdout.write(line + '\n');
}

async function startServer() {
  const out = fs.openSync(path.join(TMPDIR, 'server.log'), 'a');
  server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMPDIR },
    stdio: ['ignore', out, out],
  });
  // Ждём готовности
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch (e) {}
    await new Promise(res => setTimeout(res, 200));
  }
  return false;
}

async function stopServer() {
  if (server && server.pid) {
    try { process.kill(server.pid); } catch (e) {}
    // Windows: убить дочерние node тоже
    try { execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  }
}

function runChild(file) {
  return new Promise((resolve) => {
    const out = [];
    const child = spawn('node', [path.join(__dirname, file)], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: TMPDIR, FLUX_TEST_BASE: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', d => { const s = d.toString(); out.push(s); process.stdout.write(s); });
    child.stderr.on('data', d => { const s = d.toString(); if (!/UV_HANDLE_CLOSING/.test(s)) { out.push(s); process.stdout.write(s); } });
    child.on('close', code => {
      // Разбор итога "РЕЗУЛЬТАТ: N ok, M fail"
      const m = out.join('').match(/РЕЗУЛЬТАТ(?:\s+API)?:\s*(\d+)\s*ok,\s*(\d+)\s*fail/);
      if (m) { pass += +m[1]; fail += +m[2]; total += +m[1] + +m[2]; }
      else if (code !== 0) fail++;
      resolve();
    });
  });
}

(async () => {
  log('=== Флюкс | СИС — автотесты ===');
  log('Временная БД: ' + TMPDIR + '\n');

  const up = await startServer();
  if (!up) { log('FAIL: сервер не поднялся'); process.exit(1); }
  log('Сервер на :' + PORT + ' поднят\n');

  for (const suite of SUITES) {
    log('── ' + suite + ' ──');
    await runChild(suite);
    log('');
  }

  await stopServer();

  log('ИТОГО: ' + pass + ' ok, ' + fail + ' fail' + (total ? ' из ' + total : ''));
  log(fail === 0 ? '\nВСЕ ТЕСТЫ ПРОШЛИ ✓' : '\nЕСТЬ ПАДЕНИЯ ✗');
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await stopServer(); process.exit(1); });