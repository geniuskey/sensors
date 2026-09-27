const form = document.querySelector('.site-search');
const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const LIMIT = 8;
const GROUPS = [['sensor', 'Sensors'], ['phone', 'Phones']];

let indexPromise;
function loadIndex() {
  indexPromise ||= fetch('/data/search-index.json').then((response) => {
    if (!response.ok) throw new Error('Search index unavailable');
    return response.json();
  }).then((rows) => rows.map((row) => ({ ...row, n: norm(row.name), full: norm(row.maker + ' ' + row.name), hay: norm([row.maker, row.name, row.detail, row.keywords].join(' ')) })))
    .catch((error) => { indexPromise = null; throw error; });
  return indexPromise;
}

function score(row, query, tokens) {
  if (row.n === query || row.full === query) return 100;
  if (row.n.startsWith(query)) return 80;
  if (row.full.startsWith(query)) return 70;
  if (row.n.includes(query)) return 60;
  if (row.full.includes(query)) return 50;
  if (row.hay.includes(query)) return 30;
  return tokens.length > 1 && tokens.every((token) => row.hay.includes(token)) ? 20 : 0;
}

function search(rows, text) {
  const query = norm(text), tokens = String(text).toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  if (!query) return [];
  const ranked = rows.map((row) => [score(row, query, tokens), row]).filter(([value]) => value > 0).sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  return GROUPS.map(([type, label]) => ({ type, label, items: ranked.filter(([, row]) => row.type === type).slice(0, LIMIT).map(([, row]) => row) })).filter((group) => group.items.length);
}

if (form) {
  const input = form.querySelector('input[name="q"]');
  const list = form.querySelector('.site-search-results');
  const toggle = form.querySelector('.site-search-toggle');
  const compact = window.matchMedia('(max-width: 960px)');
  let options = [], active = -1, requestId = 0;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Search suggestions');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', input.id);

  const setActive = (index) => {
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    active = index;
    if (index < 0) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', options[index].id);
      options[index].scrollIntoView({ block: 'nearest' });
    }
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };
  const setOpen = (open, refocus = true) => {
    form.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close search' : 'Search sensors and phones');
    if (open) input.focus();
    else { close(); if (refocus) toggle.focus(); }
  };
  const render = (groups, text) => {
    let n = 0;
    list.innerHTML = groups.length
      ? groups.map((group) => `<div role="group" aria-labelledby="site-search-${group.type}"><div class="site-search-group" id="site-search-${group.type}" role="presentation">${group.label}</div>` + group.items.map((row) => `<a class="site-search-option" id="site-search-opt-${n++}" role="option" aria-selected="false" tabindex="-1" href="${esc(row.url)}"><span class="site-search-name">${esc(row.name)}</span><span class="site-search-meta">${esc([row.maker, row.detail].filter(Boolean).join(' · '))}</span></a>`).join('') + '</div>').join('')
        : `<div class="site-search-empty">No matches for “${esc(text)}”. Press Enter to search the catalog.</div>`;
    options = [...list.querySelectorAll('[role="option"]')];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  };
  const update = async () => {
    const text = input.value.trim(), id = ++requestId;
    if (!text) { close(); return; }
    try {
      const rows = await loadIndex();
      if (id === requestId) render(search(rows, text), text);
    } catch (_) {
      if (id === requestId) close();
    }
  };

  input.addEventListener('focus', () => { loadIndex().catch(() => {}); if (input.value.trim()) update(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) { update(); return; }
      if (!options.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      location.href = options[active].href;
    } else if (event.key === 'Escape') {
      if (!list.hidden) { event.preventDefault(); close(); }
      else if (form.classList.contains('is-open')) { event.preventDefault(); setOpen(false); }
      else input.blur();
    }
  });
  list.addEventListener('pointerdown', (event) => event.preventDefault());
  list.addEventListener('pointermove', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option && options.indexOf(option) !== active) setActive(options.indexOf(option));
  });
  form.addEventListener('submit', (event) => {
    if (!input.value.trim()) { event.preventDefault(); input.focus(); }
  });
  form.addEventListener('focusout', (event) => {
    if (form.contains(event.relatedTarget)) return;
    close();
    if (compact.matches && !input.value.trim()) setOpen(false, false);
  });
  toggle.addEventListener('click', () => setOpen(!form.classList.contains('is-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    event.preventDefault();
    if (compact.matches) setOpen(true);
    else input.focus();
    input.select();
  });
}
