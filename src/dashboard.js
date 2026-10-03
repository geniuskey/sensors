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
  return '/sensors/?' + params.toString();
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const palette = {};
function readPalette() {
  palette.trend = [1, 2, 3, 4, 5].map((index) => cssVar(`--series-${index}`));
  palette.other = cssVar('--series-other');
  palette.paper = cssVar('--paper');
  palette.empty = cssVar('--hover');
  palette.makers = Object.fromEntries(['Sony', 'Samsung', 'OmniVision', 'GalaxyCore', 'SmartSens'].map((name) => [name, cssVar(`--maker-${name.toLowerCase()}`)]));
}
readPalette();

function chartWidth(target, design) {
  const width = Math.floor(qs(target).clientWidth);
  return width && width < design * 0.75 ? Math.max(width, 280) : design;
}
const clip = (text, max) => text.length > max ? text.slice(0, max - 1) + '…' : text;
const yearText = (year, band) => band < 34 ? `’${String(year).slice(2)}` : String(year);
const labelEvery = (band, size) => Math.max(1, Math.ceil(size / band));

function markShape(shape, cx, cy, r, attrs) {
  if (shape !== 'diamond') return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" ${attrs}/>`;
  const d = r * 1.3;
  return `<path d="M${cx.toFixed(1)} ${(cy - d).toFixed(1)}L${(cx + d).toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${(cy + d).toFixed(1)}L${(cx - d).toFixed(1)} ${cy.toFixed(1)}Z" ${attrs}/>`;
}

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
  const name = sensor.canonical_name.toLowerCase().includes(String(sensor.manufacturer).toLowerCase()) ? sensor.canonical_name : `${sensor.manufacturer} ${sensor.canonical_name}`;
  return /^IMX/i.test(sensor.internal_code || '') ? `${name} (${sensor.internal_code})` : name;
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
    return `<a class="chart-point" href="${esc(href)}" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}. ${esc(detail.replaceAll('\n', '. '))}. Open matching catalog results."><circle class="chart-hit" cx="${x}" cy="${y}" r="${Math.max(r + 3, options.minHit || 8)}"/><circle class="chart-dot" cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${color}" fill-opacity=".75" stroke="${palette.paper}" stroke-width="1"/></a>`;
  }).join('');
}

function renderScatter(target, data, xKey, yKey, xLabel, yLabel, options = {}) {
  const valid = data.filter((point) => Number(point[xKey]) > 0 && Number(point[yKey]) > 0);
  if (!valid.length) {
    qs(target).innerHTML = '<div class="chart-empty">No records have both measurements.</div>';
    return;
  }

  const w = chartWidth(target, 680), narrow = w < 500, h = narrow ? Math.round(w * 0.86) : 340, p = { l: narrow ? 46 : 58, r: narrow ? 12 : 20, t: 20, b: 54 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b;
  const scaled = options.scaleData || valid;
  const sx = axisScale(scaled.map((point) => Number(point[xKey])), { log: options.logX, ticks: options.xTicks, step: options.xStep });
  const sy = axisScale(scaled.map((point) => Number(point[yKey])), { log: options.logY, ticks: options.yTicks, step: options.yStep });
  const X = (value) => p.l + (sx.t(value) - sx.lo) / (sx.hi - sx.lo) * pw;
  const Y = (value) => h - p.b - (sy.t(value) - sy.lo) / (sy.hi - sy.lo) * ph;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(yLabel)} by ${esc(xLabel)}">`;

  sy.ticks.forEach((value) => {
    const y = Y(value).toFixed(1);
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y}" dy=".32em" text-anchor="end">${tickLabel(value)}</text>`;
  });
  sx.ticks.filter((value, index) => !narrow || sx.ticks.length <= 6 || index % 2 === 0).forEach((value) => {
    const x = X(value).toFixed(1);
    svg += `<line class="chart-gridline chart-gridline-v" x1="${x}" x2="${x}" y1="${p.t}" y2="${h - p.b}"/><text class="chart-tick" x="${x}" y="${h - p.b + 18}" text-anchor="middle">${tickLabel(value)}</text>`;
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${h - p.b}" y2="${h - p.b}"/>`;

  if (options.group) svg += groupedPoints(valid, xKey, yKey, X, Y, { ...options, minHit: narrow ? 11 : 8 });
  else valid.forEach((point) => {
    const label = options.label(point);
    const href = options.href(point);
    const protocol = point.protocol || '';
    const color = options.pointColor ? options.pointColor(point) : palette.trend[0];
    const cx = X(Number(point[xKey])), cy = Y(Number(point[yKey]));
    const x = cx.toFixed(1), y = cy.toFixed(1);
    const r = (options.hitRadius || 7) + (narrow ? 3 : 0);
    const metadata = [`${number(point[xKey], 2)} ${xLabel} · ${number(point[yKey], 1)} ${yLabel}`, options.detail?.(point)].filter(Boolean).join('\n');
    svg += `<a class="chart-point${protocol ? ` chart-point-${esc(protocol.toLowerCase())}` : ''}" href="${esc(href)}" data-tooltip-title="${esc(label)}" data-tooltip-detail="${esc(metadata)}"${protocol ? ` data-protocol="${esc(protocol)}"` : ''} aria-label="${esc(label)}. ${esc(metadata.replaceAll('\n', '. '))}. Open matching catalog results."><circle class="chart-hit" cx="${x}" cy="${y}" r="${r}"/>${markShape(options.shape?.(point), cx, cy, options.dotRadius || 4, `class="chart-dot" fill="${color}" fill-opacity=".72" stroke="${palette.paper}" stroke-width="1"`)}</a>`;
  });

  if (options.legend) {
    const lx = w - p.r - 10;
    options.legend.slice().reverse().forEach((item, index) => {
      const x = lx - index * 56;
      svg += `<g aria-hidden="true">${markShape(item.shape, x - 30, p.t + 12, 5, `fill="${item.color}" fill-opacity=".72" stroke="${palette.paper}" stroke-width="1"`)}<text class="chart-legend" x="${x - 21}" y="${p.t + 12}" dy=".32em">${esc(item.label)}</text></g>`;
    });
  }

  svg += `<text class="chart-axis" x="${p.l + pw / 2}" y="${h - 10}" text-anchor="middle">${esc(xLabel)}</text><text class="chart-axis" transform="translate(${narrow ? 12 : 16} ${p.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text></svg>`;
  qs(target).innerHTML = svg;
}

const FORMAT_TICKS = [4, 3, 2.5, 2, 1.5, 1.3, 1].map((denominator) => 1 / denominator);

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
  const series = [...top.map((name, index) => ({ name, color: palette.trend[index] })), { name: 'Other', color: palette.other, other: true }];
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

function quantile(sorted, q) {
  const index = (sorted.length - 1) * q, low = Math.floor(index);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (index - low);
}

function cameraDistribution(groups, value) {
  return groups.map(({ key, cameras }) => {
    const bins = new Map();
    const values = [];
    cameras.forEach((camera) => {
      const raw = Number(value(camera));
      if (!(raw > 0)) return;
      const binKey = Number(raw.toFixed(4));
      values.push(binKey);
      const bin = bins.get(binKey) || { value: binKey, count: 0, sensors: new Map() };
      bin.count += 1;
      if (camera.sensor) bin.sensors.set(camera.sensor, (bin.sensors.get(camera.sensor) || 0) + 1);
      bins.set(binKey, bin);
    });
    const sorted = values.sort((a, b) => a - b);
    return { key, n: sorted.length, bins: [...bins.values()], q1: sorted.length ? quantile(sorted, 0.25) : null, median: sorted.length ? quantile(sorted, 0.5) : null, q3: sorted.length ? quantile(sorted, 0.75) : null };
  }).filter((row) => row.n >= TREND_MIN_MAIN);
}

function renderShareChart(target, share) {
  const w = chartWidth(target, 1100), h = w < 600 ? 260 : 320, p = { l: 42, r: 8, t: 12, b: 48 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b, band = pw / share.rows.length, bar = Math.min(44, band * 0.62), every = labelEvery(band, 34);
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
    if ((share.rows.length - 1 - index) % every === 0) svg += `<text class="chart-tick" x="${cx.toFixed(1)}" y="${h - p.b + 18}" text-anchor="middle">${yearText(row.year, band * every)}</text>` + (band >= 34 ? `<text class="chart-tick trend-count" x="${cx.toFixed(1)}" y="${h - p.b + 33}" text-anchor="middle">n=${row.total}</text>` : '');
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
  qs(target).innerHTML = svg;
  qs('#share-legend').innerHTML = share.series.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.name)}</span>`).join('');
}

function renderDistribution(target, rows, categories, options) {
  if (!rows.length) {
    qs(target).innerHTML = '<div class="chart-empty">No camera data for this view.</div>';
    return;
  }
  const w = chartWidth(target, 400), h = 260, p = { l: 52, r: 16, t: 16, b: 30 };
  const pw = w - p.l - p.r, ph = h - p.t - p.b;
  const t = options.log ? Math.log10 : (value) => value;
  const values = rows.flatMap((row) => row.bins.map((bin) => bin.value));
  let lo = t(Math.min(...values)), hi = t(Math.max(...values));
  if (hi === lo) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const ticks = options.ticks.filter((value) => t(value) >= lo && t(value) <= hi);
  const band = pw / categories.length;
  const X = (key) => p.l + band * (categories.indexOf(key) + 0.5);
  const Y = (value) => h - p.b - (t(value) - lo) / (hi - lo) * ph;
  const format = options.format || ((value) => number(value, 2));
  const unit = options.unit || '';
  const keyLabel = options.keyLabel || String;
  const maxCount = Math.max(...rows.flatMap((row) => row.bins.map((bin) => bin.count)));
  const rMax = Math.min(band * 0.45, options.rMax || 13);
  const radius = (count) => Math.max(2.5, rMax * Math.sqrt(count / maxCount));
  const step = Math.max(Math.ceil(categories.length / 5), labelEvery(band, 36));
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(options.label)} distribution">`;
  ticks.forEach((value) => {
    const y = Y(value).toFixed(1);
    svg += `<line class="chart-gridline" x1="${p.l}" x2="${w - p.r}" y1="${y}" y2="${y}"/><text class="chart-tick" x="${p.l - 8}" y="${y}" dy=".32em" text-anchor="end">${esc(format(value))}</text>`;
  });
  categories.filter((key, index) => (categories.length - 1 - index) % step === 0).forEach((key) => {
    svg += `<text class="chart-tick" x="${X(key).toFixed(1)}" y="${h - p.b + 18}" text-anchor="middle">${esc((band < 72 && options.shortLabel || keyLabel)(key))}</text>`;
  });
  svg += `<line class="chart-baseline" x1="${p.l}" x2="${w - p.r}" y1="${h - p.b}" y2="${h - p.b}"/>`;
  const half = band * 0.32;
  if (options.connect) {
    const upper = rows.map((row) => `${X(row.key).toFixed(1)},${Y(row.q3).toFixed(1)}`);
    const lower = rows.slice().reverse().map((row) => `${X(row.key).toFixed(1)},${Y(row.q1).toFixed(1)}`);
    svg += `<polygon class="trend-band" points="${[...upper, ...lower].join(' ')}" fill="${options.color}"/>`;
  } else rows.forEach((row) => {
    svg += `<rect class="trend-band" x="${(X(row.key) - half).toFixed(1)}" y="${Y(row.q3).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${Math.max(Y(row.q1) - Y(row.q3), 1).toFixed(1)}" rx="3" fill="${options.color}"/>`;
  });
  rows.forEach((row) => {
    const x = X(row.key).toFixed(1);
    row.bins.slice().sort((a, b) => b.count - a.count).forEach((bin) => {
      const y = Y(bin.value).toFixed(1), r = radius(bin.count), share = bin.count / row.n;
      const top = [...bin.sensors].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name} (${count})`).join(', ');
      const title = `${keyLabel(row.key)} · ${format(bin.value)}${unit}`;
      const detail = [`${bin.count} of ${row.n} ${options.noun} (${number(share * 100, 0)}%)`, top, `Median ${format(row.median)}${unit} · IQR ${format(row.q1)}–${format(row.q3)}`].filter(Boolean).join('\n');
      svg += `<g class="chart-point" tabindex="0" role="img" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail.replaceAll('\n', '. '))}"><circle class="chart-hit" cx="${x}" cy="${y}" r="${Math.max(r + 2, 6).toFixed(1)}"/><circle class="chart-dot" cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${options.color}" fill-opacity="${(0.18 + 0.72 * Math.sqrt(share)).toFixed(2)}" stroke="${palette.paper}" stroke-width=".5" stroke-opacity=".6"/></g>`;
    });
  });
  if (options.connect) svg += `<polyline class="trend-line" points="${rows.map((row) => `${X(row.key).toFixed(1)},${Y(row.median).toFixed(1)}`).join(' ')}" stroke="${options.color}"/>`;
  else rows.forEach((row) => {
    const y = Y(row.median).toFixed(1);
    svg += `<line class="trend-line" x1="${(X(row.key) - half).toFixed(1)}" x2="${(X(row.key) + half).toFixed(1)}" y1="${y}" y2="${y}" stroke="${options.color}"/>`;
  });
  qs(target).innerHTML = svg + '</svg>';
}

const METRICS = [
  { id: 'mp', label: 'Resolution (MP)', unit: ' MP', log: true, ticks: [2, 5, 12, 25, 50, 100, 200], series: 0, value: (camera) => camera.resolution_mp, format: (value) => number(value, 1) },
  { id: 'pitch', label: 'Pixel pitch (µm)', unit: ' µm', log: true, ticks: [0.6, 0.8, 1, 1.2, 1.6, 2, 2.4], series: 2, value: (camera) => camera.pixel_size_um },
  { id: 'format', label: 'Optical format (inch)', log: true, ticks: FORMAT_TICKS, series: 1, value: (camera) => parseOpticalFormat(camera.sensor_size), format: formatOptical }
];

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
  const mainGroups = groups.map(({ year, cameras }) => ({ key: year, cameras: cameras.filter(isMainCamera) }));
  METRICS.forEach((metric) => renderDistribution(`#${metric.id}-trend-chart`, cameraDistribution(mainGroups, metric.value), years, { ...metric, color: palette.trend[metric.series], connect: true, noun: 'main cameras' }));
}

const ROLES = [['Rear Main', 'Main', 'Main'], ['Rear Ultra-wide', 'Ultra-wide', 'UW'], ['Rear Telephoto', 'Telephoto', 'Tele'], ['Front Main', 'Front', 'Front']];

function renderRoleComparison(phones) {
  const cameras = phones.flatMap((phone) => phone.cameras || []);
  const groups = ROLES.map(([role]) => ({ key: role, cameras: cameras.filter((camera) => String(camera.role || '').split(/\s*\+\s*/).includes(role)) }));
  const labels = new Map(ROLES.map(([role, name]) => [role, name])), short = new Map(ROLES.map(([role, , abbr]) => [role, abbr]));
  METRICS.forEach((metric) => renderDistribution(`#role-${metric.id}-chart`, cameraDistribution(groups, metric.value), ROLES.map(([role]) => role), { ...metric, color: palette.trend[metric.series], keyLabel: (role) => labels.get(role), shortLabel: (role) => short.get(role), noun: 'cameras', rMax: 16 }));
}

function renderMakerMatrix(target, phones) {
  const counts = new Map(), makerTotals = new Map();
  phones.forEach((phone) => (phone.cameras || []).forEach((camera) => {
    if (!camera.sensor_manufacturer || !phone.oem) return;
    const row = counts.get(phone.oem) || new Map();
    row.set(camera.sensor_manufacturer, (row.get(camera.sensor_manufacturer) || 0) + 1);
    counts.set(phone.oem, row);
    makerTotals.set(camera.sensor_manufacturer, (makerTotals.get(camera.sensor_manufacturer) || 0) + 1);
  }));
  const total = (row) => [...row.values()].reduce((sum, count) => sum + count, 0);
  const oems = [...counts].sort((a, b) => total(b[1]) - total(a[1]) || a[0].localeCompare(b[0])).slice(0, 12);
  const w = chartWidth(target, 1100), narrow = w < 600;
  const makers = [...makerTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, narrow ? 4 : 6).map(([name]) => name);
  const columns = [...makers, 'Other'];
  const rowH = 30, p = narrow ? { l: 84, r: 40, t: 62, b: 8 } : { l: 120, r: 70, t: 30, b: 8 };
  const cellW = (w - p.l - p.r) / columns.length, h = p.t + oems.length * rowH + p.b;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Sensor manufacturer share by phone manufacturer">`;
  columns.forEach((name, index) => {
    const x = (p.l + cellW * (index + 0.5)).toFixed(1);
    svg += narrow ? `<text class="chart-axis" transform="translate(${x} ${p.t - 8}) rotate(-40)">${esc(name)}</text>` : `<text class="chart-axis" x="${x}" y="${p.t - 12}" text-anchor="middle">${esc(name)}</text>`;
  });
  svg += `<text class="chart-tick" x="${w - p.r + (narrow ? 8 : 12)}" y="${p.t - 12}">${narrow ? 'n' : 'Cameras'}</text>`;
  oems.forEach(([oem, row], rowIndex) => {
    const sum = total(row), y = p.t + rowIndex * rowH;
    const other = [...row].filter(([name]) => !makers.includes(name)).sort((a, b) => b[1] - a[1]);
    svg += `<text class="chart-axis" x="${p.l - (narrow ? 8 : 12)}" y="${y + rowH / 2}" dy=".32em" text-anchor="end">${esc(narrow ? clip(oem, 11) : oem)}</text><text class="chart-tick" x="${w - p.r + (narrow ? 8 : 12)}" y="${y + rowH / 2}" dy=".32em">${sum}</text>`;
    columns.forEach((name, index) => {
      const count = name === 'Other' ? other.reduce((acc, [, value]) => acc + value, 0) : row.get(name) || 0;
      const share = count / sum, x = p.l + cellW * index;
      const rect = `<rect class="chart-dot matrix-cell" x="${(x + 1).toFixed(1)}" y="${y + 1}" width="${(cellW - 2).toFixed(1)}" height="${rowH - 2}" rx="4" fill="${count ? palette.trend[0] : palette.empty}" fill-opacity="${count ? (0.08 + 0.87 * share).toFixed(2) : 1}"/>`;
      if (!count) { svg += rect; return; }
      const label = `<text class="matrix-label${share > 0.45 ? ' is-strong' : ''}" x="${(x + cellW / 2).toFixed(1)}" y="${y + rowH / 2}" dy=".32em" text-anchor="middle">${number(share * 100, 0)}%</text>`;
      const title = `${oem} · ${name}`;
      const detail = [`${count} of ${sum} camera mappings (${number(share * 100, 1)}%)`, name === 'Other' ? other.map(([maker, value]) => `${maker} ${value}`).join(' · ') : ''].filter(Boolean).join('\n');
      const href = '/phones/?' + new URLSearchParams(name === 'Other' ? { manufacturer: oem } : { manufacturer: oem, q: name }).toString();
      svg += `<a class="chart-point" href="${esc(href)}" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail.replaceAll('\n', '. '))}. Open matching phones.">${rect}${label}</a>`;
    });
  });
  qs(target).innerHTML = svg + '</svg>';
}

const slug = (text) => String(text ?? '').toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function sensorPath(sensor) {
  const index = sensor.canonical_id.indexOf(':');
  return '/sensors/' + slug(sensor.canonical_id.slice(0, index)) + '/' + slug(sensor.canonical_id.slice(index + 1)) + '/';
}

function renderSensorUsage(target, sensors) {
  const w = chartWidth(target, 1100), narrow = w < 600, limit = narrow ? 12 : 20;
  const used = sensors.filter((sensor) => phoneCount(sensor) > 0).sort(byUsage);
  if (!used.length) {
    qs(target).innerHTML = '<div class="chart-empty">No sensors are mapped to phones yet.</div>';
    return;
  }
  const totalMappings = used.reduce((sum, sensor) => sum + phoneCount(sensor), 0);
  const top = used.slice(0, limit);
  const perYear = top.map((sensor) => {
    const years = new Map();
    (sensor.phones || []).forEach((phone) => {
      const year = Number(phone.year);
      if (!year) return;
      const entry = years.get(year) || { count: 0, roles: new Map() };
      entry.count += 1;
      entry.roles.set(phone.role || 'Unspecified', (entry.roles.get(phone.role || 'Unspecified') || 0) + 1);
      years.set(year, entry);
    });
    return years;
  });
  const allYears = perYear.flatMap((years) => [...years.keys()]);
  const first = Math.min(...allYears), last = Math.max(...allYears);
  const years = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const rowH = 26, p = narrow ? { l: 112, r: 34, t: 26, b: 8 } : { l: 190, r: Math.min(250, Math.round(w * 0.23)), t: 26, b: 8 };
  const band = (w - p.l - p.r) / years.length, h = p.t + top.length * rowH + p.b, every = labelEvery(band, 34);
  const X = (year) => (p.l + band * (year - first + 0.5)).toFixed(1);
  const maxYear = Math.max(...perYear.flatMap((map) => [...map.values()].map((entry) => entry.count)));
  const rMax = Math.min(band * 0.45, rowH * 0.48);
  const barX = w - p.r + 24, barW = p.r - 110, maxCount = phoneCount(top[0]);
  let cumulative = 0;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Most-used sensors by phone release year">`;
  years.forEach((year, index) => {
    svg += `<line class="chart-gridline chart-gridline-v" x1="${X(year)}" x2="${X(year)}" y1="${p.t - 6}" y2="${h - p.b}"/>` + ((years.length - 1 - index) % every === 0 ? `<text class="chart-tick" x="${X(year)}" y="${p.t - 12}" text-anchor="middle">${yearText(year, band * every)}</text>` : '');
  });
  svg += narrow ? `<text class="chart-tick" x="${w - 4}" y="${p.t - 12}" text-anchor="end">n</text>` : `<text class="chart-tick" x="${barX}" y="${p.t - 12}">Phones</text><text class="chart-tick" x="${w - 8}" y="${p.t - 12}" text-anchor="end">Cumulative</text>`;
  top.forEach((sensor, index) => {
    const y = p.t + index * rowH + rowH / 2, color = palette.makers[sensor.manufacturer] || palette.other, map = perYear[index], href = sensorPath(sensor);
    const active = [...map.keys()];
    cumulative += phoneCount(sensor);
    if (active.length) svg += `<line class="usage-span" x1="${X(Math.min(...active))}" x2="${X(Math.max(...active))}" y1="${y}" y2="${y}" stroke="${color}"/>`;
    svg += `<a class="usage-label" href="${esc(href)}"><text class="chart-axis" x="${p.l - 12}" y="${y}" dy=".32em" text-anchor="end">${esc(clip(sensorLabel(sensor), narrow ? 16 : 26))}</text><title>${esc(sensorLabel(sensor))}</title></a>`;
    [...map].sort((a, b) => b[1].count - a[1].count).forEach(([year, entry]) => {
      const r = Math.max(2.5, rMax * Math.sqrt(entry.count / maxYear));
      const title = `${sensorLabel(sensor)} · ${year}`;
      const detail = `${entry.count} phone${entry.count === 1 ? '' : 's'}\n` + [...entry.roles].sort((a, b) => b[1] - a[1]).map(([role, count]) => `${role} ${count}`).join(' · ');
      svg += `<a class="chart-point" href="${esc(href)}" data-tooltip-title="${esc(title)}" data-tooltip-detail="${esc(detail)}" aria-label="${esc(title)}: ${esc(detail.replaceAll('\n', '. '))}. Open sensor details."><circle class="chart-hit" cx="${X(year)}" cy="${y}" r="${Math.max(r + 2, 7).toFixed(1)}"/><circle class="chart-dot" cx="${X(year)}" cy="${y}" r="${r.toFixed(1)}" fill="${color}" fill-opacity=".8" stroke="${palette.paper}" stroke-width=".75"/></a>`;
    });
    if (narrow) { svg += `<text class="chart-tick" x="${w - 4}" y="${y}" dy=".32em" text-anchor="end">${phoneCount(sensor)}</text>`; return; }
    const length = Math.max(2, barW * phoneCount(sensor) / maxCount);
    svg += `<rect class="usage-bar" x="${barX}" y="${y - 6}" width="${length.toFixed(1)}" height="12" rx="3" fill="${color}"/><text class="chart-tick" x="${(barX + length + 6).toFixed(1)}" y="${y}" dy=".32em">${phoneCount(sensor)}</text><text class="chart-tick trend-count" x="${w - 8}" y="${y}" dy=".32em" text-anchor="end">${number(cumulative / totalMappings * 100, 0)}%</text>`;
  });
  qs(target).innerHTML = svg + '</svg>';
  const share = (count) => number(used.slice(0, count).reduce((sum, sensor) => sum + phoneCount(sensor), 0) / totalMappings * 100, 0);
  const single = used.filter((sensor) => phoneCount(sensor) === 1).length;
  qs('#usage-summary').textContent = `The top 3 sensors account for ${share(3)}% and the top ${top.length} for ${share(top.length)}% of ${number(totalMappings, 0)} phone mappings; ${single} of ${used.length} mapped sensors appear in a single phone.`;
  const makers = [...new Set(top.map((sensor) => palette.makers[sensor.manufacturer] ? sensor.manufacturer : 'Other'))];
  qs('#usage-legend').innerHTML = makers.map((name) => `<span><i style="background:${palette.makers[name] || palette.other}"></i>${esc(name)}</span>`).join('');
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
    if (point && !point.hasAttribute('hidden')) showTooltip(point);
  });
  area.addEventListener('pointerout', (event) => {
    const point = event.target.closest('.chart-point');
    if (point && event.pointerType !== 'touch' && !point.contains(event.relatedTarget)) hideTooltip();
  });
  area.addEventListener('focusin', (event) => {
    const point = event.target.closest('.chart-point');
    if (point && !point.hasAttribute('hidden')) showTooltip(point);
  });
  area.addEventListener('focusout', (event) => {
    if (event.target.closest('.chart-point')) hideTooltip();
  });
});
let touchPoint = null, lastPointer = 'mouse';
addEventListener('pointerdown', (event) => { lastPointer = event.pointerType; }, true);
qsa('.chart-area').forEach((area) => area.addEventListener('click', (event) => {
  const point = event.target.closest('a.chart-point');
  if (!point || lastPointer !== 'touch' || point === touchPoint) return;
  event.preventDefault();
  touchPoint = point;
  showTooltip(point);
}));
document.addEventListener('click', (event) => { if (!event.target.closest('.chart-point')) { touchPoint = null; hideTooltip(); } });
window.addEventListener('scroll', () => { touchPoint = null; hideTooltip(); }, true);
window.addEventListener('resize', hideTooltip);

async function init() {
  try {
    const responses = await Promise.all(['/data/sensors.json', '/data/stats.json', '/data/phones.json'].map((url) => fetch(url)));
    if (responses.some((response) => !response.ok)) throw new Error('Overview data could not be loaded.');
    const [sensors, stats, phones] = await Promise.all(responses.map((response) => response.json()));

    qs('#sensors').textContent = number(stats.sensors ?? sensors.length, 0);
    qs('#phones').textContent = number(stats.phones, 0);
    qs('#makers').textContent = number(stats.manufacturers, 0);
    qs('#mappings').textContent = number(stats.mappings, 0);

    const pitchMakers = makerTally(sensors).slice(0, 5).map(([name]) => name);
    const pitchSensors = sensors.filter((row) => Number(row.pixel_size_um) > 0 && Number(row.resolution_mp) > 0);
    const oemWeight = new Map();
    phones.forEach((row) => row.oem && oemWeight.set(row.oem, (oemWeight.get(row.oem) || 0) + 1));
    const topOems = [...oemWeight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([name]) => name);
    const filters = {
      sensor: { label: 'Sensor', names: pitchMakers, selection: new Set(), color: (name) => pitchMakers.includes(name) ? palette.makers[name] || palette.trend[pitchMakers.indexOf(name)] : palette.other },
      oem: { label: 'Phone', names: topOems, selection: new Set() }
    };
    const matches = (kind, names) => {
      const { names: listed, selection } = filters[kind];
      return !selection.size || [...names].some((name) => selection.has(listed.includes(name) ? name : 'Other'));
    };
    const sensorOems = new Map();
    phones.forEach((phone) => phone.cameras.forEach((camera) => sensorOems.set(camera.sensor_id, (sensorOems.get(camera.sensor_id) || new Set()).add(phone.oem))));
    const renderPitch = () => {
      hideTooltip();
      Object.entries(filters).forEach(([kind, { selection }]) => {
        qsa(`.maker-filters[data-kind="${kind}"]`).forEach((row) => row.classList.toggle('has-selection', selection.size > 0));
        qsa(`[data-kind="${kind}"] [data-value]`).forEach((button) => button.setAttribute('aria-pressed', String(selection.has(button.dataset.value))));
      });
      renderScatter('#pitch-chart', pitchSensors.filter((row) => matches('sensor', [row.manufacturer]) && matches('oem', sensorOems.get(row.canonical_id) || [])), 'pixel_size_um', 'resolution_mp', 'Pixel pitch (µm)', 'Resolution (MP)', {
        logX: true,
        logY: true,
        xTicks: [0.5, 0.7, 1, 1.4, 2, 3, 5, 10],
        yTicks: [0.1, 0.3, 1, 3, 10, 30, 100, 200],
        scaleData: pitchSensors,
        group: true,
        makerColor: filters.sensor.color,
        label: (row) => row.canonical_name,
        href: (row) => catalogUrl({ sensor: row.canonical_id }),
        hitRadius: 8,
        dotRadius: 3.5
      });
    };
    const filterRows = () => Object.entries(filters).map(([kind, { label, names, color }]) => `<div class="maker-filters" data-kind="${kind}" role="group" aria-label="Filter by ${kind === 'oem' ? 'phone' : 'sensor'} manufacturer"><span class="maker-filters-label">${label}</span>` + [...names, 'Other'].map((name) => `<button class="maker-filter" type="button" data-value="${esc(name)}" aria-pressed="false">${color ? `<i style="background:${color(name)}"></i>` : ''}${esc(name)}</button>`).join('') + `<button class="maker-filter-clear" type="button" data-clear aria-label="Show all ${kind === 'oem' ? 'phone' : 'sensor'} makers" title="Show all">×</button></div>`).join('');
    qsa('.landscape-filters').forEach((panel) => {
      panel.innerHTML = filterRows();
      panel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-value], [data-clear]');
        if (!button) return;
        const { names, selection } = filters[button.closest('[data-kind]').dataset.kind];
        if (button.dataset.value == null) selection.clear();
        else if (!selection.delete(button.dataset.value)) selection.add(button.dataset.value);
        if (selection.size === names.length + 1) selection.clear();
        renderPitch();
      });
    });
    const renderAll = () => {
      renderPitch();
      renderTrends(phones);
      renderMakerMatrix('#matrix-chart', phones);
      renderSensorUsage('#usage-chart', sensors);
      renderRoleComparison(phones);
    };
    renderAll();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readPalette();
      qsa('.landscape-filters').forEach((panel) => { panel.innerHTML = filterRows(); });
      renderAll();
    });
    let lastWidth = innerWidth, resizeTimer = 0;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (Math.abs(innerWidth - lastWidth) < 40) return;
        lastWidth = innerWidth;
        renderAll();
      }, 200);
    });
  } catch (error) {
    document.querySelectorAll('.chart-area').forEach((chart) => { chart.innerHTML = '<div class="chart-empty">Could not load overview data. Try refreshing the page.</div>'; });
  }
}

init();
