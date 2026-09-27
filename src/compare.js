const root = document.querySelector('#size-compare');
const MAX = 6;
const COLORS = ['--series-1', '--series-5', '--series-3', '--series-4', '--series-2', '--series-6'];
const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const number = (value, digits = 1) => value == null || value === '' ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const area = (sensor) => sensor.w * sensor.h;
const dims = (sensor) => `${number(sensor.w, 2)} × ${number(sensor.h, 2)} mm`;
const format = (sensor) => sensor.size ? (/^\d+(\.\d+)?$/.test(sensor.size) ? `${sensor.size}"` : sensor.size) : '—';
const denominator = (sensor) => { const match = String(sensor.size || '').match(/^1\s*\/\s*(\d+(?:\.\d+)?)/); return match ? Number(match[1]) : Number(sensor.size) ? 1 / Number(sensor.size) : null; };
const label = (sensor) => norm(sensor.name).startsWith(norm(sensor.maker)) ? sensor.name : `${sensor.maker} ${sensor.name}`;
const byPhones = (a, b) => (b.phones || 0) - (a.phones || 0) || area(b) - area(a) || a.name.localeCompare(b.name);
const encodeId = (id) => encodeURIComponent(id).replace(/%3A/gi, ':');

function ratioText(sensor, reference) {
  if (sensor === reference) return 'Reference';
  const ratio = area(sensor) / area(reference);
  return `${number(ratio, ratio >= 10 ? 1 : 2)}× area`;
}

function distinctSizes(pool, count) {
  const picked = [];
  pool.slice().sort(byPhones).forEach((sensor) => {
    if (picked.length < count && picked.every((other) => Math.max(area(sensor), area(other)) / Math.min(area(sensor), area(other)) > 1.3)) picked.push(sensor);
  });
  return picked.sort((a, b) => area(b) - area(a));
}

function buildPresets(sensors) {
  const top = (rows, count = 1) => rows.slice().sort(byPhones).slice(0, count);
  const presets = [];
  const add = (name, rows) => { const ids = [...new Set(rows.filter(Boolean).map((row) => row.id))].slice(0, MAX); if (ids.length >= 2) presets.push({ name, ids }); };
  const inch = top(sensors.filter((row) => denominator(row) && denominator(row) <= 1.05));
  const oneThree = top(sensors.filter((row) => denominator(row) >= 1.25 && denominator(row) <= 1.35));
  add('1-inch vs 1/1.3"', [...inch, ...oneThree]);
  const huge = sensors.filter((row) => row.mp >= 190);
  const samsung = top(huge.filter((row) => row.maker === 'Samsung'));
  const sony = top(huge.filter((row) => row.maker === 'Sony'));
  const rival = sony.length ? sony : top(huge.filter((row) => row.maker !== 'Samsung'));
  if (samsung.length && rival.length) add(`Samsung vs ${rival[0].maker} 200 MP`, [...samsung, ...rival]);
  else add('200 MP sensors', top(huge, 4));
  add('Sony LYTIA lineup', top(sensors.filter((row) => row.maker === 'Sony' && /^LYT/i.test(row.name)), 4).sort((a, b) => area(b) - area(a)));
  add('Largest sensors', sensors.slice().sort((a, b) => area(b) - area(a)).slice(0, 4));
  add('Most used', top(sensors, 4).sort((a, b) => area(b) - area(a)));
  add('Common sizes', distinctSizes(sensors.filter((row) => row.phones > 0), 4));
  return presets;
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

function sideItems(rows, reference, width) {
  const maxW = Math.max(...rows.map((row) => row.w)), sumW = rows.reduce((sum, row) => sum + row.w, 0);
  const gap = 24, s = Math.min(240 / maxW, Math.max((width - gap * (rows.length - 1)) / sumW, (width - gap) / (2 * maxW)));
  return rows.map((row) => {
    const w = row.w * s, h = row.h * s, color = `var(${row.color})`;
    return `<figure class="sc-side-item" data-id="${esc(row.id)}"><svg width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="-1 -1 ${(w + 2).toFixed(1)} ${(h + 2).toFixed(1)}" role="img" aria-label="${esc(`${label(row)}, ${dims(row)}`)}"><rect class="sc-rect" x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:${color};stroke:${color}"/></svg><figcaption><strong>${esc(label(row))}</strong><span>${esc(dims(row))}</span><span>${esc(ratioText(row, reference))}</span></figcaption></figure>`;
  }).join('');
}

function init(sensors) {
  const byId = new Map(sensors.map((row) => [row.id, row]));
  const presets = buildPresets(sensors);
  const params = new URLSearchParams(location.search);
  let ids = (params.get('ids') || '').split(',').map((id) => id.trim()).filter((id) => byId.has(id));
  ids = [...new Set(ids)].slice(0, MAX);
  if (!ids.length) ids = distinctSizes(sensors.filter((row) => row.phones > 0), 3).map((row) => row.id);
  let mode = params.get('view') === 'side' ? 'side' : 'overlay';
  let options = [], active = -1;

  root.innerHTML = `<div class="sc-toolbar">
      <div class="sc-picker"><label class="field-label" for="sc-input">Add a sensor <span class="facet-hint" id="sc-count"></span></label>
        <div class="sc-picker-field"><input id="sc-input" class="text-field" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sc-options" autocomplete="off" spellcheck="false" placeholder="e.g. IMX989, HP2, LYT-900"><div id="sc-options" class="site-search-results sc-options" role="listbox" aria-label="Matching sensors" hidden></div></div>
      </div>
      <div class="chart-controls sc-mode" role="group" aria-label="Layout"><button class="chart-filter" type="button" data-mode="overlay">Overlay</button><button class="chart-filter" type="button" data-mode="side">Side by side</button></div>
    </div>
    ${presets.length ? `<div class="sc-presets" role="group" aria-label="Presets"><span class="maker-filters-label">Presets</span>${presets.map((preset, index) => `<button class="maker-filter" type="button" data-preset="${index}">${esc(preset.name)}</button>`).join('')}</div>` : ''}
    <ul class="sc-chips" aria-label="Selected sensors"></ul>
    <div class="sc-stage" aria-live="polite"></div>
    <p class="sc-note">Rectangles use each sensor’s physical active-area width and height. Area ratios compare against the first sensor in the list.</p>
    <div class="sc-table-wrap"><table class="sc-table"><thead><tr><th scope="col">Sensor</th><th scope="col" class="num">Resolution</th><th scope="col">Format</th><th scope="col" class="num">Pixel</th><th scope="col" class="num">Size</th><th scope="col" class="num">Area</th><th scope="col" class="num">vs first</th><th scope="col" class="num">Phones</th></tr></thead><tbody></tbody></table></div>`;
  const input = root.querySelector('#sc-input'), list = root.querySelector('#sc-options'), stage = root.querySelector('.sc-stage');

  const rows = () => ids.map((id, index) => ({ ...byId.get(id), color: COLORS[index % COLORS.length] }));
  const syncUrl = () => {
    const url = new URL(location.href);
    const query = ['ids=' + ids.map(encodeId).join(',')];
    if (mode === 'side') query.push('view=side');
    url.search = '?' + query.join('&');
    history.replaceState(null, '', url);
  };
  const renderStage = () => {
    const current = rows();
    if (!current.length) { stage.innerHTML = '<div class="chart-empty">Add a sensor to start comparing.</div>'; return; }
    stage.classList.toggle('is-side', mode === 'side');
    stage.innerHTML = mode === 'side' ? sideItems(current, current[0], stage.clientWidth - 32 || 600) : overlaySvg(current, current[0]);
  };
  const render = () => {
    const current = rows(), reference = current[0];
    root.querySelector('#sc-count').textContent = `${ids.length} of ${MAX}`;
    input.disabled = ids.length >= MAX;
    input.placeholder = ids.length >= MAX ? 'Remove a sensor to add another' : 'e.g. IMX989, HP2, LYT-900';
    root.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    root.querySelector('.sc-chips').innerHTML = current.map((row) => `<li class="sc-chip" data-id="${esc(row.id)}"><i class="sc-swatch" style="background:var(${row.color})" aria-hidden="true"></i><span class="sc-chip-copy"><a href="${esc(row.url)}">${esc(label(row))}</a><span>${esc(format(row))} · ${esc(dims(row))} · ${esc(ratioText(row, reference))}</span></span><button class="sc-remove" type="button" data-remove="${esc(row.id)}" aria-label="Remove ${esc(label(row))}">×</button></li>`).join('');
    root.querySelector('.sc-table tbody').innerHTML = current.map((row) => `<tr data-id="${esc(row.id)}"><td><span class="sc-table-name"><i class="sc-swatch" style="background:var(${row.color})" aria-hidden="true"></i><span><span class="compare-maker">${esc(row.maker)}</span><a href="${esc(row.url)}">${esc(row.name)}</a></span></span></td><td class="num">${row.mp == null ? '—' : number(row.mp) + ' MP'}</td><td>${esc(format(row))}</td><td class="num">${row.pitch ? number(row.pitch, 2) + ' µm' : '—'}</td><td class="num">${esc(dims(row))}</td><td class="num">${number(area(row), 1)} mm²</td><td class="num">${esc(ratioText(row, reference))}</td><td class="num">${number(row.phones || 0, 0)}</td></tr>`).join('');
    root.querySelector('.sc-table-wrap').hidden = !current.length;
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
    }).filter(([score]) => score).sort((a, b) => b[0] - a[0] || byPhones(a[1], b[1])).slice(0, 10).map(([, row]) => row);
    list.innerHTML = matches.length ? matches.map((row, index) => `<div class="site-search-option" id="sc-opt-${index}" role="option" aria-selected="false" data-add="${esc(row.id)}"><span class="site-search-name">${esc(label(row))}</span><span class="site-search-meta">${esc([format(row), dims(row), row.mp ? number(row.mp) + ' MP' : '', `${row.phones || 0} phones`].filter(Boolean).join(' · '))}</span></div>`).join('') : '<div class="site-search-empty">No matching sensors.</div>';
    options = [...list.querySelectorAll('[role="option"]')];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };
  const add = (id) => {
    if (!byId.has(id) || ids.includes(id) || ids.length >= MAX) return;
    ids.push(id);
    input.value = '';
    closeList();
    render();
    if (!input.disabled) input.focus();
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
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      const index = ids.indexOf(remove.dataset.remove);
      ids.splice(index, 1);
      render();
      const next = root.querySelectorAll('[data-remove]')[Math.min(index, ids.length - 1)];
      (next || input).focus();
      return;
    }
    const preset = event.target.closest('[data-preset]');
    if (preset) { ids = presets[Number(preset.dataset.preset)].ids.slice(); render(); return; }
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton && modeButton.dataset.mode !== mode) { mode = modeButton.dataset.mode; render(); }
  });
  const highlight = (id) => {
    stage.classList.toggle('has-focus', Boolean(id));
    stage.querySelectorAll('[data-id]').forEach((node) => node.classList.toggle('is-focus', node.dataset.id === id));
  };
  root.addEventListener('pointerover', (event) => { const item = event.target.closest('.sc-chip[data-id], .sc-table tr[data-id]'); highlight(item ? item.dataset.id : null); });
  root.addEventListener('pointerleave', () => highlight(null));
  root.addEventListener('focusin', (event) => { const item = event.target.closest('.sc-chip[data-id], .sc-table tr[data-id]'); highlight(item ? item.dataset.id : null); });
  let lastWidth = 0;
  new ResizeObserver(() => {
    if (mode !== 'side' || Math.abs(stage.clientWidth - lastWidth) < 8) return;
    lastWidth = stage.clientWidth;
    renderStage();
  }).observe(stage);
  render();
}

if (root) {
  root.innerHTML = '<div class="chart-empty">Loading sensor dimensions…</div>';
  fetch('/data/sensor-dims.json')
    .then((response) => { if (!response.ok) throw new Error('Sensor dimensions could not be loaded.'); return response.json(); })
    .then((rows) => init(rows.filter((row) => row.w > 0 && row.h > 0)))
    .catch(() => { root.innerHTML = '<div class="chart-empty">Could not load sensor dimensions. Try refreshing the page.</div>'; });
}
