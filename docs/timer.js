// Ninegrade: mock and quiz timer. Counts only while the page is open and in front; pauses when the student switches
// tab or window or leaves the page, and carries on when they come back (kept in this browser until they send).
(function () {
  const fmt = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  window.ngTimer = function ({ key, minutes, style, where }) {
    const K = 'ng-timer:' + key; let st = null; try { st = JSON.parse(localStorage.getItem(K)); } catch (e) { st = null; }
    st = st || { used: 0, away: 0, left: 0, seen: Date.now() };
    const now = Date.now(); let pausedFor = 0;
    if (st.seen && now - st.seen > 5000) { pausedFor = now - st.seen; st.away += pausedFor; st.left += 1; } // came back to the page later
    let running = !document.hidden; let since = now; let goneAt = null;
    const total = minutes ? minutes * 60000 : 0;
    const used = () => st.used + (running ? Date.now() - since : 0);
    const save = () => { try { localStorage.setItem(K, JSON.stringify({ ...st, used: used(), seen: Date.now() })); } catch (e) { /* blocked */ } };
    const el = document.createElement('div'); el.className = 'ngt ngt-' + style; el.setAttribute('role', 'timer');
    el.innerHTML = style === 'exam'
      ? '<span class="ngt-clk"></span><b class="ngt-lab"></b><small class="ngt-sub">Mock exam timer. It pauses if you leave the page, and your parent or teacher sees the time you took.</small>'
      : style === 'bar' ? '<span aria-hidden="true">⏱</span><span class="ngt-clk"></span><span class="ngt-prog"><i></i></span><small class="ngt-sub"></small>'
      : '<span class="ngt-ring" aria-hidden="true"><i></i></span><span class="ngt-clk"></span><small class="ngt-sub"></small>';
    if (style === 'corner') document.body.appendChild(el); else where.before(el);
    const draw = () => { const u = used(); const over = total && u > total;
      const clk = el.querySelector('.ngt-clk'); const sub = el.querySelector('.ngt-sub'); const pct = total ? Math.min(100, u / total * 100) : 0;
      if (style === 'exam' && total) { clk.textContent = over ? '0:00' : fmt(total - u); el.querySelector('.ngt-lab').textContent = over ? `Time's up. Finish the question you're on and send.` : `left of ${minutes} minutes`; }
      else { clk.textContent = fmt(u); if (sub) sub.textContent = total ? (over ? `Over the ${minutes} min` : `of ${minutes} min`) : 'time on this quiz'; if (style === 'exam') el.querySelector('.ngt-lab').textContent = 'time so far'; }
      el.classList.toggle('over', !!over); el.classList.toggle('paused', !running);
      const ring = el.querySelector('.ngt-ring'); if (ring) ring.style.setProperty('--p', (total ? pct : (u / 1000 % 60) / 60 * 100) + '%');
      const bar = el.querySelector('.ngt-prog i'); if (bar) bar.style.width = (total ? pct : 0) + '%'; };
    const pausedBox = (ms) => { if (style !== 'exam' || ms < 5000) return; const old = document.querySelector('.ngt-paused'); if (old) old.remove();
      const p = document.createElement('div'); p.className = 'ngt-paused'; p.setAttribute('role', 'dialog');
      p.innerHTML = `<div><div class="ngt-pi" aria-hidden="true">⏸</div><h3>Timer paused</h3><p>You left the page for ${ms < 60000 ? Math.round(ms / 1000) + ' seconds' : Math.round(ms / 60000) + ' minute' + (Math.round(ms / 60000) === 1 ? '' : 's')}. Your time stopped at ${fmt(used())}${total ? ' used' : ''}. Ready to carry on?</p><button type="button" class="btn primary">Carry on</button></div>`;
      document.body.appendChild(p); const b = p.querySelector('button'); b.onclick = () => p.remove(); b.focus(); };
    const stop = () => { if (!running) return; st.used += Date.now() - since; running = false; goneAt = Date.now(); save(); draw(); };
    const go = () => { if (running) return; running = true; since = Date.now(); if (goneAt) { const ms = Date.now() - goneAt; st.away += ms; st.left += 1; goneAt = null; pausedBox(ms); } save(); draw(); };
    const vis = () => (document.hidden ? stop() : go());
    // Choosing photos opens the computer's file window: that isn't leaving the page.
    let picking = false; const pick = (e) => { if (e.target.closest && e.target.closest('input[type=file]')) picking = true; };
    const blur = () => { if (!picking) stop(); }; const focus = () => { picking = false; go(); };
    document.addEventListener('click', pick, true);
    document.addEventListener('visibilitychange', vis); window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    const tick = setInterval(() => { if (!document.body.contains(where)) return done(); draw(); if (running) save(); }, 1000);
    function done() { clearInterval(tick); document.removeEventListener('visibilitychange', vis); document.removeEventListener('click', pick, true); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); el.remove(); const p = document.querySelector('.ngt-paused'); if (p) p.remove(); }
    draw(); save(); if (pausedFor) pausedBox(pausedFor);
    return {
      result() { const u = used(); return { minutes: Math.max(1, Math.round(u / 60000)), away_count: st.left, away_seconds: Math.round(st.away / 1000) }; },
      finish() { try { localStorage.removeItem(K); } catch (e) { /* blocked */ } done(); },
    };
  };
})();
