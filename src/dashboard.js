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

const PROTOCOL_COLORS = { V5: '#f08a3c', V6: '#7c5cf0' };
const DOT_COLOR = '#3b6cf6';

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / pow;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * pow;
}

function axisScale(values, { log, ticks, step }) {
  const t = log ? Math.log10 : (value) => value;
  let min = Math.min(...values), max = Math.max(...values);
  if (step) {
    const top = Math.ceil(max / step) * step;
    min = Math.floor(min / step) * step - step;
    max = top - max < step * 0.3 ? top + step : top;
  }
  let lo = t(min), hi = t(max);
  if (hi === lo) { lo -= log ? 0.5 : 1; hi += log ? 0.5 : 1; }
  if (!step) { const pad = (hi - lo) * 0.05; lo -= pad; hi += pad; }
  let list;
  if (log) list = (ticks || [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000]).filter((value) => t(value) >= lo && t(value) <= hi);
  else {
    const s = step || niceStep((hi - lo) / 6);
    list = [];
    for (let value = Math.ceil(lo / s - 1e-9) * s; value <= hi + 1e-9; value += s) list.push(Number(value.toFixed(6)));
  }
  return { t, lo, hi, ticks: list };
}

function tickLabel(value) {
  return number(value, value < 1 ? 2 : 1);
}

function renderScatter(target, data, xKey, yKey, xLabel, yLabel, options = {}) {
  const valid = data.filter((point) => Number(point[xKey]) > 0 && Number(point[yKey]) > 0);
  if (!valid.length) {
    qs(target).innerHTML = '<div class="chart-empty">No records have both measurements.</div>';
    return;
  }

  const w = 680, h = 340, p = { l: 58, r: 20, t: 20, b: 54 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b;
  const sx = axisScale(valid.map((point) => Number(point[xKey])), { log: options.logX, ticks: options.xTicks, step: options.xStep });
  const sy = axisScale(valid.map((point) => Number(point[yKey])), { log: options.logY, ticks: options.yTicks, step: options.yStep });
  const X = (value) => p.l + (sx.t(value) - sx.lo) / (sx.hi - sx.lo) * pw;
  const Y = (value) => h - p.b - (sy.t(value) - sy.lo) / (sy.hi - sy.lo) * ph;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(yLabel)} by ${esc(xLabel)}">`;

  sy.ticks.forEach((value) => {
    const y = Y(value).toFixed(1);
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y}" dy=".32em" text-anchor="end">${tickLabel(value)}</text>`;
  });
  sx.ticks.forEach((value) => {
    const x = X(value).toFixed(1);
    svg += `<line class="chart-gridline chart-gridline-v" x1="${x}" x2="${x}" y1="${p.t}" y2="${h - p.b}"/><text class="chart-tick" x="${x}" y="${h - p.b + 18}" text-anchor="middle">${tickLabel(value)}</text>`;
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${h - p.b}" y2="${h - p.b}"/>`;

  valid.forEach((point) => {
    const label = options.label(point);
    const href = options.href(point);
    const protocol = point.protocol || '';
    const color = protocol.includes('V5') ? PROTOCOL_COLORS.V5 : protocol.includes('V6') ? PROTOCOL_COLORS.V6 : DOT_COLOR;
    const x = X(Number(point[xKey])).toFixed(1), y = Y(Number(point[yKey])).toFixed(1);
    const r = options.hitRadius || 7;
    const metadata = `${number(point[xKey], 2)} ${xLabel} · ${number(point[yKey], 1)} ${yLabel}`;
    svg += `<a class="chart-point${protocol ? ` chart-point-${esc(protocol.toLowerCase())}` : ''}" href="${esc(href)}" data-tooltip-title="${esc(label)}" data-tooltip-detail="${esc(metadata)}"${protocol ? ` data-protocol="${esc(protocol)}"` : ''} aria-label="${esc(label)}. ${esc(metadata)}. Open matching catalog results."><circle class="chart-hit" cx="${x}" cy="${y}" r="${r}"/><circle class="chart-dot" cx="${x}" cy="${y}" r="${options.dotRadius || 4}" fill="${color}" fill-opacity=".72" stroke="#fff" stroke-width="1"/></a>`;
  });

  if (options.legend) {
    const lx = w - p.r - 10;
    options.legend.slice().reverse().forEach((item, index) => {
      const x = lx - index * 56;
      svg += `<g aria-hidden="true"><circle cx="${x - 30}" cy="${p.t + 12}" r="5" fill="${item.color}" fill-opacity=".72" stroke="#fff" stroke-width="1"/><text class="chart-legend" x="${x - 21}" y="${p.t + 12}" dy=".32em">${esc(item.label)}</text></g>`;
    });
  }

  svg += `<text class="chart-axis" x="${p.l + pw / 2}" y="${h - 10}" text-anchor="middle">${esc(xLabel)}</text><text class="chart-axis" transform="translate(16 ${p.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
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
      logX: true,
      logY: true,
      xTicks: [0.5, 0.7, 1, 1.4, 2, 3, 5, 10],
      yTicks: [0.1, 0.3, 1, 3, 10, 30, 100, 200],
      label: (row) => row.sensor,
      href: (row) => catalogUrl({ sensor: row.canonical_id }),
      hitRadius: 8,
      dotRadius: 3.5
    });

    renderScatter('#dxo-chart', dashboard.dxomark || [], 'pitch', 'score', 'Mean sensor pitch (µm)', 'Camera score', {
      yStep: 10,
      legend: [{ label: 'V5', color: PROTOCOL_COLORS.V5 }, { label: 'V6', color: PROTOCOL_COLORS.V6 }],
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
