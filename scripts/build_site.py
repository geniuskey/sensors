from pathlib import Path
from datetime import date
from html import escape
from urllib.parse import quote
import json, re, shutil
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'; SITE='https://sensors.euiyun.com'; OG_IMAGE=SITE+'/images/image-sensor.png'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT/'index.html',DIST/'index.html')
(DIST/'src').mkdir()
for asset in ('main.js', 'dashboard.js', 'phones.js', 'style.css'):
    shutil.copy2(ROOT/'src'/asset, DIST/'src'/asset)
(DIST/'catalog').mkdir()
shutil.copy2(ROOT/'catalog/index.html', DIST/'catalog/index.html')
(DIST/'phones').mkdir()
shutil.copy2(ROOT/'phones/index.html', DIST/'phones/index.html')
shutil.copytree(ROOT/'public/data',DIST/'data')
shutil.copytree(ROOT/'public/images',DIST/'images')
shutil.copy2(ROOT/'public/favicon.svg',DIST/'favicon.svg')

def slug(text): return re.sub(r'[^a-z0-9]+','-',str(text).lower().replace('+',' plus ')).strip('-')
def sensor_slug(s): return slug(s['canonical_id'])
def phone_slug(p): return slug(p.get('model') or p['canonical_id'].removeprefix('PHONE:'))
def e(v): return escape('' if v is None else str(v))
def num(v, d=1): return '' if v in (None,'') else f'{float(v):.{d}f}'.rstrip('0').rstrip('.')
def fmt_size(v): return f'{v}"' if v and not str(v).endswith('"') else (v or '')
def badge(c): return f'<span class="badge badge-{"high" if c=="High" else "medium" if c and c.startswith("Medium") else "low"}">{e(c or "Unrated")}</span>'
def ld(obj): return '<script type="application/ld+json">'+json.dumps(obj,ensure_ascii=False).replace('</','<\\/')+'</script>'

catalog=(ROOT/'catalog/index.html').read_text(encoding='utf-8')
TOPBAR=re.search(r'<header class="topbar">.*?</header>',catalog,re.S).group(0)
NAV_PLAIN=re.sub(r'<a class="is-current" href="([^"]+)" aria-current="page">',r'<a href="\1">',TOPBAR)
def topbar(section): return NAV_PLAIN.replace(f'<a href="{section}">',f'<a class="is-current" href="{section}" aria-current="page">',1)
FOOTER='<footer class="page-footer"><span>Source-traceable mobile image sensor data</span><span class="footer-links"><a href="/data/all-in-one.csv">Download CSV ↓</a><a href="https://github.com/geniuskey/sensors" target="_blank" rel="noopener noreferrer">How this catalog is maintained ↗</a></span></footer>'

def page(path, title, desc, section, crumbs, body, product):
    url=SITE+path
    crumb_ld={'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+h} for i,(n,h) in enumerate(crumbs)]}
    nav=' <span aria-hidden="true">/</span> '.join(f'<a href="{e(h)}">{e(n)}</a>' if i<len(crumbs)-1 else f'<span aria-current="page">{e(n)}</span>' for i,(n,h) in enumerate(crumbs))
    return f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(desc)}" />
    <link rel="canonical" href="{e(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mobile Image Sensor Database" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(desc)}" />
    <meta property="og:url" content="{e(url)}" />
    <meta property="og:image" content="{OG_IMAGE}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="{e(title)}" />
    <meta name="twitter:description" content="{e(desc)}" />
    <meta name="twitter:image" content="{OG_IMAGE}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
    <link rel="stylesheet" href="/src/style.css" />
    {ld(product)}
    {ld(crumb_ld)}
  </head>
  <body class="detail-page-body">
    <a class="skip-link" href="#main-content">Skip to content</a>
    {topbar(section)}
    <main class="detail-page" id="main-content">
      <nav class="breadcrumb" aria-label="Breadcrumb">{nav}</nav>
      {body}
      {FOOTER}
    </main>
  </body>
</html>
'''

def items(pairs): return ''.join(f'<div class="detail-item"><span>{e(k)}</span><strong>{e(v if v not in (None,"") else "—")}</strong></div>' for k,v in pairs)
def write(path, html):
    out=DIST/path.strip('/')/'index.html'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(html,encoding='utf-8')

sensors=json.loads((ROOT/'public/data/sensors.json').read_text(encoding='utf-8'))
phones=json.loads((ROOT/'public/data/phones.json').read_text(encoding='utf-8'))
for kind,rows,fn in (('sensor',sensors,sensor_slug),('phone',phones,phone_slug)):
    seen={}
    for r in rows:
        s=fn(r)
        if not s or s in seen: raise SystemExit(f'Duplicate or empty {kind} slug {s!r}: {seen.get(s)} / {r["canonical_id"]}')
        seen[s]=r['canonical_id']
sensor_by_id={s['canonical_id']:s for s in sensors}; phone_by_id={p['canonical_id']:p for p in phones}
urls=['/','/catalog/','/phones/']

for s in sensors:
    name=s.get('sensor') or s.get('marketing_name') or s['canonical_name']; maker=s.get('manufacturer') or ''; full=f'{maker} {name}'.strip()
    mp=num(s.get('resolution_mp')); size=fmt_size(s.get('sensor_size')); pitch=num(s.get('pixel_size_um'),2)
    headline=' '.join(x for x in (mp and mp+'MP', size) if x)
    ps=s.get('phones') or []; path=f'/sensors/{sensor_slug(s)}/'; urls.append(path)
    title=f'{full} — {headline+" " if headline else ""}mobile image sensor | Sensor Database'
    spec=', '.join(x for x in (mp and mp+' MP', size and size+' optical format', pitch and pitch+' µm pixels', s.get('af') and 'AF: '+s['af'], s.get('hdr') and 'HDR: '+s['hdr']) if x)
    desc=f'{full} image sensor specifications{": "+spec if spec else ""}. '+(f'Used in {len(ps)} phone{"s" if len(ps)!=1 else ""}, including {", ".join(p["model"] for p in ps[:3])}.' if ps else 'Camera roles, phone mappings and sources.')
    specs=[('Resolution',mp and mp+' MP'),('Resolution pixels',s.get('resolution_px')),('Optical format',size),('Pixel pitch',pitch and pitch+' µm'),('Pixel binning',s.get('pixel_binning')),('Autofocus',s.get('af')),('HDR',s.get('hdr')),('CFA',s.get('cfa')),('Full well capacity',s.get('fwc')),('Two layer transistor',s.get('two_layer_transistor')),('Transfer gate',s.get('transfer_gate')),('Internal code',s.get('internal_code')),('Camera roles',s.get('roles')),('First phone year',s.get('first_year')),('Latest phone year',s.get('latest_year')),('Phone mappings',len(ps))]
    cards=''.join(f'<article class="camera-mapping-card"><div class="camera-mapping-head"><span class="role-tag">{e(p.get("role") or "Unspecified")}</span>{badge(p.get("confidence"))}</div><h3>'+(f'<a href="/phone/{phone_slug(phone_by_id[p["canonical_id"]])}/">{e(p["model"])}</a>' if p.get('canonical_id') in phone_by_id else e(p['model']))+f'</h3><p>{e(" · ".join(str(x) for x in (p.get("oem"),p.get("year")) if x))}</p></article>' for p in ps)
    srcs=s.get('sources') or ([{'url':s['source_url'],'type':'source','relationship':'spec'}] if s.get('source_url') else [])
    body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">{e(maker)} IMAGE SENSOR</div><h1>{e(full)}</h1><p>{e(s["canonical_id"])} · {badge(s.get("confidence"))}</p></div></div>
        <div class="detail-grid">{items(specs)}</div>
        <div class="detail-extra"><h2>Aliases</h2><p>{e(" · ".join(s.get("aliases") or []) or "—")}</p>{f"<h2>Notes</h2><p>{e(s['notes'])}</p>" if s.get("notes") else ""}</div>
      </section>
      <section class="detail-panel"><div class="section-kicker">PHONES USING THIS SENSOR</div><h2 class="detail-section-title">{len(ps)} mapped phone{"s" if len(ps)!=1 else ""}</h2>{f'<div class="camera-mapping-list">{cards}</div>' if ps else '<p class="phone-none">No phone mappings are available for this sensor yet.</p>'}</section>
      <section class="detail-panel"><div class="section-kicker">SOURCES</div><ul class="source-list">{"".join(f'<li><a href="{e(x["url"])}" target="_blank" rel="noopener noreferrer">{e(x["url"])} ↗</a> <span class="badge badge-source">{e(x.get("type") or "source")}</span> <span class="badge badge-source">{e(x.get("relationship") or "spec")}</span></li>' for x in srcs) or "<li>No sources listed.</li>"}</ul><p class="detail-cta"><a class="button button-secondary" href="/catalog/?sensor={e(quote(s["canonical_id"]))}">Open in sensor catalog →</a></p></section>'''
    props=[{'@type':'PropertyValue','name':k,'value':str(v)} for k,v in specs if v not in (None,'')]
    product={'@context':'https://schema.org','@type':'Product','name':full,'description':desc,'url':SITE+path,'image':OG_IMAGE,'sku':s['canonical_id'],'category':'Mobile image sensor','brand':{'@type':'Brand','name':maker},'manufacturer':{'@type':'Organization','name':maker},'additionalProperty':props}
    if s.get('aliases'): product['alternateName']=s['aliases']
    write(path,page(path,title,desc,'/catalog/',[('Home','/'),('Sensors','/catalog/'),(full,path)],body,product))

for p in phones:
    model=p['model']; cams=p.get('cameras') or []; path=f'/phone/{phone_slug(p)}/'; urls.append(path)
    main=next((c for c in cams if 'Main' in (c.get('role') or '')),cams[0] if cams else None)
    title=f'{model} camera sensors{" — "+main["sensor"]+" main" if main else ""} | Sensor Database'
    desc=f'{model}{" ("+str(p["release_year"])+")" if p.get("release_year") else ""} image sensors by camera: '+('; '.join(f'{c.get("role") or "Camera"}: {c.get("sensor_manufacturer") or ""} {c.get("sensor")}'.replace('  ',' ') for c in cams) if cams else 'no sensor mappings yet')+'.'
    facts=[('Brand',p.get('oem')),('Release year',p.get('release_year')),('System on chip',p.get('soc')),('Camera mappings',len(cams)),('DXOMARK camera score',p.get('camera_score')),('DXOMARK protocol',p.get('camera_protocol'))]
    def cam(c):
        sen=sensor_by_id.get(c.get('sensor_id')); nm=e(c.get('sensor') or c.get('sensor_id'))
        info=' · '.join(x for x in (c.get('sensor_manufacturer'), num(c.get('resolution_mp')) and num(c.get('resolution_mp'))+' MP', fmt_size(c.get('sensor_size')), num(c.get('pixel_size_um'),2) and num(c.get('pixel_size_um'),2)+' µm pixels') if x)
        return f'<article class="camera-mapping-card"><div class="camera-mapping-head"><span class="role-tag">{e(c.get("role") or "Unspecified")}</span>{badge(c.get("confidence"))}</div><h3>'+(f'<a href="/sensors/{sensor_slug(sen)}/">{nm}</a>' if sen else nm)+f'</h3><p>{e(info or "Sensor specifications are not listed.")}</p>'+(f'<a class="mapping-source" href="{e(c["source_url"])}" target="_blank" rel="noopener noreferrer">Mapping source ↗</a>' if c.get('source_url') else '')+'</article>'
    body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">{e(p.get("oem") or "PHONE")} SMARTPHONE</div><h1>{e(model)}</h1><p>{e(p["canonical_id"])}</p></div></div>
        <div class="detail-grid phone-detail-grid">{items(facts)}</div>
      </section>
      <section class="detail-panel"><div class="section-kicker">IMAGE SENSORS BY CAMERA</div><h2 class="detail-section-title">{len(cams)} camera{"s" if len(cams)!=1 else ""}</h2>{f'<div class="camera-mapping-list">{"".join(cam(c) for c in cams)}</div>' if cams else '<p class="phone-none">No image sensor mappings are available for this phone yet.</p>'}<p class="detail-cta"><a class="button button-secondary" href="/phones/?phone={e(quote(p["canonical_id"]))}">Open in phone catalog →</a></p></section>'''
    product={'@context':'https://schema.org','@type':'Product','name':model,'description':desc,'url':SITE+path,'image':OG_IMAGE,'sku':p['canonical_id'],'category':'Smartphone','brand':{'@type':'Brand','name':p.get('oem') or ''},'additionalProperty':[{'@type':'PropertyValue','name':c.get('role') or 'Camera','value':c.get('sensor') or ''} for c in cams]}
    if p.get('release_year'): product['releaseDate']=str(p['release_year'])
    write(path,page(path,title,desc,'/phones/',[('Home','/'),('Phones','/phones/'),(model,path)],body,product))

today=date.today().isoformat()
(DIST/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{e(SITE+u)}</loc><lastmod>{today}</lastmod></url>\n' for u in urls)+'</urlset>\n',encoding='utf-8')
(DIST/'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n',encoding='utf-8')
print('Built',DIST,f'({len(sensors)} sensor pages, {len(phones)} phone pages, {len(urls)} sitemap URLs)')
