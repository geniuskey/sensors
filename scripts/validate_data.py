from pathlib import Path
import math, re, sqlite3, sys
ROOT=Path(__file__).resolve().parents[1]; db=ROOT/'database/local.sqlite3'; con=sqlite3.connect(db)
checks={
'duplicate canonical sensors':"SELECT COUNT(*) FROM (SELECT canonical_id FROM sensors GROUP BY canonical_id HAVING COUNT(*)>1)",
'orphan camera sensor':"SELECT COUNT(*) FROM phone_cameras pc LEFT JOIN sensors s ON s.id=pc.sensor_id WHERE s.id IS NULL",
'orphan camera phone':"SELECT COUNT(*) FROM phone_cameras pc LEFT JOIN phones p ON p.id=pc.phone_id WHERE p.id IS NULL",
'samsung S5K canonical names':"SELECT COUNT(*) FROM sensors s JOIN manufacturers m ON m.id=s.manufacturer_id WHERE m.name='Samsung' AND s.canonical_name LIKE 'S5K%'",
}
failed=False
for name,q in checks.items():
 n=con.execute(q).fetchone()[0];print(f'{name}: {n}');failed|=n>0
def optical_inch(v):
 m=re.match(r'^1/(\d+(?:\.\d+)?)$',(v or '').replace('"','').strip())
 return 1/float(m.group(1)) if m else None
for cid,mp,px,size in con.execute('SELECT canonical_id,resolution_mp,pixel_size_um,sensor_size FROM sensors'):
 inch=optical_inch(size)
 if not (mp and px and inch): continue
 ratio=math.sqrt(mp*1e6*4/3)*1.25*px/1000/(16*inch)
 if not 0.8<=ratio<=1.25: print(f'warning: {cid} resolution/pixel/format disagree ({mp} MP, {px} um, {size}; ratio {ratio:.2f})')
for table in ['manufacturers','sensors','phones','phone_cameras','dxomark_results','sources']:
 print(table,con.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0])
con.close()
if failed:sys.exit(1)
