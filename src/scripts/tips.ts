// Shared hover tooltip for chart marks and matrix cells carrying data-tip (HTML-escaped text, "|" = line break).
const tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
document.body.appendChild(tip);
let current: Element | null = null;
function show(el: Element, x: number, y: number) {
  const parts = (el.getAttribute('data-tip') || '').split('|');
  tip.replaceChildren(...parts.map((p, i) => { const n = document.createElement(i === 0 ? 'b' : 'div'); n.textContent = p; return n; }));
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, x + 14);
  const top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${top}px`;
}
document.addEventListener('pointermove', (e) => {
  const el = (e.target as Element).closest?.('[data-tip]');
  if (el) { current = el; show(el, e.clientX, e.clientY); }
  else if (current) { current = null; tip.style.display = 'none'; }
});
document.addEventListener('focusin', (e) => {
  const el = (e.target as Element).closest?.('[data-tip]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  show(el, r.right, r.top);
});
document.addEventListener('focusout', () => (tip.style.display = 'none'));
