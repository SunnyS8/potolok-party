(function () {
  var KEY = 'flux_estimate';
  var MAX_AGE = 5 * 60 * 1000;

  function parseMoney(s) {
    if (!s) return 0;
    var t = String(s).replace(/[^\d.,]/g, '');
    if (!t) return 0;
    var dot = t.lastIndexOf('.');
    var comma = t.lastIndexOf(',');
    var sepIdx = Math.max(dot, comma);
    if (sepIdx > 0) {
      var after = t.length - sepIdx - 1;
      if (after >= 1 && after <= 2) {
        var before = t.slice(0, sepIdx).replace(/[.,]/g, '');
        t = before + '.' + t.slice(sepIdx + 1);
      } else {
        t = t.replace(/[.,]/g, '');
      }
    }
    var n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  function scan(sel) {
    var nodes = document.querySelectorAll(sel);
    var found = null;
    for (var i = 0; i < nodes.length; i++) {
      var raw = (nodes[i].textContent || '').trim();
      var n = parseMoney(raw);
      if (n <= 0) continue;
      if (!found || n > found.total) found = { total: n, raw: raw };
    }
    return found;
  }

  function collect() {
    var best = scan('div.text-brand-700.text-lg') || scan('.text-brand-700');
    if (!best) return;
    var total = Math.round(best.total);
    var obj = {
      total: total,
      raw: best.raw,
      summary: 'Итого ≈ ' + total.toLocaleString('ru-RU') + ' ₽',
      at: Date.now()
    };
    window.__fluxEstimate = obj;
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function init() {
    if (window.__fluxEstimateInit) return;
    window.__fluxEstimateInit = true;
    try {
      var fromLS = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (fromLS && fromLS.at && (Date.now() - fromLS.at) < MAX_AGE) {
        window.__fluxEstimate = fromLS;
      }
    } catch (e) {}

    var timer = null;
    function onMutate() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(collect, 400);
    }
    var root = document.getElementById('root') || document.body;
    var mo = new MutationObserver(onMutate);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    collect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
