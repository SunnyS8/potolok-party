const slider = document.getElementById('areaSlider');
const areaValue = document.getElementById('areaValue');
slider.addEventListener('input', () => { areaValue.textContent = slider.value + ' м²'; });

document.querySelectorAll('.option-item').forEach(item => {
  item.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    item.classList.toggle('active');
  });
});

document.getElementById('calcBtn').addEventListener('click', async () => {
  const ceilingType = document.getElementById('ceilingType').value;
  const area = parseFloat(slider.value);
  const options = [];

  document.querySelectorAll('.option-item.active').forEach(item => {
    const opt = item.dataset.option;
    const input = item.querySelector('input');
    const val = input ? input.value : '1';

    if (opt === 'lights') options.push({ name: 'Встраиваемые светильники', value: val });
    if (opt === 'chandelier') options.push({ name: 'Монтаж люстры', value: '1' });
    if (opt === 'pipes') options.push({ name: 'Обвод труб', value: val });
    if (opt === 'cornice') options.push({ name: 'Маскировка карниза', value: val });
  });

  const loading = document.getElementById('loading');
  const result = document.getElementById('result');
  loading.classList.add('show');
  result.classList.remove('show');
  document.getElementById('leadForm').style.display = 'none';

  try {
    const res = await fetch('/api/calculator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ceilingType, area, options })
    });
    const data = await res.json();
    result.textContent = data.explanation;
    result.classList.add('show');
    document.getElementById('leadForm').style.display = 'block';
  } catch (err) {
    result.textContent = 'Ошибка расчёта. Попробуйте ещё раз.';
    result.classList.add('show');
  } finally {
    loading.classList.remove('show');
  }
});

document.getElementById('leadBtn').addEventListener('click', async () => {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  if (!name || !phone) { alert('Заполните имя и телефон'); return; }

  const res = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, phone, source: 'calculator',
      ceilingType: document.getElementById('ceilingType').value,
      area: parseFloat(slider.value)
    })
  });
  const data = await res.json();
  if (data.ok) {
    alert('Спасибо! Мы свяжемся с вами в ближайшее время.');
    document.getElementById('leadForm').style.display = 'none';
  } else {
    alert('Ошибка. Попробуйте ещё раз.');
  }
});
