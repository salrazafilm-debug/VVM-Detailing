// Gift picker used on the homepage and on /gift-cards: any amount ($25 to $1,000) or a Full Factory Reset by size.
// Prices for the reset come from /api/gift-card (the website's own price list). Writes hidden inputs "amount" and "reset".
(function () {
  const money = c => '$' + Math.round(c / 100).toLocaleString('en-US');
  const ready = fetch('/api/gift-card').then(r => r.ok ? r.json() : null).catch(() => null);
  document.querySelectorAll('[data-gpick]').forEach(async el => {
    const q = new URLSearchParams(location.search);
    const show = document.querySelector(el.dataset.show || '[data-gpick-show]'), sub = document.querySelector('[data-gpick-sub]');
    const amountIn = el.querySelector('input[name=amount]'), resetIn = el.querySelector('input[name=reset]');
    const num = el.querySelector('.gp-num'), sizes = el.querySelector('.gp-sizes');
    let mode = q.get('reset') ? 'reset' : 'amount', dollars = Math.min(1000, Math.max(25, Math.round(+q.get('amount') / 100) || 100)), size = q.get('reset') || '', opts = [];
    function paint() {
      el.querySelectorAll('.gp-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      el.querySelector('.gp-amount').hidden = mode !== 'amount'; sizes.hidden = mode !== 'reset';
      num.value = dollars;
      sizes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
      const o = opts.find(x => x.size === size);
      amountIn.value = mode === 'amount' ? dollars * 100 : ''; resetIn.value = mode === 'reset' && o ? size : '';
      if (show) show.textContent = mode === 'amount' ? money(dollars * 100) : (o ? money(o.cents) : 'Pick a size');
      if (sub) sub.textContent = mode === 'amount' ? 'Any service' : (o ? 'Full Factory Reset · ' + o.label : 'Full Factory Reset');
      el.dispatchEvent(new Event('gpick'));
    }
    el.querySelectorAll('.gp-mode button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; paint(); }));
    el.querySelectorAll('.gp-step').forEach(b => b.addEventListener('click', () => { dollars = Math.min(1000, Math.max(25, dollars + (+b.dataset.step))); paint(); }));
    el.querySelectorAll('.gp-quick').forEach(b => b.addEventListener('click', () => { dollars = +b.dataset.v; paint(); }));
    num.addEventListener('input', () => { const v = Math.round(+num.value); if (v) { dollars = Math.min(1000, Math.max(1, v)); if (show) show.textContent = money(dollars * 100); amountIn.value = dollars * 100; } });
    num.addEventListener('change', () => { dollars = Math.min(1000, Math.max(25, Math.round(+num.value) || 25)); paint(); });
    paint();
    const d = await ready; opts = (d && d.reset) || [];
    sizes.innerHTML = opts.map(o => `<button type="button" data-size="${o.size}" aria-pressed="false"><b>${o.label}</b><span>${money(o.cents)}</span></button>`).join('') || '<p class="gp-note">Prices are loading. Please refresh.</p>';
    sizes.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { size = b.dataset.size; paint(); }));
    if (mode === 'reset' && !opts.some(o => o.size === size)) size = '';
    paint();
  });
})();
