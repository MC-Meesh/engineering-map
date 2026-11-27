// Word filter for static tables: every whitespace-separated term must appear in the row text.
for (const input of document.querySelectorAll<HTMLInputElement>('input[data-filter]')) {
  const table = document.querySelector(input.dataset.filter!) as HTMLTableElement | null;
  const count = document.getElementById('q-count');
  if (!table) continue;
  const rows = [...table.tBodies[0].rows];
  const text = rows.map((r) => r.textContent!.toLowerCase().replace(/\s+/g, ' '));
  const apply = () => {
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    rows.forEach((r, i) => {
      const ok = terms.every((t) => text[i].includes(t));
      r.hidden = !ok;
      if (ok) shown++;
    });
    if (count) count.textContent = terms.length ? `${shown} of ${rows.length} rows match.` : `${rows.length} rows.`;
  };
  input.addEventListener('input', apply);
  const q = new URLSearchParams(location.search).get('q');
  if (q) input.value = q;
  apply();
}
