'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { vehicleLabel, preferredGarageVehicleId } from '../server/garage-vehicle';
import { garageRequest, signOut } from './garage-auth-client';
import { sealantProgress } from '../server/garage-dates';
import GarageIcon from './garage-icons';
import './garage-vault.css';

const TABS = [['home', 'Home', 'home'], ['photos', 'Photos', 'photo'], ['history', 'History', 'history'], ['account', 'Account', 'profile']];
const ET = 'America/New_York';
const asDate = v => (v instanceof Date ? v : new Date(String(v).includes('T') ? v : `${v}T12:00:00Z`));
const fmtDate = v => v ? asDate(v).toLocaleDateString('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtShort = v => v ? asDate(v).toLocaleDateString('en-US', { timeZone: ET, month: 'short', day: 'numeric' }) : '';
const fmtTime = v => new Date(v).toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' });
const isInterior = p => p.photo_kind === 'interior' || /interior/i.test(p.caption || '');
const isBA = p => p.photo_kind === 'before' || p.photo_kind === 'after';
const daysLeft = cycle => cycle ? Math.max(0, Math.ceil((Date.parse(`${cycle.sealant_expires_at}T00:00:00Z`) - Date.now()) / 86400000)) : 0;
const PROTECTIONS = [['paint_sealant', 'Ceramic Sealant'], ['ceramic_coating', 'Ceramic Coating'], ['leather_protection', 'Leather Protection'], ['fabric_protection', 'Fabric Protection']];

function Tile({ tone, icon, label, children }) {
  return <article className={`v-tile v-tone-${tone}`}><span className="v-tile-ic"><GarageIcon name={icon}/></span><p className="v-label">{label}</p>{children}</article>;
}

// A ring that shows how much of the 3-month sealant protection is left
function Ring({ percentUsed, children }) {
  const r = 44, c = 2 * Math.PI * r, left = Math.max(0, 100 - percentUsed);
  return <div className="v-ring" role="img" aria-label={`${Math.round(left)}% of sealant protection left`}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r={r} className="v-ring-bg"/><circle cx="50" cy="50" r={r} className="v-ring-fg" strokeDasharray={`${(c * left) / 100} ${c}`} transform="rotate(-90 50 50)"/></svg>
    <div className="v-ring-text">{children}</div>
  </div>;
}

function Home({ vehicle, hero, onPhoto, go }) {
  const photos = (vehicle?.photos || []).filter(p => p.url);
  const strip = photos.filter(isBA).length ? photos.filter(isBA) : photos.filter(p => p.id !== hero?.id);
  const next = vehicle?.appointments?.[0], last = vehicle?.services?.[0], cycle = vehicle?.cycle, offer = vehicle?.offer;
  const progress = sealantProgress(cycle), days = daysLeft(cycle), due = cycle && progress.value >= 100;
  const applied = PROTECTIONS.filter(([k]) => (k === 'paint_sealant' ? !!cycle : vehicle?.[k]));
  const missing = PROTECTIONS.filter(([k]) => k !== 'paint_sealant' && !vehicle?.[k]).map(([, n]) => n);
  return <>
    {offer && <section className="v-offer"><div><p className="v-offer-k">Just for your vehicle</p><h2>{offer.discount_percent || 50}% off your {offer.title || 'Full Factory Reset'}</h2><p>Through {fmtDate(offer.expires_at)} · code <b>{offer.coupon_code}</b></p></div><a className="v-btn" href={`/?coupon=${encodeURIComponent(offer.coupon_code)}#book`}>Redeem &amp; book <GarageIcon name="arrow"/></a></section>}
    <section className="v-tiles" aria-label="Your vehicle at a glance">
      <Tile tone="blue" icon="bookings" label="Next visit">
        {next ? <><p className="v-big">{fmtShort(next.starts_at)}</p><p className="v-sub">{fmtTime(next.starts_at)} · {next.service_label}</p></>
          : <><p className="v-big v-soft">Not booked yet</p><a className="v-link" href="/#book">Book your next detail <GarageIcon name="arrow"/></a></>}
      </Tile>
      <Tile tone="yellow" icon="shield" label="Sealant protection">
        {cycle ? <div className="v-prot"><Ring percentUsed={progress.value}>{due ? <b>Due</b> : <><b>{days}</b><small>days</small></>}</Ring>
          <div><p className="v-big">{due ? 'Maintenance due' : `${days} days left`}</p><p className="v-sub">{due ? 'Time for a fresh sealant.' : `Until ${fmtShort(cycle.sealant_expires_at)}`}</p>{due && <a className="v-link" href="/#book">Book now <GarageIcon name="arrow"/></a>}</div></div>
          : <><p className="v-big v-soft">Add 3-month sealant</p><p className="v-sub">Free with every Full or Exterior detail.</p><a className="v-link" href="/#book">Book a detail <GarageIcon name="arrow"/></a></>}
      </Tile>
      <Tile tone="red" icon="spark" label="Last detail">
        {last ? <><p className="v-big">{last.title}</p><p className="v-sub">{fmtDate(last.service_date)}</p><button type="button" className="v-link" onClick={() => go('history')}>See history <GarageIcon name="arrow"/></button></>
          : <><p className="v-big v-soft">Your first detail</p><p className="v-sub">Your history will show up here.</p></>}
      </Tile>
    </section>
    {(applied.length > 0 || missing.length > 0) && <section className="v-protect" aria-label="Protection on your vehicle">
      <p className="v-label">What protects your vehicle</p>
      {applied.length > 0 && <ul className="v-chips">{applied.map(([k, n]) => <li key={k} className="v-chip is-on"><GarageIcon name="shield"/>{n}</li>)}</ul>}
      {missing.length > 0 && <p className="v-sub">Add {missing.join(' or ').toLowerCase()} on your next visit. Just ask.</p>}
    </section>}
    {strip.length > 0 && <section className="v-strip-wrap"><div className="v-row-head"><p className="v-label">Recent photos</p><button type="button" className="v-link" onClick={() => go('photos')}>All photos <GarageIcon name="arrow"/></button></div>
      <ul className="v-strip">{strip.slice(0, 10).map(p => <li key={p.id}><button type="button" onClick={() => onPhoto(p)} aria-label={p.caption || 'Open photo'}><img src={p.url} alt={p.caption || 'Your vehicle'} loading="lazy"/>{isBA(p) && <span className="v-tag">{p.photo_kind}</span>}</button></li>)}</ul></section>}
  </>;
}

function Photos({ vehicle, onPhoto }) {
  const [filter, setFilter] = useState('all');
  const photos = (vehicle?.photos || []).filter(p => p.url);
  const sets = { all: photos, ba: photos.filter(isBA), interior: photos.filter(isInterior), exterior: photos.filter(p => !isInterior(p) && !isBA(p)) };
  const chips = [['all', 'All'], ['ba', 'Before & after'], ['interior', 'Interior'], ['exterior', 'Exterior']].filter(([k]) => k === 'all' || sets[k].length);
  const shown = sets[filter] || photos;
  if (!photos.length) return <div className="v-empty"><GarageIcon name="photo"/><h3>Your photos will appear here</h3><p>After each detail we add your before and after photos to your Garage.</p></div>;
  return <><div className="v-filters" role="group" aria-label="Filter photos">{chips.map(([k, n]) => <button key={k} type="button" className={filter === k ? 'is-on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{n}<span>{sets[k].length}</span></button>)}</div>
    <ul className="v-grid">{shown.map(p => <li key={p.id}><button type="button" onClick={() => onPhoto(p)}><img src={p.url} alt={p.caption || 'Your vehicle'} loading="lazy"/><span className="v-cap">{p.caption || fmtDate(p.created_at)}</span></button></li>)}</ul></>;
}

function History({ vehicle }) {
  const services = vehicle?.services || [], upcoming = vehicle?.appointments || [];
  return <>
    {upcoming.length > 0 && <section className="v-block"><p className="v-label">Upcoming</p><ul className="v-timeline">{upcoming.map(a => <li key={a.id} className="is-next"><time>{fmtDate(a.starts_at)} · {fmtTime(a.starts_at)}</time><strong>{a.service_label}</strong><span className="v-pill">{a.status}</span></li>)}</ul></section>}
    <section className="v-block"><p className="v-label">Completed details</p>
      {services.length ? <ul className="v-timeline">{services.map(s => <li key={s.id}><time>{fmtDate(s.service_date)}</time><strong>{s.title}</strong>{s.description && <p>{s.description}</p>}
        <ul className="v-chips">{PROTECTIONS.filter(([k]) => s[k]).map(([k, n]) => <li key={k} className="v-chip is-on"><GarageIcon name="shield"/>{n}</li>)}</ul></li>)}</ul>
        : <div className="v-empty"><GarageIcon name="history"/><h3>Your history starts with your first detail</h3><p>Every service we do for you shows up here.</p><a className="v-btn" href="/#book">Book a detail <GarageIcon name="arrow"/></a></div>}
    </section></>;
}

function Account({ data }) {
  return <section className="v-block"><dl className="v-account"><div><dt>Name</dt><dd>{data.profile?.display_name || 'VVM client'}</dd></div><div><dt>Email</dt><dd>{data.profile?.email || '—'}</dd></div><div><dt>Vehicles</dt><dd>{data.vehicles.length}</dd></div></dl>
    <div className="v-actions">{!data.preview && <a className="v-btn" href="/reset-password">Change password <GarageIcon name="arrow"/></a>}
      <a className="v-btn v-btn-ghost" href="tel:+12406019451"><GarageIcon name="phone"/> Call or text (240) 601-9451</a>
      <a className="v-btn v-btn-ghost" href="mailto:vvm.detailing@gmail.com">Email VVM Details</a>
      {data.preview ? <a className="v-btn v-btn-ghost" href="/garage-admin">Back to admin</a> : <button type="button" className="v-btn v-btn-ghost" onClick={signOut}><GarageIcon name="logout"/> Sign out</button>}</div></section>;
}

export default function Garage() {
  const [data, setData] = useState(null), [selected, setSelected] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [view, setView] = useState('home'), [photo, setPhoto] = useState(null);
  const dialog = useRef(null), heading = useRef(null), prev = useRef(null);
  useEffect(() => {
    let active = true;
    const client = new URLSearchParams(location.search).get('client');
    async function load() {
      try { const d = await garageRequest(`/api/garage${client ? `?client=${encodeURIComponent(client)}` : ''}`, { cache: 'no-store' }); if (active) { setData(d); setSelected(id => preferredGarageVehicleId(d.vehicles, id)); setError(''); } }
      catch (e) { if (active) setError(e.message); } finally { if (active) setLoading(false); }
    }
    load();
    const timer = setInterval(load, 10 * 60 * 1000), visible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => { setPhoto(null); }, [selected]);
  useEffect(() => { if (photo) { prev.current = document.activeElement; dialog.current?.showModal(); } else if (dialog.current?.open) { dialog.current.close(); prev.current?.focus?.(); } }, [photo]);
  useEffect(() => { if (view !== 'home') heading.current?.focus({ preventScroll: true }); }, [view]);
  const vehicle = useMemo(() => data?.vehicles.find(v => v.id === selected), [data, selected]);
  const hero = vehicle?.photos.find(p => p.id === vehicle.hero_photo_id && p.url) || vehicle?.photos.find(p => p.photo_kind === 'hero' && p.url) || vehicle?.photos.find(p => p.photo_kind === 'after' && p.url) || vehicle?.photos.find(p => p.url);
  const first = (data?.profile?.display_name || '').trim().split(/\s+/)[0];
  const go = v => { setView(v); setPhoto(null); window.scrollTo({ top: 0 }); };
  const heads = { photos: 'Photos', history: 'History', account: 'Account' };

  return <main className="vault">
    <header className="v-top"><a className="v-brand" href="/" aria-label="VVM Details website"><img src="/assets/logo.jpg" alt=""/><span>VVM DETAILS<small>{data?.preview ? 'Client preview' : first ? `${first}’s Garage` : 'Your Garage'}</small></span></a>
      {data?.preview ? <a className="v-chip-link" href="/garage-admin">Back to admin</a> : data && <button type="button" className="v-icon-btn" onClick={signOut} aria-label="Sign out"><GarageIcon name="logout"/></button>}</header>
    {loading ? <p className="v-loading" role="status">Opening your Garage…</p>
      : !data ? <section className="v-auth"><h1>Your Garage awaits</h1><p role="alert">{error || 'Please sign in to open your Garage.'}</p><a className="v-btn" href="/client-login">Enter my Garage <GarageIcon name="arrow"/></a></section>
      : <>
        {error && <p className="v-note" role="status">Couldn’t refresh your Garage. {error}</p>}
        {data.vehicles.length > 1 && <div className="v-vehicles" role="tablist" aria-label="Your vehicles">{data.vehicles.map(v => <button key={v.id} type="button" role="tab" aria-selected={v.id === selected} className={v.id === selected ? 'is-on' : ''} onClick={() => setSelected(v.id)}>{vehicleLabel(v)}</button>)}</div>}
        {!vehicle ? <section className="v-empty v-wide"><GarageIcon name="garage"/><h1>Your Garage is ready</h1><p>We’ll add your vehicle and care history here after your first detail.</p><a className="v-btn" href="/#book">Book a detail <GarageIcon name="arrow"/></a></section> : <>
          {view === 'home' && <section className={`v-hero${hero ? '' : ' no-photo'}`} aria-label={vehicleLabel(vehicle)}>
            {hero ? <button type="button" className="v-hero-img" onClick={() => setPhoto(hero)} aria-label="Open photo"><img className="v-hero-fill" src={hero.url} alt="" aria-hidden="true"/><img className="v-hero-car" src={hero.url} alt={vehicleLabel(vehicle)} fetchPriority="high"/></button> : <div className="v-hero-img" aria-hidden="true"/>}
            <div className="v-hero-text"><p className="v-label">{first ? `Welcome back, ${first}` : 'Your vehicle'}</p><h1>{vehicleLabel(vehicle)}</h1>{vehicle.color && <p className="v-sub">{vehicle.color}</p>}</div></section>}
          {view !== 'home' && <h1 className="v-page-title" tabIndex="-1" ref={heading}>{heads[view]}<span>{vehicleLabel(vehicle)}</span></h1>}
          <div className="v-body">
            {view === 'home' && <Home vehicle={vehicle} hero={hero} onPhoto={setPhoto} go={go}/>}
            {view === 'photos' && <Photos vehicle={vehicle} onPhoto={setPhoto}/>}
            {view === 'history' && <History vehicle={vehicle}/>}
            {view === 'account' && <Account data={data}/>}
          </div></>}
        <nav className="v-nav" aria-label="Garage navigation">{TABS.map(([id, label, icon]) => <button key={id} type="button" className={view === id ? 'is-on' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}><GarageIcon name={icon}/><span>{label}</span></button>)}</nav>
      </>}
    <dialog className="v-dialog" ref={dialog} onCancel={e => { e.preventDefault(); setPhoto(null); }} onClick={e => { if (e.target === e.currentTarget) setPhoto(null); }} aria-label="Photo">{photo && <><button type="button" className="v-icon-btn v-dialog-x" onClick={() => setPhoto(null)} aria-label="Close photo"><GarageIcon name="close"/></button><img src={photo.url} alt={photo.caption || 'Your vehicle'}/>{photo.caption && <p>{photo.caption}</p>}</>}</dialog>
  </main>;
}
