// Ninegrade: "Rough paper" window. Draw (mouse, finger or pen) or type working out. Nothing is saved unless the
// student presses "Add to my answers", which attaches a picture of the page to the photos box of the form.
(function () {
  const COLS = { ink: '#1d2240', blue: '#2457c5', red: '#c62828' };
  window.ngRough = function (open, photos) {
    if (!open) return;
    const old = document.getElementById('rough'); if (old) old.remove();
    const w = document.createElement('div'); w.id = 'rough'; w.className = 'memo rough'; w.hidden = true; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Rough paper');
    w.innerHTML = `<div class="memo-head" title="Drag to move"><b>✏️ Rough paper</b><span class="memo-grip" aria-hidden="true">⠿</span><button type="button" class="memo-x" aria-label="Close">✕</button></div>
      <div class="rough-tools" role="toolbar" aria-label="Rough paper tools">
        <span class="rough-group">${Object.keys(COLS).map((c, i) => `<button type="button" class="rough-pen${i ? '' : ' on'}" data-col="${c}" aria-label="${c === 'ink' ? 'Black' : c === 'blue' ? 'Blue' : 'Red'} pen" style="--c:${COLS[c]}"></button>`).join('')}
          <button type="button" class="rough-tool" data-tool="rub" title="Rubber">Rubber</button><button type="button" class="rough-tool" data-tool="type" title="Type working">Aa Type</button></span>
        <span class="rough-group"><select class="rough-paper" aria-label="Paper"><option value="grid">Squared</option><option value="lines">Lined</option><option value="plain">Plain</option></select>
          <button type="button" class="rough-tool" data-act="undo">Undo</button><button type="button" class="rough-tool" data-act="clear">Clear</button></span></div>
      <div class="rough-area paper-grid"><canvas></canvas><textarea class="rough-text" hidden placeholder="Type your working out…" spellcheck="false"></textarea></div>
      <div class="memo-foot"><span class="muted small">${photos ? 'Not saved unless you add it.' : 'Nothing is saved.'}</span>${photos ? '<button type="button" class="btn primary xs rough-add">Add to my answers</button>' : ''}</div>`;
    document.body.appendChild(w);
    const area = w.querySelector('.rough-area'); const cv = w.querySelector('canvas'); const ctx = cv.getContext('2d'); const txt = w.querySelector('.rough-text');
    let strokes = []; let cur = null; let col = 'ink'; let tool = 'pen';
    const size = () => { const r = area.getBoundingClientRect(); const d = window.devicePixelRatio || 1; if (!r.width) return; cv.width = r.width * d; cv.height = r.height * d; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; ctx.setTransform(d, 0, 0, d, 0, 0); draw(); };
    const line = (s) => { if (!s.p.length) return; ctx.save(); ctx.globalCompositeOperation = s.rub ? 'destination-out' : 'source-over'; ctx.strokeStyle = COLS[s.c] || COLS.ink; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = s.rub ? 22 : 2.4; ctx.lineCap = ctx.lineJoin = 'round';
      if (s.p.length === 1) { ctx.beginPath(); ctx.arc(s.p[0][0], s.p[0][1], ctx.lineWidth / 2, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(s.p[0][0], s.p[0][1]); s.p.slice(1).forEach((q) => ctx.lineTo(q[0], q[1])); ctx.stroke(); } ctx.restore(); };
    function draw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(line); }
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => { if (tool === 'type') return; e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { c: col, rub: tool === 'rub', p: [pt(e)] }; strokes.push(cur); line(cur); });
    cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.p.push(pt(e)); draw(); });
    const end = () => { cur = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const setTool = (t) => { tool = t; w.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); w.querySelectorAll('.rough-pen').forEach((b) => b.classList.toggle('on', t === 'pen' && b.dataset.col === col));
      txt.hidden = t !== 'type' && !txt.value; txt.classList.toggle('active', t === 'type'); area.classList.toggle('rubbing', t === 'rub'); if (t === 'type') txt.focus(); };
    w.querySelectorAll('.rough-pen').forEach((b) => { b.onclick = () => { col = b.dataset.col; setTool('pen'); }; });
    w.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => setTool(tool === b.dataset.tool ? 'pen' : b.dataset.tool); });
    w.querySelector('[data-act=undo]').onclick = () => { strokes.pop(); draw(); };
    w.querySelector('[data-act=clear]').onclick = () => { strokes = []; txt.value = ''; draw(); setTool(tool); };
    const paper = w.querySelector('.rough-paper'); paper.onchange = () => { area.className = area.className.replace(/paper-\w+/, 'paper-' + paper.value); };
    const show = () => { w.hidden = false; size(); };
    open.onclick = () => (w.hidden ? show() : (w.hidden = true));
    w.querySelector('.memo-x').onclick = () => { w.hidden = true; };
    new ResizeObserver(() => { if (!w.hidden) size(); }).observe(area);
    const add = w.querySelector('.rough-add');
    if (add) add.onclick = () => {
      if (!strokes.length && !txt.value.trim()) { add.textContent = 'Nothing to add yet'; setTimeout(() => { add.textContent = 'Add to my answers'; }, 1500); return; }
      const r = area.getBoundingClientRect(); const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const o = out.getContext('2d'); const d = cv.width / r.width;
      o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height); o.strokeStyle = '#d6dbe6'; o.lineWidth = 1;
      if (paper.value !== 'plain') { for (let y = 24 * d; y < out.height; y += 24 * d) { o.beginPath(); o.moveTo(0, y); o.lineTo(out.width, y); o.stroke(); } if (paper.value === 'grid') for (let x = 24 * d; x < out.width; x += 24 * d) { o.beginPath(); o.moveTo(x, 0); o.lineTo(x, out.height); o.stroke(); } }
      o.drawImage(cv, 0, 0);
      if (txt.value.trim()) { o.fillStyle = COLS.ink; o.font = `${16 * d}px system-ui, sans-serif`; txt.value.split('\n').forEach((l, i) => o.fillText(l, 10 * d, (24 * (i + 1) - 6) * d)); }
      out.toBlob((b) => { if (!b) return; const n = (photos.files ? photos.files.length : 0) + 1; const f = new File([b], `rough-paper-${n}.png`, { type: 'image/png' });
        try { const dt = new DataTransfer(); [...(photos.files || [])].forEach((x) => dt.items.add(x)); dt.items.add(f); photos.files = dt.files; photos.dispatchEvent(new Event('change', { bubbles: true }));
          add.textContent = '✔ Added'; setTimeout(() => { add.textContent = 'Add to my answers'; }, 2000); }
        catch (x) { add.textContent = 'Couldn’t add it on this device'; } }, 'image/png');
    };
    // drag by the title bar, as the memory window
    const head = w.querySelector('.memo-head'); let sx, sy, ox, oy;
    head.addEventListener('pointerdown', (e) => { if (e.target.closest('button') || window.innerWidth < 600) return; const r = w.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; head.setPointerCapture(e.pointerId); w.classList.add('dragging'); });
    head.addEventListener('pointermove', (e) => { if (!w.classList.contains('dragging')) return; const r = w.getBoundingClientRect();
      w.style.left = Math.max(0, Math.min(window.innerWidth - r.width, ox + e.clientX - sx)) + 'px'; w.style.top = Math.max(0, Math.min(window.innerHeight - 48, oy + e.clientY - sy)) + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; });
    head.addEventListener('pointerup', () => w.classList.remove('dragging'));
    const gone = () => { if (!document.body.contains(open)) { w.remove(); window.removeEventListener('hashchange', later); } };
    const later = () => setTimeout(gone, 0); window.addEventListener('hashchange', later);
  };
})();
