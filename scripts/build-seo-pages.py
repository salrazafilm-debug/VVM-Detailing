#!/usr/bin/env python3
"""Builds the local SEO pages (Calvert County hub, town pages, service pages) into public/, plus sitemap.xml and
scripts/seo-slugs.json (read by next.config.mjs for clean URLs).

Run from the repo root:  python3 scripts/build-seo-pages.py

Copy rules (so the pages stay honest): only say what the site and terms already say. No prices (they change in Square
and are shown live in the booking), no invented local facts, no review numbers. Edit the data below, then run it again.
"""
import html, json, datetime, os

BASE = 'https://vvmdetails.com'
PHONE_DISPLAY, PHONE_TEL = '(240) 601-9451', '+12406019451'
EMAIL = 'vvm.detailing@gmail.com'
TODAY = datetime.date.today().isoformat()
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

esc = html.escape

# ---------- the six towns on the Calvert County map (same ZIPs as FAMILY_ZIPS in server/travel.js) ----------
TOWNS = [
    dict(slug='mobile-detailing-chesapeake-beach-md', name='Chesapeake Beach', zip='20732',
         near='Chesapeake Beach is our home base, so travel here is always free.',
         about='Chesapeake Beach is a bayfront town in Calvert County, and it is where VVM Mobile Detailing is based. We know the streets, the driveways and the docks, and we can usually fit you in quickly.',
         angle=('Cars and boats', 'Keep a boat at a dock or marina nearby? Ask us about boat detailing. We come to your dock, marina or driveway, and every boat is quoted by text or email.')),
    dict(slug='mobile-detailing-north-beach-md', name='North Beach', zip='20714',
         near='North Beach is inside our Calvert County family area, so travel is free.',
         about='North Beach is a small bayfront town in Calvert County, just up the road from our home base in Chesapeake Beach. If you live in or around North Beach, we come straight to your driveway.',
         angle=('Beach days, clean car', 'Sand and dirt find their way into carpets and seats. The Interior Reset is a deep clean of the dash, seats, carpets, vents, door jambs and pedals, finished with a fresh scent.')),
    dict(slug='mobile-detailing-prince-frederick-md', name='Prince Frederick', zip='20678',
         near='Prince Frederick is inside our Calvert County family area, so travel is free.',
         about='Prince Frederick is the county seat of Calvert County. We bring a full mobile detailing service to homes and workplaces in Prince Frederick, so you do not have to give up your day to get your vehicle looking new.',
         angle=('Daily drivers', 'Vehicles that work hard collect road film and interior mess fast. The Full Factory Reset cleans the whole vehicle in one visit, and the free 3-month ceramic sealant helps it stay cleaner longer.')),
    dict(slug='mobile-detailing-huntingtown-md', name='Huntingtown', zip='20639',
         near='Huntingtown is inside our Calvert County family area, so travel is free.',
         about='Huntingtown is a community in northern Calvert County. We come to your driveway in Huntingtown, so you can keep your day.',
         angle=('Family vehicles', 'SUVs, trucks and minivans take a beating inside. We offer pet hair removal, seat shampoo and stain removal add-ons with the Interior Reset or the Full Factory Reset.')),
    dict(slug='mobile-detailing-dunkirk-md', name='Dunkirk', zip='20754',
         near='Dunkirk is inside our Calvert County family area, so travel is free.',
         about='Dunkirk is a community in northern Calvert County. VVM Mobile Detailing comes to Dunkirk for full details, exterior washes, interior cleans, ceramic coating and more.',
         angle=('Trucks and commuters', 'The Exterior Reset is a hand wash with iron and clay decontamination, finished with a free ceramic sealant and tire shine. For lasting protection, ask about our 5 year ceramic coating.')),
    dict(slug='mobile-detailing-owings-md', name='Owings', zip='20736',
         near='Owings is inside our Calvert County family area, so travel is free.',
         about='Owings is a community in northern Calvert County. We offer mobile detailing in Owings, from a fresh interior clean to a full-day paint enhancement and ceramic coating.',
         angle=('Older vehicles, new look', 'Foggy, yellow headlights make a vehicle look tired and are harder to see by at night. Our Headlight Restoration sands, polishes and seals them. Add it to any detail.')),
]

# ---------- services ----------
SERVICES = [
    dict(slug='full-factory-reset-calvert-county-md', short='The Full Factory Reset', title='Full Car Detail in Calvert County, MD',
         h1='The Full Factory Reset: Full Car Detail in Calvert County',
         desc='Interior and exterior detail with a FREE 3-month ceramic sealant, at your door in Calvert County, MD. FREE travel up to 30 min. Book online.',
         lede='Our most popular service: the interior and the exterior together, plus a free ceramic sealant, all done at your home or work in Calvert County.',
         includes=['<b>Interior and exterior</b> detailed in one visit', '<b>PH-balanced handwash</b> and full decontamination', '<b>FREE 3-month ceramic sealant</b>, which beats wax', '<b>Tire shine</b> and see-through glass', 'Save versus booking the interior and the exterior separately'],
         who='Everyone who wants the whole vehicle done at once. It is the best value of our services, and a good way to reset a vehicle that has not been detailed in a while.',
         faq=[('Is the ceramic sealant really free?', 'Yes. The Full Factory Reset includes a free ceramic sealant that lasts about 3 months. It is not the same as our 5 year ceramic coating, which is a separate service.'),
              ('Can I add things to the Full Factory Reset?', 'Yes. Pet hair removal, seat shampoo, stain removal and odor removal can be added, and so can Engine Bay Detail or Headlight Restoration.'),
              ('How long does it take?', 'It depends on the size and condition of the vehicle. The booking page shows the estimated time for your size before you pick a day.')]),
    dict(slug='interior-car-detailing-calvert-county-md', short='Interior Reset', title='Interior Car Detailing in Calvert County, MD',
         h1='Interior Car Detailing in Calvert County, MD',
         desc='A deep interior clean at your door in Calvert County, MD: dash, seats, carpets, vents and more. FREE travel up to 30 min. Book online.',
         lede='A deep clean on every surface inside your vehicle, done where you park it in Calvert County.',
         includes=['A deep clean on <b>every surface</b>', '<b>Nano ceramic</b> on interior plastics', 'Dash, seats, carpets, vents, door jambs and pedals', 'Finished with a <b>fresh scent</b>', 'Add-ons: pet hair removal, seat shampoo, stain removal, odor removal'],
         who='Pet owners, parents, anyone who eats in the car, and anyone who is tired of looking at the mess. We will tell you the price before we start any add-on.',
         faq=[('What should I do before you arrive?', 'Please remove all personal belongings and any items from your vehicle so we can complete the detail.'),
              ('Do add-ons cost extra?', 'Yes. Pet hair removal, seat shampoo, stain removal and odor removal cost extra and depend on condition. We tell you the price before we start any add-on.'),
              ('Do you do the outside too?', 'Yes. Book the Exterior Reset as well, or choose the Full Factory Reset to get both for less.')]),
    dict(slug='mobile-car-wash-calvert-county-md', short='Exterior Reset', title='Mobile Car Wash in Calvert County, MD',
         h1='Mobile Car Wash and Exterior Detail in Calvert County',
         desc='A hand wash with iron and clay decontamination at your door in Calvert County, MD, with a free ceramic sealant. FREE travel up to 30 min.',
         lede='A careful hand wash and decontamination for the outside of your vehicle, at your door in Calvert County.',
         includes=['<b>Pre-wash</b>, PH-balanced foam and hand wash', 'Full <b>iron and clay</b> decontamination', 'Emblems, windows and tires cleaned', 'Finished with a <b>free ceramic sealant</b> and tire shine'],
         who='Anyone who wants a deeper clean than a drive-through wash, and a paint surface that is protected and easier to keep clean.',
         faq=[('How is this different from a car wash?', 'We wash by hand and decontaminate the paint with iron remover and clay, which lifts what a normal wash leaves behind. It finishes with a ceramic sealant and tire shine.'),
              ('Will you wash my vehicle in the rain?', 'If rain, storms or extreme weather make it unsafe or unsuitable to work, we will contact you to reschedule at no charge. Covered or garage space is welcome.'),
              ('Can I get the inside done too?', 'Yes. The Full Factory Reset does the interior and the exterior together.')]),
    dict(slug='ceramic-coating-calvert-county-md', short='Paint Enhancement + Ceramic Coating', title='Ceramic Coating in Calvert County, MD',
         h1='Ceramic Coating and Paint Correction in Calvert County, MD',
         desc='5 year ceramic coating with paint correction, applied at your door in Calvert County, MD. FREE travel up to 30 min. Full-day service.',
         lede='Paint enhancement and a 5 year ceramic coating, applied by hand in Calvert County. It is a full-day, exterior-only service.',
         includes=['Full <b>wash and decontamination</b>', '<b>One-step paint correction</b> to remove most swirls and defects (two-step available for older vehicles or more severe condition)', 'Panel prep so the coating bonds directly to the paint', '<b>5 year ceramic coating</b>, applied by hand, panel by panel', 'A final walkthrough where we review every step with you'],
         who='Anyone who wants lasting protection and a deep, mirror-like gloss. Because the coating locks in whatever is under it, we always correct the paint first.',
         faq=[('What is paint enhancement?', 'Paint enhancement, also called paint correction, is the step that makes your paint look new again. We use a machine polisher and professional compounds to carefully level a microscopic layer of clear coat, which removes swirl marks, fine scratches and haze.'),
              ('How long does a ceramic coating last?', 'Ours is a 5 year coating. Wax lasts weeks to a few months, and our free sealant lasts about 3 months.'),
              ('Is a ceramic coating scratch-proof?', 'No. It makes your vehicle easier to keep clean and helps protect the paint, but it is not scratch-proof and still needs regular washing. A scratch that goes through the clear coat cannot be polished out, and we will tell you what is realistic for your paint.')]),
    dict(slug='headlight-restoration-calvert-county-md', short='Headlight Restoration', title='Headlight Restoration in Calvert County, MD',
         h1='Headlight Restoration in Calvert County, MD',
         desc='Foggy or yellow headlights restored at your door in Calvert County, MD: sanded, polished and sealed. FREE travel up to 30 min.',
         lede='Foggy, yellow headlights restored to a clear, new look, done at your home or work in Calvert County.',
         includes=['We <b>sand, polish and seal</b> the headlights', 'Restores the new look and the <b>clarity at night</b>', 'Finished with a fresh layer of <b>2K clear coat</b> and <b>ceramic protection</b>', 'Easy to add to any detail'],
         who='Vehicles that are about 5 to 10+ years old, where the headlight lenses have turned cloudy or yellow.',
         faq=[('Can I add headlights to another service?', 'Yes. You can book Headlight Restoration on its own or add it to another service.'),
              ('How do I see the price?', 'The booking page shows the current price for Headlight Restoration before you pick a day.')]),
    dict(slug='boat-detailing-calvert-county-md', short='Boat Detailing', title='Boat Detailing in Calvert County, MD',
         h1='Boat Detailing in Calvert County, MD',
         desc='Mobile boat detailing at your dock, marina or driveway in Calvert County, MD. Text or email VVM for a quote.',
         lede='Your boat gets the VVM treatment too. We come to your dock, marina or driveway in Calvert County and bring the shine back.',
         includes=['We come to your <b>dock, marina or driveway</b>', 'Every boat is different, so every job is <b>quoted</b>', 'Text or email us a few details and photos to get started'],
         who='Boat owners around Calvert County who would rather spend the day on the water than scrubbing the deck.',
         faq=[('How do I get a boat detailing quote?', f'Text us at {PHONE_DISPLAY} or email {EMAIL}. Boats are quoted because every boat is different.'),
              ('Where do you work?', 'At your dock, marina or driveway, wherever the boat is kept in Calvert County.')]),
]

HUB = dict(slug='mobile-detailing-calvert-county-md', name='Calvert County')

# ---------- shared pieces ----------
TOWN_LINKS = ''.join(f'<a href="/{t["slug"]}">{t["name"]}</a>' for t in TOWNS)


def tag(slug):
    return f'{BASE}/{slug}'


def head(title, desc, slug, jsonld):
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(j, separators=(",", ":"), ensure_ascii=False)}</script>\n' for j in jsonld)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{tag(slug)}">
<meta name="theme-color" content="#e9b3b3">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VVM Details">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{tag(slug)}">
<meta property="og:image" content="{BASE}/assets/og-image.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Montserrat:ital,wght@1,700;1,800;1,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
{ld}<script>window.va=window.va||function(){{(window.vaq=window.vaq||[]).push(arguments)}}</script>
<script defer src="/_vercel/insights/script.js"></script>
</head>
<body class="legal-page seo-page">
'''


def top():
    return '''<header class="legal-top">
  <a href="/" class="brand"><img src="/assets/logo.jpg" alt="VVM Details fox logo"><span>VVM Details</span></a>
  <a href="/" class="legal-back">&larr; Back to site</a>
</header>
'''


def foot():
    return f'''<footer class="footer legal-foot">
  <div class="foot-inner">
    <p class="foot-brand">VVM Details</p>
    <p class="foot-area">Local to Calvert County, MD &middot; Serving DC, MD &amp; VA</p>
    <div class="foot-contact">
      <a class="foot-pill" href="tel:{PHONE_TEL}">Call or text {PHONE_DISPLAY}</a>
      <a class="foot-pill" href="mailto:{EMAIL}">{EMAIL}</a>
    </div>
    <nav class="foot-areas" aria-label="Areas we serve"><span>Mobile detailing in</span> {TOWN_LINKS}</nav>
    <nav class="foot-links" aria-label="Footer"><a href="/">Home</a><a href="/#services">Services</a><a href="/#book">Book Now</a><a href="/terms.html">Terms</a><a href="/privacy.html">Privacy Policy</a></nav>
    <p class="foot-copy">&copy; <span id="yr"></span> VVM Details. All rights reserved.</p>
  </div>
</footer>
<script>document.getElementById('yr').textContent=new Date().getFullYear()</script>
</body>
</html>
'''


def hero(eyebrow, h1, lede):
    return f'''<main class="legal-wrap seo-main">
  <header class="legal-head">
    <p class="eyebrow">{esc(eyebrow)}</p>
    <h1 class="legal-title">{esc(h1)}</h1>
    <p class="legal-lede">{esc(lede)}</p>
    <div class="seo-ctas"><a href="/#book" class="hero-book">Book my day</a><a href="sms:{PHONE_TEL}" class="seo-alt">Text {PHONE_DISPLAY}</a></div>
  </header>
  <ul class="seo-badges"><li><b>FREE</b>travel up to 30 min</li><li><b>$25 OFF</b>in our family area</li><li><b>WE COME</b>to you</li></ul>
  <div class="legal-card">
'''


def section(title, body):
    return f'<section class="legal-sec"><h2>{esc(title)}</h2>{body}</section>\n'


def faq_html(items):
    rows = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in items)
    return section('Questions, answered', f'<div class="faq">{rows}</div>')


def faq_ld(items):
    return {'@context': 'https://schema.org', '@type': 'FAQPage',
            'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in items]}


def crumbs(items):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
            'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(items)]}


def business():
    return {'@type': 'AutoWash', 'name': 'VVM Mobile Detailing - Calvert County', 'alternateName': 'VVM Details', 'url': BASE + '/',
            'telephone': '+1-240-601-9451', 'image': BASE + '/assets/og-image.png'}


def service_ld(name, desc, areas):
    return {'@context': 'https://schema.org', '@type': 'Service', 'name': name, 'description': desc, 'provider': business(),
            'areaServed': [{'@type': 'Place', 'name': a} for a in areas]}


def service_list():
    return '<ul>' + ''.join(f'<li><a href="/{s["slug"]}"><b>{esc(s["short"])}</b></a></li>' for s in SERVICES) + '</ul>'


def cta_block(text):
    return f'''  </div>
  <section class="seo-cta"><h2>{esc(text)}</h2><div class="seo-ctas"><a href="/#book" class="hero-book">Book my day</a><a href="sms:{PHONE_TEL}" class="seo-alt">Text {PHONE_DISPLAY}</a></div>
  <p class="muted">No deposit. We take payment only after we complete your service.</p></section>
</main>
'''


STEPS = '''<ol class="seo-steps">
<li><b>Pick your services</b> and your vehicle on the booking page.</li>
<li><b>Enter your ZIP code.</b> Travel is free up to 30 minutes, and the family area discount applies automatically.</li>
<li><b>Choose a day and time</b> that works for you.</li>
<li><b>We come to you.</b> Please empty your vehicle of personal belongings and park where we can open the doors and work around it.</li>
</ol>'''

COMMON_FAQ = [
    ('Do I need to pay a deposit?', 'No. There is no deposit. We take payment only after we complete your service.'),
    ('What should I do before you arrive?', 'Please remove all personal belongings and any items from your vehicle so we can complete the detail. Park where we have room to open the doors and work around the vehicle, and let us know if you have water and power access.'),
    ('Can I drop my vehicle off instead?', 'Yes. You can drop off at our home base in Chesapeake Beach, MD. The address is shown when you choose drop-off while booking, and there is no travel fee for drop-off.'),
]

pages = []   # (slug, html, priority)


def write(slug, content, priority='0.8'):
    with open(os.path.join(OUT, slug + '.html'), 'w', encoding='utf-8') as f:
        f.write(content)
    pages.append((slug, priority))


# ---------- hub ----------
hub_faq = [
    ('Do you service all of Calvert County?', 'Yes. We are based in Chesapeake Beach and come to homes, workplaces, docks and marinas across Calvert County. Our family area covers Chesapeake Beach, North Beach, Huntingtown, Owings, Dunkirk and Prince Frederick.'),
    ('How much is travel?', 'Travel is free up to 30 minutes from us. Farther trips have a small travel fee that you see before you book. Customers in our family area never pay a travel fee.'),
    ('What is the family area discount?', 'Customers in the Calvert County family area get FREE travel plus $25 off their total price. It applies automatically when you enter your ZIP code at checkout.'),
    ('Do you also serve DC, Maryland and Virginia?', 'Yes. Calvert County is our home, and we also travel to the DC, MD and VA area. A travel fee applies for longer trips, and you see it before you book.'),
] + COMMON_FAQ
body = hero('Local to Calvert County', 'Mobile Car Detailing in Calvert County, MD',
            'VVM Mobile Detailing is based in Chesapeake Beach and comes to you across Calvert County. Car wash, interior and exterior detailing, ceramic coating and more, at your door.')
body += section('We come to you', '<p>Mobile detailing means you do not drive anywhere or wait around. We bring everything to your driveway, workplace, dock or marina anywhere in Calvert County. Customers in our Calvert County family area get <b>FREE travel plus $25 off</b>, applied automatically when you enter your ZIP code.</p>')
body += section('Towns we serve', '<p>Tap your town to see how we work there:</p><nav class="seo-links" aria-label="Towns">' + TOWN_LINKS + '</nav><p>Do not see your town? We serve all of Calvert County and the DC, MD and VA area. Enter your ZIP code on the booking page to see your travel fee.</p>')
body += section('Our services in Calvert County', service_list())
body += section('How it works', STEPS)
body += faq_html(hub_faq)
body += cta_block('Ready to book in Calvert County?')
page = head('Mobile Car Detailing in Calvert County, MD | VVM Details',
            'Mobile car detailing in Calvert County, MD. Based in Chesapeake Beach. FREE travel up to 30 min plus $25 off in our family area. Also serving DC, MD and VA.',
            HUB['slug'], [service_ld('Mobile car detailing', 'Mobile car wash and detailing in Calvert County, MD.', ['Calvert County, MD'] + [t['name'] + ', MD' for t in TOWNS]),
                          faq_ld(hub_faq), crumbs([('Home', BASE + '/'), ('Calvert County', tag(HUB['slug']))])]) + top() + body + foot()
write(HUB['slug'], page, '0.9')

# ---------- towns ----------
for t in TOWNS:
    others = ''.join(f'<a href="/{o["slug"]}">{o["name"]}</a>' for o in TOWNS if o['slug'] != t['slug'])
    faq = [
        (f'Do you come to {t["name"]}?', f'Yes. We are a mobile service, so we come to your home or workplace in {t["name"]} (ZIP {t["zip"]}).'),
        (f'How much is travel to {t["name"]}?', f'{t["near"]} Enter ZIP {t["zip"]} while booking and your FREE travel and $25 family area discount apply automatically.'),
    ] + COMMON_FAQ
    body = hero(f'{t["name"]}, Calvert County', f'Mobile Car Detailing in {t["name"]}, MD',
                f'VVM Mobile Detailing comes to you in {t["name"]}: car wash, interior and exterior detailing, ceramic coating and more. FREE travel plus $25 off.')
    body += section(f'Detailing that comes to you in {t["name"]}', f'<p>{esc(t["about"])}</p><p>{esc(t["near"])} Enter ZIP <b>{t["zip"]}</b> when you book and you get <b>FREE travel + $25 off</b> your total price.</p>')
    body += section(t['angle'][0], f'<p>{esc(t["angle"][1])}</p>')
    body += section(f'What we do in {t["name"]}', service_list())
    body += section('How it works', STEPS)
    body += section('Also serving nearby', f'<nav class="seo-links" aria-label="Nearby towns">{others}<a href="/{HUB["slug"]}">All of Calvert County</a></nav>')
    body += faq_html(faq)
    body += cta_block(f'Book mobile detailing in {t["name"]}')
    page = head(f'Mobile Car Detailing in {t["name"]}, MD | VVM Details',
                f'Mobile car detailing in {t["name"]}, MD (ZIP {t["zip"]}). We come to you. FREE travel plus $25 off in our Calvert County family area. Book online.',
                t['slug'], [service_ld(f'Mobile car detailing in {t["name"]}, MD', f'Mobile car wash and detailing in {t["name"]}, Calvert County, MD.', [f'{t["name"]}, MD', 'Calvert County, MD']),
                            faq_ld(faq), crumbs([('Home', BASE + '/'), ('Calvert County', tag(HUB['slug'])), (t['name'], tag(t['slug']))])]) + top() + body + foot()
    write(t['slug'], page)

# ---------- services ----------
for s in SERVICES:
    faq = s['faq'] + [COMMON_FAQ[0], ('Where do you work?', 'We come to you anywhere in Calvert County, including Chesapeake Beach, North Beach, Prince Frederick, Huntingtown, Dunkirk and Owings, and we also travel around the DC, MD and VA area.')]
    body = hero('Calvert County, MD', s['h1'], s['lede'])
    body += section("What's included", '<ul>' + ''.join(f'<li>{i}</li>' for i in s['includes']) + '</ul>')
    body += section('Who it is for', f'<p>{esc(s["who"])}</p>')
    body += section('Prices and booking', '<p>Prices depend on your vehicle size and are shown live on the booking page before you pick a day. There is no deposit, and we take payment only after we complete your service.</p>' if s['slug'] != 'boat-detailing-calvert-county-md' else f'<p>Every boat is different, so every boat is quoted. Text us at <a href="sms:{PHONE_TEL}">{PHONE_DISPLAY}</a> or email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>')
    body += section('How it works', STEPS)
    body += section('Serving these towns', f'<nav class="seo-links" aria-label="Towns">{TOWN_LINKS}<a href="/{HUB["slug"]}">All of Calvert County</a></nav>')
    body += section('More services', service_list())
    body += faq_html(faq)
    body += cta_block(f'Book {s["short"].lower() if s["short"] != "The Full Factory Reset" else "the Full Factory Reset"} in Calvert County')
    page = head(f'{s["title"]} | VVM Details', s['desc'], s['slug'],
                [service_ld(s['short'], s['desc'], ['Calvert County, MD']), faq_ld(faq),
                 crumbs([('Home', BASE + '/'), ('Calvert County', tag(HUB['slug'])), (s['short'], tag(s['slug']))])]) + top() + body + foot()
    write(s['slug'], page)

# ---------- sitemap and slugs ----------
urls = [(BASE + '/', '1.0'), (BASE + '/privacy.html', '0.3'), (BASE + '/terms.html', '0.3')] + [(tag(slug), pr) for slug, pr in pages]
with open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
    for u, pr in urls:
        f.write(f'  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>\n')
    f.write('</urlset>\n')
with open(os.path.join(os.path.dirname(__file__), 'seo-slugs.json'), 'w') as f:
    json.dump([slug for slug, _ in pages], f, indent=1)
print(f'built {len(pages)} pages')
