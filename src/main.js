import { stickyTableHead } from './sticky-head.js';

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const appShell = qs('#app-shell');
stickyTableHead(qs('#tablewrap'));
let staticRows = [];
let sortState = { key: 'resolution_mp', direction: 'desc' };
const compareIds = new Set();
let currentChips = [];
let exactPhoneFilter = '';
let visibleCount = window.matchMedia('(max-width: 720px)').matches ? 24 : 60;
const roleOptions = ['Main', 'Ultra-wide', 'Telephoto', 'Front', 'Front Ultra-wide', 'Macro', 'Depth', 'Night', 'Unspecified'];

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
  const items = (await response.json()).map((row) => ({ ...row, sensor: row.sensor || row.canonical_name }));
  let stats = {};
  try {
    const statsResponse = await fetch('/data/stats.json');
    if (statsResponse.ok) stats = await statsResponse.json();
  } catch (_) {}
  return { items, stats };
}

const slug = (text) => String(text ?? '').toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function sensorPath(row) {
  const [maker, productId] = String(row.canonical_id || '').split(':', 2);
  return '/sensors/' + slug(maker) + '/' + slug(productId) + '/';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}
function formatNumber(value, digits = 1) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}
function normalizeRole(value = '') {
  const role = String(value).toLowerCase().replace(/^rear\s+/, '').replaceAll('ultrawide', 'ultra-wide').trim();
  if (!role || ['unknown', 'unspecified', 'unknown role', 'not specified', 'n/a'].includes(role)) return 'Unspecified';
  if (role.includes('front') && role.includes('ultra') && role.includes('wide')) return 'Front Ultra-wide';
  if (role.includes('ultra') && role.includes('wide')) return 'Ultra-wide';
  if (role.includes('tele')) return 'Telephoto';
  if (role.includes('front')) return 'Front';
  if (role.includes('macro')) return 'Macro';
  if (role.includes('depth') || role.includes('tof')) return 'Depth';
  if (role.includes('night')) return 'Night';
  if (role.includes('mono')) return 'Monochrome';
  if (role.includes('main') || role === 'wide' || role.includes('wide angle')) return 'Main';
  return 'Unspecified';
}
function rolesFor(row) {
  const hasMappings = Number(row.phone_count || 0) > 0 || (Array.isArray(row.phones) && row.phones.length > 0);
  if (!hasMappings) return [];
  const source = Array.isArray(row.phones) && row.phones.length
    ? row.phones.map((phone) => phone.role)
    : String(row.roles || '').split(',');
  const roles = source.flatMap((value) => String(value || '').split(/[;+]/).map((part) => normalizeRole(part)));
  return Array.from(new Set(roles));
}
function rowHasRole(row, selectedRole) {
  if (selectedRole === 'Unspecified') return rolesFor(row).includes('Unspecified');
  return rolesFor(row).includes(normalizeRole(selectedRole));
}
function checkedValues(name) {
  return qsa('input[name="' + name + '"]:checked').map((input) => input.value);
}
function sortValue(row, key) {
  if (key === 'roles') return rolesFor(row).join(', ') || 'No phone mapping';
  return row[key];
}
function phoneRole(phone) {
  return normalizeRole(phone.role);
}
function renderPhoneMappings(row) {
  const phones = row.phones || [];
  if (!phones.length) return '<span class="phone-none">No phone mapping</span>';
  const visible = phones.slice(0, 3);
  const entries = visible.map((phone) => {
    const role = phoneRole(phone);
    const phoneUrl = phone.canonical_id ? '/phones/?phone=' + encodeURIComponent(phone.canonical_id) : '/phones/?q=' + encodeURIComponent(phone.model);
    return '<li><a class="phone-match" href="' + esc(phoneUrl) + '" title="View sensors in ' + esc(phone.model) + '">' + esc(phone.model) + '</a>' + (role === 'Unspecified' ? '' : '<span class="phone-role">' + esc(role) + '</span>') + '</li>';
  }).join('');
  const more = phones.length > visible.length
    ? '<li><button class="phone-more" type="button" data-open="' + esc(row.canonical_id) + '">+' + (phones.length - visible.length) + ' more · details</button></li>'
    : '';
  return '<ul class="phone-match-list">' + entries + more + '</ul>';
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
  qs('#maker-hint').textContent = 'sorted by count';
  const makerCounts = new Map();
  staticRows.forEach((row) => { if (row.manufacturer) makerCounts.set(row.manufacturer, (makerCounts.get(row.manufacturer) || 0) + 1); });
  const makers = Array.from(makerCounts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  qs('#manufacturer-facets').innerHTML = makers.map((maker) => {
    return '<label class="facet-option"><input type="checkbox" name="manufacturer" value="' + esc(maker.name) + '"><span class="facet-name">' + esc(maker.name) + '</span><span class="facet-count">' + maker.count + '</span></label>';
  }).join('');
  const availableRoles = new Set(staticRows.flatMap(rolesFor));
  if (staticRows.some((row) => rolesFor(row).includes('Unspecified'))) availableRoles.add('Unspecified');
  const roles = roleOptions.filter((role) => availableRoles.has(role)).map((role) => ({ role, count: staticRows.filter((row) => rowHasRole(row, role)).length })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
  qs('#role-facets').innerHTML = roles.map(({ role, count }) => {
    return '<label class="facet-option"><input type="checkbox" name="role" value="' + esc(role) + '"><span class="facet-name">' + esc(role) + '</span><span class="facet-count">' + count + '</span></label>';
  }).join('');
  const sizeCounts = new Map();
  staticRows.forEach((row) => { if (row.sensor_size) sizeCounts.set(row.sensor_size, (sizeCounts.get(row.sensor_size) || 0) + 1); });
  const sizes = Array.from(sizeCounts, ([size, count]) => ({ size, count })).sort((a, b) => b.count - a.count || a.size.localeCompare(b.size, undefined, { numeric: true }));
  qs('#sensor-size').innerHTML += sizes.map(({ size, count }) => '<option value="' + esc(size) + '">' + esc(size) + ' (' + count + ')</option>').join('');
}
function applyUrlFilters() {
  const params = new URLSearchParams(location.search);
  const makers = params.getAll('manufacturer');
  if (makers.length) {
    qsa('input[name="manufacturer"]').forEach((input) => { input.checked = makers.includes(input.value); });
  }
  const roles = params.getAll('role');
  if (roles.length) qsa('input[name="role"]').forEach((input) => { input.checked = roles.includes(input.value); });
  const query = params.get('q');
  if (query) qs('#q').value = query;
  exactPhoneFilter = (params.get('phone') || '').toLowerCase();
  if (exactPhoneFilter) qs('#q').value = params.get('phone');
  const mapped = params.get('mapped');
  if (['any', 'mapped', 'unmapped'].includes(mapped)) qs('input[name="mapped"][value="' + mapped + '"]').checked = true;
  const size = params.get('size');
  if (size) qs('#sensor-size').value = size;
  if (params.has('min')) qs('#min-mp').value = params.get('min');
  if (params.has('max')) qs('#max-mp').value = params.get('max');
  return params.get('sensor');
}
function currentFilters() {
  const makers = checkedValues('manufacturer');
  const roles = checkedValues('role');
  const query = qs('#q').value.trim().toLowerCase();
  const size = qs('#sensor-size').value;
  const min = qs('#min-mp').value === '' ? null : Number(qs('#min-mp').value);
  const max = qs('#max-mp').value === '' ? null : Number(qs('#max-mp').value);
  const mapped = qs('input[name="mapped"]:checked').value;
  return { makers, roles, query, size, min, max, mapped, exactPhone: exactPhoneFilter };
}
function rowMatches(row, filters) {
  if (filters.makers.length && !filters.makers.includes(row.manufacturer)) return false;
  if (filters.roles.length && !filters.roles.some((role) => rowHasRole(row, role))) return false;
  if (filters.size && row.sensor_size !== filters.size) return false;
  if (filters.min != null && (row.resolution_mp == null || Number(row.resolution_mp) < filters.min)) return false;
  if (filters.max != null && (row.resolution_mp == null || Number(row.resolution_mp) > filters.max)) return false;
  if (filters.mapped === 'mapped' && !(Number(row.phone_count) > 0)) return false;
  if (filters.mapped === 'unmapped' && Number(row.phone_count) > 0) return false;
  if (filters.exactPhone && !(row.phones || []).some((phone) => String(phone.model || '').toLowerCase() === filters.exactPhone)) return false;
  if (filters.query) {
    const phoneModels = (row.phones || []).map((phone) => phone.model).join(' ');
    const haystack = [row.manufacturer, row.sensor, row.marketing_name, row.internal_code, row.canonical_id, row.example_phones, phoneModels, row.roles].join(' ').toLowerCase();
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
function render(resetList = false) {
  if (resetList) visibleCount = window.matchMedia('(max-width: 720px)').matches ? 24 : 60;
  const filters = currentFilters();
  const chips = filterChips(filters);
  const filtered = staticRows.filter((row) => rowMatches(row, filters)).sort(compareRows);
  qs('#status').textContent = filtered.length.toLocaleString() + ' of ' + staticRows.length.toLocaleString() + ' sensors';
  const shown = filtered.slice(0, visibleCount);
  qs('#rows').innerHTML = shown.map((row) => {
    const selected = compareIds.has(row.canonical_id);
    return '<tr class="' + (selected ? 'is-selected' : '') + '"><td class="check-col"><input class="compare-check" type="checkbox" data-compare="' + esc(row.canonical_id) + '" aria-label="Select ' + esc(row.sensor) + ' for comparison"' + (selected ? ' checked' : '') + '></td>' +
      '<td><span class="maker-label">' + esc(row.manufacturer) + '</span></td>' +
      '<td class="sensor-cell"><button class="sensor-link" type="button" data-open="' + esc(row.canonical_id) + '">' + esc(row.sensor) + '</button></td>' +
      '<td class="muted code-cell" data-label="Part / alias">' + esc(row.internal_code || '—') + '</td>' +
      '<td class="number-cell emphasis" data-label="Resolution">' + (row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP') + '</td>' +
      '<td class="number-cell" data-label="Format">' + esc(row.sensor_size || '—') + '</td>' +
      '<td class="number-cell" data-label="Pixel">' + (row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—') + '</td>' +
      '<td class="role-cell" data-label="Camera roles">' + (rolesFor(row).length ? rolesFor(row).map((role) => '<span class="role-tag' + (role === 'Unspecified' ? ' role-muted' : '') + '">' + esc(role) + '</span>').join('') : '<span class="role-empty">—</span>') + '</td>' +
      '<td class="phone-cell" data-label="Phones / camera role">' + renderPhoneMappings(row) + '</td>' +
      '<td class="number-cell" data-label="Latest use">' + (row.latest_year || '—') + '</td>' +
      '<td class="open-col"><button class="icon-button row-open" type="button" data-open="' + esc(row.canonical_id) + '" aria-label="View ' + esc(row.sensor) + ' details">↗</button></td></tr>';
  }).join('');
  qs('#empty-state').hidden = filtered.length > 0;
  qs('#sensor-table').hidden = filtered.length === 0;
  qs('#results-footer').hidden = filtered.length === 0;
  qs('#results-count').textContent = 'Showing ' + shown.length.toLocaleString() + ' of ' + filtered.length.toLocaleString();
  qs('#show-more').hidden = shown.length >= filtered.length;
  updateSortIndicators();
  updateComparisonBar();
}
function clearFilters() {
  qs('#q').value = '';
  exactPhoneFilter = '';
  qsa('input[name="manufacturer"], input[name="role"]').forEach((input) => { input.checked = false; });
  qs('#min-mp').value = '';
  qs('#max-mp').value = '';
  qs('#sensor-size').value = '';
  qs('input[name="mapped"][value="any"]').checked = true;
  render(true);
}
function removeChip(chip) {
  if (chip.key === 'manufacturer' || chip.key === 'role') {
    const input = qsa('input[name="' + chip.key + '"]').find((candidate) => candidate.value === chip.value);
    if (input) input.checked = false;
  } else if (chip.key === 'query') { qs('#q').value = ''; exactPhoneFilter = ''; }
  else if (chip.key === 'size') qs('#sensor-size').value = '';
  else if (chip.key === 'min') qs('#min-mp').value = '';
  else if (chip.key === 'max') qs('#max-mp').value = '';
  else if (chip.key === 'mapped') qs('input[name="mapped"][value="any"]').checked = true;
  render(true);
}
function showDetail(id, updateUrl = true) {
  const row = staticRows.find((item) => item.canonical_id === id);
  if (!row) return;
  if (updateUrl) {
    const url = new URL(location.href);
    if (url.searchParams.get('sensor') !== id) {
      url.searchParams.set('sensor', id);
      history.pushState({ sensor: id }, '', url);
    }
  }
  const detail = qs('#detail');
  detail.hidden = false;
  detail.innerHTML = '<div class="detail-head"><div><div class="section-kicker">SENSOR DETAILS</div><h2>' + esc(row.sensor) + '</h2><p>' + esc(row.manufacturer) + ' · ' + esc(row.canonical_id) + ' · <a href="' + sensorPath(row) + '">Permalink</a></p></div><button class="icon-button" type="button" data-detail-close aria-label="Close sensor details">×</button></div>' +
    '<div class="detail-grid">' +
    '<div class="detail-item"><span>Resolution</span><strong>' + (row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP') + '</strong></div>' +
    '<div class="detail-item"><span>Resolution pixels</span><strong>' + esc(row.resolution_px || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Optical format</span><strong>' + esc(row.sensor_size || '—') + '</strong></div>' +
    '<div class="detail-item"><span>Pixel pitch</span><strong>' + (row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—') + '</strong></div>' +
    '<div class="detail-item"><span>Camera roles</span><strong>' + esc(rolesFor(row).join(', ') || 'No phone mapping') + '</strong></div>' +
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
    '</div><div class="detail-extra"><h3>Aliases</h3><p>' + esc((row.aliases || []).join(' · ') || '—') + '</p><h3>Mapped phones (' + Number(row.phone_count || 0).toLocaleString() + ')</h3><ul>' + (row.phones || []).map((phone) => '<li>' + esc([phone.model, phone.year, 'Camera role: ' + phoneRole(phone), phone.confidence && ('confidence ' + phone.confidence)].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul><h3>Notes</h3><p>' + esc(row.notes || '—') + '</p></div><div class="detail-source">' + (row.sources||[]).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.type+' · '+s.relationship)+' ↗</a>').join('') + (row.source_url && !(row.sources||[]).length ? '<a href="' + esc(row.source_url) + '" target="_blank" rel="noopener noreferrer">Open source ↗</a>' : '') + '</div>';
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function comparisonTable() {
  const rows = Array.from(compareIds).map((id) => staticRows.find((row) => row.canonical_id === id)).filter(Boolean);
  qs('#compare-subtitle').textContent = rows.length + ' sensors · key specifications at a glance';
  const fields = [
    ['Manufacturer', (row) => row.manufacturer],
    ['Resolution', (row) => row.resolution_mp == null ? '—' : formatNumber(row.resolution_mp) + ' MP'],
    ['Optical format', (row) => row.sensor_size || '—'],
    ['Pixel pitch', (row) => row.pixel_size_um ? formatNumber(row.pixel_size_um, 2) + ' µm' : '—'],
    ['Camera roles', (row) => rolesFor(row).join(', ') || 'No phone mapping'],
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

qs('#manufacturer-facets').addEventListener('change', () => render(true));
qs('#role-facets').addEventListener('change', () => render(true));
qs('#q').addEventListener('input', () => { exactPhoneFilter = ''; render(true); });
qs('#min-mp').addEventListener('input', () => render(true));
qs('#max-mp').addEventListener('input', () => render(true));
qs('#sensor-size').addEventListener('change', () => render(true));
qsa('input[name="mapped"]').forEach((input) => input.addEventListener('change', () => render(true)));
qs('#show-more').addEventListener('click', () => { visibleCount += window.matchMedia('(max-width: 720px)').matches ? 24 : 60; render(); });
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
    render(true);
    return;
  }
  const detailButton = event.target.closest('[data-open]');
  if (detailButton) showDetail(detailButton.dataset.open);
  const phoneButton = event.target.closest('[data-phone-search]');
  if (phoneButton) {
    qs('#q').value = phoneButton.dataset.phoneSearch;
    exactPhoneFilter = phoneButton.dataset.phoneSearch.toLowerCase();
    render(true);
    qs('#q').focus();
  }
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
  render(true);
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
  if (event.target.closest('[data-detail-close]')) {
    qs('#detail').hidden = true;
    const url = new URL(location.href);
    if (url.searchParams.has('sensor')) {
      url.searchParams.delete('sensor');
      history.replaceState({}, '', url);
    }
  }
});
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('sensor');
  if (id) showDetail(id, false);
  else qs('#detail').hidden = true;
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
    makeFacets();
    const sensorToOpen = applyUrlFilters();
    render();
    if (sensorToOpen) showDetail(sensorToOpen, false);
  } catch (error) {
    qs('#status').textContent = 'Could not load the sensor catalog. Please refresh to try again.';
    qs('#empty-state').hidden = false;
    qs('#sensor-table').hidden = true;
  }
})();
