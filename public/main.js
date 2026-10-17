const CONTACT_EMAIL = "vvm.detailing@gmail.com";
const $ = s => document.querySelector(s);
const nav = $('#nav'), prog = $('#progress'), cta = $('.float-cta');
const burger = $('#burger'), links = $('#links');

burger.addEventListener('click', () => {
  const o = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', o);
});
links.addEventListener('click', e => { if (e.target.tagName === 'A') { links.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });

// Scroll work runs once per frame (not on every scroll event) and reads page height only when it changes,
// so scrolling never forces the browser to recalculate layout.
let docMax = 1, ticking = false, lastY = 0;
const measure = () => { docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight); };
function onScroll() {
  ticking = false;
  const y = scrollY;
  prog.style.transform = `scaleX(${Math.min(1, y / docMax)})`;
  nav.classList.toggle('scrolled', y > 40);
  cta.classList.toggle('show', y > innerHeight * .7);
  // Menu bar fades away while scrolling down and returns on any scroll up, at the top, or while the phone menu is open
  const dy = y - lastY;
  if (Math.abs(dy) > 6) {
    const keep = y < 80 || links.classList.contains('open') || nav.contains(document.activeElement);
    nav.classList.toggle('nav-hide', !keep && dy > 0);
    lastY = y;
  }
}
const requestTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
addEventListener('scroll', requestTick, { passive: true });
addEventListener('resize', () => { measure(); requestTick(); });
new ResizeObserver(() => { measure(); requestTick(); }).observe(document.body);
measure(); onScroll();

// Reveal as soon as an element's top edge enters the screen (tall cards used to wait until 15% was visible, which
// showed blank pink space). Short stagger, capped, so nothing feels slow.
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal').forEach(el => {
  el.style.transitionDelay = el.closest('.cards,.pillars,.gallery,.how-grid') ? Math.min([...el.parentElement.children].indexOf(el), 3) * 55 + 'ms' : '';
  io.observe(el);
});

// Pause the endless shine/glow animations on anything that is off screen, so only what you can see is animating.
const pauser = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '120px 0px' });
document.querySelectorAll('.hero,.marquee,#services .card,#services .flip,.statement,.how,#work,.book,.footer').forEach(el => pauser.observe(el));


$('#yr').textContent = new Date().getFullYear();

/* ---------- Booking calendar ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
const dur = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} hr${h > 1 ? 's' : ''}${r ? ` ${r} min` : ''}` : `${r} min`; };
const fmtTime = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
const keyOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dateOf = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8));
const longDate = k => dateOf(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

async function realApi(path, opts) {
  const r = await fetch('/api' + path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  return j;
}
const api = (...a) => (window.VVM_API || realApi)(...a);

const now0 = new Date();
// count: 1 vehicle, 2 vehicles (same day, back to back), 3 = "3 or more" (we send them to text / email us)
// cars[i] = services picked for vehicle i: { item, kind, v }
const S = { coupon: null, step: 'service', services: null, open: null, count: 1, active: 0, cars: [[]], multi: false, vehicles: ['', ''], locked: [false, false], vError: '', focusV: false, notice: '', y: now0.getFullYear(), m: now0.getMonth(), days: {}, loading: false, date: null, time: null, error: '', busy: false, result: null };
const bk = $('#bk');
if (window.VVM_DEMO) $('#demoBadge').hidden = false;

const contactLine = `<p class="muted">Call or text <a href="tel:+12406019451"><b>(240) 601-9451</b></a> or email ${esc(CONTACT_EMAIL)}.</p>`;
const CERAMIC_MSG = 'Ceramic coating takes the whole day, so it is booked on its own. Text or email us if you want to combine it.';
const INCLUDED_MSG = 'The Full Factory Reset already includes the Interior and Exterior Reset.';

/* ----- cart helpers ----- */
const carItems = i => S.cars[i] || [];
const booked = () => S.cars.slice(0, S.count === 2 ? 2 : 1);               // the vehicles being booked
const carMin = i => carItems(i).reduce((n, x) => n + x.v.minutes, 0);
const carCents = i => carItems(i).reduce((n, x) => n + x.v.priceCents, 0);
const totalMin = () => booked().reduce((n, _, i) => n + carMin(i), 0);
const totalCents = () => booked().reduce((n, _, i) => n + carCents(i), 0);
const planStr = () => booked().map(c => c.map(x => x.v.id).join('.')).join(',');
const names = i => carItems(i).map(x => x.item).join(' + ');
const vname = i => (S.vehicles[i] || '').trim();
const lines = () => booked().map((_, i) => `${S.count === 2 ? `Vehicle ${i + 1} (${vname(i)})` : vname(0)}: ${carItems(i).map(x => `${x.item} (${x.v.label})`).join(' + ')}`);
const title = () => S.count === 2 ? '2 vehicles, same day' : names(0);
// why `g` cannot be added to this vehicle's cart, or '' if it can
function conflict(items, g) {
  const others = items.filter(x => x.item !== g.name).map(x => x.kind);
  if (g.kind === 'ceramic') return others.length || S.count === 2 ? CERAMIC_MSG : '';
  if (others.includes('ceramic')) return CERAMIC_MSG;
  if (g.kind === 'full' && (others.includes('interior') || others.includes('exterior'))) return INCLUDED_MSG;
  if ((g.kind === 'interior' || g.kind === 'exterior') && others.includes('full')) return INCLUDED_MSG;
  return '';
}
const problem = () => (S.count === 2 && booked().some((_, i) => carItems(i).some(x => x.kind === 'ceramic'))) ? CERAMIC_MSG : '';
const ready = () => S.count < 3 && booked().every((_, i) => S.locked[i] && carItems(i).length) && !problem();

function stepper() {
  const labels = ['Service', 'Date & time', 'Details'], at = { service: 0, date: 1, details: 2, done: 3 }[S.step];
  return `<ol class="bsteps">${labels.map((n, i) => `<li class="${i === at ? 'on' : i < at ? 'past' : ''}"><span>${i + 1}</span>${n}</li>`).join('')}</ol>`;
}
const back = to => `<button type="button" class="link" data-act="back" data-to="${to}">← Back</button>`;

// First row for each vehicle: year, make and model. Confirm locks it in; Edit unlocks it.
function vehicleRow() {
  const i = S.active, n = S.count === 2 ? `Vehicle ${i + 1}` : 'Your vehicle';
  if (S.locked[i]) return `<div class="vrow locked"><span class="v-k">${n}</span><b class="v-t">${esc(vname(i))}</b><span class="v-ok">✓ Locked in</span><button type="button" class="link" data-act="vedit">Edit</button></div>`;
  return `<form id="vform" class="vrow" novalidate><label for="f-vinfo">${n}: year, make &amp; model</label>
    <div class="v-in"><input id="f-vinfo" name="vinfo" value="${esc(S.vehicles[i])}" placeholder="e.g. 2022 Lexus IS 350" autocomplete="off" enterkeyhint="done"><button class="mini" type="submit">Confirm</button></div>
    ${S.vError ? `<p class="err" role="alert">${esc(S.vError)}</p>` : `<p class="muted small">${S.coupon ? 'Fill this in, then choose your day.' : 'Fill this in first, then pick your services.'}</p>`}</form>`;
}

// Under the vehicle box: "Booking for more than 1 vehicle?" Yes / No. Yes pops up 1, 2, 3 or more; No blurs the picker.
function multiBlock() {
  const yes = S.multi;
  return `<div class="vcount" role="group" aria-label="More than one vehicle">
      <p class="vc-q">Booking for more than 1 vehicle?</p>
      <div class="seg yn">${[[1, 'Yes'], [0, 'No']].map(([v, l]) => `<button type="button" class="${!!v === yes ? 'on' : ''}" data-act="multi" data-v="${v}" aria-pressed="${!!v === yes}">${l}</button>`).join('')}</div>
      <div class="vpick ${yes ? 'open' : 'off'}" ${yes ? '' : 'aria-hidden="true" inert'}>
        <p class="vc-q sm">How many vehicles?</p>
        <div class="seg">${[[1, '1'], [2, '2'], [3, '3 or more']].map(([n, l]) => `<button type="button" class="${S.count === n ? 'on' : ''}" data-act="count" data-n="${n}" aria-pressed="${S.count === n}">${l}</button>`).join('')}</div>
      </div>
    </div>`;
}

// A coupon books one fixed service, so the picker is replaced by the vehicle box and a "Choose a day" button.
function couponStep() {
  const c = S.coupon;
  const sizes = c.garage_offer && c.size_options ? `<label class="g-offer-size">Choose your vehicle size<select id="offerSize">${c.size_options.map(v=>`<option value="${esc(v.id)}" ${v.id===c.id?'selected':''}>${esc(v.label)} · ${money(v.priceCents)} (save ${money(v.savingCents)})</option>`).join('')}</select></label>` : '';
  return `<div class="coupon-bar"><p><b>${esc(c.code)}</b> · Full Factory Reset, ${esc(c.label)} · <b>${money(c.priceCents)}</b>${c.vehicle ? `<br><span class="picked-sub">${esc(c.vehicle)}</span>` : ''}</p><button type="button" class="link" data-act="nocoupon">Remove</button></div>${sizes}
    <button class="btn primary" type="button" data-act="go">Choose a day</button>`;
}

// Apply a valid coupon: its service and price go into the cart, then the vehicle box comes first.
function useCoupon(data) {
  const g = (S.services || []).find(x => x.name === data.item);
  const v = g && g.variations.find(x => x.id === data.id);
  if (!v) return false;
  S.coupon = data; S.multi = false; S.count = 1; S.active = 0;
  S.cars = [[{ item: g.name, kind: g.kind, v: { ...v, priceCents: data.priceCents } }]];
  S.vehicles[0] = data.vehicle || ''; S.locked = [true, false]; S.vError = ''; S.focusV = false; S.step = 'service'; S.error = '';
  return true;
}

function serviceStep() {
  if (S.coupon) return couponStep();
  let html = vehicleRow() + multiBlock();
  if (S.count === 3) {
    return html + `<div class="notice help"><b>3 or more vehicles?</b> We would love to help. Text or email us and we will set up your day.
      <div class="notice-btns"><a class="mini" href="sms:+12406019451">Text (240) 601-9451</a><a class="mini alt" href="mailto:${esc(CONTACT_EMAIL)}?subject=Booking%20for%203%2B%20vehicles">Email us</a></div></div>`;
  }
  const items = carItems(S.active);
  if (S.count === 2) {
    html += `<div class="car-tabs" role="tablist">${[0, 1].map(i => `<button type="button" role="tab" aria-selected="${S.active === i}" class="${S.active === i ? 'on' : ''}" data-act="car" data-i="${i}">Vehicle ${i + 1}${S.locked[i] && carItems(i).length ? ' ✓' : ''}</button>`).join('')}</div>
      <p class="muted small">Both vehicles are done the same day, one after the other. Tap a vehicle to switch.</p>`;
  }
  if (!S.locked[S.active]) {
    return html + (booked().some((_, i) => carItems(i).length) ? '<p class="muted small">Your services are saved. Confirm the vehicle to keep going.</p>' : '');
  }
  html += '<div class="svc-list">' + S.services.map((g, gi) => {
    const has = items.some(x => x.item === g.name);
    return `<div class="svc ${S.open === gi ? 'open' : ''} ${has ? 'has' : ''}">
        <button type="button" class="svc-head" data-act="item" data-i="${gi}"><b>${esc(g.name)}${has ? ' <em class="tick">✓ added</em>' : ''}</b><span>from ${money(g.variations[0].priceCents)}</span></button>
        ${S.open === gi ? `<div class="sizes-pick">${g.variations.map(v => { const on = items.some(x => x.v.id === v.id); return `<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="pick" data-g="${gi}" data-id="${esc(v.id)}"><b>${esc(v.label)}</b><span>${money(v.priceCents)} · ${dur(v.minutes)}</span><i class="pm" aria-hidden="true">${on ? '✓' : '+'}</i></button>`; }).join('')}</div>` : ''}
      </div>`;
  }).join('') + '</div>';
  const why = S.notice || problem();
  if (why) html += `<p class="notice" role="alert">${esc(why)}</p>`;
  if (booked().some((_, i) => carItems(i).length)) {
    html += `<div class="cart"><p class="cart-k">Your booking</p>${booked().map((_, i) => `<div class="cart-car"><p class="cart-v">${S.count === 2 ? `Vehicle ${i + 1} · ` : ''}${esc(vname(i))}</p>${carItems(i).map(x => `<div class="cart-line"><span>${esc(x.item)} · ${esc(x.v.label)}</span><span>${money(x.v.priceCents)}</span><button type="button" class="rm" data-act="drop" data-car="${i}" data-id="${esc(x.v.id)}" aria-label="Remove ${esc(x.item)}">×</button></div>`).join('') || '<p class="muted small">No service yet</p>'}</div>`).join('')}
      <div class="cart-total"><span>Total · about ${dur(totalMin())}</span><b>${money(totalCents())}</b></div>
      ${booked().some((_, i) => { const k = carItems(i).map(x => x.kind); return k.includes('interior') && k.includes('exterior'); }) ? '<p class="tip"><b>Tip:</b> the Full Factory Reset includes both and costs less.</p>' : ''}</div>`;
  }
  html += `<p class="muted small add-hint">Tap <b>+</b> on any size to add another service${S.count === 2 ? ' to this vehicle' : ''}. Tap it again to remove it.</p>
    <button type="button" class="go" data-act="go" ${ready() ? '' : 'disabled'}>Pick a date &amp; time</button>
    ${!ready() && !why ? `<p class="muted small">${booked().some((_, i) => !S.locked[i]) ? 'Confirm your vehicle info' + (S.count === 2 ? ' for both vehicles' : '') + ' and' : 'Please'} choose at least one service${S.count === 2 ? ' for each vehicle' : ''}.</p>` : ''}`;
  return html;
}

function render() {
  if (S.step === 'error') { bk.innerHTML = `<p><b>Online booking is unavailable right now.</b></p>${contactLine}`; return; }
  if (!S.services) { bk.innerHTML = '<p class="muted">Loading open times…</p>'; return; }
  let html = stepper();
  if (S.step === 'service') {
    html += serviceStep();
  } else if (S.step === 'date') {
    const label = new Date(S.y, S.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const first = new Date(S.y, S.m, 1).getDay(), total = new Date(S.y, S.m + 1, 0).getDate();
    const atNow = S.y === now0.getFullYear() && S.m === now0.getMonth();
    let cells = '<span></span>'.repeat(first);
    for (let d = 1; d <= total; d++) {
      const k = keyOf(S.y, S.m, d), open = (S.days[k] || []).length > 0;
      cells += `<button type="button" class="day ${open ? 'open' : ''} ${S.date === k ? 'sel' : ''}" ${open ? `data-act="day" data-d="${k}"` : 'disabled'} aria-label="${open ? 'Available ' : 'Unavailable '}${esc(longDate(k))}">${d}</button>`;
    }
    html += `${back('service')}
      <p class="picked"><b>${esc(title())}</b> · ${money(totalCents())} · about ${dur(totalMin())}${S.count === 2 ? `<br><span class="picked-sub">${lines().map(esc).join('<br>')}</span>` : ''}</p>
      <div class="cal">
        <div class="cal-head"><button type="button" class="nav-m" data-act="prev" ${atNow ? 'disabled' : ''} aria-label="Previous month">‹</button><b>${label}</b><button type="button" class="nav-m" data-act="next" aria-label="Next month">›</button></div>
        <div class="dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('')}</div>
        <div class="grid ${S.loading ? 'loading' : ''}">${cells}</div>
      </div>
      <p class="muted small">${S.loading ? 'Checking open days…' : 'Highlighted days are open.'}</p>
      ${S.date ? `<p class="picked"><b>${esc(longDate(S.date))}</b>, start time:</p><div class="slots">${(S.days[S.date] || []).map(t => `<button type="button" class="slot" data-act="time" data-t="${t}">${fmtTime(t)}</button>`).join('')}</div>` : ''}`;
  } else if (S.step === 'details') {
    html += `${back('date')}
      <div class="sum">
        <p class="sum-k">Your booking</p>
        <h3 class="sum-t">${esc(title())}</h3>
        <p class="sum-v">${lines().map(esc).join('<br>')}<br>${money(totalCents())} · about ${dur(totalMin())}</p>
        <p class="sum-d">${esc(longDate(S.date)).replace(/ (\d+)$/, '&nbsp;$1')} <span class="sum-at">at ${fmtTime(S.time)}</span></p>
      </div>
      <form id="bform" class="form" novalidate>
        <label>Name<input id="f-name" name="name" required autocomplete="name"></label>
        <label>Phone<input id="f-phone" name="phone" type="tel" required autocomplete="tel"></label>
        <label>Email<input id="f-email" name="email" type="email" required autocomplete="email"></label>
        <label>Address &amp; concerns<span class="hint">Where should we arrive + any concerns or questions can let us know here - We will get back to you as soon as possible! Thank you!!!</span><textarea id="f-notes" name="notes" rows="4" placeholder="Street address, city, ZIP"></textarea></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ''}
        <button class="btn primary" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Booking…' : 'Book my day'}</button>
        <p class="nodep">No deposit needed - we take payment only after we complete your service, thank you!</p>
        <p class="consent">By booking, you agree to our <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>
      </form>`;
  } else if (S.step === 'done') {
    const tones = ['#ffe27a', '#4f8ff0', '#e4572e', '#ffffff', '#8fd0ff', '#f7c948'];
    const confetti = Array.from({ length: 36 }, (_, i) => `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.9).toFixed(2)}s;--t:${(2.4 + Math.random() * 1.6).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${tones[i % tones.length]};--w:${6 + Math.round(Math.random() * 6)}px"></i>`).join('');
    html = `<div class="done yay">
      <div class="confetti" aria-hidden="true">${confetti}</div>
      <div class="yay-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></div>
      <h3 class="yay-big">YAY!</h3>
      ${S.coupon ? `<p class="yay-sub">Congrats, your booking is complete!</p>
      <p class="yay-line" style="text-transform:none;letter-spacing:.02em">Hi ${esc(S.coupon.customer || 'there')}! Thank you for redeeming your coupon - you are saving ${money(S.coupon.savingCents)}! See you on ${esc(longDate(S.date))} at ${fmtTime(S.time)}.</p>` : `<p class="yay-sub">You're all booked and ready!</p>
      <p class="yay-line">Your booking is now reserved.</p>`}
      <div class="yay-card">
        <p class="yay-t">${esc(title())}</p>
        <p class="yay-l">${lines().map(esc).join('<br>')}</p>
        <p class="yay-d">${esc(longDate(S.date))} <span>at ${fmtTime(S.time)}</span></p>
      </div>
      <p class="yay-note">We will reach out shortly to answer any questions and confirm all details! Thank you!</p>
      ${contactLine}</div>`;
  }
  bk.innerHTML = html;
  if (S.focusV) { S.focusV = false; const el = $('#f-vinfo'); if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); } }
}

async function loadMonth() {
  S.loading = true; S.days = {}; render();
  try {
    const month = `${S.y}-${String(S.m + 1).padStart(2, '0')}`;
    S.days = (await api(`/availability?plan=${encodeURIComponent(planStr())}&month=${month}`)).days || {};
  } catch (e) { S.error = e.message; }
  S.loading = false; render();
}

bk.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const a = t.dataset.act;
  if (a === 'multi') {
    S.multi = t.dataset.v === '1'; S.notice = ''; S.active = 0;
    S.count = S.multi ? 2 : 1;
    if (S.count === 2 && S.cars.length < 2) S.cars.push([]);
    S.vError = ''; render();
  }
  else if (a === 'count') {
    S.count = +t.dataset.n; S.notice = ''; S.active = 0;
    if (S.count === 2 && S.cars.length < 2) S.cars.push([]);
    S.vError = ''; S.focusV = S.count < 3 && !S.locked[0]; render();
  }
  else if (a === 'car') { S.active = +t.dataset.i; S.notice = ''; S.vError = ''; S.focusV = !S.locked[S.active]; render(); }
  else if (a === 'vedit') { S.locked[S.active] = false; S.vError = ''; S.focusV = true; render(); }
  else if (a === 'item') { S.open = S.open === +t.dataset.i ? null : +t.dataset.i; render(); }
  else if (a === 'pick') {
    const g = S.services[+t.dataset.g], v = g.variations.find(x => x.id === t.dataset.id), items = carItems(S.active);
    const already = items.find(x => x.v.id === v.id);
    if (already) S.cars[S.active] = items.filter(x => x !== already);                       // tap again to remove
    else {
      const why = conflict(items, g);
      if (why) { S.notice = why; render(); return; }
      S.cars[S.active] = [...items.filter(x => x.item !== g.name), { item: g.name, kind: g.kind, v }];   // another size of the same service replaces it
    }
    S.notice = ''; render();
  }
  else if (a === 'drop') { const i = +t.dataset.car; S.cars[i] = carItems(i).filter(x => x.v.id !== t.dataset.id); S.notice = ''; render(); }
  else if (a === 'nocoupon') { S.coupon = null; S.cars = [[]]; S.locked = [false, false]; S.vError = ''; S.focusV = false; S.error = ''; render(); }
  else if (a === 'go') { if (!ready()) return; S.date = null; S.time = null; S.error = ''; S.step = 'date'; await loadMonth(); }
  else if (a === 'prev' || a === 'next') { S.m += a === 'next' ? 1 : -1; if (S.m > 11) { S.m = 0; S.y++; } if (S.m < 0) { S.m = 11; S.y--; } S.date = null; await loadMonth(); }
  else if (a === 'day') { S.date = t.dataset.d; render(); }
  else if (a === 'time') { S.time = t.dataset.t; S.error = ''; S.step = 'details'; render(); }
  else if (a === 'back') { S.step = t.dataset.to; S.error = ''; render(); }
});
bk.addEventListener('change', e => {
  if (e.target.id !== 'offerSize' || !S.coupon?.size_options) return;
  const option = S.coupon.size_options.find(v => v.id === e.target.value);
  if (!option) return;
  S.coupon = { ...S.coupon, ...option };
  useCoupon(S.coupon);
  render();
});

// remember what is typed in the vehicle box, so switching vehicles or steps never loses it
bk.addEventListener('input', e => { if (e.target.name === 'vinfo') S.vehicles[S.active] = e.target.value; });

bk.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'vform') {                                    // Confirm vehicle info: lock it in
    const v = String(new FormData(e.target).get('vinfo') || '').replace(/\s+/g, ' ').trim();
    S.vehicles[S.active] = v;
    if (v.length < 4 || !/[a-z]/i.test(v)) { S.vError = 'Please enter the year, make and model, like 2022 Lexus IS 350.'; S.focusV = true; render(); return; }
    S.locked[S.active] = true; S.vError = ''; render(); return;
  }
  const f = Object.fromEntries(new FormData(e.target));
  const digits = (f.phone || '').replace(/\D/g, '');
  if ((f.name || '').trim().length < 2) S.error = 'Please enter your name.';
  else if (digits.length < 10) S.error = 'Please enter a 10-digit phone number.';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) S.error = 'Please enter a valid email.';
  else S.error = '';
  if (S.error) { render(); return; }
  S.busy = true; render();
  try {
    const plan = booked().map((_, i) => carItems(i).map(x => x.v.id));
    S.result = await api('/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, phone: f.phone, email: f.email, notes: f.notes, website: f.website, vehicles: booked().map((_, i) => vname(i)), plan, date: S.date, time: S.time, coupon: S.coupon ? S.coupon.code : '', offerVariationId: S.coupon?.garage_offer ? S.coupon.id : undefined }) });
    S.step = 'done'; S.busy = false; render();
    bk.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    return;
  } catch (err) {
    S.error = err.message;
    if (err.status === 409) { S.step = 'date'; S.time = null; S.busy = false; await loadMonth(); S.error = ''; return; }
  }
  S.busy = false; render();
});

(async function init() {
  try { S.services = (await api('/services')).services; if (!S.services.length) throw new Error('none'); }
  catch { S.step = 'error'; S.services = []; }
  render();
})();

document.querySelectorAll('.sizes').forEach(ul => ul.addEventListener('click', e => {
  const b = e.target.closest('.size'); if (!b) return;
  const on = b.classList.toggle('flipped');
  b.setAttribute('aria-pressed', on);
}));

/* ---------- "More info" flip card ---------- */
document.querySelectorAll('.flip').forEach(w => {
  const inner = w.querySelector('.flip-inner'), front = w.querySelector('.flip-face.front'), back = w.querySelector('.flip-face.back');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer;
  const inert = (el, on) => { el.toggleAttribute('inert', on); el.setAttribute('aria-hidden', String(on)); };
  inert(back, true);
  // Phones and tablets: no 3D flip (tall rotated layers are unreliable on iOS). The faces simply swap with a fade.
  const flat = () => matchMedia('(max-width:900px)').matches;
  function set(open) {
    clearTimeout(timer);
    const f = flat();
    if (!f) {
      if (open) { inner.style.height = front.offsetHeight + 'px'; inner.offsetHeight; inner.style.height = back.offsetHeight + 'px'; }
      else { inner.style.height = back.offsetHeight + 'px'; inner.offsetHeight; inner.style.height = front.offsetHeight + 'px'; timer = setTimeout(() => { if (!w.classList.contains('flipped')) inner.style.height = ''; }, reduce ? 0 : 750); }
    } else inner.style.height = '';
    w.classList.toggle('flipped', open);
    inert(front, open); inert(back, !open);
    w.querySelectorAll('[data-flip="open"]').forEach(b => b.setAttribute('aria-expanded', String(open)));
    w.scrollIntoView({ behavior: reduce || f ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => (open ? back.querySelector('h3') : w.querySelector('[data-flip="open"]')).focus({ preventScroll: true }), reduce || f ? 0 : 750);
  }
  w.addEventListener('click', e => { const b = e.target.closest('[data-flip]'); if (b) set(b.dataset.flip === 'open'); });
  w.addEventListener('keydown', e => { if (e.key === 'Escape' && w.classList.contains('flipped')) set(false); });
  // keep the card height in step with the open guide (tab changes, images loading, window resize)
  new ResizeObserver(() => { if (!w.classList.contains('flipped')) return; inner.style.height = flat() ? '' : back.offsetHeight + 'px'; }).observe(back);
});

/* ---------- guide tabs ---------- */
document.querySelectorAll('.pe-tabs').forEach(tabs => {
  const btns = [...tabs.querySelectorAll('[role="tab"]')];
  const panels = btns.map(b => document.getElementById(b.getAttribute('aria-controls')));
  const select = i => { btns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; panels[j].hidden = j !== i; }); if (panels[i].id === 'panel-media') loadMedia(panels[i]); };
  btns.forEach((b, i) => b.addEventListener('click', () => select(i)));
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (btns.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
    select(n); btns[n].focus();
  });
});

/* ---------- photo + video slots: drop files in assets/uploads/ and they appear (checked only when the Photos & Video tab is first opened) ---------- */
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'], VID_EXT = ['mp4', 'webm', 'mov'];
function loadMedia(root = document) {
  function firstThatLoads(urls, test, done) { (function next(i) { if (i >= urls.length) return done(null); test(urls[i], ok => ok ? done(urls[i]) : next(i + 1)); })(0); }
  const caption = slot => { const c = document.createElement('span'); c.className = 'cap'; c.textContent = slot.dataset.label || ''; return c; };
  root.querySelectorAll('.mslot[data-img]').forEach(slot => {
    if (slot.dataset.probed) return; slot.dataset.probed = '1';
    const base = 'assets/uploads/' + slot.dataset.img;
    firstThatLoads(IMG_EXT.map(x => `${base}.${x}`), (src, cb) => { const im = new Image(); im.onload = () => cb(true); im.onerror = () => cb(false); im.src = src; }, src => {
      if (!src) return;
      const im = document.createElement('img'); im.src = src; im.alt = slot.dataset.alt || slot.dataset.label || ''; im.loading = 'lazy';
      slot.replaceChildren(im, caption(slot)); slot.classList.add('filled');
    });
  });
  root.querySelectorAll('.mslot[data-video]').forEach(slot => {
    if (slot.dataset.probed) return; slot.dataset.probed = '1';
    const base = 'assets/uploads/' + slot.dataset.video;
    firstThatLoads(VID_EXT.map(x => `${base}.${x}`), (src, cb) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => cb(true); v.onerror = () => cb(false); v.src = src; }, src => {
      if (!src) return;
      const v = document.createElement('video'); v.src = src; v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.setAttribute('aria-label', slot.dataset.label || 'Video');
      v.muted = true; v.loop = true; v.preload = 'auto';
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) new IntersectionObserver(es => { es[0].isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: .4 }).observe(v);
      slot.replaceChildren(v); slot.classList.add('filled');
    });
  });
}


/* ---------- Reviews: the owner's own (reviews.json) plus Google's (/api/reviews, once the owner connects it) ---------- */
(async function reviews() {
  const grid = $('#revGrid'); if (!grid) return;
  let own = { reviews: [], googleReviewUrl: '' }, g = null;
  try { own = await (await fetch('reviews.json', { cache: 'no-cache' })).json(); } catch {}
  try { g = (await (await fetch('/api/reviews')).json()).google; } catch {}
  const stars = n => '★'.repeat(Math.max(1, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(1, Math.min(5, Math.round(n))));
  let photoN = 0;
  const card = (r, src) => `<article class="rev">${r.photo ? `<img class="rev-photo" src="${esc(r.photo)}" alt="${esc(r.name)}\u2019s car" loading="${photoN++ < 3 ? 'eager' : 'lazy'}" decoding="async">` : ''}<div class="rev-body"><p class="rev-stars" aria-label="${r.rating || 5} out of 5 stars">${stars(r.rating || 5)}</p><p class="rev-text">${esc(r.text)}</p><p class="rev-by"><b>${esc(r.name)}</b>${r.car ? ` \u00b7 ${esc(r.car)}` : ''}${r.when ? ` \u00b7 ${esc(r.when)}` : ''}<span class="rev-src${src === 'Google' ? ' ver' : ''}">${src === 'Google' ? '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10"/><path d="M5.5 10.4l3 3 6-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Verified Google review' : src}</span></p></div></article>`;
  const all = [...(g && g.reviews ? g.reviews.map(r => card(r, 'Google')) : []), ...(own.reviews || []).filter(r => r && r.text).map(r => card(r, r.source || 'VVM client'))];
  grid.innerHTML = all.length ? all.join('') : `<article class="rev rev-empty"><div class="rev-body"><p class="rev-stars" aria-hidden="true">★★★★★</p><p class="rev-text">Finished your detail? We would love to hear how we did!</p></div></article>`;
  const gs = (g && g.rating) ? g : own.googleSummary;   // live Google numbers when connected, otherwise the saved snapshot in reviews.json
  const link = own.googleReviewUrl || (g && g.url) || '';
  $('#revCta').innerHTML = link
    ? `<a class="cta" href="${esc(link)}" target="_blank" rel="noopener">Review us on Google</a><a class="cta alt" href="mailto:${esc(CONTACT_EMAIL)}?subject=My%20VVM%20Details%20review">Email us your review</a>`
    : `<a class="cta" href="mailto:${esc(CONTACT_EMAIL)}?subject=My%20VVM%20Details%20review">Send us your review</a><a class="cta alt" href="sms:+12406019451">Text us</a>`;
  document.querySelectorAll('#reviews .reveal').forEach(el => io.observe(el));

  // Carousel: an endless loop that keeps drifting on its own and never stops. Arrows and swipe still work.
  // Three identical sets sit side by side; when the drift reaches the end of the middle set it jumps back by one set (invisible).
  const vp = $('#revViewport'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = grid.children.length, loop = n > 3;
  if (loop) {
    const set = [...grid.children];
    for (let k = 0; k < 2; k++) set.forEach(c => { const x = c.cloneNode(true); x.setAttribute('aria-hidden', 'true'); grid.appendChild(x); });
  }
  const gap = () => parseFloat(getComputedStyle(grid).columnGap) || 0;
  const setW = () => loop ? grid.children[n].offsetLeft - grid.children[0].offsetLeft : 0;
  const step = () => { const c = grid.querySelector('.rev'); return c ? c.getBoundingClientRect().width + gap() : vp.clientWidth; };
  let S = setW(), pos = 0, lastSet = 0, hold = 0, touching = false, visible = false, last = performance.now();
  if (loop) { vp.scrollLeft = S; pos = lastSet = vp.scrollLeft; addEventListener('resize', () => { const r = vp.scrollLeft / (S || 1); S = setW(); vp.scrollLeft = r * S; pos = lastSet = vp.scrollLeft; }); }
  const arrow = dir => { hold = performance.now() + 1100; vp.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' }); };
  document.querySelectorAll('.rev-arrow').forEach(b => b.addEventListener('click', () => arrow(+b.dataset.dir)));
  vp.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { arrow(1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { arrow(-1); e.preventDefault(); } });
  const touchOn = () => { touching = true; }, touchOff = () => { touching = false; hold = performance.now() + 1500; };
  vp.addEventListener('touchstart', touchOn, { passive: true }); vp.addEventListener('touchend', touchOff, { passive: true }); vp.addEventListener('touchcancel', touchOff, { passive: true });
  vp.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') hold = performance.now() + 1500; });
  vp.addEventListener('wheel', () => { hold = performance.now() + 1500; }, { passive: true });
  new IntersectionObserver(es => visible = es[0].isIntersecting, { threshold: .15 }).observe(vp);
  if (loop) requestAnimationFrame(function tick(t) {
    const dt = Math.min(250, t - last); last = t;
    let moved = false;
    if (Math.abs(vp.scrollLeft - lastSet) > 1.5) pos = vp.scrollLeft;                    // someone moved it (arrow, swipe): follow, never fight it
    else if (visible && !document.hidden && !touching && t > hold && !reduce) { pos += 42 * dt / 1000; moved = true; }   // ~42 px a second, always
    if (pos >= 2 * S) { pos -= S; moved = true; } else if (pos < S * .5) { pos += S; moved = true; }               // endless
    if (moved) vp.scrollLeft = pos;
    lastSet = vp.scrollLeft;
    requestAnimationFrame(tick);
  });
})();

// Our Work: balanced columns. Photos keep their own shapes; only the last photo in a taller column is trimmed so every column ends on the same line.
(function () {
  const g = document.querySelector('.gallery'); if (!g) return;
  const figs = [...g.querySelectorAll('figure')]; let key = '';
  function layout() {
    const n = matchMedia('(max-width:900px)').matches ? 2 : 3, w = g.clientWidth, k = n + ':' + w;
    if (!w || k === key) return; key = k;
    const gap = n === 2 ? 10 : 14, cw = (w - gap * (n - 1)) / n;
    const items = figs.map(f => { const im = f.querySelector('img'); f.style.height = ''; f.classList.remove('crop'); return [f, cw * im.getAttribute('height') / im.getAttribute('width')]; });
    const place = order => { const cols = Array.from({ length: n }, () => ({ f: [], h: 0 })); order.forEach(it => { const c = cols.reduce((a, b) => (b.h < a.h ? b : a)); c.f.push(it); c.h += it[1] + (c.f.length > 1 ? gap : 0); }); return cols; };
    const spread = cols => Math.max(...cols.map(c => c.h)) - Math.min(...cols.map(c => c.h));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let cols = place(items), best = spread(cols);
    for (let i = 0; i < 3000 && best > 2; i++) {
      const o = items.slice(); for (let k = o.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; }
      const c = place(o), sp = spread(c); if (sp < best) { best = sp; cols = c; }
    }
    const T = Math.min(...cols.map(c => c.h));
    g.textContent = ''; g.classList.add('gal-js');
    cols.forEach(c => {
      const d = document.createElement('div'); d.className = 'gcol';
      c.f.forEach(([f]) => d.appendChild(f));
      const [lf, lh] = c.f[c.f.length - 1], cut = c.h - T;
      if (cut > 1 && cut < lh * .6) { lf.style.height = (lh - cut) + 'px'; lf.classList.add('crop'); }
      g.appendChild(d);
    });
  }
  layout(); new ResizeObserver(() => { clearTimeout(layout.t); layout.t = setTimeout(layout, 60); }).observe(g); addEventListener('load', layout);
})();

/* ----- coupon code (footer) ----- */
(function coupon() {
  const form = $('#couponForm'), msg = $('#couponMsg');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const code = String(new FormData(form).get('code') || '').trim();
    if (!code) { msg.textContent = 'Type your code first.'; return; }
    msg.textContent = 'Checking…';
    try {
      const d = await api('/coupon?code=' + encodeURIComponent(code));
      const sizePicker = d.garage_offer && d.size_options ? `<label class="offer-size-choice">Choose vehicle size <select id="couponSize">${d.size_options.map(v=>`<option value="${esc(v.id)}" ${v.id===d.id?'selected':''}>${esc(v.label)} · ${money(v.priceCents)} (save ${money(v.savingCents)})</option>`).join('')}</select></label>` : '';
      msg.innerHTML = `<b>${esc(d.code)}</b> works: Full Factory Reset, ${esc(d.label)} for <b>${money(d.priceCents)}</b> (normally ${money(d.normalCents)}).${sizePicker} <button type="button" class="mini" id="couponGo">Book it</button>`;
      $('#couponGo').addEventListener('click', () => {
        if (!S.services) { msg.textContent = 'Booking is still loading. Try again in a moment.'; return; }
        const selectedSize = d.garage_offer && d.size_options ? d.size_options.find(v=>v.id===$('#couponSize').value) : d;
        if (!useCoupon({ ...d, ...selectedSize })) { msg.textContent = 'That service is not available to book right now.'; return; }
        render();
        $('#book').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    } catch (err) {
      msg.textContent = err.message || 'That code is not valid.';
    }
  });
  const fromGarage = new URLSearchParams(location.search).get('coupon');
  if (fromGarage) {
    const input = $('#couponCode');
    if (input) {
      input.value = fromGarage;
      const check = () => { if (S.services) form.requestSubmit(); else setTimeout(check, 200); };
      setTimeout(check, 200);
    }
  }
})();
