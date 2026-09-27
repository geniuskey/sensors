const root = document.querySelector('#size-compare');
const MAX = 6;
const STORAGE_KEY = 'sensor-db:compare-list';
const DISPLAY_STORAGE_KEY = 'sensor-db:display-calibration';
const COLORS = ['--series-1', '--series-5', '--series-3', '--series-4', '--series-2', '--series-6'];
const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const number = (value, digits = 1) => value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const readStoredIds = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string'))].slice(0, MAX) : [];
  } catch (_) { return []; }
};
const readDisplayCalibration = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (_) { return null; }
};
const saveStoredIds = (ids) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (_) {} };
const area = (sensor) => sensor.w * sensor.h;
const dims = (sensor) => `${number(sensor.w, 2)} × ${number(sensor.h, 2)} mm`;
const format = (sensor) => sensor.size ? (/^\d+(\.\d+)?$/.test(sensor.size) ? `${sensor.size}"` : sensor.size) : '—';
const label = (sensor) => norm(sensor.name).startsWith(norm(sensor.maker)) ? sensor.name : `${sensor.maker} ${sensor.name}`;
const encodeId = (id) => encodeURIComponent(id).replace(/%3A/gi, ':');
const display = (value) => Array.isArray(value) ? (value.filter(Boolean).join(', ') || '—') : (value == null || value === '' ? '—' : String(value));

function ratioText(sensor, reference) {
  if (sensor === reference) return 'Reference';
  const ratio = area(sensor) / area(reference);
  return `${number(ratio, ratio >= 10 ? 1 : 2)}× area`;
}

function overlaySvg(rows, reference) {
  const pad = 16, bar = 34;
  const maxW = Math.max(...rows.map((row) => row.w)), maxH = Math.max(...rows.map((row) => row.h));
  const s = Math.min((640 - pad * 2) / maxW, 400 / maxH);
  const W = Math.round(maxW * s + pad * 2), H = Math.round(maxH * s + pad * 2 + bar);
  const cx = W / 2, cy = pad + maxH * s / 2;
  const scale = maxW > 12 ? 5 : maxW > 5 ? 2 : 1;
  const summary = rows.map((row) => `${label(row)} ${dims(row)}, ${ratioText(row, reference).toLowerCase()}`).join('; ');
  let svg = `<svg class="sc-overlay" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Sensors drawn to scale, centered on each other: ${summary}`)}">`;
  svg += `<line class="sc-axis" x1="${pad}" x2="${W - pad}" y1="${cy}" y2="${cy}"/><line class="sc-axis" x1="${cx}" x2="${cx}" y1="${pad}" y2="${pad + maxH * s}"/>`;
  const seen = new Set();
  rows.slice().sort((a, b) => area(b) - area(a)).forEach((row) => {
    const w = row.w * s, h = row.h * s, color = `var(${row.color})`, key = `${row.w}x${row.h}`;
    svg += `<rect class="sc-rect${seen.has(key) ? ' is-duplicate' : ''}" data-id="${esc(row.id)}" x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${color};stroke:${color}"/>`;
    seen.add(key);
  });
  const by = H - bar / 2 - 4;
  svg += `<g class="sc-scale" aria-hidden="true"><path d="M${pad} ${by - 4}v4h${(scale * s).toFixed(1)}v-4"/><text x="${(pad + scale * s + 8).toFixed(1)}" y="${by}" dy=".32em">${scale} mm</text></g>`;
  return svg + '</svg>';
}

function sideItems(rows, reference, columnWidth, pixelsPerMm = null) {
  const maxW = Math.max(...rows.map((row) => row.w)), maxH = Math.max(...rows.map((row) => row.h));
  const s = pixelsPerMm || Math.min((columnWidth - 48) / maxW, 160 / maxH);
  return rows.map((row) => {
    const w = row.w * s, h = row.h * s, color = `var(${row.color})`;
    const rect = pixelsPerMm
      ? `<rect class="sc-rect sc-rect-life" x=".5" y=".5" width="${(w - 1).toFixed(2)}" height="${(h - 1).toFixed(2)}" style="fill:${color};stroke:${color}"/>`
      : `<rect class="sc-rect" x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${color};stroke:${color}"/>`;
    const box = pixelsPerMm ? `0 0 ${w.toFixed(2)} ${h.toFixed(2)}` : `-1 -1 ${(w + 2).toFixed(1)} ${(h + 2).toFixed(1)}`;
    return `<figure class="sc-side-item" data-id="${esc(row.id)}"><svg width="${pixelsPerMm ? w.toFixed(2) : w.toFixed(0)}" height="${pixelsPerMm ? h.toFixed(2) : h.toFixed(0)}" viewBox="${box}" role="img" aria-label="${esc(`${label(row)}, ${dims(row)}`)}">${rect}</svg><figcaption><strong>${esc(label(row))}</strong><span>${esc(dims(row))}</span><span>${esc(ratioText(row, reference))}</span></figcaption></figure>`;
  }).join('');
}

function init(sensors) {
  const byId = new Map(sensors.map((row) => [row.id, row]));
  const params = new URLSearchParams(location.search);
  let ids = (params.has('ids') ? (params.get('ids') || '').split(',') : readStoredIds()).map((id) => id.trim()).filter((id) => byId.has(id));
  ids = [...new Set(ids)].slice(0, MAX);
  if (params.has('ids')) saveStoredIds(ids);
  let calibration = readDisplayCalibration();
  const displayMetrics = () => {
    if (!calibration) return null;
    const diagonal = Number(calibration.diagonal), width = Number(calibration.width), height = Number(calibration.height);
    const dpr = Number(window.devicePixelRatio) || 1;
    if (!(diagonal > 0 && width > 0 && height > 0)) return null;
    const ppi = Math.hypot(width, height) / diagonal;
    return { ppi, dpr, pixelsPerMm: ppi / (25.4 * dpr) };
  };
  let mode = params.get('view') === 'life' ? 'life' : params.get('view') === 'overlay' ? 'overlay' : 'side';
  if (mode === 'life' && !displayMetrics()) mode = 'side';
  let options = [], active = -1;

  root.innerHTML = `<div class="sc-toolbar">
      <div class="sc-picker"><label class="field-label" for="sc-input">Add a sensor <span class="facet-hint" id="sc-count"></span></label>
        <div class="sc-picker-field"><input id="sc-input" class="text-field" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sc-options" autocomplete="off" spellcheck="false" placeholder="e.g. IMX989, HP2, LYT-900"><div id="sc-options" class="site-search-results sc-options" role="listbox" aria-label="Matching sensors" hidden></div></div>
      </div>
      <div class="chart-controls sc-mode" role="group" aria-label="Layout"><button class="chart-filter" type="button" data-mode="side">Side by side</button><button class="chart-filter" type="button" data-mode="overlay">Overlay</button><button class="chart-filter" type="button" data-mode="life" title="Enter display dimensions to estimate physical size">Life size</button></div>
      <button class="button button-quiet sc-clear" type="button" data-clear-list>Clear list</button>
      <p id="sc-list-status" class="sr-only" role="status" aria-live="polite"></p>
    </div>
    <details class="sc-calibration" id="sc-calibration"><summary>Display settings for life-size view</summary><div class="sc-calibration-fields">
      <label>Monitor diagonal <span class="sc-calibration-input"><input id="sc-display-diagonal" class="text-field" type="number" min="1" max="100" step="0.1" inputmode="decimal" placeholder="27"><span>in</span></span></label>
      <label>Native resolution <span class="sc-resolution-inputs"><input id="sc-display-width" class="text-field" type="number" min="320" step="1" inputmode="numeric" placeholder="2560" aria-label="Display resolution width"><span>×</span><input id="sc-display-height" class="text-field" type="number" min="240" step="1" inputmode="numeric" placeholder="1440" aria-label="Display resolution height"><span>px</span></span></label>
      <div class="sc-calibration-action"><button class="button button-secondary" type="button" data-save-display>Use display settings</button><p id="sc-calibration-status" role="status" aria-live="polite"></p></div>
    </div></details>
    <ul class="sc-chips" aria-label="Selected sensors"></ul>
    <div class="sc-stage" aria-live="polite"></div>
    <p class="sc-note">Sensor outlines are drawn at the same scale. The comparison table below lists each specification by sensor.</p>
    <div class="sc-table-wrap"><table class="sc-table"><caption class="sr-only">Sensor specification comparison</caption><thead></thead><tbody></tbody></table></div>`;
  const input = root.querySelector('#sc-input'), list = root.querySelector('#sc-options'), stage = root.querySelector('.sc-stage'), tableWrap = root.querySelector('.sc-table-wrap');
  const diagonalInput = root.querySelector('#sc-display-diagonal'), widthInput = root.querySelector('#sc-display-width'), heightInput = root.querySelector('#sc-display-height');
  if (calibration) {
    diagonalInput.value = calibration.diagonal ?? '';
    widthInput.value = calibration.width ?? '';
    heightInput.value = calibration.height ?? '';
  }

  const rows = () => ids.map((id, index) => ({ ...byId.get(id), color: COLORS[index % COLORS.length] }));
  const syncUrl = () => {
    const url = new URL(location.href);
    if (ids.length) url.searchParams.set('ids', ids.map(encodeId).join(','));
    else url.searchParams.delete('ids');
    if (mode !== 'side') url.searchParams.set('view', mode);
    else url.searchParams.delete('view');
    history.replaceState(null, '', url);
  };
  const renderStage = () => {
    const current = rows();
    if (!current.length) { stage.classList.remove('is-side', 'is-overlay', 'is-life-size', 'has-sensors', 'has-focus'); stage.innerHTML = '<div class="chart-empty"><strong>Your compare list is empty.</strong><span>Add sensors from the catalog, or search for one above.</span><a class="button button-secondary" href="/sensors/">Browse sensor catalog</a></div>'; return; }
    stage.classList.add('has-sensors');
    stage.classList.toggle('is-overlay', mode === 'overlay');
    stage.classList.toggle('is-side', mode !== 'overlay');
    stage.classList.toggle('is-life-size', mode === 'life');
    if (mode === 'overlay') { stage.innerHTML = overlaySvg(current, current[0]); return; }
    const table = root.querySelector('.sc-table'), widths = [...table.querySelectorAll('thead th')].map((th) => th.getBoundingClientRect().width);
    stage.innerHTML = `<div class="sc-side-track" style="width:${table.getBoundingClientRect().width}px;grid-template-columns:${widths.map((width) => `${width}px`).join(' ')}"><span aria-hidden="true"></span>${sideItems(current, current[0], Math.min(...widths.slice(1)), mode === 'life' ? displayMetrics()?.pixelsPerMm : null)}</div>`;
    stage.scrollLeft = tableWrap.scrollLeft;
  };
  const render = () => {
    const current = rows(), reference = current[0];
    const metrics = displayMetrics();
    root.querySelector('#sc-count').textContent = `${ids.length} of ${MAX}`;
    root.querySelector('#sc-list-status').textContent = `${ids.length} of ${MAX} sensors in your compare list`;
    root.querySelector('[data-clear-list]').disabled = !ids.length;
    input.disabled = ids.length >= MAX;
    input.placeholder = ids.length >= MAX ? 'Remove a sensor to add another' : 'e.g. IMX989, HP2, LYT-900';
    root.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
      if (button.dataset.mode === 'life') {
        button.title = metrics ? 'Approximate sensor dimensions at physical size on this display' : 'Enter display dimensions below first';
      }
    });
    root.querySelector('#sc-calibration-status').textContent = metrics
      ? `Estimated ${number(metrics.ppi, 1)} PPI · ${number(metrics.pixelsPerMm, 2)} CSS px/mm at browser scale ${number(metrics.dpr, 2)}. Actual size may vary with display scaling.`
      : 'Enter the monitor diagonal and native resolution. Browser scale is detected automatically.';
    root.querySelector('.sc-chips').innerHTML = current.length ? current.map((row) => `<li class="sc-chip" draggable="true" data-id="${esc(row.id)}"><i class="sc-swatch" style="background:var(${row.color})" aria-hidden="true"></i><span class="sc-chip-copy"><a href="${esc(row.url)}" draggable="false">${esc(label(row))}</a><span>${esc(format(row))} · ${esc(dims(row))} · ${esc(ratioText(row, reference))}</span></span><button class="sc-remove" type="button" data-remove="${esc(row.id)}" aria-label="Remove ${esc(label(row))}">×</button></li>`).join('') : '<li class="sc-empty">Your list is empty. <a href="/sensors/">Browse sensors to add items.</a></li>';
    const specs = [
      { name: 'Manufacturer', value: (row) => row.maker },
      { name: 'Marketing name', value: (row) => row.marketing_name },
      { name: 'Resolution', value: (row) => row.mp == null ? '—' : `${number(row.mp)} MP`, numeric: true },
      { name: 'Resolution pixels', value: (row) => row.resolution_px },
      { name: 'Optical format', value: (row) => format(row) },
      { name: 'Active dimensions', value: (row) => dims(row), numeric: true },
      { name: 'Active area', value: (row) => `${number(row.area ?? area(row), 1)} mm²`, numeric: true },
      { name: 'Area vs first sensor', value: (row) => ratioText(row, reference), numeric: true },
      { name: 'Pixel pitch', value: (row) => row.pitch == null || row.pitch === '' ? '—' : `${number(row.pitch, 2)} µm`, numeric: true },
      { name: 'Pixel binning', value: (row) => row.pixel_binning },
      { name: 'Camera roles', value: (row) => row.roles },
      { name: 'Mapped phones', value: (row) => `${number(row.phones || 0, 0)} phones`, numeric: true },
      { name: 'First phone year', value: (row) => row.first_year, numeric: true },
      { name: 'Latest phone year', value: (row) => row.latest_year, numeric: true },
      { name: 'Internal code', value: (row) => row.internal_code },
      { name: 'Autofocus', value: (row) => row.af },
      { name: 'HDR', value: (row) => row.hdr },
      { name: 'Color filter array', value: (row) => row.cfa },
      { name: 'Full-well capacity', value: (row) => row.fwc },
      { name: 'Two-layer transistor', value: (row) => row.two_layer_transistor },
      { name: 'Transfer gate', value: (row) => row.transfer_gate },
      { name: 'First listed', value: (row) => row.first_listed_year, numeric: true },
      { name: 'Data confidence', value: (row) => row.confidence },
      { name: 'Aliases', value: (row) => row.aliases },
      { name: 'Example phones', value: (row) => row.example_phones },
      { name: 'Notes', value: (row) => row.notes }
    ];
    const table = root.querySelector('.sc-table');
    table.style.minWidth = `${180 + current.length * 180}px`;
    table.querySelector('thead').innerHTML = `<tr><th scope="col">Specification</th>${current.map((row) => `<th scope="col"><span class="sc-table-name"><i class="sc-swatch" style="background:var(${row.color})" aria-hidden="true"></i><span><span class="compare-maker">${esc(row.maker)}</span><a href="${esc(row.url)}">${esc(label(row))}</a></span></span></th>`).join('')}</tr>`;
    table.querySelector('tbody').innerHTML = specs.map((spec) => `<tr><th scope="row">${esc(spec.name)}</th>${current.map((row) => `<td${spec.numeric ? ' class="num"' : ''}>${esc(display(spec.value(row)))}</td>`).join('')}</tr>`).join('');
    root.querySelector('.sc-table-wrap').hidden = !current.length;
    root.querySelector('.sc-note').textContent = mode === 'life' && metrics
      ? `Approximate life-size preview · ${number(calibration.width, 0)} × ${number(calibration.height, 0)} px · ${number(calibration.diagonal, 1)}″ display.`
      : 'Sensor outlines are drawn at the same scale. The comparison table below lists each specification by sensor.';
    renderStage();
    syncUrl();
  };
  const closeList = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = (index) => {
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    active = index;
    if (index >= 0) { input.setAttribute('aria-activedescendant', options[index].id); options[index].scrollIntoView({ block: 'nearest' }); }
  };
  const suggest = () => {
    const query = norm(input.value);
    if (!query) { closeList(); return; }
    const matches = sensors.filter((row) => !ids.includes(row.id)).map((row) => {
      const name = norm(row.name), full = norm(row.maker + row.name), hay = full + norm(row.id);
      const score = name.startsWith(query) ? 3 : full.startsWith(query) ? 2 : hay.includes(query) ? 1 : 0;
      return [score, row];
    }).filter(([score]) => score).sort((a, b) => b[0] - a[0] || (b[1].phones || 0) - (a[1].phones || 0) || area(b[1]) - area(a[1])).slice(0, 10).map(([, row]) => row);
    list.innerHTML = matches.length ? matches.map((row, index) => `<div class="site-search-option" id="sc-opt-${index}" role="option" aria-selected="false" data-add="${esc(row.id)}"><span class="site-search-name">${esc(label(row))}</span><span class="site-search-meta">${esc([format(row), dims(row), row.mp ? number(row.mp) + ' MP' : '', `${row.phones || 0} phones`].filter(Boolean).join(' · '))}</span></div>`).join('') : '<div class="site-search-empty">No matching sensors.</div>';
    options = [...list.querySelectorAll('[role="option"]')];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };
  const add = (id) => {
    if (!byId.has(id) || ids.includes(id)) return;
    if (ids.length >= MAX) { root.querySelector('#sc-list-status').textContent = `Your compare list is full. Remove a sensor to add another.`; return; }
    ids.push(id);
    saveStoredIds(ids);
    input.value = '';
    closeList();
    render();
    if (!input.disabled) input.focus();
  };
  const saveDisplaySettings = () => {
    const diagonal = Number(diagonalInput.value), width = Number(widthInput.value), height = Number(heightInput.value);
    if (!(diagonal > 0 && width > 0 && height > 0)) {
      root.querySelector('#sc-calibration-status').textContent = 'Enter a valid monitor diagonal, width and height.';
      root.querySelector('#sc-calibration').open = true;
      return;
    }
    calibration = { diagonal, width, height };
    try { localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(calibration)); } catch (_) {}
    mode = 'life';
    root.querySelector('#sc-calibration').open = false;
    render();
  };

  input.addEventListener('input', suggest);
  input.addEventListener('focus', () => { if (input.value) suggest(); });
  input.addEventListener('blur', () => setTimeout(closeList, 120));
  input.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length && !list.hidden) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active >= 0 ? active : 0];
      if (option && !list.hidden) add(option.dataset.add);
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      closeList();
    }
  });
  list.addEventListener('pointerdown', (event) => {
    const option = event.target.closest('[data-add]');
    event.preventDefault();
    if (option) add(option.dataset.add);
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-save-display]')) { saveDisplaySettings(); return; }
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const index = ids.indexOf(remove.dataset.remove);
      ids.splice(index, 1);
      saveStoredIds(ids);
      render();
      const next = root.querySelectorAll('[data-remove]')[Math.min(index, ids.length - 1)];
      (next || input).focus();
      return;
    }
    if (event.target.closest('[data-clear-list]')) { ids = []; saveStoredIds(ids); render(); return; }
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton && modeButton.dataset.mode !== mode) {
      if (modeButton.dataset.mode === 'life' && !displayMetrics()) {
        root.querySelector('#sc-calibration').open = true;
        root.querySelector('#sc-calibration-status').textContent = 'Enter the monitor diagonal and native resolution to use life-size view.';
        diagonalInput.focus();
        return;
      }
      mode = modeButton.dataset.mode;
      render();
    }
  });
  const chips = root.querySelector('.sc-chips');
  let dragged = null;
  chips.addEventListener('dragstart', (event) => {
    dragged = event.target.closest('.sc-chip');
    if (!dragged) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.dataset.id);
    requestAnimationFrame(() => dragged?.classList.add('is-dragging'));
  });
  chips.addEventListener('dragover', (event) => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target.closest('.sc-chip');
    if (!target || target === dragged) return;
    const items = [...chips.children];
    chips.insertBefore(dragged, items.indexOf(dragged) < items.indexOf(target) ? target.nextSibling : target);
  });
  chips.addEventListener('drop', (event) => { if (dragged) event.preventDefault(); });
  chips.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged = null;
    const order = [...chips.querySelectorAll('.sc-chip')].map((chip) => chip.dataset.id);
    if (order.join() === ids.join()) return;
    ids = order;
    saveStoredIds(ids);
    render();
  });
  const highlight = (id) => {
    stage.classList.toggle('has-focus', Boolean(id));
    stage.querySelectorAll('[data-id]').forEach((node) => node.classList.toggle('is-focus', node.dataset.id === id));
  };
  root.addEventListener('pointerover', (event) => { const item = event.target.closest('.sc-chip[data-id], .sc-table tr[data-id]'); highlight(item ? item.dataset.id : null); });
  root.addEventListener('pointerleave', () => highlight(null));
  root.addEventListener('focusin', (event) => { const item = event.target.closest('.sc-chip[data-id], .sc-table tr[data-id]'); highlight(item ? item.dataset.id : null); });
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    ids = readStoredIds().filter((id) => byId.has(id)).slice(0, MAX);
    render();
  });
  let lastWidth = 0;
  new ResizeObserver(() => {
    if (mode === 'overlay' || Math.abs(tableWrap.clientWidth - lastWidth) < 1) return;
    lastWidth = tableWrap.clientWidth;
    renderStage();
  }).observe(tableWrap);
  tableWrap.addEventListener('scroll', () => { stage.scrollLeft = tableWrap.scrollLeft; });
  window.addEventListener('resize', () => { if (mode === 'life') render(); });
  render();
}

if (root) {
  root.innerHTML = '<div class="chart-empty">Loading sensor dimensions…</div>';
  fetch('/data/sensor-dims.json')
    .then((response) => { if (!response.ok) throw new Error('Sensor dimensions could not be loaded.'); return response.json(); })
    .then((rows) => init(rows.filter((row) => row.w > 0 && row.h > 0)))
    .catch(() => { root.innerHTML = '<div class="chart-empty">Could not load sensor dimensions. Try refreshing the page.</div>'; });
}
