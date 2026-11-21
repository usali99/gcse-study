// Ninegrade: "Write it from memory" window for lessons (study lessons and practice lessons). Nothing is saved.
(function () {
    // "Write it from memory": a movable writing window. The Learn it notes can be covered while writing. Nothing is saved.
  window.ngMemoPad = function (body, open, answer) {
      if (!body || !open) return;
      const h = [...body.querySelectorAll('h2')].find((x) => /learn it/i.test(x.textContent));
      let zone = null;
      if (h) { zone = document.createElement('div'); zone.className = 'learn-zone'; let el = h.nextElementSibling; while (el && el.tagName !== 'H2') { const n = el.nextElementSibling; zone.appendChild(el); el = n; } h.after(zone);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost xs memo-inline'; b.textContent = '✍ Write it from memory'; b.onclick = () => show(); h.appendChild(b); }
      const old = document.getElementById('memo'); if (old) old.remove();
      const w = document.createElement('div'); w.id = 'memo'; w.className = 'memo'; w.hidden = true; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Write it from memory');
      w.innerHTML = `<div class="memo-head" title="Drag to move"><b>✍ Write it from memory</b><span class="memo-grip" aria-hidden="true">⠿</span><button type="button" class="memo-x" aria-label="Close">✕</button></div>
        <textarea class="memo-text" spellcheck="true" placeholder="Write what you remember, in your own words…"></textarea>
        <div class="memo-foot"><span class="muted small memo-count">0 words</span><span class="memo-btns">${zone ? '<button type="button" class="btn ghost xs memo-cover">Show the notes</button>' : ''}<button type="button" class="btn ghost xs memo-clear">Clear</button></span></div>
        <p class="muted small memo-note">Nothing is saved. Closing the window or leaving the page clears it.</p>`;
      document.body.appendChild(w);
      const ta = w.querySelector('.memo-text'); const cnt = w.querySelector('.memo-count'); const cov = w.querySelector('.memo-cover');
      const setCover = (on) => { if (!zone) return; zone.classList.toggle('covered', on); cov.textContent = on ? 'Show the notes (check)' : 'Cover the notes'; };
      const show = () => { w.hidden = false; setCover(true); ta.focus(); };
      const hide = () => { w.hidden = true; ta.value = ''; cnt.textContent = '0 words'; setCover(false); };
      open.onclick = show; w.querySelector('.memo-x').onclick = hide;
      w.querySelector('.memo-clear').onclick = () => { ta.value = ''; cnt.textContent = '0 words'; ta.focus(); };
      if (cov) cov.onclick = () => setCover(!zone.classList.contains('covered'));
      if (zone) zone.addEventListener('click', () => { if (zone.classList.contains('covered')) setCover(false); });
      ta.addEventListener('input', () => { const n = (ta.value.trim().match(/\S+/g) || []).length; cnt.textContent = `${n} word${n === 1 ? '' : 's'}`; });
      // drag by the title bar (mouse, pen or finger); stays inside the window
      const head = w.querySelector('.memo-head'); let sx, sy, ox, oy;
      head.addEventListener('pointerdown', (e) => { if (e.target.closest('button') || window.innerWidth < 600) return; const r = w.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; head.setPointerCapture(e.pointerId); w.classList.add('dragging'); });
      head.addEventListener('pointermove', (e) => { if (!w.classList.contains('dragging')) return; const r = w.getBoundingClientRect();
        w.style.left = Math.max(0, Math.min(window.innerWidth - r.width, ox + e.clientX - sx)) + 'px'; w.style.top = Math.max(0, Math.min(window.innerHeight - 48, oy + e.clientY - sy)) + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; });
      head.addEventListener('pointerup', () => w.classList.remove('dragging'));
      const gone = () => { if (!document.body.contains(open)) { w.remove(); window.removeEventListener('hashchange', gone); } };
      window.addEventListener('hashchange', () => setTimeout(gone, 0));
      // Starting the real answers clears the memory window, so it can't be copied from.
      if (answer) answer.addEventListener('focus', () => { if (!w.hidden || ta.value) hide(); });
  };
})();
