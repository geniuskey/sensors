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

function makerTally(points) {
  const counts = new Map();
  points.forEach((point) => counts.set(point.manufacturer, (counts.get(point.manufacturer) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const phoneCount = (sensor) => Number(sensor.phone_count) || 0;
const byUsage = (a, b) => phoneCount(b) - phoneCount(a) || a.canonical_name.localeCompare(b.canonical_name);

function sensorLabel(sensor) {
  return sensor.canonical_name.toLowerCase().includes(String(sensor.manufacturer).toLowerCase()) ? sensor.canonical_name : `${sensor.manufacturer} ${sensor.canonical_name}`;
}

function sensorSummary(sensor) {
  const size = sensor.sensor_size ? (String(sensor.sensor_size).endsWith('"') ? sensor.sensor_size : `${sensor.sensor_size}"`) : '';
  const count = phoneCount(sensor);
  return [size, count ? `${count} phone${count === 1 ? '' : 's'}` : 'no phones mapped'].filter(Boolean).join(' · ');
}

function sensorExtra(sensor) {
  const years = sensor.first_year && sensor.latest_year ? (sensor.first_year === sensor.latest_year ? String(sensor.first_year) : `${sensor.first_year}–${sensor.latest_year}`) : '';
  return [years, sensor.pixel_binning, sensor.af, sensor.hdr].filter(Boolean).join(' · ');
}

function groupedPoints(valid, xKey, yKey, X, Y, options) {
  const groups = new Map();
  valid.forEach((point) => {
    const key = `${Number(point[xKey])}|${Number(point[yKey])}`;
    groups.set(key, [...(groups.get(key) || []), point]);
  });
  const near = (a, b, ratio) => Math.abs(Math.log(a / b)) <= Math.log(ratio);
  return [...groups.values()].sort((a, b) => b.length - a.length).map((points) => {
    const xv = Number(points[0][xKey]), yv = Number(points[0][yKey]);
    const tally = makerTally(points), nearby = valid.filter((point) => near(Number(point[xKey]), xv, 1.1) && near(Number(point[yKey]), yv, 1.25));
    const color = options.makerColor(tally[0][0]);
    const ranked = points.slice().sort(byUsage);
    const others = nearby.filter((point) => !points.includes(point) && phoneCount(point) > 0).sort(byUsage).slice(0, 3);
    const title = `${number(yv, 1)} MP · ${number(xv, 2)} µm — ${points.length} sensor${points.length === 1 ? '' : 's'}`;
    const detail = [
      points.length > 1 ? tally.map(([name, count]) => `${name} ${count}`).join(' · ') : '',
      ...ranked.slice(0, 6).map((sensor) => `${sensorLabel(sensor)} · ${sensorSummary(sensor)}`),
      ranked.length > 6 ? `+${ranked.length - 6} more` : '',
      points.length === 1 ? sensorExtra(points[0]) : '',
      nearby.length > points.length ? `Nearby (±10% pitch, ±25% MP): ${nearby.length} sensors — ` + makerTally(nearby).slice(0, 4).map(([name, count]) => `${name} ${count}`).join(' · ') : '',
      others.length ? 'Also nearby: ' + others.map((sensor) => `${sensorLabel(sensor)} (${phoneCount(sensor)})`).join(', ') : ''
    ].filter(Boolean).join('\n');
    const href = points.length === 1 ? options.href(points[0]) : catalogUrl({ min: yv, max: yv });
    const x = X(xv).toFixed(1), y = Y(yv).toFixed(1), r = Math.min(3.5 + Math.sqrt(points.length - 1) * 1.8, 11);
    return `<a class="chart-point" href="${esc(href)}" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}. ${esc(detail.replaceAll('\n', '. '))}. Open matching catalog results."><circle class="chart-hit" cx="${x}" cy="${y}" r="${Math.max(r + 3, 8)}"/><circle class="chart-dot" cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${color}" fill-opacity=".75" stroke="#fff" stroke-width="1"/></a>`;
  }).join('');
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

  if (options.group) svg += groupedPoints(valid, xKey, yKey, X, Y, options);
  else valid.forEach((point) => {
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

const TREND_COLORS = ['#3b5bfd', '#7c5cf0', '#0ea5a4', '#f08a3c', '#e5487a'];
const OTHER_COLOR = '#94a3b8';
const FORMAT_TICKS = [4, 3, 2.5, 2, 1.7, 1.5, 1.3, 1.12, 1].map((denominator) => 1 / denominator);

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseOpticalFormat(text) {
  const value = String(text || '').replace(/^type\s*/i, '').replace(/["”″]|inch(es)?/gi, '').trim();
  const fraction = value.match(/^1\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) return Number(fraction[1]) > 0 ? 1 / Number(fraction[1]) : null;
  return /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

function formatOptical(value) {
  return value >= 0.995 ? `${number(value, 2)}"` : `1/${number(1 / value, 2)}`;
}

function isMainCamera(camera) {
  return /\bRear Main\b/i.test(camera.role || '');
}

const TREND_MIN_MAPPINGS = 10, TREND_MIN_MAIN = 3;

function yearGroups(phones, minimum = TREND_MIN_MAPPINGS) {
  const groups = new Map();
  phones.forEach((phone) => {
    const year = Number(phone.release_year);
    if (!year || !(phone.cameras || []).length) return;
    groups.set(year, [...(groups.get(year) || []), ...phone.cameras]);
  });
  return [...groups].filter(([, cameras]) => cameras.length >= minimum).sort((a, b) => a[0] - b[0]).map(([year, cameras]) => ({ year, cameras }));
}

function manufacturerShare(groups, limit = 5) {
  const totals = new Map();
  groups.forEach(({ cameras }) => cameras.forEach((camera) => {
    const name = camera.sensor_manufacturer || 'Unknown';
    totals.set(name, (totals.get(name) || 0) + 1);
  }));
  const top = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name]) => name);
  const series = [...top.map((name, index) => ({ name, color: TREND_COLORS[index] })), { name: 'Other', color: OTHER_COLOR, other: true }];
  const rows = groups.map(({ year, cameras }) => {
    const counts = cameras.reduce((map, camera) => {
      const name = top.includes(camera.sensor_manufacturer) ? camera.sensor_manufacturer : 'Other';
      map[name] = (map[name] || 0) + 1;
      return map;
    }, {});
    return { year, total: cameras.length, segments: series.map((item) => ({ ...item, count: counts[item.name] || 0 })) };
  });
  return { series, rows };
}

function mainCameraMedians(groups, value) {
  return groups.map(({ year, cameras }) => {
    const values = cameras.filter(isMainCamera).map(value).filter((item) => Number(item) > 0).map(Number);
    return { year, value: median(values), n: values.length };
  }).filter((row) => row.n >= TREND_MIN_MAIN);
}

function renderShareChart(target, share) {
  const w = 1100, h = 320, p = { l: 48, r: 8, t: 12, b: 48 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b, band = pw / share.rows.length, bar = Math.min(44, band * 0.56);
  const Y = (ratio) => h - p.b - ratio * ph;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Sensor manufacturer share of camera mappings by phone release year">`;
  [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
    const y = Y(ratio).toFixed(1);
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y}" dy=".32em" text-anchor="end">${ratio * 100}%</text>`;
  });
  share.rows.forEach((row, index) => {
    const cx = p.l + band * (index + 0.5), x = (cx - bar / 2).toFixed(1);
    let offset = 0;
    row.segments.filter((segment) => segment.count).forEach((segment) => {
      const ratio = segment.count / row.total, y = Y(offset + ratio), height = ratio * ph;
      offset += ratio;
      const title = `${row.year} · ${segment.name}`, detail = `${segment.count} of ${row.total} mappings (${number(ratio * 100, 1)}%)`;
      const rect = `<rect class="chart-dot" x="${x}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${Math.max(height - 1, 0.5).toFixed(1)}" rx="2" fill="${segment.color}" fill-opacity=".88"/>`;
      svg += segment.other
        ? `<g class="chart-point" tabindex="0" role="img" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail)}">${rect}</g>`
        : `<a class="chart-point" href="${esc(catalogUrl({ manufacturer: segment.name }))}" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail)}. Open ${esc(segment.name)} sensors in the catalog.">${rect}</a>`;
    });
    svg += `<text class="chart-tick" x="${cx.toFixed(1)}" y="${h - p.b + 18}" text-anchor="middle">${row.year}</text><text class="chart-tick trend-count" x="${cx.toFixed(1)}" y="${h - p.b + 33}" text-anchor="middle">n=${row.total}</text>`;
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
  qs(target).innerHTML = svg;
  qs('#share-legend').innerHTML = share.series.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.name)}</span>`).join('');
}

function renderTrendLine(target, rows, years, options) {
  if (!rows.length) {
    qs(target).innerHTML = '<div class="chart-empty">No main camera data for these years.</div>';
    return;
  }
  const w = 400, h = 240, p = { l: 52, r: 16, t: 14, b: 30 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b, first = years[0], last = years[years.length - 1];
  const values = rows.map((row) => row.value);
  let lo, hi, ticks;
  if (options.ticks) {
    lo = Math.min(...values, ...(options.domain || [])); hi = Math.max(...values, ...(options.domain || []));
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    ticks = options.ticks.filter((value) => value >= lo && value <= hi);
  } else ({ lo, hi, ticks } = axisScale([...values, ...(options.domain || [])], {}));
  const X = (year) => p.l + (last === first ? 0.5 : (year - first) / (last - first)) * pw;
  const Y = (value) => h - p.b - (value - lo) / (hi - lo) * ph;
  const format = options.format || ((value) => number(value, 2));
  const step = Math.ceil(years.length / 5);
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(options.label)} by phone release year">`;
  ticks.forEach((value) => {
    const y = Y(value).toFixed(1);
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y}" dy=".32em" text-anchor="end">${esc(format(value))}</text>`;
  });
  years.filter((year, index) => (years.length - 1 - index) % step === 0).forEach((year) => {
    svg += `<text class="chart-tick" x="${X(year).toFixed(1)}" y="${h - p.b + 18}" text-anchor="middle">${year}</text>`;
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${h - p.b}" y2="${h - p.b}"/>`;
  svg += `<polyline class="trend-line" points="${rows.map((row) => `${X(row.year).toFixed(1)},${Y(row.value).toFixed(1)}`).join(' ')}" stroke="${options.color}"/>`;
  rows.forEach((row) => {
    const x = X(row.year).toFixed(1), y = Y(row.value).toFixed(1);
    const title = `${row.year} · ${options.label}`, detail = `Median ${format(row.value)}${options.unit || ''} · ${row.n} main camera${row.n === 1 ? '' : 's'}`;
    svg += `<g class="chart-point" tabindex="0" role="img" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail)}"><circle class="chart-hit" cx="${x}" cy="${y}" r="8"/><circle class="chart-dot" cx="${x}" cy="${y}" r="4" fill="${options.color}" stroke="#fff" stroke-width="1"/></g>`;
  });
  qs(target).innerHTML = svg + '</svg>';
}

function renderTrends(phones) {
  const groups = yearGroups(phones);
  if (!groups.length) {
    qsa('.trend-dashboard .chart-area').forEach((chart) => { chart.innerHTML = '<div class="chart-empty">Not enough dated phone mappings yet.</div>'; });
    return;
  }
  const years = groups.map((group) => group.year);
  qs('#trend-range').textContent = ` (${years[0]}–${years[years.length - 1]})`;
  qs('#trend-min').textContent = TREND_MIN_MAPPINGS;
  renderShareChart('#share-chart', manufacturerShare(groups));
  renderTrendLine('#mp-trend-chart', mainCameraMedians(groups, (camera) => camera.resolution_mp), years, { label: 'Resolution (MP)', unit: ' MP', domain: [0], color: TREND_COLORS[0], format: (value) => number(value, 1) });
  renderTrendLine('#pitch-trend-chart', mainCameraMedians(groups, (camera) => camera.pixel_size_um), years, { label: 'Pixel pitch (µm)', unit: ' µm', domain: [0], color: TREND_COLORS[2] });
  renderTrendLine('#format-trend-chart', mainCameraMedians(groups, (camera) => parseOpticalFormat(camera.sensor_size)), years, { label: 'Optical format (inch)', color: TREND_COLORS[1], ticks: FORMAT_TICKS, domain: [1 / 3, 1], format: formatOptical });
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
    const responses = await Promise.all(['/data/sensors.json', '/data/stats.json', '/data/dashboard.json', '/data/phones.json'].map((url) => fetch(url)));
    if (responses.some((response) => !response.ok)) throw new Error('Overview data could not be loaded.');
    const [sensors, stats, dashboard, phones] = await Promise.all(responses.map((response) => response.json()));

    qs('#sensors').textContent = number(stats.sensors ?? sensors.length, 0);
    qs('#phones').textContent = number(stats.phones, 0);
    qs('#makers').textContent = number(stats.manufacturers, 0);
    qs('#mappings').textContent = number(stats.mappings, 0);

    const pitchMakers = makerTally(sensors).slice(0, 5).map(([name]) => name);
    const pitchMakerColors = new Map(pitchMakers.map((name, index) => [name, TREND_COLORS[index]]));
    qs('#pitch-legend').innerHTML = [...pitchMakers.map((name) => [name, pitchMakerColors.get(name)]), ['Other', OTHER_COLOR]].map(([name, color]) => `<span><i style="background:${color}"></i>${esc(name)}</span>`).join('');
    renderScatter('#pitch-chart', sensors.filter((row) => Number(row.pixel_size_um) > 0 && Number(row.resolution_mp) > 0), 'pixel_size_um', 'resolution_mp', 'Pixel pitch (µm)', 'Resolution (MP)', {
      logX: true,
      logY: true,
      xTicks: [0.5, 0.7, 1, 1.4, 2, 3, 5, 10],
      yTicks: [0.1, 0.3, 1, 3, 10, 30, 100, 200],
      group: true,
      makerColor: (name) => pitchMakerColors.get(name) || OTHER_COLOR,
      label: (row) => row.canonical_name,
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
    renderTrends(phones);
    qs('.chart-controls').addEventListener('click', (event) => {
      const button = event.target.closest('[data-dx-filter]');
      if (button) setProtocolFilter(button.dataset.dxFilter);
    });
  } catch (error) {
    document.querySelectorAll('.chart-area').forEach((chart) => { chart.innerHTML = '<div class="chart-empty">Could not load overview data. Try refreshing the page.</div>'; });
  }
}

init();
