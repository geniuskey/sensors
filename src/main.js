import './style.css';

const app=document.querySelector('#app');
app.innerHTML=`<main class="shell">
<section class="hero"><div><div class="eyebrow">sensors.euiyun.com</div><h1>Mobile Image Sensor Database</h1><p>Open, source-traceable catalog of mobile CIS products and their smartphone adoption. Samsung names are canonicalized to ISOCELL, while S5K codes are retained as aliases/internal codes.</p></div><div class="links"><a class="button" href="/data/all-in-one.csv">Download CSV</a><a class="button" href="https://github.com/geniuskey/sensors" target="_blank">GitHub</a></div></section>
<section class="stats"><div class="card"><div id="sensors" class="metric">—</div><div class="label">Sensors</div></div><div class="card"><div id="phones" class="metric">—</div><div class="label">Mapped phones</div></div><div class="card"><div id="makers" class="metric">—</div><div class="label">Sensor makers</div></div><div class="card"><div id="mappings" class="metric">—</div><div class="label">Sensor ↔ phone mappings</div></div></section>
<section class="card"><div class="toolbar"><input id="q" placeholder="Search IMX989, ISOCELL GN3, S5KGN3…"><select id="manufacturer"><option value="">All manufacturers</option></select><select id="role"><option value="">All camera roles</option><option>Main</option><option>Ultra-wide</option><option>Telephoto</option><option>Front</option></select></div><div class="status" id="status">Loading…</div><div class="tablewrap"><table><thead><tr><th>Manufacturer</th><th>Sensor</th><th>Internal / alias</th><th>MP</th><th>Optical format</th><th>Pixel</th><th>Roles</th><th>Phones</th><th>Years</th></tr></thead><tbody id="rows"></tbody></table></div></section>
<section id="detail" class="card detail"></section><div class="footer">Data is aggregated from manufacturer pages and third-party catalogs. Each record should retain source URLs and confidence metadata. See repository docs for provenance rules.</div></main>`;

const qs=(s)=>document.querySelector(s);
let staticRows=[];
async function getData(){
  try{const r=await fetch('/api/sensors?limit=500');if(r.ok)return await r.json();}catch{}
  const r=await fetch('/data/sensors.json');const items=await r.json();let stats={};try{stats=await (await fetch('/data/stats.json')).json()}catch{}return {items,total:items.length,stats};
}
function normRole(s=''){return s.toLowerCase().replaceAll('rear ','').replace('ultrawide','ultra-wide')}
function render(){
 const q=qs('#q').value.trim().toLowerCase(); const mf=qs('#manufacturer').value; const role=qs('#role').value;
 const rows=staticRows.filter(x=>(!mf||x.manufacturer===mf)&&(!role||normRole(x.roles||'').includes(normRole(role)))&&(!q||[x.sensor,x.marketing_name,x.internal_code,x.canonical_id,x.example_phones].join(' ').toLowerCase().includes(q))).slice(0,500);
 qs('#status').textContent=`Showing ${rows.length.toLocaleString()} of ${staticRows.length.toLocaleString()} sensors`;
 qs('#rows').innerHTML=rows.map(x=>`<tr data-id="${esc(x.canonical_id)}"><td>${esc(x.manufacturer)}</td><td class="sensor">${esc(x.sensor)}</td><td class="muted">${esc(x.internal_code||'')}</td><td>${x.resolution_mp??''}</td><td>${esc(x.sensor_size||'')}</td><td>${x.pixel_size_um?`${x.pixel_size_um} µm`:''}</td><td>${esc(x.roles||'')}</td><td>${x.phone_count??0}</td><td>${[x.first_year,x.latest_year].filter(Boolean).join('–')}</td></tr>`).join('');
 document.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>showDetail(tr.dataset.id));
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function showDetail(id){const x=staticRows.find(r=>r.canonical_id===id); if(!x)return; const d=qs('#detail');d.classList.add('open');d.innerHTML=`<h2>${esc(x.sensor)}</h2><div class="detail-grid"><div><div class="kv"><b>Manufacturer</b>${esc(x.manufacturer)}</div><div class="kv"><b>Canonical ID</b>${esc(x.canonical_id)}</div><div class="kv"><b>Internal code</b>${esc(x.internal_code||'—')}</div></div><div><div class="kv"><b>Resolution</b>${x.resolution_mp??'—'} MP</div><div class="kv"><b>Optical format</b>${esc(x.sensor_size||'—')}</div><div class="kv"><b>Pixel pitch</b>${x.pixel_size_um?`${x.pixel_size_um} µm`:'—'}</div></div><div><div class="kv"><b>Camera roles</b>${esc(x.roles||'—')}</div><div class="kv"><b>Mapped phones</b>${x.phone_count??0}</div><div class="kv"><b>Examples</b>${esc(x.example_phones||'—')}</div></div></div><div class="sources">${x.source_url?`<a href="${esc(x.source_url)}" target="_blank">Source ↗</a>`:''}</div>`;d.scrollIntoView({behavior:'smooth',block:'nearest'})}
(async()=>{const data=await getData();staticRows=data.items; const m=[...new Set(staticRows.map(x=>x.manufacturer))].sort();qs('#manufacturer').innerHTML+=m.map(x=>`<option>${esc(x)}</option>`).join(''); ['q','manufacturer','role'].forEach(id=>qs(id).addEventListener('input',render)); render();
 const stats=data.stats||{}; qs('#sensors').textContent=(stats.sensors??staticRows.length).toLocaleString(); qs('#makers').textContent=(stats.manufacturers??m.length).toLocaleString(); qs('#phones').textContent=(stats.phones??0).toLocaleString(); qs('#mappings').textContent=(stats.mappings??0).toLocaleString();})();
