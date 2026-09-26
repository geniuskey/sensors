const app = document.querySelector('#app');
app.innerHTML = `
  <a class="skip-link" href="#catalog">Skip to sensor results</a>
  <div class="app-shell" id="app-shell">
    <aside class="filters" id="filters" aria-label="Sensor filters">
      <div class="filter-head">
        <div><span class="filter-kicker">REFINE CATALOG</span><h2>Filters</h2></div>
        <button class="icon-button drawer-close" id="drawer-close" type="button" aria-label="Close filters">×</button>
      </div>
      <label class="field-label" for="q">Search</label>
      <input id="q" class="text-field" type="search" name="search" autocomplete="off" spellcheck="false" placeholder="IMX989, GN3, S5KGN3…">

      <fieldset class="filter-group"><legend>Manufacturer <span class="facet-hint">select any</span></legend><div class="facet-list" id="manufacturer-facets"></div></fieldset>
      <fieldset class="filter-group"><legend>Camera role <span class="facet-hint">select any</span></legend><div class="facet-list" id="role-facets"></div></fieldset>
      <fieldset class="filter-group"><legend>Resolution <span class="unit-label">MP</span></legend>
        <div class="range-fields"><label>Min<input id="min-mp" name="min-resolution" type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" aria-label="Minimum resolution in megapixels"></label><label>Max<input id="max-mp" name="max-resolution" type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" aria-label="Maximum resolution in megapixels"></label></div>
      </fieldset>
      <div class="filter-group"><label class="field-label" for="sensor-size">Optical format</label><select id="sensor-size" name="sensor-size" class="select-field"><option value="">Any sensor size</option></select></div>
      <fieldset class="filter-group"><legend>Phone adoption</legend>
        <label class="radio-option"><input type="radio" name="mapped" value="any" checked><span>Any sensor</span></label>
        <label class="radio-option"><input type="radio" name="mapped" value="mapped"><span>Used in a mapped phone</span></label>
        <label class="radio-option"><input type="radio" name="mapped" value="unmapped"><span>No phone mapping yet</span></label>
      </fieldset>
      <div class="filter-footer"><button class="button button-quiet" id="clear-filters" type="button">Clear all filters</button><span id="filter-count" class="filter-count">0 active</span></div>
    </aside>
    <button class="drawer-backdrop" id="drawer-backdrop" type="button" aria-label="Close filters" hidden></button>

    <main class="workspace" id="main-content">
      <header class="page-header">
        <div class="brand-lockup"><div class="brand-mark" aria-hidden="true">CIS</div><div><div class="eyebrow">SENSORS.EUIYUN.COM <span class="live-dot"></span> LIVE CATALOG</div><h1>Mobile Image Sensor Database</h1><p>Explore camera sensors, compare specifications, and see where they are used.</p></div></div>
        <nav class="header-actions" aria-label="Catalog actions">
          <button class="button button-filter" id="filter-toggle" type="button" aria-controls="filters" aria-expanded="true"><span aria-hidden="true">☷</span> Filters</button>
          <a class="button button-secondary" href="/data/all-in-one.csv">Download CSV</a>
          <a class="button button-primary" href="https://github.com/geniuskey/sensors" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </nav>
      </header>

      <section class="stats" aria-label="Catalog summary">
        <div class="stat-card"><span class="stat-icon stat-blue" aria-hidden="true">◈</span><div><div id="sensors" class="metric">—</div><div class="label">Image sensors</div></div></div>
        <div class="stat-card"><span class="stat-icon stat-violet" aria-hidden="true">▣</span><div><div id="phones" class="metric">—</div><div class="label">Mapped phones</div></div></div>
        <div class="stat-card"><span class="stat-icon stat-teal" aria-hidden="true">◉</span><div><div id="makers" class="metric">—</div><div class="label">Manufacturers</div></div></div>
        <div class="stat-card"><span class="stat-icon stat-amber" aria-hidden="true">↔</span><div><div id="mappings" class="metric">—</div><div class="label">Camera mappings</div></div></div>
      </section>

      <section class="dashboard-panel" id="dashboard" aria-labelledby="dashboard-title">
        <div class="section-kicker">DATA OVERVIEW</div><h2 id="dashboard-title">Sensor landscape</h2>
        <p class="dashboard-intro">Explore how sensor pixel pitch relates to resolution and compare mapped devices with published DxOMark camera scores.</p>
        <div class="chart-grid"><article class="chart-card"><h3>Pixel pitch vs resolution</h3><p>Each point is a sensor; resolution uses a logarithmic scale.</p><div id="pitch-chart" class="chart-area"></div></article>
        <article class="chart-card"><h3>DxOMark camera score vs mapped sensor pitch</h3><p>Device level scores are shown against the mean pixel pitch of mapped sensors. Protocols are labeled separately.</p><div id="dxo-chart" class="chart-area"></div></article>
        <article class="chart-card chart-wide"><h3>Sensors by manufacturer</h3><div id="maker-chart" class="chart-area"></div></article></div>
      </section>

      <section class="catalog-panel" id="catalog" aria-labelledby="catalog-title">
        <div class="catalog-heading">
          <div><div class="section-kicker">SENSOR CATALOG</div><h2 id="catalog-title">Browse & compare</h2><p class="status" id="status" role="status" aria-live="polite">Loading sensors…</p></div>
          <label class="sort-select-wrap" for="sort-select">Sort by<select id="sort-select" name="sort"><option value="resolution_mp:desc">Resolution: high to low</option><option value="sensor_size:asc">Optical format: A to Z</option><option value="phone_count:desc">Phone adoption: most</option><option value="manufacturer:asc">Manufacturer: A to Z</option><option value="sensor:asc">Sensor name: A to Z</option><option value="latest_year:desc">Latest phone: newest</option></select></label>
        </div>
        <div id="active-filters" class="active-filters" aria-label="Active filters"></div>
        <div class="tablewrap" id="tablewrap">
          <table id="sensor-table">
            <thead><tr>
              <th class="check-col" scope="col"><span class="sr-only">Compare</span></th>
              <th scope="col" data-sort="manufacturer" aria-sort="none"><button class="sort-button" data-sort="manufacturer" type="button">Maker <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="sensor" aria-sort="none"><button class="sort-button" data-sort="sensor" type="button">Sensor <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="internal_code" aria-sort="none"><button class="sort-button" data-sort="internal_code" type="button">Part / alias <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="resolution_mp" aria-sort="descending"><button class="sort-button" data-sort="resolution_mp" type="button">Resolution <span aria-hidden="true">↓</span></button></th>
              <th scope="col" data-sort="sensor_size" aria-sort="none"><button class="sort-button" data-sort="sensor_size" type="button">Format <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="pixel_size_um" aria-sort="none"><button class="sort-button" data-sort="pixel_size_um" type="button">Pixel <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="roles" aria-sort="none"><button class="sort-button" data-sort="roles" type="button">Camera roles <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="phone_count" aria-sort="none"><button class="sort-button" data-sort="phone_count" type="button">Phones <span aria-hidden="true">↕</span></button></th>
              <th scope="col" data-sort="latest_year" aria-sort="none"><button class="sort-button" data-sort="latest_year" type="button">Latest use <span aria-hidden="true">↕</span></button></th>
              <th scope="col" class="open-col"><span class="sr-only">Details</span></th>
            </tr></thead>
            <tbody id="rows"></tbody>
          </table>
          <div id="empty-state" class="empty-state" hidden><div class="empty-mark" aria-hidden="true">⌕</div><h3>No sensors match these filters</h3><p>Try removing a filter or broadening your search.</p><button class="button button-secondary" id="empty-clear" type="button">Clear filters</button></div>
        </div>
      </section>
      <section id="detail" class="detail-panel" aria-live="polite"></section>
      <footer class="page-footer"><span>Source-traceable mobile image sensor data</span><a href="https://github.com/geniuskey/sensors" target="_blank" rel="noopener noreferrer">How this catalog is maintained ↗</a></footer>
    </main>
  </div>

  <div id="compare-bar" class="compare-bar" hidden><div class="compare-bar-copy"><span class="compare-bar-icon" aria-hidden="true">⇄</span><div><strong id="compare-count">0 sensors selected</strong><span id="compare-notice" role="status" aria-live="polite">Select up to 4 sensors to compare.</span></div></div><div class="compare-bar-actions"><button class="button button-quiet" id="clear-comparison" type="button">Clear</button><button class="button button-primary" id="open-comparison" type="button" disabled>Compare sensors <span aria-hidden="true">→</span></button></div></div>
  <dialog id="compare-dialog" class="compare-dialog" aria-labelledby="compare-title"><div class="dialog-head"><div><div class="section-kicker">SIDE-BY-SIDE</div><h2 id="compare-title">Sensor comparison</h2><p id="compare-subtitle"></p></div><button class="icon-button" id="close-comparison" type="button" aria-label="Close comparison">×</button></div><div class="compare-table-wrap" id="comparison-content"></div></dialog>
`;

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const appShell = qs('#app-shell');
let staticRows = [];
let statsData = {};
let sortState = { key: 'resolution_mp', direction: 'desc' };
const compareIds = new Set();
let currentChips = [];
const roleOptions = ['Main', 'Ultra-wide', 'Telephoto', 'Front', 'Macro', 'Depth', 'Unspecified'];

async function getData() {
  try {
    const response = await fetch('/api/sensors?limit=500');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items)) {
        const local = await fetch('/data/sensors.json');
        if (local.ok) {
          const rich = await local.json(), byId = new Map(rich.map(row => [row.canonical_id, row]));
          data.items = data.items.map(row => ({ ...(byId.get(row.canonical_id) || {}), ...row, aliases: byId.get(row.canonical_id)?.aliases || [], sources: byId.get(row.canonical_id)?.sources || [], phones: byId.get(row.canonical_id)?.phones || [] }));
        }
        return data;
      }
    }
  } catch (_) {}
  const response = await fetch('/data/sensors.json');
  if (!response.ok) throw new Error('Sensor data could not be loaded.');
  const items = await response.json();
  let stats = {};
  try {
    const statsResponse = await fetch('/data/stats.json');
    if (statsResponse.ok) stats = await statsResponse.json();
  } catch (_) {}
  return { items, stats };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}
function formatNumber(value, digits = 1) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}
function normalizeRole(value = '') {
  const role = String(value).toLowerCase().replace(/^rear\s+/, '').replaceAll('ultrawide', 'ultra-wide').trim();
  if (role.includes('ultra') && role.includes('wide')) return 'Ultra-wide';
  if (role.includes('tele')) return 'Telephoto';
  if (role.includes('front')) return 'Front';
  if (role.includes('macro')) return 'Macro';
  if (role.includes('depth') || role.includes('tof')) return 'Depth';
  if (role.includes('main') || role === 'wide' || role.includes('wide angle')) return 'Main';
  return '';
}
function rolesFor(row) {
  if (!row.roles) return [];
  return Array.from(new Set(String(row.roles).split(/[,;+]/).map((part) => normalizeRole(part)).filter(Boolean)));
}
function rowHasRole(row, selectedRole) {
  if (selectedRole === 'Unspecified') return rolesFor(row).length === 0;
  return rolesFor(row).includes(normalizeRole(selectedRole));
}
function renderCharts(dashboard = {}) {
  const sensors = staticRows.filter((r) => Number(r.pixel_size_um) > 0 && Number(r.resolution_mp) > 0);
  const scatter = (target, data, xKey, yKey, xLabel, yLabel, logY = false) => {
    const w=680,h=300,p={l:54,r:18,t:15,b:42}, xs=data.map(d=>Number(d[xKey])), ys=data.map(d=>Number(d[yKey]));
    if (!data.length) { qs(target).innerHTML='<div class="chart-empty">No records have both measurements.</div>'; return; }
    const xmin=Math.min(...xs),xmax=Math.max(...xs), ymin=logY?Math.min(...ys):0,ymax=Math.max(...ys), ly=v=>logY?Math.log10(v):v, low=ly(ymin),high=ly(ymax);
    const X=v=>p.l+(v-xmin)/(xmax-xmin||1)*(w-p.l-p.r), Y=v=>h-p.b-(ly(v)-low)/(high-low||1)*(h-p.t-p.b);
    let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)} by ${esc(xLabel)}">`;
    for(let i=0;i<5;i++){const yy=p.t+i*(h-p.t-p.b)/4, val=logY?Math.pow(10,high-i*(high-low)/4):ymax-i*(ymax-ymin)/4; svg+=`<line class="chart-gridline" x1="${p.l}" x2="${w-p.r}" y1="${yy}" y2="${yy}"/><text class="chart-tick" x="${p.l-8}" y="${yy+4}" text-anchor="end">${formatNumber(val,1)}</text>`;}
    data.forEach(d=>{const protocol=d.protocol||'',color=protocol.includes('V5')?'#e78b38':protocol.includes('V6')?'#7866d7':'#3182ce';svg+=`<circle cx="${X(Number(d[xKey]))}" cy="${Y(Number(d[yKey]))}" r="${xKey==='pitch'?3.5:6}" fill="${color}" opacity=".72"><title>${esc(d.sensor||d.device)} · ${formatNumber(d[xKey],2)} µm · ${formatNumber(d[yKey],1)} ${esc(protocol)}</title></circle>`;});
    svg+=`<text class="chart-axis" x="${(w+p.l-p.r)/2}" y="${h-6}" text-anchor="middle">${esc(xLabel)}</text><text class="chart-axis" transform="translate(14 ${h/2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;qs(target).innerHTML=svg;
  };
  scatter('#pitch-chart',sensors,'pixel_size_um','resolution_mp','Pixel pitch (µm)','Resolution (MP)',true);
  const dx=(dashboard.dxomark||[]).filter(d=>Number(d.pitch)>0&&Number(d.score)>0);scatter('#dxo-chart',dx,'pitch','score','Mean mapped sensor pitch (µm)','DxOMark camera score');
  const makers=dashboard.manufacturers||[], max=Math.max(...makers.map(x=>x.count),1);qs('#maker-chart').innerHTML='<div class="bar-chart">'+makers.map(m=>`<div class="bar-row"><span>${esc(m.name)}</span><div class="bar-track"><i style="width:${100*m.count/max}%"></i></div><b>${m.count}</b></div>`).join('')+'</div>';
}
function checkedValues(name) {
  return qsa('input[name="' + name + '"]:checked').map((input) => input.value);
}
function sortValue(row, key) {
  if (key === 'roles') return rolesFor(row).join(', ') || 'Unspecified';
  return row[key];
}
function compareRows(left, right) {
  const a = sortValue(left, sortState.key);
  const b = sortValue(right, sortState.key);
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  let result;
  if (typeof a === 'number' || typeof b === 'number') result = Number(a) - Number(b);
  else result = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return sortState.direction === 'asc' ? result : -result;
}
function makeFacets() {
  const makers = Array.from(new Set(staticRows.map((row) => row.manufacturer).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  qs('#manufacturer-facets').innerHTML = makers.map((maker) => {
    const count = staticRows.filter((row) => row.manufacturer === maker).length;
    return '<label class="facet-option"><input type="checkbox" name="manufacturer" value="' + esc(maker) + '"><span class="facet-name">' + esc(maker) + '</span><span class="facet-count">' + count + '</span></label>';
  }).join('');
  const availableRoles = new Set(staticRows.flatMap(rolesFor));
  if (staticRows.some((row) => rolesFor(row).length === 0)) availableRoles.add('Unspecified');
  const roles = roleOptions.filter((role) => availableRoles.has(role));
  qs('#role-facets').innerHTML = roles.map((role) => {
    const count = staticRows.filter((row) => rowHasRole(row, role)).length;
    return '<label class="facet-option"><input type="checkbox" name="role" value="' + esc(role) + '"><span class="facet-name">' + esc(role) + '</span><span class="facet-count">' + count + '</span></label>';
  }).join('');
  const sizes = Array.from(new Set(staticRows.map((row) => row.sensor_size).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  qs('#sensor-size').innerHTML += sizes.map((size) => '<option value="' + esc(size) + '">' + esc(size) + '</option>').join('');
}
function currentFilters() {
  const makers = checkedValues('manufacturer');
  const roles = checkedValues('role');
  const query = qs('#q').value.trim().toLowerCase();
  const size = qs('#sensor-size').value;
  const min = qs('#min-mp').value === '' ? null : Number(qs('#min-mp').value);
  const max = qs('#max-mp').value === '' ? null : Number(qs('#max-mp').value);
  const mapped = qs('input[name="mapped"]:checked').value;
  return { makers, roles, query, size, min, max, mapped };
}
function rowMatches(row, filters) {
  if (filters.makers.length && !filters.makers.includes(row.manufacturer)) return false;
  if (filters.roles.length && !filters.roles.some((role) => rowHasRole(row, role))) return false;
  if (filters.size && row.sensor_size !== filters.size) return false;
  if (filters.min != null && (row.resolution_mp == null || Number(row.resolution_mp) < filters.min)) return false;
  if (filters.max != null && (row.resolution_mp == null || Number(row.resolution_mp) > filters.max)) return false;
  if (filters.mapped === 'mapped' && !(Number(row.phone_count) > 0)) return false;
  if (filters.mapped === 'unmapped' && Number(row.phone_count) > 0) return false;
  if (filters.query) {
    const haystack = [row.manufacturer, row.sensor, row.marketing_name, row.internal_code, row.canonical_id, row.example_phones, row.roles].join(' ').toLowerCase();
    if (!haystack.includes(filters.query)) return false;
  }
  return true;
}
function filterChips(filters) {
  const chips = [];
  filters.makers.forEach((value) => chips.push({ key: 'manufacturer', value, label: value }));
  filters.roles.forEach((value) => chips.push({ key: 'role', value, label: value }));
  if (filters.query) chips.push({ key: 'query', value: '', label: '“' + qs('#q').value.trim() + '”' });
  if (filters.size) chips.push({ key: 'size', value: '', label: 'Format ' + filters.size });
  if (filters.min != null) chips.push({ key: 'min', value: '', label: '≥ ' + formatNumber(filters.min) + ' MP' });
  if (filters.max != null) chips.push({ key: 'max', value: '', label: '≤ ' + formatNumber(filters.max) + ' MP' });
  if (filters.mapped !== 'any') chips.push({ key: 'mapped', value: filters.mapped, label: filters.mapped === 'mapped' ? 'Has phone mapping' : 'No phone mapping' });
  currentChips = chips;
  qs('#active-filters').innerHTML = chips.map((chip, index) => '<button class="filter-chip" type="button" data-chip="' + index + '" aria-label="Remove filter: ' + esc(chip.label) + '">' + esc(chip.label) + '<span aria-hidden="true">×</span></button>').join('');
  qs('#filter-count').textContent = chips.length + (chips.length === 1 ? ' active filter' : ' active filters');
  qs('#active-filters').classList.toggle('has-filters', chips.length > 0);
  return chips;
}
function updateSortIndicators() {
  qsa('th[data-sort]').forEach((cell) => {
    const active = cell.dataset.sort === sortState.key;
    cell.setAttribute('aria-sort', active ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const button = qs('button', cell);
    qs('span', button).textContent = active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
  });
}
function updateComparisonBar() {
  const count = compareIds.size;
  qs('#compare-bar').hidden = count === 0;
  qs('#compare-count').textContent = count + (count === 1 ? ' sensor selected' : ' sensors selected');
  qs('#compare-notice').textContent = count < 4 ? 'Select up to 4 sensors to compare.' : 'Comparison limit reached.';
  qs('#open-comparison').disabled = count < 2;
}
function render() {
  const filters = currentFilters();
  const chips = filterChips(filters);
  const filtered = staticRows.filter((row) => rowMatches(row, filters)).sort(compareRows);
  qs('#status').textContent = filtered.length.toLocaleString() + ' of ' + staticRows.length.toLocaleString() + ' sensors';
  qs('#rows').innerHTML = filtered.map((row) => {
    const selected = compareIds.has(row.canonical_id);
    return '<tr class="' + (selected ? 'is-selected' : '') + '"><td class="check-col"><input class="compare-check" type="checkbox" data-compare="' + esc(row.canonical_id) + '" aria-label="Select ' + esc(row.sensor) + ' for comparison"' + (selected ? ' checked' : '') + '></td>' +
      '<td><span class="maker-label">' + esc(row.manufacturer) + '</span></td>' +
      '<td class="sensor-cell"><button class="sensor-link" type="button" data-open="' + esc(row.canonical_id) + '">' + esc(row.sensor) + '</button></td>' +
      '<td class="muted code-cell">' + esc(row.internal_code || '—') + '</td>' +
      '<td class="number-cell emphasis">' + (row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP') + '</td>' +
      '<td class="number-cell">' + esc(row.sensor_size || '—') + '</td>' +
      '<td class="number-cell">' + (row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—') + '</td>' +
      '<td class="role-cell">' + (rolesFor(row).length ? rolesFor(row).map((role) => '<span class="role-tag">' + esc(role) + '</span>').join('') : '<span class="role-tag role-muted">Unspecified</span>') + '</td>' +
      '<td class="number-cell"><span class="phone-count">' + Number(row.phone_count || 0).toLocaleString() + '</span></td>' +
      '<td class="number-cell">' + (row.latest_year || '—') + '</td>' +
      '<td class="open-col"><button class="icon-button row-open" type="button" data-open="' + esc(row.canonical_id) + '" aria-label="View ' + esc(row.sensor) + ' details">↗</button></td></tr>';
  }).join('');
  qs('#empty-state').hidden = filtered.length > 0;
  qs('#sensor-table').hidden = filtered.length === 0;
  updateSortIndicators();
  updateComparisonBar();
}
function clearFilters() {
  qs('#q').value = '';
  qsa('input[name="manufacturer"], input[name="role"]').forEach((input) => { input.checked = false; });
  qs('#min-mp').value = '';
  qs('#max-mp').value = '';
  qs('#sensor-size').value = '';
  qs('input[name="mapped"][value="any"]').checked = true;
  render();
}
function removeChip(chip) {
  if (chip.key === 'manufacturer' || chip.key === 'role') {
    const input = qsa('input[name="' + chip.key + '"]').find((candidate) => candidate.value === chip.value);
    if (input) input.checked = false;
  } else if (chip.key === 'query') qs('#q').value = '';
  else if (chip.key === 'size') qs('#sensor-size').value = '';
  else if (chip.key === 'min') qs('#min-mp').value = '';
  else if (chip.key === 'max') qs('#max-mp').value = '';
  else if (chip.key === 'mapped') qs('input[name="mapped"][value="any"]').checked = true;
  render();
}
function showDetail(id) {
  const row = staticRows.find((item) => item.canonical_id === id);
  if (!row) return;
  const detail = qs('#detail');
  detail.hidden = false;
  detail.innerHTML = '<div class="detail-head"><div><div class="section-kicker">SENSOR DETAILS</div><h2>' + esc(row.sensor) + '</h2><p>' + esc(row.manufacturer) + ' · ' + esc(row.canonical_id) + '</p></div><button class="icon-button" type="button" data-detail-close aria-label="Close sensor details">×</button></div>' +
    '<div class="detail-grid">' +
    '<div class="detail-item"><span>Resolution</span><strong>' + (row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP') + '</strong></div>' +
    '<div class="detail-item"><span>Resolution pixels</span><strong>' + esc(row.resolution_px || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Optical format</span><strong>' + esc(row.sensor_size || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Pixel pitch</span><strong>' + (row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—') + '</strong></div>' +
    '<div class="detail-item"><span>Camera roles</span><strong>' + esc(rolesFor(row).join(', ') || 'Unspecified') + '</strong></div>' +
    '<div class="detail-item"><span>Internal / alias</span><strong>' + esc(row.internal_code || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Autofocus</span><strong>' + esc(row.af || '—') + '</strong></div>' +
    '<div class="detail-item"><span>HDR</span><strong>' + esc(row.hdr || '—') + '</strong></div>' +
    '<div class="detail-item"><span>CFA</span><strong>' + esc(row.cfa || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Pixel binning</span><strong>' + esc(row.pixel_binning || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Full well capacity</span><strong>' + esc(row.fwc || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Two layer transistor</span><strong>' + esc(row.two_layer_transistor || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Transfer gate</span><strong>' + esc(row.transfer_gate || '—') + '</strong></div>' +
    '<div class="detail-item"><span>First listed</span><strong>' + esc(row.first_listed_year || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Data confidence</span><strong>' + esc(row.confidence || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Phone mappings</span><strong>' + Number(row.phone_count || 0).toLocaleString() + '</strong></div>' +
    '<div class="detail-item"><span>Example phones</span><strong>' + esc(row.example_phones || '—') + '</strong></div>' +
    '</div><div class="detail-extra"><h3>Aliases</h3><p>' + esc((row.aliases || []).join(' · ') || '—') + '</p><h3>Mapped phones (' + Number(row.phone_count || 0) + ')</h3><ul>' + (row.phones || []).map(p=>'<li>'+esc([p.model,p.year,p.role,p.confidence&&('confidence '+p.confidence)].filter(Boolean).join(' · '))+'</li>').join('') + '</ul><h3>Notes</h3><p>' + esc(row.notes || '—') + '</p></div><div class="detail-source">' + (row.sources||[]).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.type+' · '+s.relationship)+' ↗</a>').join('') + (row.source_url && !(row.sources||[]).length ? '<a href="' + esc(row.source_url) + '" target="_blank" rel="noopener noreferrer">Open source ↗</a>' : '') + '</div>';
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function comparisonTable() {
  const rows = Array.from(compareIds).map((id) => staticRows.find((row) => row.canonical_id === id)).filter(Boolean);
  qs('#compare-subtitle').textContent = rows.length + ' sensors · key specifications at a glance';
  const fields = [
    ['Manufacturer', (row) => row.manufacturer],
    ['Resolution', (row) => row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP'],
    ['Optical format', (row) => row.sensor_size || '—'],
    ['Pixel pitch', (row) => row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—'],
    ['Camera roles', (row) => rolesFor(row).join(', ') || 'Unspecified'],
    ['Mapped phones', (row) => Number(row.phone_count || 0).toLocaleString()],
    ['Latest phone year', (row) => row.latest_year || '—'],
    ['Internal code', (row) => row.internal_code || '—'],
    ['Autofocus', (row) => row.af || '—'],
    ['HDR', (row) => row.hdr || '—'],
    ['CFA', (row) => row.cfa || '—'],
    ['Examples', (row) => row.example_phones || '—']
  ];
  qs('#comparison-content').innerHTML = '<table class="comparison-table"><thead><tr><th scope="col">Specification</th>' + rows.map((row) => '<th scope="col"><span class="compare-maker">' + esc(row.manufacturer) + '</span><strong>' + esc(row.sensor) + '</strong><button class="remove-compare" type="button" data-remove-compare="' + esc(row.canonical_id) + '" aria-label="Remove ' + esc(row.sensor) + ' from comparison">Remove</button></th>').join('') + '</tr></thead><tbody>' + fields.map((field) => '<tr><th scope="row">' + esc(field[0]) + '</th>' + rows.map((row) => '<td>' + esc(field[1](row)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}
function setDrawer(open) {
  if (window.matchMedia('(max-width: 1020px)').matches) {
    appShell.classList.toggle('filters-open', open);
    qs('#drawer-backdrop').hidden = !open;
    qs('#filter-toggle').setAttribute('aria-expanded', String(open));
    if (open) qs('#q').focus();
    else qs('#filter-toggle').focus();
  }
}

qs('#manufacturer-facets').addEventListener('change', render);
qs('#role-facets').addEventListener('change', render);
qs('#q').addEventListener('input', render);
qs('#min-mp').addEventListener('input', render);
qs('#max-mp').addEventListener('input', render);
qs('#sensor-size').addEventListener('change', render);
qsa('input[name="mapped"]').forEach((input) => input.addEventListener('change', render));
qs('#clear-filters').addEventListener('click', clearFilters);
qs('#empty-clear').addEventListener('click', clearFilters);
qs('#filter-toggle').addEventListener('click', () => setDrawer(true));
qs('#drawer-close').addEventListener('click', () => setDrawer(false));
qs('#drawer-backdrop').addEventListener('click', () => setDrawer(false));
qs('#active-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-chip]');
  if (button) removeChip(currentChips[Number(button.dataset.chip)]);
});
qs('#sensor-table').addEventListener('click', (event) => {
  const sortButton = event.target.closest('[data-sort]');
  if (sortButton) {
    const key = sortButton.dataset.sort;
    sortState = { key, direction: sortState.key === key && sortState.direction === 'asc' ? 'desc' : 'asc' };
    const sortValue = key + ':' + sortState.direction;
    const sortSelect = qs('#sort-select');
    let sortOption = Array.from(sortSelect.options).find((option) => option.value === sortValue);
    if (!sortOption) {
      sortOption = document.createElement('option');
      sortOption.value = sortValue;
      sortOption.textContent = 'Current column: ' + key.replaceAll('_', ' ') + (sortState.direction === 'asc' ? ' ascending' : ' descending');
      sortSelect.append(sortOption);
    }
    sortSelect.value = sortValue;
    render();
    return;
  }
  const detailButton = event.target.closest('[data-open]');
  if (detailButton) showDetail(detailButton.dataset.open);
});
qs('#sensor-table').addEventListener('change', (event) => {
  const input = event.target.closest('[data-compare]');
  if (!input) return;
  const id = input.dataset.compare;
  if (input.checked) {
    if (compareIds.size >= 4) {
      qs('#compare-notice').textContent = 'You can compare up to 4 sensors. Remove one to add another.';
      input.checked = false;
      return;
    }
    compareIds.add(id);
  } else compareIds.delete(id);
  render();
});
qs('#sort-select').addEventListener('change', (event) => {
  const parts = event.target.value.split(':');
  sortState = { key: parts[0], direction: parts[1] };
  render();
});
qs('#clear-comparison').addEventListener('click', () => { compareIds.clear(); render(); });
qs('#open-comparison').addEventListener('click', () => {
  if (compareIds.size < 2) return;
  comparisonTable();
  qs('#compare-dialog').showModal();
});
qs('#close-comparison').addEventListener('click', () => qs('#compare-dialog').close());
qs('#compare-dialog').addEventListener('click', (event) => {
  if (event.target === qs('#compare-dialog')) qs('#compare-dialog').close();
  const remove = event.target.closest('[data-remove-compare]');
  if (remove) {
    compareIds.delete(remove.dataset.removeCompare);
    render();
    if (compareIds.size < 2) qs('#compare-dialog').close();
    else comparisonTable();
  }
});
qs('#detail').addEventListener('click', (event) => {
  if (event.target.closest('[data-detail-close]')) qs('#detail').hidden = true;
});
qs('#app-shell').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setDrawer(false);
});
if (window.matchMedia('(max-width: 1020px)').matches) qs('#filter-toggle').setAttribute('aria-expanded', 'false');
window.addEventListener('resize', () => {
  if (!window.matchMedia('(max-width: 1020px)').matches) {
    appShell.classList.remove('filters-open');
    qs('#drawer-backdrop').hidden = true;
    qs('#filter-toggle').setAttribute('aria-expanded', 'true');
  } else qs('#filter-toggle').setAttribute('aria-expanded', String(appShell.classList.contains('filters-open')));
});

(async function init() {
  try {
    const data = await getData();
    staticRows = Array.isArray(data.items) ? data.items : [];
    statsData = data.stats || {};
    makeFacets();
    qs('#sensors').textContent = Number(statsData.sensors ?? staticRows.length).toLocaleString();
    qs('#makers').textContent = Number(statsData.manufacturers ?? new Set(staticRows.map((row) => row.manufacturer)).size).toLocaleString();
    qs('#phones').textContent = Number(statsData.phones ?? 0).toLocaleString();
    qs('#mappings').textContent = Number(statsData.mappings ?? 0).toLocaleString();
    render();
    try { const resp = await fetch('/data/dashboard.json'); renderCharts(resp.ok ? await resp.json() : {}); } catch (_) { renderCharts(); }
  } catch (error) {
    qs('#status').textContent = 'Could not load the sensor catalog. Please refresh to try again.';
    qs('#empty-state').hidden = false;
    qs('#sensor-table').hidden = true;
  }
})();
