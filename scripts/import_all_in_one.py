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

def add_source(cur,url,stype,title=''):
    if not url:return None
    cur.execute('INSERT OR IGNORE INTO sources(url,source_type,title) VALUES(?,?,?)',(url,source_type(stype),title))
    return cur.execute('SELECT id FROM sources WHERE url=?',(url,)).fetchone()[0]

if DB.exists(): DB.unlink()
con=sqlite3.connect(DB); con.execute('PRAGMA foreign_keys=ON'); con.executescript(SCHEMA.read_text())
with CSV.open(encoding='utf-8-sig',newline='') as f: rows=list(csv.DictReader(f))
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
        pcid=clean(r['Phone_Canonical_ID']) or re.sub(r'[^a-z0-9]+','-',phone.lower()).strip('-')
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
    item['phones']=[dict(model=r[0],oem=r[1],year=r[2],role=r[3],confidence=r[4]) for r in con.execute('SELECT p.model,p.oem,p.release_year,pc.camera_role,pc.mapping_confidence FROM phone_cameras pc JOIN phones p ON p.id=pc.phone_id WHERE pc.sensor_id=? ORDER BY p.release_year DESC,p.model',(sid,))]
(PUBLIC/'sensors.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
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
shutil.copy2(CSV,PUBLIC/'all-in-one.csv');shutil.copy2(CSV,EXPORTS/'all-in-one.csv')

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
