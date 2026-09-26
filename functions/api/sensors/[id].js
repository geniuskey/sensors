import { json } from '../../_types.js';
export async function onRequestGet({env,params}){
 const id=decodeURIComponent(params.id||'');
 const sensor=await env.DB.prepare(`SELECT s.*,m.name manufacturer FROM sensors s JOIN manufacturers m ON m.id=s.manufacturer_id WHERE s.canonical_id=?`).bind(id).first();
 if(!sensor)return json({error:'Not found'},404);
 const phones=await env.DB.prepare(`SELECT p.canonical_id,p.oem,p.model,p.release_year,p.soc,pc.camera_role,d.camera_score,d.camera_protocol FROM phone_cameras pc JOIN phones p ON p.id=pc.phone_id LEFT JOIN dxomark_results d ON d.phone_id=p.id WHERE pc.sensor_id=(SELECT id FROM sensors WHERE canonical_id=?) ORDER BY p.release_year DESC,p.model`).bind(id).all();
 const aliases=await env.DB.prepare(`SELECT alias,alias_type FROM sensor_aliases WHERE sensor_id=(SELECT id FROM sensors WHERE canonical_id=?) ORDER BY alias`).bind(id).all();
 const sources=await env.DB.prepare(`SELECT src.url,src.source_type,ss.relationship FROM sensor_sources ss JOIN sources src ON src.id=ss.source_id WHERE ss.sensor_id=(SELECT id FROM sensors WHERE canonical_id=?)`).bind(id).all();
 return json({sensor,aliases:aliases.results,phones:phones.results,sources:sources.results});
}
