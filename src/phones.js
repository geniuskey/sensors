const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const appShell = qs('#app-shell');
let phoneRows = [];
let sortState = { key: 'release_year', direction: 'desc' };
let visibleCount = window.matchMedia('(max-width: 720px)').matches ? 24 : 60;
let currentChips = [];
let makerLabelByKey = new Map();

async function getPhones() {
  try {
    const response = await fetch('/api/phones?limit=500');
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items)) return data.items;
    }
  } catch (_) {}
  const response = await fetch('/data/phones.json');
  if (!response.ok) throw new Error('Phone data could not be loaded.');
  return response.json();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}
function formatNumber(value, digits = 1) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}
function phoneMaker(phone) {
  return String(phone.oem || '').trim() || 'Unknown';
}
function makerKey(value) {
  return String(value || '').trim().toLocaleLowerCase();
}
function phoneMakerLabel(phone) {
  const maker = phoneMaker(phone);
  return makerLabelByKey.get(makerKey(maker)) || maker;
}
function checkedValues(name) {
  return qsa('input[name="' + name + '"]:checked').map((input) => input.value);
}
function sortValue(phone, key) {
  if (key === 'manufacturer') return phoneMakerLabel(phone);
  if (key === 'camera_count') return phone.cameras?.length || 0;
  return phone[key];
}
function comparePhones(left, right) {
  const a = sortValue(left, sortState.key), b = sortValue(right, sortState.key);
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  const result = typeof a === 'number' || typeof b === 'number'
    ? Number(a) - Number(b)
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return sortState.direction === 'asc' ? result : -result;
}
function makeFacets() {
  const makers = new Map(), roles = new Map();
  phoneRows.forEach((phone) => {
    const maker = phoneMaker(phone);
    const key = makerKey(maker);
    if (!makers.has(key)) makers.set(key, new Map());
    const variants = makers.get(key);
    variants.set(maker, (variants.get(maker) || 0) + 1);
    (phone.cameras || []).forEach((camera) => {
      const role = String(camera.role || '').trim() || 'Unspecified';
      roles.set(role, (roles.get(role) || 0) + 1);
    });
  });
  makerLabelByKey = new Map();
  const sortedMakers = Array.from(makers, ([key, variants]) => {
    const names = Array.from(variants, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    makerLabelByKey.set(key, names[0].name);
    return { name: names[0].name, count: names.reduce((sum, item) => sum + item.count, 0) };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  qs('#manufacturer-facets').innerHTML = sortedMakers.map(({ name, count }) =>
    '<label class="facet-option"><input type="checkbox" name="manufacturer" value="' + esc(name) + '"><span class="facet-name">' + esc(name) + '</span><span class="facet-count">' + count + '</span></label>'
  ).join('');
  const sortedRoles = Array.from(roles, ([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
  qs('#role-facets').innerHTML = sortedRoles.map(({ role, count }) =>
    '<label class="facet-option"><input type="checkbox" name="role" value="' + esc(role) + '"><span class="facet-name">' + esc(role) + '</span><span class="facet-count">' + count + '</span></label>'
  ).join('');
}
function applyUrlFilters() {
  const params = new URLSearchParams(location.search);
  const makers = params.getAll('manufacturer');
  qsa('input[name="manufacturer"]').forEach((input) => { input.checked = makers.some((maker) => makerKey(maker) === makerKey(input.value)); });
  const roles = params.getAll('role');
  qsa('input[name="role"]').forEach((input) => { input.checked = roles.includes(input.value); });
  if (params.get('q')) qs('#q').value = params.get('q');
  const mapped = params.get('mapped');
  if (['any', 'mapped', 'unmapped'].includes(mapped)) qs('input[name="mapped"][value="' + mapped + '"]').checked = true;
  return params.get('phone');
}
function currentFilters() {
  return {
    manufacturers: checkedValues('manufacturer'),
    roles: checkedValues('role'),
    query: qs('#q').value.trim().toLowerCase(),
    mapped: qs('input[name="mapped"]:checked').value,
  };
}
function phoneMatches(phone, filters) {
  const cameras = phone.cameras || [];
  if (filters.manufacturers.length && !filters.manufacturers.some((maker) => makerKey(maker) === makerKey(phoneMaker(phone)))) return false;
  if (filters.roles.length && !filters.roles.some((role) => cameras.some((camera) => (String(camera.role || '').trim() || 'Unspecified') === role))) return false;
  if (filters.mapped === 'mapped' && cameras.length === 0) return false;
  if (filters.mapped === 'unmapped' && cameras.length > 0) return false;
  if (filters.query) {
    const cameraTerms = cameras.flatMap((camera) => [camera.sensor, camera.sensor_id, camera.sensor_manufacturer, camera.role]);
    const haystack = [phoneMaker(phone), phoneMakerLabel(phone), phone.model, phone.canonical_id, phone.soc, phone.release_year, ...cameraTerms].join(' ').toLowerCase();
    if (!haystack.includes(filters.query)) return false;
  }
  return true;
}
function filterChips(filters) {
  const chips = [];
  filters.manufacturers.forEach((value) => chips.push({ key: 'manufacturer', value, label: value }));
  filters.roles.forEach((value) => chips.push({ key: 'role', value, label: value }));
  if (filters.query) chips.push({ key: 'query', value: '', label: '“' + qs('#q').value.trim() + '”' });
  if (filters.mapped !== 'any') chips.push({ key: 'mapped', value: filters.mapped, label: filters.mapped === 'mapped' ? 'Has mapped sensors' : 'No sensor mappings' });
  currentChips = chips;
  qs('#active-filters').innerHTML = chips.map((chip, index) => '<button class="filter-chip" type="button" data-chip="' + index + '" aria-label="Remove filter: ' + esc(chip.label) + '">' + esc(chip.label) + '<span aria-hidden="true">×</span></button>').join('');
  qs('#filter-count').textContent = chips.length + (chips.length === 1 ? ' active filter' : ' active filters');
  qs('#active-filters').classList.toggle('has-filters', chips.length > 0);
}
function cameraPreview(cameras, phoneId) {
  if (!cameras.length) return '<span class="phone-none">No sensor mapping yet</span>';
  const shown = cameras.slice(0, 3).map((camera) =>
    '<li><span class="phone-role">' + esc(camera.role || 'Unspecified') + '</span><a class="phone-sensor-link" href="/catalog/?q=' + encodeURIComponent(camera.sensor || camera.sensor_id || '') + '">' + esc(camera.sensor || 'Unknown sensor') + '</a><span class="sensor-maker-hint">' + esc(camera.sensor_manufacturer || '') + '</span></li>'
  ).join('');
  const more = cameras.length > 3 ? '<li><button class="phone-more" type="button" data-open-phone="' + esc(phoneId) + '">+' + (cameras.length - 3) + ' more · details</button></li>' : '';
  return '<ul class="phone-camera-preview">' + shown + more + '</ul>';
}
function updateSortIndicators() {
  qsa('#phone-table th[data-sort]').forEach((cell) => {
    const active = cell.dataset.sort === sortState.key;
    cell.setAttribute('aria-sort', active ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    qs('span', qs('button', cell)).textContent = active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
  });
}
function render(resetList = false) {
  if (resetList) visibleCount = window.matchMedia('(max-width: 720px)').matches ? 24 : 60;
  const filters = currentFilters();
  filterChips(filters);
  const filtered = phoneRows.filter((phone) => phoneMatches(phone, filters)).sort(comparePhones);
  qs('#status').textContent = filtered.length.toLocaleString() + ' of ' + phoneRows.length.toLocaleString() + ' phones';
  const shown = filtered.slice(0, visibleCount);
  qs('#rows').innerHTML = shown.map((phone) => {
    const cameras = phone.cameras || [];
    const uniqueSensors = new Set(cameras.map((camera) => camera.sensor_id || camera.sensor).filter(Boolean)).size;
    return '<tr><td class="phone-maker-cell" data-label="Phone manufacturer"><span class="maker-label">' + esc(phoneMakerLabel(phone)) + '</span></td>' +
      '<td class="phone-model-cell"><button class="phone-model-link" type="button" data-open-phone="' + esc(phone.canonical_id) + '">' + esc(phone.model) + '</button><span class="phone-canonical-id">' + esc(phone.canonical_id || '') + '</span></td>' +
      '<td class="number-cell" data-label="Year">' + esc(phone.release_year || '—') + '</td>' +
      '<td class="phone-soc-cell" data-label="SoC">' + esc(phone.soc || '—') + '</td>' +
      '<td class="number-cell" data-label="Sensors"><strong>' + uniqueSensors + '</strong></td>' +
      '<td class="phone-camera-cell" data-label="Camera sensor mappings">' + cameraPreview(cameras, phone.canonical_id) + '</td>' +
      '<td class="open-col"><button class="icon-button row-open" type="button" data-open-phone="' + esc(phone.canonical_id) + '" aria-label="View sensors in ' + esc(phone.model) + '">↗</button></td></tr>';
  }).join('');
  qs('#empty-state').hidden = filtered.length > 0;
  qs('#phone-table').hidden = filtered.length === 0;
  qs('#results-footer').hidden = filtered.length === 0;
  qs('#results-count').textContent = 'Showing ' + shown.length.toLocaleString() + ' of ' + filtered.length.toLocaleString();
  qs('#show-more').hidden = shown.length >= filtered.length;
  updateSortIndicators();
}
function clearFilters() {
  qs('#q').value = '';
  qsa('input[name="manufacturer"], input[name="role"]').forEach((input) => { input.checked = false; });
  qs('input[name="mapped"][value="any"]').checked = true;
  const url = new URL(location.href);
  ['q', 'manufacturer', 'role', 'mapped'].forEach((key) => url.searchParams.delete(key));
  history.replaceState({}, '', url);
  render(true);
}
function removeChip(chip) {
  if (chip.key === 'manufacturer' || chip.key === 'role') {
    const input = qsa('input[name="' + chip.key + '"]').find((candidate) => candidate.value === chip.value);
    if (input) input.checked = false;
  } else if (chip.key === 'query') qs('#q').value = '';
  else if (chip.key === 'mapped') qs('input[name="mapped"][value="any"]').checked = true;
  render(true);
}
function detailCamera(camera) {
  const sensorName = camera.sensor || camera.sensor_id || 'Unknown sensor';
  const info = [camera.sensor_manufacturer, camera.resolution_mp == null ? '' : formatNumber(camera.resolution_mp) + ' MP', camera.sensor_size, camera.pixel_size_um ? formatNumber(camera.pixel_size_um, 2) + ' µm pixels' : ''].filter(Boolean).join(' · ');
  return '<article class="camera-mapping-card"><div class="camera-mapping-head"><span class="role-tag">' + esc(camera.role || 'Unspecified') + '</span><span class="camera-confidence">' + (camera.confidence ? esc(camera.confidence) + ' confidence' : '') + '</span></div><h3><a href="/catalog/?q=' + encodeURIComponent(sensorName) + '">' + esc(sensorName) + '</a></h3><p>' + esc(info || 'Sensor specifications are not listed.') + '</p>' + (camera.source_url ? '<a class="mapping-source" href="' + esc(camera.source_url) + '" target="_blank" rel="noopener noreferrer">Mapping source ↗</a>' : '') + '</article>';
}
function showPhone(id, updateUrl = true) {
  const phone = phoneRows.find((item) => item.canonical_id === id);
  if (!phone) return;
  const detail = qs('#phone-detail');
  const cameras = phone.cameras || [];
  const facts = [
    ['Release year', phone.release_year || '—'],
    ['System on chip', phone.soc || '—'],
    ['Camera mappings', cameras.length],
    ['DXOMARK camera score', phone.camera_score == null ? '—' : formatNumber(phone.camera_score)],
    ['DXOMARK protocol', phone.camera_protocol || '—'],
  ];
  detail.innerHTML = '<div class="detail-head"><div><div class="section-kicker">PHONE DETAILS</div><h2>' + esc(phone.model) + '</h2><p>' + esc(phoneMakerLabel(phone)) + ' · ' + esc(phone.canonical_id) + '</p></div><button class="icon-button" type="button" data-detail-close aria-label="Close phone details">×</button></div>' +
    '<div class="detail-grid phone-detail-grid">' + facts.map(([label, value]) => '<div class="detail-item"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('') + '</div>' +
    '<div class="phone-camera-detail"><h3>Image sensors by camera</h3>' + (cameras.length ? '<div class="camera-mapping-list">' + cameras.map(detailCamera).join('') + '</div>' : '<p class="phone-none">No image sensor mappings are available for this phone yet.</p>') + '</div>';
  detail.hidden = false;
  if (updateUrl) {
    const url = new URL(location.href);
    if (url.searchParams.get('phone') !== id) {
      url.searchParams.set('phone', id);
      history.pushState({ phone: id }, '', url);
    }
  }
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
qs('#q').addEventListener('input', () => render(true));
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
qs('#phone-table').addEventListener('click', (event) => {
  const sortButton = event.target.closest('[data-sort]');
  if (sortButton) {
    const key = sortButton.dataset.sort;
    sortState = { key, direction: sortState.key === key && sortState.direction === 'asc' ? 'desc' : 'asc' };
    const value = key + ':' + sortState.direction;
    const select = qs('#sort-select');
    let option = Array.from(select.options).find((candidate) => candidate.value === value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      option.textContent = 'Current column: ' + key.replaceAll('_', ' ') + (sortState.direction === 'asc' ? ' ascending' : ' descending');
      select.append(option);
    }
    select.value = value;
    render(true);
    return;
  }
  const button = event.target.closest('[data-open-phone]');
  if (button) showPhone(button.dataset.openPhone);
});
qs('#sort-select').addEventListener('change', (event) => {
  const [key, direction] = event.target.value.split(':');
  sortState = { key, direction };
  render(true);
});
qs('#phone-detail').addEventListener('click', (event) => {
  if (!event.target.closest('[data-detail-close]')) return;
  qs('#phone-detail').hidden = true;
  const url = new URL(location.href);
  url.searchParams.delete('phone');
  history.replaceState({}, '', url);
});
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('phone');
  if (id) showPhone(id, false);
  else qs('#phone-detail').hidden = true;
});
appShell.addEventListener('keydown', (event) => { if (event.key === 'Escape') setDrawer(false); });
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
    phoneRows = await getPhones();
    makeFacets();
    const phoneToOpen = applyUrlFilters();
    render();
    if (phoneToOpen) showPhone(phoneToOpen, false);
  } catch (_) {
    qs('#status').textContent = 'Could not load the phone catalog. Please refresh to try again.';
    qs('#empty-state').hidden = false;
    qs('#phone-table').hidden = true;
  }
})();
