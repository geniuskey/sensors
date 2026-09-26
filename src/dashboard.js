const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function number(value, digits = 1) {
  return value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function catalogUrl(filters) {
  const params = new URLSearchParams(filters);
  return '/catalog/?' + params.toString();
}

function renderScatter(target, data, xKey, yKey, xLabel, yLabel, options = {}) {
  const valid = data.filter((point) => Number(point[xKey]) > 0 && Number(point[yKey]) > 0);
  if (!valid.length) {
    qs(target).innerHTML = '<div class="chart-empty">No records have both measurements.</div>';
    return;
  }

  const w = 680, h = 300, p = { l: 58, r: 18, t: 18, b: 44 };
  const xs = valid.map((point) => Number(point[xKey]));
  const ys = valid.map((point) => Number(point[yKey]));
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = options.logY ? Math.min(...ys) : 0, ymax = Math.max(...ys);
  const scaleY = (value) => options.logY ? Math.log10(value) : value;
  const low = scaleY(ymin), high = scaleY(ymax);
  const X = (value) => p.l + (value - xmin) / (xmax - xmin || 1) * (w - p.l - p.r);
  const Y = (value) => h - p.b - (scaleY(value) - low) / (high - low || 1) * (h - p.t - p.b);
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(yLabel)} by ${esc(xLabel)}">`;

  for (let i = 0; i < 5; i++) {
    const y = p.t + i * (h - p.t - p.b) / 4;
    const value = options.logY ? Math.pow(10, high - i * (high - low) / 4) : ymax - i * (ymax - ymin) / 4;
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y + 4}" text-anchor="end">${number(value, 1)}</text>`;
  }

  valid.forEach((point) => {
    const label = options.label(point);
    const href = options.href(point);
    const protocol = point.protocol || '';
    const color = protocol.includes('V5') ? '#e78b38' : protocol.includes('V6') ? '#7866d7' : '#3182ce';
    const x = X(Number(point[xKey])), y = Y(Number(point[yKey]));
    const r = options.hitRadius || 7;
    const metadata = `${number(point[xKey], 2)} ${xLabel} · ${number(point[yKey], 1)} ${yLabel}`;
    svg += `<a class="chart-point${protocol ? ` chart-point-${esc(protocol.toLowerCase())}` : ''}" href="${esc(href)}" data-tooltip-title="${esc(label)}" data-tooltip-detail="${esc(metadata)}"${protocol ? ` data-protocol="${esc(protocol)}"` : ''} aria-label="${esc(label)}. ${esc(metadata)}. Open matching catalog results."><circle class="chart-hit" cx="${x}" cy="${y}" r="${r}"/><circle class="chart-dot" cx="${x}" cy="${y}" r="${options.dotRadius || 4}" fill="${color}" opacity=".78"/></a>`;
  });

  svg += `<text class="chart-axis" x="${(w + p.l - p.r) / 2}" y="${h - 7}" text-anchor="middle">${esc(xLabel)}</text><text class="chart-axis" transform="translate(14 ${h / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
  qs(target).innerHTML = svg;
}

function renderManufacturers(manufacturers) {
  const sorted = [...manufacturers].sort((a, b) => Number(b.count) - Number(a.count) || a.name.localeCompare(b.name));
  const max = Math.max(...sorted.map((item) => Number(item.count) || 0), 1);
  qs('#maker-total').textContent = `${sorted.length} manufacturers`;
  qs('#maker-chart').innerHTML = '<div class="bar-chart">' + sorted.map((maker) => {
    const width = 100 * Number(maker.count) / max;
    const href = catalogUrl({ manufacturer: maker.name });
    return `<a class="bar-row" href="${esc(href)}" aria-label="Browse ${esc(maker.count)} ${esc(maker.name)} sensors"><span>${esc(maker.name)}</span><span class="bar-track"><i style="width:${width}%"></i></span><b>${number(maker.count, 0)}</b></a>`;
  }).join('') + '</div>';
}

function dxomarkSearchTerm(point, sensors) {
  const device = String(point.device || '').toLowerCase();
  const hasPhoneMapping = sensors.some((row) => {
    const phones = (row.phones || []).map((phone) => phone.model).join(' ');
    return [row.example_phones, phones].some((value) => String(value || '').toLowerCase().includes(device));
  });
  if (hasPhoneMapping || !point.sensors) return point.device;
  return String(point.sensors).split(/[,/;]/)[0].trim() || point.device;
}

function setProtocolFilter(protocol) {
  hideTooltip();
  qsa('[data-dx-filter]').forEach((button) => {
    const active = button.dataset.dxFilter === protocol;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  qsa('#dxo-chart [data-protocol]').forEach((point) => {
    point.hidden = protocol !== 'all' && point.dataset.protocol !== protocol;
  });
}

const chartTooltip = qs('#chart-tooltip');
function hideTooltip() {
  chartTooltip.hidden = true;
}
function showTooltip(point) {
  chartTooltip.querySelector('strong').textContent = point.dataset.tooltipTitle;
  chartTooltip.querySelector('span').textContent = point.dataset.tooltipDetail;
  chartTooltip.hidden = false;
  const dot = point.querySelector('.chart-dot').getBoundingClientRect();
  const width = chartTooltip.offsetWidth;
  const height = chartTooltip.offsetHeight;
  const center = dot.left + dot.width / 2;
  const below = dot.top < height + 18;
  chartTooltip.classList.toggle('is-below', below);
  chartTooltip.style.left = `${Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12))}px`;
  chartTooltip.style.top = `${below ? dot.bottom + 12 : dot.top - height - 12}px`;
}
qsa('.chart-area').forEach((area) => {
  area.addEventListener('pointerover', (event) => {
    const point = event.target.closest('.chart-point');
    if (point && !point.hidden) showTooltip(point);
  });
  area.addEventListener('pointerout', (event) => {
    const point = event.target.closest('.chart-point');
    if (point && !point.contains(event.relatedTarget)) hideTooltip();
  });
  area.addEventListener('focusin', (event) => {
    const point = event.target.closest('.chart-point');
    if (point && !point.hidden) showTooltip(point);
  });
  area.addEventListener('focusout', (event) => {
    if (event.target.closest('.chart-point')) hideTooltip();
  });
});
window.addEventListener('scroll', hideTooltip, true);
window.addEventListener('resize', hideTooltip);

async function init() {
  try {
    const [sensorResponse, statsResponse, dashboardResponse] = await Promise.all([
      fetch('/data/sensors.json'), fetch('/data/stats.json'), fetch('/data/dashboard.json')
    ]);
    if (!sensorResponse.ok || !statsResponse.ok || !dashboardResponse.ok) throw new Error('Overview data could not be loaded.');
    const [sensors, stats, dashboard] = await Promise.all([sensorResponse.json(), statsResponse.json(), dashboardResponse.json()]);

    qs('#sensors').textContent = number(stats.sensors ?? sensors.length, 0);
    qs('#phones').textContent = number(stats.phones, 0);
    qs('#makers').textContent = number(stats.manufacturers, 0);
    qs('#mappings').textContent = number(stats.mappings, 0);

    renderScatter('#pitch-chart', sensors.filter((row) => Number(row.pixel_size_um) > 0 && Number(row.resolution_mp) > 0), 'pixel_size_um', 'resolution_mp', 'Pixel pitch (µm)', 'Resolution (MP)', {
      logY: true,
      label: (row) => row.sensor,
      href: (row) => catalogUrl({ sensor: row.canonical_id }),
      hitRadius: 8,
      dotRadius: 3.5
    });

    renderScatter('#dxo-chart', dashboard.dxomark || [], 'pitch', 'score', 'Mean sensor pitch (µm)', 'Camera score', {
      label: (row) => `${row.device} · ${row.protocol}`,
      href: (row) => catalogUrl({ q: dxomarkSearchTerm(row, sensors) }),
      hitRadius: 8,
      dotRadius: 5
    });
    renderManufacturers(dashboard.manufacturers || []);
    qs('.chart-controls').addEventListener('click', (event) => {
      const button = event.target.closest('[data-dx-filter]');
      if (button) setProtocolFilter(button.dataset.dxFilter);
    });
  } catch (error) {
    document.querySelectorAll('.chart-area').forEach((chart) => { chart.innerHTML = '<div class="chart-empty">Could not load overview data. Try refreshing the page.</div>'; });
  }
}

init();
