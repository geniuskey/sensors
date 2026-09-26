from __future__ import annotations
import csv, json, os, re, shutil, sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CSV=ROOT/'data/raw/bootstrap_2026-09.csv'
DB=ROOT/'database/local.sqlite3'
SCHEMA=ROOT/'database/migrations/0001_initial.sql'
SEED=ROOT/'database/seed.sql'
PUBLIC=ROOT/'public/data'
EXPORTS=ROOT/'exports'
VERIFIED_MAPPINGS=EXPORTS/'verified-mapping-additions-2026-09-26.csv'
ROLE_UPDATES=EXPORTS/'verified-role-updates-2026-09-26.csv'
UNKNOWN_ROLES=('','unknown','unspecified')
PUBLIC.mkdir(parents=True,exist_ok=True); EXPORTS.mkdir(parents=True,exist_ok=True)

def clean(v): return (v or '').strip()
def num(v):
    try:return float(v) if clean(v) else None
    except:return None
def integer(v):
    try:return int(float(v)) if clean(v) else None
    except:return None
def split_aliases(s): return [x.strip() for x in re.split(r'[|;,]',clean(s)) if x.strip()]
def source_type(v):
    s=clean(v).lower()
    if 'official' in s: return 'official'
    if 'dxomark' in s:return 'benchmark'
    return s or 'secondary'

def identity_key(v): return re.sub(r'[^a-z0-9]+','',((v or '').lower().replace('+',' plus ')))
def phone_id(r): return clean(r['Phone_Canonical_ID']) or re.sub(r'[^a-z0-9]+','-',clean(r['Phone']).lower().replace('+',' plus ')).strip('-')

def merge_verified_mappings(rows,fieldnames):
    if not VERIFIED_MAPPINGS.exists(): return rows
    # Keep the two Realme variants as separate phone entities. They previously
    # shared an ID, which would attach the new exact-model mapping to both.
    for row in rows:
        if identity_key(row.get('OEM'))=='realme' and identity_key(row.get('Phone'))=='realme12proplus' and clean(row.get('Phone_Canonical_ID'))=='PHONE:REALME12PRO':
            row['Phone_Canonical_ID']='PHONE:REALME12PROPLUS'

    sensors={}
    templates={}
    for row in rows:
        key=(identity_key(row['Manufacturer']),identity_key(row['Sensor']))
        sensors.setdefault(key,set()).add(clean(row['Canonical_ID']))
        if clean(row['Canonical_ID']) not in templates or not clean(row['Phone']):
            templates[clean(row['Canonical_ID'])]=row

    phone_ids_by_model={}
    phone_models_by_id={}
    existing_links={}
    for row in rows:
        if not clean(row['Phone']): continue
        model_key=(identity_key(row['OEM']),identity_key(row['Phone']))
        pcid=phone_id(row)
        phone_ids_by_model.setdefault(model_key,set()).add(pcid)
        phone_models_by_id.setdefault(pcid,set()).add(model_key)
        link_key=(clean(row['Canonical_ID']),pcid)
        existing_links.setdefault(link_key,[]).append(row)

    with VERIFIED_MAPPINGS.open(encoding='utf-8-sig',newline='') as f:
        additions=list(csv.DictReader(f))
    seen=set()
    for addition in additions:
        sensor_key=(identity_key(addition['Manufacturer']),identity_key(addition['Sensor']))
        matches=sensors.get(sensor_key,set())
        if len(matches)!=1:
            raise ValueError(f"Verified mapping sensor must match exactly once: {addition['Manufacturer']} {addition['Sensor']}")
        canonical_id=next(iter(matches))
        model=clean(addition['Phone']); oem=clean(addition['OEM'])
        model_key=(identity_key(oem),identity_key(model))
        known_ids=phone_ids_by_model.get(model_key,set())
        if len(known_ids)>1:
            raise ValueError(f"Phone model maps to multiple canonical IDs: {model} -> {sorted(known_ids)}")
        if known_ids:
            pcid=next(iter(known_ids))
        else:
            pcid='PHONE:'+identity_key(model).upper()
            conflicts=phone_models_by_id.get(pcid,set())
            if conflicts and conflicts!={model_key}:
                raise ValueError(f"Verified mapping generated a conflicting phone ID: {model} -> {pcid}")
            phone_ids_by_model.setdefault(model_key,set()).add(pcid)
            phone_models_by_id.setdefault(pcid,set()).add(model_key)

        pair=(canonical_id,pcid)
        if pair in seen: raise ValueError(f"Duplicate verified sensor/phone pair: {canonical_id} / {model}")
        seen.add(pair)
        source_url=clean(addition['Mapping_Source_URL'])
        if not source_url.startswith('https://helpix.ru/isensor/'):
            raise ValueError(f"Unexpected verified mapping source URL: {source_url}")
        role=clean(addition['Camera_Role']) or 'Unknown'
        existing=existing_links.get(pair,[])
        if existing:
            match=next((row for row in existing if clean(row['Camera_Role']).lower()==role.lower()),None)
            if match is None:
                match=next((row for row in existing if clean(row['Camera_Role']).lower() in ('','unknown','unspecified')),None)
            if match is not None:
                match['Camera_Role']=role
                match['Release_Year']=match['Release_Year'] or clean(addition['Release_Year'])
                match['Mapping_Source_URL']=source_url
                match['Mapping_Source_Type']=clean(addition['Mapping_Source_Type'])
                match['Mapping_Confidence']=clean(addition['Mapping_Confidence'])
                match['Phone_Canonical_ID']=pcid
                continue

        row={column:'' for column in fieldnames}
        row.update(templates[canonical_id])
        row.update({
            'Canonical_ID':canonical_id,
            'Phone':model,
            'OEM':oem,
            'Camera_Role':role,
            'Release_Year':clean(addition['Release_Year']),
            'Mapping_Source_URL':source_url,
            'Mapping_Source_Type':clean(addition['Mapping_Source_Type']),
            'Mapping_Confidence':clean(addition['Mapping_Confidence']),
            'Phone_Canonical_ID':pcid,
        })
        rows.append(row)
        existing_links.setdefault(pair,[]).append(row)
    print(f'Integrated {len(additions)} verified phone-sensor mappings from {VERIFIED_MAPPINGS.name}')
    return rows

def apply_role_updates(rows):
    if not ROLE_UPDATES.exists(): return rows
    with ROLE_UPDATES.open(encoding='utf-8-sig',newline='') as f:
        updates=list(csv.DictReader(f))
    socs={}; seen=set()
    for u in updates:
        pcid=clean(u['Phone_Canonical_ID']); cid=clean(u['Sensor_Canonical_ID']); model=identity_key(u['Phone'])
        if (pcid,model,cid) in seen: raise ValueError(f"Duplicate role update: {u['Phone']} / {cid}")
        seen.add((pcid,model,cid))
        url=clean(u['Source_URL'])
        if not url.startswith('https://') or clean(u['Confidence']) not in ('High','Medium') or not clean(u['Camera_Role']):
            raise ValueError(f"Invalid role update: {u['Phone']} / {cid}")
        matches=[r for r in rows if clean(r['Phone']) and clean(r['Canonical_ID'])==cid and phone_id(r)==pcid and identity_key(r['Phone'])==model]
        if not matches: raise ValueError(f"Role update targets a missing mapping: {u['Phone']} ({pcid}) / {cid}")
        for r in matches:
            r.update(Camera_Role=clean(u['Camera_Role']),Mapping_Source_URL=url,Mapping_Source_Type=clean(u['Source_Type']),Mapping_Confidence=clean(u['Confidence']))
        soc=clean(u.get('SoC'))
        if soc:
            if socs.get(pcid,(soc,))[0]!=soc: raise ValueError(f"Conflicting SoC updates for {pcid}: {socs[pcid][0]} / {soc}")
            socs[pcid]=(soc,url)
    for r in rows:
        if clean(r['Phone']) and phone_id(r) in socs and not clean(r['SoC']):
            r['SoC'],r['SoC_Source_URL']=socs[phone_id(r)]
    print(f'Applied {len(updates)} verified camera-role updates from {ROLE_UPDATES.name} ({len(socs)} phones with SoC)')
    return rows

def derive_roles(rows):
    # A pair left as Unknown inherits the role only when another sourced row for the same phone/sensor pair has exactly one role.
    known={}
    for r in rows:
        if clean(r['Phone']) and clean(r['Camera_Role']).lower() not in UNKNOWN_ROLES:
            known.setdefault((clean(r['Canonical_ID']),phone_id(r)),set()).add(clean(r['Camera_Role']))
    derived=0
    for r in rows:
        roles=known.get((clean(r['Canonical_ID']),phone_id(r)),set())
        if clean(r['Phone']) and clean(r['Camera_Role']).lower() in UNKNOWN_ROLES and len(roles)==1:
            r['Camera_Role']=next(iter(roles)); r['Mapping_Source_Type']=clean(r['Mapping_Source_Type'])+' (role derived from same phone/sensor mapping)'; derived+=1
    print(f'Derived {derived} camera roles from existing phone/sensor mappings')
    return rows

def add_source(cur,url,stype,title=''):
    if not url:return None
    cur.execute('INSERT OR IGNORE INTO sources(url,source_type,title) VALUES(?,?,?)',(url,source_type(stype),title))
    return cur.execute('SELECT id FROM sources WHERE url=?',(url,)).fetchone()[0]

if DB.exists(): DB.unlink()
con=sqlite3.connect(DB); con.execute('PRAGMA foreign_keys=ON'); con.executescript(SCHEMA.read_text())
with CSV.open(encoding='utf-8-sig',newline='') as f:
    reader=csv.DictReader(f); fieldnames=reader.fieldnames; rows=list(reader)
rows=derive_roles(apply_role_updates(merge_verified_mappings(rows,fieldnames)))
cur=con.cursor(); sensor_ids={}; phone_ids={}
for r in rows:
    maker=clean(r['Manufacturer']); cur.execute('INSERT OR IGNORE INTO manufacturers(name) VALUES(?)',(maker,)); mid=cur.execute('SELECT id FROM manufacturers WHERE name=?',(maker,)).fetchone()[0]
    cid=clean(r['Canonical_ID']) or f"{maker.upper()}:{clean(r['Sensor'])}"
    if cid not in sensor_ids:
        vals=(mid,cid,clean(r['Sensor']),clean(r['Marketing_Name']),clean(r['Internal_Code']),num(r['Resolution_MP']),clean(r['Resolution_Px']),clean(r['Sensor_Size']),num(r['Pixel_Size_um']),clean(r['Pixel_Binning']),clean(r['FWC']),clean(r['AF']),clean(r['HDR']),clean(r['CFA']),clean(r['Two_Layer_Transistor']),clean(r['Transfer_Gate']),clean(r['Notes']),integer(r['First_Listed_Year']),clean(r['Sensor_Confidence']),clean(r['Example_Phones']))
        cur.execute('''INSERT INTO sensors(manufacturer_id,canonical_id,canonical_name,marketing_name,internal_code,resolution_mp,resolution_px,sensor_size,pixel_size_um,pixel_binning,fwc,af,hdr,cfa,two_layer_transistor,transfer_gate,notes,first_listed_year,confidence,example_phones) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',vals)
        sid=cur.lastrowid;sensor_ids[cid]=sid
        aliases=set(split_aliases(r['Aliases'])+[clean(r['Internal_Code']),clean(r['Marketing_Name']),clean(r['Sensor'])]); aliases.discard('')
        for a in aliases:cur.execute('INSERT OR IGNORE INTO sensor_aliases(sensor_id,alias,alias_type) VALUES(?,?,?)',(sid,a,'alias'))
        for col,typ,rel in [('Source_URL',r['Source_Type'],'spec'),('Additional_Source_URL','secondary','spec')]:
            src=add_source(cur,clean(r[col]),typ)
            if src:cur.execute('INSERT OR IGNORE INTO sensor_sources(sensor_id,source_id,relationship) VALUES(?,?,?)',(sid,src,rel))
    sid=sensor_ids[cid]
    phone=clean(r['Phone'])
    if phone:
        pcid=phone_id(r)
        if pcid not in phone_ids:
            cur.execute('INSERT OR IGNORE INTO phones(canonical_id,oem,model,release_year,soc) VALUES(?,?,?,?,?)',(pcid,clean(r['OEM']),phone,integer(r['Release_Year']),clean(r['SoC'])))
            pid=cur.execute('SELECT id FROM phones WHERE canonical_id=?',(pcid,)).fetchone()[0];phone_ids[pcid]=pid
            if clean(r['DXOMARK_Device']) or clean(r['DXOMARK_Camera_Score']):
                cur.execute('''INSERT OR REPLACE INTO dxomark_results(phone_id,device_name,match_status,camera_score,photo_score,video_score,main_score,ultrawide_score,tele_score,selfie_score,display_score,battery_score,launch_price_usd,launch_date,camera_protocol,checked_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(pid,clean(r['DXOMARK_Device']),clean(r['DXOMARK_Match_Status']),num(r['DXOMARK_Camera_Score']),num(r['DXOMARK_Photo_Score']),num(r['DXOMARK_Video_Score']),num(r['DXOMARK_Main_Score']),num(r['DXOMARK_UltraWide_Score']),num(r['DXOMARK_Tele_Score']),num(r['DXOMARK_Selfie_Score']),num(r['DXOMARK_Display_Score']),num(r['DXOMARK_Battery_Score']),num(r['DXOMARK_Launch_Price_USD']),clean(r['DXOMARK_Launch_Date']),clean(r['DXOMARK_Camera_Protocol']),clean(r['DXOMARK_Checked_Date'])))
        pid=phone_ids[pcid];role=clean(r['Camera_Role']) or 'Unknown'
        cur.execute('INSERT OR IGNORE INTO phone_cameras(phone_id,sensor_id,camera_role,mapping_confidence) VALUES(?,?,?,?)',(pid,sid,role,clean(r['Mapping_Confidence'])))
        camid=cur.execute('SELECT id FROM phone_cameras WHERE phone_id=? AND sensor_id=? AND camera_role=?',(pid,sid,role)).fetchone()[0]
        src=add_source(cur,clean(r['Mapping_Source_URL']),clean(r['Mapping_Source_Type']),'phone mapping')
        if src:cur.execute('INSERT OR IGNORE INTO camera_sources(camera_id,source_id) VALUES(?,?)',(camid,src))
        add_source(cur,clean(r['SoC_Source_URL']),'official','phone SoC')
        add_source(cur,clean(r['DXOMARK_Source_URL']),clean(r['DXOMARK_Source_Type']),'DXOMARK')
con.commit()

# Static fallback JSON used before D1 is configured.
q='''SELECT s.*,m.name manufacturer,COUNT(DISTINCT pc.phone_id) phone_count,GROUP_CONCAT(DISTINCT pc.camera_role) roles,MIN(p.release_year) first_year,MAX(p.release_year) latest_year,(SELECT src.url FROM sensor_sources ss JOIN sources src ON src.id=ss.source_id WHERE ss.sensor_id=s.id ORDER BY CASE src.source_type WHEN 'official' THEN 0 ELSE 1 END,src.id LIMIT 1) source_url FROM sensors s JOIN manufacturers m ON m.id=s.manufacturer_id LEFT JOIN phone_cameras pc ON pc.sensor_id=s.id LEFT JOIN phones p ON p.id=pc.phone_id GROUP BY s.id ORDER BY m.name,s.canonical_name'''
cols=[d[0] for d in con.execute(q).description]; items=[dict(zip(cols,row)) for row in con.execute(q)]
for item in items:
    sid=item['id']
    item['aliases']=[r[0] for r in con.execute('SELECT alias FROM sensor_aliases WHERE sensor_id=? ORDER BY alias',(sid,))]
    item['sources']=[dict(url=r[0],type=r[1],relationship=r[2]) for r in con.execute('SELECT src.url,src.source_type,ss.relationship FROM sensor_sources ss JOIN sources src ON src.id=ss.source_id WHERE ss.sensor_id=? ORDER BY src.source_type,src.url',(sid,))]
    item['phones']=[dict(canonical_id=r[0],model=r[1],oem=r[2],year=r[3],role=r[4],confidence=r[5]) for r in con.execute('SELECT p.canonical_id,p.model,p.oem,p.release_year,pc.camera_role,pc.mapping_confidence FROM phone_cameras pc JOIN phones p ON p.id=pc.phone_id WHERE pc.sensor_id=? ORDER BY p.release_year DESC,p.model',(sid,))]
(PUBLIC/'sensors.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
phone_query='''SELECT p.*,d.camera_score,d.photo_score,d.video_score,d.camera_protocol FROM phones p LEFT JOIN dxomark_results d ON d.phone_id=p.id ORDER BY p.release_year DESC,p.model'''
phone_cols=[d[0] for d in con.execute(phone_query).description]
phone_items=[dict(zip(phone_cols,row)) for row in con.execute(phone_query)]
for phone in phone_items:
    phone['cameras']=[dict(
        role=r[0],confidence=r[1],sensor_id=r[2],sensor=r[3],sensor_manufacturer=r[4],
        resolution_mp=r[5],sensor_size=r[6],pixel_size_um=r[7],
        source_url=r[8]
    ) for r in con.execute('''SELECT pc.camera_role,pc.mapping_confidence,s.canonical_id,s.canonical_name,m.name,
        s.resolution_mp,s.sensor_size,s.pixel_size_um,
        (SELECT src.url FROM camera_sources cs JOIN sources src ON src.id=cs.source_id WHERE cs.camera_id=pc.id ORDER BY CASE src.source_type WHEN 'official' THEN 0 ELSE 1 END,src.id LIMIT 1)
        FROM phone_cameras pc JOIN sensors s ON s.id=pc.sensor_id JOIN manufacturers m ON m.id=s.manufacturer_id
        WHERE pc.phone_id=? ORDER BY pc.camera_role,s.canonical_name''',(phone['id'],))]
    phone['camera_count']=len(phone['cameras'])
(PUBLIC/'phones.json').write_text(json.dumps(phone_items,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
dashboard={
 'manufacturers':[dict(name=r[0],count=r[1]) for r in con.execute('SELECT m.name,COUNT(*) FROM sensors s JOIN manufacturers m ON m.id=s.manufacturer_id GROUP BY m.name ORDER BY COUNT(*) DESC,m.name')],
 'dxomark':[]
}
dashboard['dxomark']=[dict(device=r[0],score=r[1],protocol=r[2],pitch=r[3],sensors=r[4]) for r in con.execute('''SELECT p.model,d.camera_score,d.camera_protocol,AVG(s.pixel_size_um),GROUP_CONCAT(DISTINCT s.canonical_name) FROM dxomark_results d JOIN phones p ON p.id=d.phone_id JOIN phone_cameras pc ON pc.phone_id=p.id JOIN sensors s ON s.id=pc.sensor_id WHERE d.camera_score IS NOT NULL AND s.pixel_size_um IS NOT NULL GROUP BY p.id''')]
(PUBLIC/'dashboard.json').write_text(json.dumps(dashboard,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
stats={
 'sensors': con.execute('SELECT COUNT(*) FROM sensors').fetchone()[0],
 'manufacturers': con.execute('SELECT COUNT(*) FROM manufacturers').fetchone()[0],
 'phones': con.execute('SELECT COUNT(*) FROM phones').fetchone()[0],
 'mappings': con.execute('SELECT COUNT(*) FROM phone_cameras').fetchone()[0],
 'dxomark_results': con.execute('SELECT COUNT(*) FROM dxomark_results').fetchone()[0],
}
(PUBLIC/'stats.json').write_text(json.dumps(stats,separators=(',',':')),encoding='utf-8')
for path in (PUBLIC/'all-in-one.csv',EXPORTS/'all-in-one.csv'):
    with path.open('w',encoding='utf-8-sig',newline='') as out:
        writer=csv.DictWriter(out,fieldnames=fieldnames,lineterminator='\r\n')
        writer.writeheader();writer.writerows(rows)

# Generate deterministic seed SQL from normalized SQLite.
def sql(v):
    if v is None:return 'NULL'
    if isinstance(v,(int,float)):return str(v)
    return "'"+str(v).replace("'","''")+"'"
with SEED.open('w',encoding='utf-8') as out:
    out.write('PRAGMA defer_foreign_keys=on;\n')
    tables=['manufacturers','sensors','sensor_aliases','phones','phone_cameras','dxomark_results','sources','sensor_sources','camera_sources']
    for t in reversed(tables):out.write(f'DELETE FROM {t};\n')
    for t in tables:
        info=con.execute(f'PRAGMA table_info({t})').fetchall(); columns=[r[1] for r in info]
        for row in con.execute(f'SELECT * FROM {t}'):
            out.write(f"INSERT INTO {t}({','.join(columns)}) VALUES({','.join(sql(v) for v in row)});\n")
    out.write('PRAGMA defer_foreign_keys=off;\n')
print(f'Imported {len(sensor_ids)} sensors, {len(phone_ids)} phones, {con.execute("select count(*) from phone_cameras").fetchone()[0]} mappings')
con.close()
