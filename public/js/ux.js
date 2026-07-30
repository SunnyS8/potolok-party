// ─── Scroll Reveal ───────────────────────────────
(function() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

// ─── Price Count-Up ───────────────────────────────
function animatePrice(el, target, duration) {
  if (!el || target <= 0) return;
  if (el._animating) { el.textContent = target.toLocaleString('ru-RU'); return; }
  el._animating = true;
  if (!duration) duration = 400;
  const start = performance.now();
  const startVal = 0;
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const current = Math.round(startVal + (target - startVal) * ease);
    el.textContent = current.toLocaleString('ru-RU');
    if (t < 1) requestAnimationFrame(tick);
    else { el.textContent = target.toLocaleString('ru-RU'); el.classList.add('price-total-anim'); el._animating = false; }
  }
  requestAnimationFrame(tick);
}

// ─── Lead Form Success ────────────────────────────
function showFormSuccess(container) {
  const inner = container.querySelector('.form-success') || (function() {
    const div = document.createElement('div');
    div.className = 'form-success';
    div.innerHTML = '<div class="checkmark"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h4>Заявка отправлена!</h4><p>Мы свяжемся с вами в ближайшее время</p>';
    container.innerHTML = '';
    container.appendChild(div);
    return div;
  })();
}

// ─── Cards Hover Effect (lift) ────────────────────
document.querySelectorAll('.product-card, .advantage-card, .feature-card').forEach(card => {
  card.addEventListener('mouseenter', function() { this.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s cubic-bezier(0.16,1,0.3,1)'; });
});
