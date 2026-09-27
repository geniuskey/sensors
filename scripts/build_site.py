from pathlib import Path
from datetime import date
from html import escape
from urllib.parse import quote, urlencode, urlparse
import csv, json, math, re, shutil
from og import render as render_og
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'; SITE='https://sensors.euiyun.com'; OG_IMAGE=SITE+'/og/site.png'; REPO='https://github.com/geniuskey/sensors'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT/'index.html',DIST/'index.html')
shutil.copytree(ROOT/'src',DIST/'src')
(DIST/'sensors').mkdir()
shutil.copy2(ROOT/'sensors/index.html', DIST/'sensors/index.html')
(DIST/'phones').mkdir()
shutil.copy2(ROOT/'phones/index.html', DIST/'phones/index.html')
shutil.copytree(ROOT/'public/data',DIST/'data')
shutil.copytree(ROOT/'public/images',DIST/'images')
shutil.copy2(ROOT/'public/favicon.svg',DIST/'favicon.svg')

def slug(text): return re.sub(r'[^a-z0-9]+','-',str(text).lower().replace('+',' plus ')).strip('-')
def sensor_path(s):
    maker, product_id = s['canonical_id'].split(':', 1)
    return f'/sensors/{slug(maker)}/{slug(product_id)}/'
def phone_path(p):
    maker=(p.get('oem') or '').strip() or 'Unknown'; model=p.get('model') or p['canonical_id'].removeprefix('PHONE:')
    if model.lower().startswith(maker.lower()+' '): model=model[len(maker)+1:]
    return f'/phones/{slug(maker)}/{slug(model)}/'
def e(v): return escape('' if v is None else str(v))
def num(v, d=1): return '' if v in (None,'') else f'{float(v):.{d}f}'.rstrip('0').rstrip('.')
def fmt_size(v): return f'{v}"' if v and not str(v).endswith('"') else (v or '')
def badge(c): return f'<span class="badge badge-{"high" if c=="High" else "medium" if c and c.startswith("Medium") else "low"}">{e(c or "Unrated")}</span>'
def ld(obj): return '<script type="application/ld+json">'+json.dumps(obj,ensure_ascii=False).replace('</','<\\/')+'</script>'

catalog=(ROOT/'sensors/index.html').read_text(encoding='utf-8')
TOPBAR=re.search(r'<header class="topbar">.*?</header>',catalog,re.S).group(0)
NAV_PLAIN=re.sub(r'<a class="is-current" href="([^"]+)" aria-current="page">',r'<a href="\1">',TOPBAR)
def topbar(section): return NAV_PLAIN.replace(f'<a href="{section}">',f'<a class="is-current" href="{section}" aria-current="page">',1)
YEARS='2026' if date.today().year==2026 else f'2026–{date.today().year}'
FOOTER=f'<footer class="page-footer"><span>© {YEARS} <a href="https://github.com/geniuskey" target="_blank" rel="noopener noreferrer">geniuskey</a> · Data licensed <a href="/open-data/">CC BY 4.0</a> · Product names are trademarks of their owners</span><span class="footer-links"><a href="/sources/">Sources</a><a href="/open-data/">Open data &amp; API</a><a href="/data/all-in-one.csv">Download CSV ↓</a><a href="{REPO}" target="_blank" rel="noopener noreferrer">How this catalog is maintained ↗</a></span></footer>'
def issue_link(record, path, name):
    q=urlencode({'template':'data-correction.yml','title':f'[Correction] {name}','record':record,'page':SITE+path})
    return f'<a class="correction-link" href="{REPO}/issues/new?{q}" target="_blank" rel="noopener noreferrer">Report a data error ↗</a>'

def page(path, title, desc, section, crumbs, body, product, og=OG_IMAGE, noindex=False, breadcrumb=True):
    url=SITE+path; robots='\n    <meta name="robots" content="noindex, follow" />' if noindex else ''
    crumb_ld={'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+h} for i,(n,h) in enumerate(crumbs)]}
    nav=' <span aria-hidden="true">/</span> '.join(f'<a href="{e(h)}">{e(n)}</a>' if i<len(crumbs)-1 else f'<span aria-current="page">{e(n)}</span>' for i,(n,h) in enumerate(crumbs))
    return f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(desc)}" />
    <link rel="canonical" href="{e(url)}" />{robots}
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#f7f8fa" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0a0e16" media="(prefers-color-scheme: dark)" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mobile Image Sensor Database" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(desc)}" />
    <meta property="og:url" content="{e(url)}" />
    <meta property="og:image" content="{e(og)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{e(title)}" />
    <meta name="twitter:description" content="{e(desc)}" />
    <meta name="twitter:image" content="{e(og)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
    <link rel="stylesheet" href="/src/style.css" />
    {ld(product)}
    {ld(crumb_ld)}
    <script type="module" src="/src/search.js"></script>
  </head>
  <body class="detail-page-body">
    <a class="skip-link" href="#main-content">Skip to content</a>
    {topbar(section)}
    <main class="detail-page" id="main-content">
      {f'<nav class="breadcrumb" aria-label="Breadcrumb">{nav}</nav>' if breadcrumb else ''}
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
for kind,rows,fn in (('sensor',sensors,sensor_path),('phone',phones,phone_path)):
    seen={}
    for r in rows:
        s=fn(r)
        if not s or s in seen: raise SystemExit(f'Duplicate or empty {kind} slug {s!r}: {seen.get(s)} / {r["canonical_id"]}')
        seen[s]=r['canonical_id']
sensor_by_id={s['canonical_id']:s for s in sensors}; phone_by_id={p['canonical_id']:p for p in phones}
urls=['/','/sensors/','/phones/','/compare/','/open-data/']

def format_diag(v):
    m=re.fullmatch(r'\s*1\s*/\s*([\d.]+)\s*"?\s*',str(v or ''))
    return 16/float(m.group(1)) if m and float(m.group(1))>0 else None
def dims(s):
    diag=format_diag(s.get('sensor_size')); pitch=s.get('pixel_size_um'); mp=s.get('resolution_mp')
    px=re.fullmatch(r'\s*(\d+)\s*[x×]\s*(\d+)\s*',s.get('resolution_px') or '')
    if pitch and (px or mp):
        w,h=(int(px.group(1)),int(px.group(2))) if px else (math.sqrt(mp*1e6*4/3),math.sqrt(mp*1e6*3/4))
        w,h=w*pitch/1000,h*pitch/1000
        if not diag or 0.6<math.hypot(w,h)/diag<1.6: return round(w,2),round(h,2)
    return (round(diag*.8,2),round(diag*.6,2)) if diag else None
def sensor_name(s): return s.get('sensor') or s.get('marketing_name') or s['canonical_name']
def short_name(s): return f'{s.get("manufacturer") or ""} {sensor_name(s)}'.strip()
def og_path(kind, path): return f'/og/{kind}/'+path.strip('/').split('/',1)[1]+'.png'
def write_og(url_path, *args):
    render_og(DIST/url_path.strip('/'), *args); return SITE+url_path
def spec_line(s):
    return ' · '.join(x for x in (num(s.get('resolution_mp')) and num(s.get('resolution_mp'))+' MP', fmt_size(s.get('sensor_size')), num(s.get('pixel_size_um'),2) and num(s.get('pixel_size_um'),2)+' µm') if x)

sensor_dims={s['canonical_id']:dims(s) for s in sensors}
pool=[s for s in sensors if sensor_dims[s['canonical_id']] and (len(s['phones'])>=2 or (s['phones'] and (s.get('resolution_mp') or 0)>=48))]
pairs={}
for a in pool:
    da=math.hypot(*sensor_dims[a['canonical_id']])
    near=sorted((b for b in pool if b is not a and 1/1.3<math.hypot(*sensor_dims[b['canonical_id']])/da<1.3),key=lambda b:(abs(math.log(math.hypot(*sensor_dims[b['canonical_id']])/da))+abs(math.log(((b.get('resolution_mp') or 1)/(a.get('resolution_mp') or 1))))*.5+(b['manufacturer']==a['manufacturer'])*.1-len(b['phones'])*.01))
    for b in near[:3]:
        x,y=sorted((a,b),key=lambda s:sensor_path(s))
        pairs[(x['canonical_id'],y['canonical_id'])]=math.log1p(len(x['phones']))+math.log1p(len(y['phones']))+(math.hypot(*sensor_dims[x['canonical_id']])+math.hypot(*sensor_dims[y['canonical_id']]))/20
per_sensor={}
for k in sorted(pairs,key=lambda k:-pairs[k]):
    if all(per_sensor.get(i,0)<5 for i in k): per_sensor.update({i:per_sensor.get(i,0)+1 for i in k})
    else: pairs.pop(k)
pairs=sorted(pairs,key=lambda k:-pairs[k])[:200]
def pair_slug(s): return sensor_path(s).strip('/').split('/',1)[1].replace('/','-')
def pair_path(a,b): return f'/compare/{pair_slug(a)}-vs-{pair_slug(b)}/'
pairs_by_sensor={}
for a,b in pairs:
    pairs_by_sensor.setdefault(a,[]).append(b); pairs_by_sensor.setdefault(b,[]).append(a)
def size_svg(items, label):
    items=[(s,sensor_dims[s['canonical_id']]) for s in items if sensor_dims[s['canonical_id']]]
    mw=max(max(d[0] for _,d in items),13.2); mh=max(max(d[1] for _,d in items),8.8); pad=1
    rects=''.join(f'<rect class="size-rect size-rect-{i}" x="{(mw-w)/2+pad:.2f}" y="{(mh-h)/2+pad:.2f}" width="{w}" height="{h}"><title>{e(short_name(s))}: {w:.1f} × {h:.1f} mm</title></rect>' for i,(s,(w,h)) in sorted(enumerate(items),key=lambda t:-t[1][1][0]*t[1][1][1]))
    ref=f'<rect class="size-ref" x="{(mw-13.2)/2+pad:.2f}" y="{(mh-8.8)/2+pad:.2f}" width="13.2" height="8.8"/><text class="size-ref-label" x="{(mw-13.2)/2+pad+.3:.2f}" y="{(mh-8.8)/2+pad+.8:.2f}">1" type</text>'
    legend=''.join(f'<li><span class="size-swatch size-rect-{i}" aria-hidden="true"></span><a href="{sensor_path(s)}">{e(short_name(s))}</a> <span>{w:.1f} × {h:.1f} mm · {w*h:.0f} mm²</span></li>' for i,(s,(w,h)) in enumerate(items))
    return f'<figure class="size-figure"><svg class="size-svg" viewBox="0 0 {mw+2*pad:.2f} {mh+2*pad:.2f}" role="img" aria-label="{e(label)}">{ref}{rects}</svg><figcaption><ul class="size-legend">{legend}</ul><p>Drawn to scale from pixel pitch × resolution (or optical format when pitch is unknown). Dashed outline: 1-inch type (13.2 × 8.8 mm).</p></figcaption></figure>'

for s in sensors:
    name=s.get('sensor') or s.get('marketing_name') or s['canonical_name']; maker=s.get('manufacturer') or ''; code=s.get('internal_code') or ''; full=f'{maker} {name}'.strip()+(f' ({code})' if code and code.lower() not in name.lower() else '')
    mp=num(s.get('resolution_mp')); size=fmt_size(s.get('sensor_size')); pitch=num(s.get('pixel_size_um'),2)
    headline=' '.join(x for x in (mp and mp+'MP', size) if x)
    ps=s.get('phones') or []; path=sensor_path(s)
    if ps: urls.append(path)
    title=f'{full} — {headline+" " if headline else ""}mobile image sensor | Sensor Database'
    spec=', '.join(x for x in (mp and mp+' MP', size and size+' optical format', pitch and pitch+' µm pixels', s.get('af') and 'AF: '+s['af'], s.get('hdr') and 'HDR: '+s['hdr']) if x)
    desc=f'{full} image sensor specifications{": "+spec if spec else ""}. '+(f'Used in {len(ps)} phone{"s" if len(ps)!=1 else ""}, including {", ".join(p["model"] for p in ps[:3])}.' if ps else 'Camera roles, phone mappings and sources.')
    specs=[('Resolution',mp and mp+' MP'),('Resolution pixels',s.get('resolution_px')),('Optical format',size),('Pixel pitch',pitch and pitch+' µm'),('Pixel binning',s.get('pixel_binning')),('Autofocus',s.get('af')),('HDR',s.get('hdr')),('CFA',s.get('cfa')),('Full well capacity',s.get('fwc')),('Two layer transistor',s.get('two_layer_transistor')),('Transfer gate',s.get('transfer_gate')),('Internal code',s.get('internal_code')),('Camera roles',s.get('roles')),('First phone year',s.get('first_year')),('Latest phone year',s.get('latest_year')),('Phone mappings',len(ps))]
    cards=''.join(f'<article class="camera-mapping-card"><div class="camera-mapping-head"><span class="role-tag">{e(p.get("role") or "Unspecified")}</span>{badge(p.get("confidence"))}</div><h3>'+(f'<a href="{phone_path(phone_by_id[p["canonical_id"]])}">{e(p["model"])}</a>' if p.get('canonical_id') in phone_by_id else e(p['model']))+f'</h3><p>{e(" · ".join(str(x) for x in (p.get("oem"),p.get("year")) if x))}</p></article>' for p in ps)
    srcs=s.get('sources') or ([{'url':s['source_url'],'type':'source','relationship':'spec'}] if s.get('source_url') else [])
    body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">{e(maker)} IMAGE SENSOR</div><h1>{e(full)}</h1><p>{e(s["canonical_id"])} · {badge(s.get("confidence"))}</p></div></div>
        <div class="detail-grid">{items(specs)}</div>
        <div class="detail-extra"><h2>Aliases</h2><p>{e(" · ".join(s.get("aliases") or []) or "—")}</p>{f"<h2>Notes</h2><p>{e(s['notes'])}</p>" if s.get("notes") else ""}</div>
      </section>
      <section class="detail-panel"><div class="section-kicker">PHONES USING THIS SENSOR</div><h2 class="detail-section-title">{len(ps)} mapped phone{"s" if len(ps)!=1 else ""}</h2>{f'<div class="camera-mapping-list">{cards}</div>' if ps else '<p class="phone-none">No phone mappings are available for this sensor yet.</p>'}</section>
      <section class="detail-panel"><div class="section-kicker">SOURCES</div><ul class="source-list">{"".join(f'<li><a href="{e(x["url"])}" target="_blank" rel="noopener noreferrer">{e(x["url"])} ↗</a> <span class="badge badge-source">{e(x.get("type") or "source")}</span> <span class="badge badge-source">{e(x.get("relationship") or "spec")}</span></li>' for x in srcs) or "<li>No sources listed.</li>"}</ul><p class="detail-cta"><a class="button button-secondary" href="/sensors/?sensor={e(quote(s["canonical_id"]))}">Open in sensor catalog →</a>{issue_link(s["canonical_id"],path,full)}</p></section>'''
    d=sensor_dims[s['canonical_id']]; rivals=[sensor_by_id[x] for x in pairs_by_sensor.get(s['canonical_id'],[])]
    if d:
        rival_links=''.join(f'<li><a href="{pair_path(*sorted((s,r),key=sensor_path))}">{e(short_name(s))} vs {e(short_name(r))}</a> <span>{e(spec_line(r))}</span></li>' for r in rivals)
        body=body.replace('<section class="detail-panel"><div class="section-kicker">PHONES USING',f'''<section class="detail-panel"><div class="section-kicker">SENSOR SIZE</div><h2 class="detail-section-title">{d[0]:.1f} × {d[1]:.1f} mm · {d[0]*d[1]:.0f} mm²</h2>{size_svg([s],f"{full} sensor size compared with a 1-inch type sensor")}{f'<h3 class="compare-links-title">Compare with similar sensors</h3><ul class="compare-links">{rival_links}</ul>' if rivals else ''}<p class="detail-cta"><a class="button button-secondary" href="/compare/?ids={e(quote(",".join([s["canonical_id"]]+[r["canonical_id"] for r in rivals[:2]])))}">Compare sizes interactively →</a></p></section>
      <section class="detail-panel"><div class="section-kicker">PHONES USING''',1)
    og=write_og(og_path('sensor',path),f'{maker} image sensor',f'{maker} {name}'.strip(),[(spec_line(s) or 'Mobile image sensor',True)]+[(f'Used in {len(ps)} phone{"s" if len(ps)!=1 else ""}',False)]+[(p['model'],False) for p in ps[:3]],[(name,*d)] if d else [])
    props=[{'@type':'PropertyValue','name':k,'value':str(v)} for k,v in specs if v not in (None,'')]
    product={'@context':'https://schema.org','@type':'Product','name':full,'description':desc,'url':SITE+path,'image':og,'sku':s['canonical_id'],'category':'Mobile image sensor','brand':{'@type':'Brand','name':maker},'manufacturer':{'@type':'Organization','name':maker},'additionalProperty':props}
    if s.get('aliases'): product['alternateName']=s['aliases']
    write(path,page(path,title,desc,'/sensors/',[('Home','/'),('Sensors','/sensors/'),(full,path)],body,product,og,noindex=not ps))

for p in phones:
    model=p['model']; cams=p.get('cameras') or []; path=phone_path(p); urls.append(path)
    main=next((c for c in cams if 'Main' in (c.get('role') or '')),cams[0] if cams else None)
    title=f'{model} camera sensors{" — "+main["sensor"]+" main" if main else ""} | Sensor Database'
    desc=f'{model}{" ("+str(p["release_year"])+")" if p.get("release_year") else ""} image sensors by camera: '+('; '.join(f'{c.get("role") or "Camera"}: {c.get("sensor_manufacturer") or ""} {c.get("sensor")}'.replace('  ',' ') for c in cams) if cams else 'no sensor mappings yet')+'.'
    facts=[('Brand',p.get('oem')),('Release year',p.get('release_year')),('System on chip',p.get('soc')),('Camera mappings',len(cams)),('DXOMARK camera score',p.get('camera_score')),('DXOMARK photo score',p.get('photo_score')),('DXOMARK video score',p.get('video_score')),('DXOMARK selfie score',p.get('selfie_score')),('DXOMARK display score',p.get('display_score')),('DXOMARK battery score',p.get('battery_score')),('DXOMARK protocol',p.get('camera_protocol'))]
    dxomark_source_html=f'<p class="phone-score-source">DXOMARK score source: <a href="{e(p["dxomark_source_url"])}" target="_blank" rel="noopener noreferrer">DXOMARK smartphone test ↗</a></p>' if p.get('dxomark_source_url') else ''
    def cam(c):
        sen=sensor_by_id.get(c.get('sensor_id')); nm=e(c.get('sensor') or c.get('sensor_id'))
        info=' · '.join(x for x in (c.get('sensor_manufacturer'), num(c.get('resolution_mp')) and num(c.get('resolution_mp'))+' MP', fmt_size(c.get('sensor_size')), num(c.get('pixel_size_um'),2) and num(c.get('pixel_size_um'),2)+' µm pixels') if x)
        return f'<article class="camera-mapping-card"><div class="camera-mapping-head"><span class="role-tag">{e(c.get("role") or "Unspecified")}</span>{badge(c.get("confidence"))}</div><h3>'+(f'<a href="{sensor_path(sen)}">{nm}</a>' if sen else nm)+f'</h3><p>{e(info or "Sensor specifications are not listed.")}</p>'+(f'<a class="mapping-source" href="{e(c["source_url"])}" target="_blank" rel="noopener noreferrer">Mapping source ↗</a>' if c.get('source_url') else '')+'</article>'
    body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">{e(p.get("oem") or "PHONE")} SMARTPHONE</div><h1>{e(model)}</h1><p>{e(p["canonical_id"])}</p></div></div>
        <div class="detail-grid phone-detail-grid">{items(facts)}</div>
        {dxomark_source_html}
      </section>
      <section class="detail-panel"><div class="section-kicker">IMAGE SENSORS BY CAMERA</div><h2 class="detail-section-title">{len(cams)} camera{"s" if len(cams)!=1 else ""}</h2>{f'<div class="camera-mapping-list">{"".join(cam(c) for c in cams)}</div>' if cams else '<p class="phone-none">No image sensor mappings are available for this phone yet.</p>'}<p class="detail-cta"><a class="button button-secondary" href="/phones/?phone={e(quote(p["canonical_id"]))}">Open in phone catalog →</a>{issue_link(p["canonical_id"],path,model)}</p></section>'''
    cam_sensors=list({c['sensor_id']:sensor_by_id[c['sensor_id']] for c in cams if c.get('sensor_id') in sensor_by_id and sensor_dims[c['sensor_id']]}.values())
    if cam_sensors: body=body.replace('<p class="detail-cta"><a class="button button-secondary" href="/phones/',f'{size_svg(cam_sensors,f"{model} camera sensor sizes drawn to scale")}<p class="detail-cta"><a class="button button-secondary" href="/phones/',1)
    og=write_og(og_path('phone',path),f'{p.get("oem") or "Phone"} camera sensors',model,[(f'{c.get("role") or "Camera"}: {c.get("sensor_manufacturer") or ""} {c.get("sensor") or ""}'.replace('  ',' '),i==0) for i,c in enumerate(sorted(cams,key=lambda c:'Main' not in (c.get('role') or '')))][:4]+[(' · '.join(str(x) for x in (f'{len(cams)} mapped camera{"s" if len(cams)!=1 else ""}',p.get('release_year'),p.get('soc'),p.get('camera_score') and f'DXOMARK camera {p["camera_score"]}') if x),False)],[(sensor_name(x),*sensor_dims[x['canonical_id']]) for x in cam_sensors[:4]])
    product={'@context':'https://schema.org','@type':'Product','name':model,'description':desc,'url':SITE+path,'image':og,'sku':p['canonical_id'],'category':'Smartphone','brand':{'@type':'Brand','name':p.get('oem') or ''},'additionalProperty':[{'@type':'PropertyValue','name':c.get('role') or 'Camera','value':c.get('sensor') or ''} for c in cams]}
    if p.get('release_year'): product['releaseDate']=str(p['release_year'])
    write(path,page(path,title,desc,'/phones/',[('Home','/'),('Phones','/phones/'),(model,path)],body,product,og))

SOURCE_INFO={
    'helpix.ru':('Helpix','https://helpix.ru/','Smartphone camera sensor index used for sensor specs and phone-to-sensor mappings.'),
    'spinformation.info':('SP Information','https://spinformation.info/','Image sensor specification sheets and camera module listings.'),
    'www.dxomark.com':('DXOMARK','https://www.dxomark.com/smartphones/','Smartphone camera, display and battery test scores.'),
    'www.gsmarena.com':('GSMArena','https://www.gsmarena.com/','Phone specification pages used to confirm camera sensors.'),
    'www.smartsenstech.com':('SmartSens','https://www.smartsenstech.com/','Official SmartSens product pages.'),
    'www.sony-semicon.com':('Sony Semiconductor Solutions','https://www.sony-semicon.com/','Official Sony image sensor product pages.'),
    'semiconductor.samsung.com':('Samsung Semiconductor','https://semiconductor.samsung.com/image-sensor/','Official Samsung ISOCELL product pages.'),
    'news.skhynix.com':('SK hynix Newsroom','https://news.skhynix.com/','SK hynix image sensor announcements.'),
    'www.techinsights.com':('TechInsights','https://www.techinsights.com/','Teardown reports identifying camera sensors.'),
}
source_stats={}
def tally(url, kind):
    host=urlparse(url).netloc.lower()
    if host: source_stats.setdefault(host,{'spec':0,'map':0,'score':0})[kind]+=1
for s in sensors:
    for x in s.get('sources') or []: tally(x['url'],'spec')
for p in phones:
    if p.get('dxomark_source_url'): tally(p['dxomark_source_url'],'score')
    for c in p.get('cameras') or []:
        if c.get('source_url'): tally(c['source_url'],'map')
def cnt(v): return f'{v:,}' if v else '—'
source_rows=''
for host,st in sorted(source_stats.items(),key=lambda kv:-sum(kv[1].values())):
    name,home,note=SOURCE_INFO.get(host,(host.removeprefix('www.'),f'https://{host}/',''))
    source_rows+=f'<tr id="{slug(name)}"><td><a href="{e(home)}" target="_blank" rel="noopener noreferrer">{e(name)} ↗</a>'+(f'<p class="source-note">{e(note)}</p>' if note else '')+f'</td><td class="num">{cnt(st["spec"])}</td><td class="num">{cnt(st["map"])}</td><td class="num">{cnt(st["score"])}</td></tr>'
sources_path='/sources/'; urls.append(sources_path)
sources_desc=f'Sources behind the Mobile Image Sensor Database: {len(source_stats)} websites cited for image sensor specifications, phone camera mappings and DXOMARK scores.'
sources_body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">REFERENCES</div><h1>Data sources</h1><p>Every sensor spec, camera mapping and score in this catalog links back to the page it came from. Counts show how many records cite each source.</p></div></div>
        <div class="tablewrap"><table class="source-table"><thead><tr><th>Source</th><th class="num">Sensor specs</th><th class="num">Camera mappings</th><th class="num">DXOMARK scores</th></tr></thead><tbody>{source_rows}</tbody></table></div>
        <p class="source-footnote">Product names and trademarks belong to their owners. Per-record source links are listed on each <a href="/sensors/">sensor</a> and <a href="/phones/">phone</a> page. Found an error? <a href="https://github.com/geniuskey/sensors/issues" target="_blank" rel="noopener noreferrer">Open an issue ↗</a></p>
      </section>'''
sources_ld={'@context':'https://schema.org','@type':'WebPage','name':'Data sources','description':sources_desc,'url':SITE+sources_path,'citation':[v[1] for v in SOURCE_INFO.values()]}
write(sources_path,page(sources_path,'Data sources | Mobile Image Sensor Database',sources_desc,sources_path,[('Home','/'),('Sources',sources_path)],sources_body,sources_ld))

def ratio(x,y): return f'{x/y:.1f}×' if x/y>=1.05 else None
def pair_rows(a,b):
    da,db=sensor_dims[a['canonical_id']],sensor_dims[b['canonical_id']]
    rows=[('Sensor maker',a.get('manufacturer'),b.get('manufacturer'),None),('Resolution',a.get('resolution_mp'),b.get('resolution_mp'),'MP'),('Optical format',fmt_size(a.get('sensor_size')),fmt_size(b.get('sensor_size')),None),('Sensor area',round(da[0]*da[1]),round(db[0]*db[1]),'mm²'),('Dimensions',f'{da[0]:.1f} × {da[1]:.1f} mm',f'{db[0]:.1f} × {db[1]:.1f} mm',None),('Pixel pitch',a.get('pixel_size_um'),b.get('pixel_size_um'),'µm'),('Pixel binning',a.get('pixel_binning'),b.get('pixel_binning'),None),('Autofocus',a.get('af'),b.get('af'),None),('HDR',a.get('hdr'),b.get('hdr'),None),('Mapped phones',len(a['phones']),len(b['phones']),None),('First phone year',a.get('first_year'),b.get('first_year'),None)]
    def cell(v,other,unit):
        win=unit and isinstance(v,(int,float)) and isinstance(other,(int,float)) and v>other
        txt='—' if v in (None,'') else (f'{num(v,2)} {unit}' if unit else str(v))
        cls=' class="is-better"' if win else ''
        return f'<td{cls}>{e(txt)}</td>'
    return ''.join(f'<tr><th scope="row">{e(k)}</th>{cell(x,y,u)}{cell(y,x,u)}</tr>' for k,x,y,u in rows if x not in (None,'') or y not in (None,''))
def verdict(a,b):
    da,db=sensor_dims[a['canonical_id']],sensor_dims[b['canonical_id']]; na,nb=short_name(a),short_name(b); out=[]
    big,small=(a,b) if da[0]*da[1]>=db[0]*db[1] else (b,a); r=ratio(max(da[0]*da[1],db[0]*db[1]),min(da[0]*da[1],db[0]*db[1]))
    out.append(f'{short_name(big)} has {r} the light-gathering area of {short_name(small)}.' if r else f'{na} and {nb} are practically the same size.')
    pa,pb=a.get('pixel_size_um'),b.get('pixel_size_um')
    if pa and pb and ratio(max(pa,pb),min(pa,pb)): out.append(f'{na if pa>pb else nb} uses larger {num(max(pa,pb),2)} µm pixels versus {num(min(pa,pb),2)} µm.')
    ma,mb=a.get('resolution_mp'),b.get('resolution_mp')
    if ma and mb and ratio(max(ma,mb),min(ma,mb)): out.append(f'{na if ma>mb else nb} resolves {num(max(ma,mb))} MP against {num(min(ma,mb))} MP.')
    return ' '.join(out)
def phone_list(s):
    links=''.join(f'<li><a href="{phone_path(phone_by_id[p["canonical_id"]])}">{e(p["model"])}</a> <span>{e(p.get("role") or "")}</span></li>' if p.get('canonical_id') in phone_by_id else f'<li>{e(p["model"])}</li>' for p in s['phones'][:12])
    return f'<div><h3><a href="{sensor_path(s)}">{e(short_name(s))}</a></h3><ul class="compare-phones">{links or "<li>No mapped phones yet.</li>"}</ul></div>'
for ida,idb in pairs:
    a,b=sensor_by_id[ida],sensor_by_id[idb]; path=pair_path(a,b); urls.append(path); na,nb=short_name(a),short_name(b)
    title=f'{na} vs {nb} — sensor size, resolution and pixel comparison'; v=verdict(a,b)
    desc=f'{na} vs {nb}: {v} Specs side by side, drawn-to-scale sensor sizes and the phones that use each.'
    body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">SENSOR COMPARISON</div><h1>{e(na)} vs {e(nb)}</h1><p class="compare-verdict">{e(v)}</p></div></div>
        {size_svg([a,b],f"{na} and {nb} sensor sizes drawn to scale")}
        <div class="tablewrap"><table class="compare-table"><thead><tr><th scope="col">Spec</th><th scope="col"><a href="{sensor_path(a)}">{e(na)}</a></th><th scope="col"><a href="{sensor_path(b)}">{e(nb)}</a></th></tr></thead><tbody>{pair_rows(a,b)}</tbody></table></div>
        <p class="detail-cta"><a class="button button-secondary" href="/compare/?ids={e(quote(ida+","+idb))}">Add more sensors to this comparison →</a></p>
      </section>
      <section class="detail-panel"><div class="section-kicker">PHONES</div><h2 class="detail-section-title">Where each sensor is used</h2><div class="compare-phone-grid">{phone_list(a)}{phone_list(b)}</div></section>'''
    og=write_og(f'/og/compare/{path.strip("/").split("/")[1]}.png','Sensor comparison',[sensor_name(a),f'vs {sensor_name(b)}'],[(v.split('. ')[0].rstrip('.').replace(na,sensor_name(a)).replace(nb,sensor_name(b)).replace(' light-gathering','')+'.',True),(f'{sensor_name(a)}: {spec_line(a)}',False),(f'{sensor_name(b)}: {spec_line(b)}',False)],[(sensor_name(a),*sensor_dims[ida]),(sensor_name(b),*sensor_dims[idb])])
    page_ld={'@context':'https://schema.org','@type':'WebPage','name':title,'description':desc,'url':SITE+path,'image':og,'about':[{'@type':'Product','name':x,'url':SITE+sensor_path(s)} for x,s in ((na,a),(nb,b))]}
    write(path,page(path,title,desc,'/compare/',[('Home','/'),('Compare','/compare/'),(f'{na} vs {nb}',path)],body,page_ld,og))
compare_desc=f'Build a list of up to six mobile image sensors and compare their physical sizes drawn to scale.'
compare_body=f'''<section class="detail-panel compare-page-panel" aria-label="Compare mobile image sensors">
        <h1 class="compare-page-title">Compare sensor sizes</h1>
        <div id="size-compare" class="size-compare"><noscript><p>Open the Sensors catalog and choose sensors to build your comparison list.</p></noscript></div>
      </section>
      <script type="module" src="/src/compare.js"></script>'''
compare_og=write_og('/og/compare.png','Size comparison','Compare sensor sizes',[('Add up to six sensors from the catalog',True),('Build your own comparison list',False),('View sizes at true relative scale',False)],[(sensor_name(sensor_by_id[i]),*sensor_dims[i]) for i in ('SONY:IMX989','SONY:IMX766','SONY:IMX882') if i in sensor_by_id and sensor_dims[i]])
write('/compare/',page('/compare/','Compare mobile image sensor sizes | Sensor Database',compare_desc,'/compare/',[('Home','/'),('Compare','/compare/')],compare_body,{'@context':'https://schema.org','@type':'WebPage','name':'Compare sensor sizes','description':compare_desc,'url':SITE+'/compare/'},compare_og,breadcrumb=False))

def fsize(name): return f'{(DIST/"data"/name).stat().st_size/1024:,.0f} KB'
dataset_ld={'@context':'https://schema.org','@type':'Dataset','name':'Mobile Image Sensor Database','alternateName':'sensors.euiyun.com','description':f'Source-traceable catalog of {len(sensors)} mobile image sensors (Sony, Samsung, OmniVision and more) with specifications and {sum(len(p.get("cameras") or []) for p in phones)} phone camera mappings across {len(phones)} smartphones.','url':SITE+'/','sameAs':REPO,'license':'https://creativecommons.org/licenses/by/4.0/','isAccessibleForFree':True,'creator':{'@type':'Person','name':'geniuskey','url':'https://github.com/geniuskey'},'dateModified':date.today().isoformat(),'keywords':['image sensor','CMOS','smartphone camera','Sony IMX','Samsung ISOCELL','OmniVision','pixel pitch','optical format'],'variableMeasured':['resolution_mp','sensor_size','pixel_size_um','pixel_binning','camera_role','release_year'],'distribution':[{'@type':'DataDownload','encodingFormat':t,'contentUrl':SITE+'/data/'+n} for n,t in (('all-in-one.csv','text/csv'),('sensors.json','application/json'),('phones.json','application/json'))]}
api_rows=[('GET /api/sensors','q, manufacturer, limit (≤500), offset','/api/sensors?q=IMX989'),('GET /api/sensors/{canonical_id}','—','/api/sensors/SONY:IMX989'),('GET /api/phones','q, manufacturer, limit (≤500), offset','/api/phones?q=Galaxy%20S25'),('GET /api/stats','—','/api/stats')]
open_desc='Download the Mobile Image Sensor Database as CSV or JSON, or query it through a free read-only JSON API. Licensed CC BY 4.0.'
open_body=f'''<section class="detail-panel">
        <div class="detail-head"><div><div class="section-kicker">OPEN DATA</div><h1>Open data &amp; API</h1><p>Everything on this site is available as plain files and through a read-only JSON API. No key, no sign-up.</p></div></div>
        <h2 class="detail-section-title">Downloads</h2>
        <div class="tablewrap"><table class="source-table"><thead><tr><th>File</th><th>Contents</th><th class="num">Size</th></tr></thead><tbody>
          <tr><td><a href="/data/all-in-one.csv">all-in-one.csv</a></td><td>One row per phone camera mapping with sensor specs</td><td class="num">{fsize("all-in-one.csv")}</td></tr>
          <tr><td><a href="/data/sensors.json">sensors.json</a></td><td>{len(sensors)} sensors with aliases, sources and phones</td><td class="num">{fsize("sensors.json")}</td></tr>
          <tr><td><a href="/data/phones.json">phones.json</a></td><td>{len(phones)} phones with per-camera sensors and DXOMARK scores</td><td class="num">{fsize("phones.json")}</td></tr>
          <tr><td><a href="/data/sensor-dims.json">sensor-dims.json</a></td><td>Sensor dimensions, specifications and phone counts</td><td class="num">{{DIMS_SIZE}}</td></tr>
        </tbody></table></div>
        <h2 class="detail-section-title">JSON API</h2>
        <p>Base URL <code>{SITE}</code>. Responses are JSON, cached for 5 minutes, and allow cross-origin requests.</p>
        <div class="tablewrap"><table class="source-table"><thead><tr><th>Endpoint</th><th>Parameters</th><th>Example</th></tr></thead><tbody>{"".join(f'<tr><td><code>{e(a)}</code></td><td>{e(b)}</td><td><a href="{e(c)}"><code>{e(c)}</code></a></td></tr>' for a,b,c in api_rows)}</tbody></table></div>
        <pre class="code-block"><code>curl "{SITE}/api/sensors?q=IMX989"</code></pre>
        <h2 class="detail-section-title">License &amp; citation</h2>
        <p>The data is released under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 (CC BY 4.0) ↗</a>. Use it freely, including commercially, with attribution. DXOMARK scores and product names remain the property of their owners; every record links back to its <a href="/sources/">source</a>.</p>
        <pre class="code-block"><code>Mobile Image Sensor Database ({date.today().year}). https://sensors.euiyun.com/ — CC BY 4.0</code></pre>
        <p>Spotted a wrong spec or mapping? Every sensor and phone page has a <em>Report a data error</em> link, or <a href="{REPO}/issues/new?template=data-correction.yml" target="_blank" rel="noopener noreferrer">open a correction ↗</a>.</p>
      </section>'''

search_index=[{'type':'sensor','name':sensor_name(s),'maker':s.get('manufacturer') or '','detail':' · '.join(x for x in (spec_line(s),f'{len(s["phones"])} phones' if s['phones'] else '') if x),'url':sensor_path(s),'keywords':' '.join(x for x in [s.get('internal_code') or '',*(s.get('aliases') or [])] if x)} for s in sensors]
search_index+=[{'type':'phone','name':p['model'],'maker':p.get('oem') or '','detail':' · '.join(str(x) for x in (p.get('release_year'),next((c.get('sensor') for c in p.get('cameras') or [] if 'Main' in (c.get('role') or '')),None)) if x),'url':phone_path(p),'keywords':' '.join(c.get('sensor') or '' for c in p.get('cameras') or [])} for p in phones]
(DIST/'data/search-index.json').write_text(json.dumps(search_index,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(DIST/'data/sensor-dims.json').write_text(json.dumps([{'id':s['canonical_id'],'name':sensor_name(s),'maker':s.get('manufacturer') or '','url':sensor_path(s),'mp':s.get('resolution_mp'),'resolution_px':s.get('resolution_px'),'marketing_name':s.get('marketing_name'),'internal_code':s.get('internal_code'),'size':s.get('sensor_size') or '','pitch':s.get('pixel_size_um'),'pixel_binning':s.get('pixel_binning'),'w':sensor_dims[s['canonical_id']][0],'h':sensor_dims[s['canonical_id']][1],'area':sensor_dims[s['canonical_id']][0]*sensor_dims[s['canonical_id']][1],'phones':len(s['phones']),'roles':s.get('roles'),'first_year':s.get('first_year'),'latest_year':s.get('latest_year'),'af':s.get('af'),'hdr':s.get('hdr'),'cfa':s.get('cfa'),'fwc':s.get('fwc'),'two_layer_transistor':s.get('two_layer_transistor'),'transfer_gate':s.get('transfer_gate'),'first_listed_year':s.get('first_listed_year'),'confidence':s.get('confidence'),'aliases':s.get('aliases'),'example_phones':s.get('example_phones'),'notes':s.get('notes')} for s in sensors if sensor_dims[s['canonical_id']]],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
open_og=write_og('/og/open-data.png','Open data','CSV, JSON & free API',[('CC BY 4.0 · no key required',True),(f'{len(sensors)} sensors · {len(phones)} phones',False)],[])
write('/open-data/',page('/open-data/','Open data & API | Mobile Image Sensor Database',open_desc,'/open-data/',[('Home','/'),('Open data','/open-data/')],open_body.replace('{DIMS_SIZE}',fsize('sensor-dims.json')),dataset_ld,open_og))

site_og=write_og('/og/site.png','Open image sensor database','Mobile Image Sensor Database',[(f'{len(sensors)} sensors · {len(phones)} phones',True),('Specs, adoption trends and size comparisons',False),('Every record linked to its source',False)],[(sensor_name(sensor_by_id[i]),*sensor_dims[i]) for i in ('SONY:IMX989','OMNIVISION:OV50H','SONY:IMX882') if i in sensor_by_id and sensor_dims[i]])
site_ld={'@context':'https://schema.org','@type':'WebSite','name':'Mobile Image Sensor Database','url':SITE+'/','inLanguage':'en','copyrightYear':2026,'copyrightHolder':{'@type':'Person','name':'geniuskey','url':'https://github.com/geniuskey'},'potentialAction':{'@type':'SearchAction','target':{'@type':'EntryPoint','urlTemplate':SITE+'/sensors/?q={search_term_string}'},'query-input':'required name=search_term_string'}}
for f,extra in (('index.html',ld(site_ld)+ld(dataset_ld)),('sensors/index.html',''),('phones/index.html','')):
    h=re.sub(r'<footer class="page-footer">.*?</footer>',lambda _:FOOTER,(DIST/f).read_text(encoding='utf-8'),count=1,flags=re.S).replace(SITE+'/images/image-sensor.png',site_og).replace('<meta name="twitter:card" content="summary" />','<meta name="twitter:card" content="summary_large_image" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />')
    (DIST/f).write_text(h.replace('</head>',f'    {extra}\n  </head>',1) if extra else h,encoding='utf-8')

nf_body='''<section class="detail-panel not-found">
        <div class="section-kicker">404</div><h1>Page not found</h1>
        <p>The sensor or phone you were looking for may have been renamed or merged. Try searching the catalog.</p>
        <p class="detail-cta"><a class="button button-primary" href="/sensors/">Browse sensors</a><a class="button button-secondary" href="/phones/">Browse phones</a><a href="/">Back to overview</a></p>
      </section>'''
nf=page('/404/','Page not found | Mobile Image Sensor Database','This page does not exist in the Mobile Image Sensor Database.','',[('Home','/')],nf_body,{'@context':'https://schema.org','@type':'WebPage','name':'Page not found'},noindex=True,breadcrumb=False)
(DIST/'404.html').write_text(re.sub(r'\n    <(link rel="canonical"|meta property="og:url")[^\n]*','',nf),encoding='utf-8')

redirects=[f'/compare/{pair_slug(sensor_by_id[b])}-vs-{pair_slug(sensor_by_id[a])}/ {pair_path(sensor_by_id[a],sensor_by_id[b])} 301' for a,b in pairs]
for s in sensors:
    redirects.append(f'/sensors/{slug(s["canonical_id"])}/ {sensor_path(s)} 301')
for p in phones:
    redirects.append(f'{phone_path(p).replace("/phones/", "/phone/", 1)} {phone_path(p)} 301')
    old_names=[p['model']]
    if p.get('oem') and not p['model'].lower().startswith(p['oem'].lower()+' '): old_names.append(f"{p['oem']} {p['model']}")
    redirects+=[f'/phone/{slug(n)}/ {phone_path(p)} 301' for n in old_names]
for path in sorted((ROOT/'data/review').glob('sensor-decisions-*.csv')):
    with path.open(encoding='utf-8-sig',newline='') as f:
        for d in csv.DictReader(f):
            target=sensor_by_id.get(d['Target_Canonical_ID'].strip())
            if d['Action'].strip()=='merge' and target:
                old={'canonical_id':d['Canonical_ID'].strip()}
                redirects+=[f'{sensor_path(old)} {sensor_path(target)} 301',f'/sensors/{slug(old["canonical_id"])}/ {sensor_path(target)} 301']
redirects+=['/catalog/ /sensors/ 301','/catalog /sensors/ 301']
(DIST/'_redirects').write_text('\n'.join(redirects)+'\n',encoding='utf-8')

today=date.today().isoformat()
(DIST/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{e(SITE+u)}</loc><lastmod>{today}</lastmod></url>\n' for u in urls)+'</urlset>\n',encoding='utf-8')
(DIST/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/images/*\n  Cache-Control: public, max-age=604800\n/og/*\n  Cache-Control: public, max-age=86400\n/data/*\n  Cache-Control: public, max-age=3600\n  Access-Control-Allow-Origin: *\n',encoding='utf-8')
(DIST/'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n',encoding='utf-8')
print('Built',DIST,f'({len(sensors)} sensor pages, {len(phones)} phone pages, {len(urls)} sitemap URLs, {len(redirects)} redirects)')
