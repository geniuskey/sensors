export function stickyTableHead(wrap) {
  const head = wrap.querySelector('thead');
  let frame = 0;
  const update = () => {
    frame = 0;
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0;
    const rect = wrap.getBoundingClientRect();
    const offset = Math.min(Math.max(0, topbar - rect.top), Math.max(0, rect.height - head.offsetHeight));
    head.style.transform = offset ? 'translateY(' + offset + 'px)' : '';
    head.classList.toggle('is-stuck', offset > 0);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(wrap);
}
