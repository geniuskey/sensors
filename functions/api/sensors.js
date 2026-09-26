import { json } from '../_types.js';
export async function onRequestGet({request,env}){
 const u=new URL(request.url), q=(u.searchParams.get('q')||'').trim(), manufacturer=(u.searchParams.get('manufacturer')||'').trim(), limit=Math.min(Number(u.searchParams.get('limit')||100),500), offset=Math.max(Number(u.searchParams.get('offset')||0),0);
 const where=[]; const binds=[];
 if(manufacturer){where.push('m.name = ?');binds.push(manufacturer)}
 if(q){where.push(`(s.canonical_name LIKE ? OR s.internal_code LIKE ? OR s.canonical_id LIKE ? OR EXISTS(SELECT 1 FROM sensor_aliases a WHERE a.sensor_id=s.id AND a.alias LIKE ?))`); for(let i=0;i<4;i++)binds.push(`%${q}%`)}
 const w=where.length?`WHERE ${where.join(' AND ')}`:'';
 const query=`SELECT s.*,m.name manufacturer,s.canonical_name sensor,COUNT(DISTINCT pc.phone_id) phone_count,GROUP_CONCAT(DISTINCT pc.camera_role) roles,MIN(p.release_year) first_year,MAX(p.release_year) latest_year,(SELECT src.url FROM sensor_sources ss JOIN sources src ON src.id=ss.source_id WHERE ss.sensor_id=s.id ORDER BY CASE src.source_type WHEN 'official' THEN 0 ELSE 1 END,src.id LIMIT 1) source_url FROM sensors s JOIN manufacturers m ON m.id=s.manufacturer_id LEFT JOIN phone_cameras pc ON pc.sensor_id=s.id LEFT JOIN phones p ON p.id=pc.phone_id ${w} GROUP BY s.id ORDER BY m.name,s.canonical_name LIMIT ? OFFSET ?`;
 const result=await env.DB.prepare(query).bind(...binds,limit,offset).all();
 const [sensors,manufacturers,phones,mappings]=await Promise.all(['sensors','manufacturers','phones','phone_cameras'].map(t=>env.DB.prepare(`SELECT COUNT(*) n FROM ${t}`).first()));
 return json({items:result.results,total:sensors?.n||0,stats:{sensors:sensors?.n||0,manufacturers:manufacturers?.n||0,phones:phones?.n||0,mappings:mappings?.n||0}})
}
