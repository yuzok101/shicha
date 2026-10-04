/* TimerSounds — built-in Web Audio ringtones for Tavlin timers.
   No external files; works fully offline. */
const TimerSounds = (() => {
  // Each sound: array of notes {f: freq Hz | [f0,f1] sweep, t: start sec, d: duration sec, type, g: gain}
  const SOUNDS = {
    classic: { label: 'פעמון קלאסי', notes: [
      { f: 1318, t: 0, d: .45 }, { f: 987, t: .55, d: .65 },
      { f: 1318, t: 1.3, d: .45 }, { f: 987, t: 1.85, d: .9 }] },
    chime: { label: 'פעמוני רוח', notes: [
      { f: 1046, t: 0, d: .8 }, { f: 1174, t: .35, d: .8 }, { f: 1318, t: .7, d: .8 },
      { f: 1568, t: 1.05, d: 1.1 }] },
    digital: { label: 'ביפ דיגיטלי', notes: [
      { f: 880, t: 0, d: .12, type: 'square', g: .25 }, { f: 880, t: .25, d: .12, type: 'square', g: .25 },
      { f: 880, t: .5, d: .12, type: 'square', g: .25 }, { f: 1174, t: .75, d: .3, type: 'square', g: .25 }] },
    gong: { label: 'גונג', notes: [
      { f: 196, t: 0, d: 1.6, g: .5 }, { f: 147, t: 1.1, d: 1.8, g: .4 }] },
    melody: { label: 'מנגינה', notes: [
      { f: 523, t: 0, d: .22 }, { f: 659, t: .25, d: .22 }, { f: 784, t: .5, d: .22 },
      { f: 659, t: .75, d: .22 }, { f: 523, t: 1, d: .5 }] },
    knock: { label: 'דפיקה', notes: [
      { f: 150, t: 0, d: .12, type: 'triangle', g: .6 }, { f: 150, t: .3, d: .12, type: 'triangle', g: .6 },
      { f: 150, t: .6, d: .2, type: 'triangle', g: .6 }] },
    birds: { label: 'ציוץ ציפורים', notes: [
      { f: [2200, 3400], t: 0, d: .18 }, { f: [2600, 1800], t: .25, d: .18 },
      { f: [2200, 3600], t: .5, d: .22 }] },
    alarm: { label: 'אזעקה', notes: [
      { f: 660, t: 0, d: .25, type: 'square', g: .2 }, { f: 880, t: .3, d: .25, type: 'square', g: .2 },
      { f: 660, t: .6, d: .25, type: 'square', g: .2 }, { f: 880, t: .9, d: .25, type: 'square', g: .2 },
      { f: 660, t: 1.2, d: .25, type: 'square', g: .2 }, { f: 880, t: 1.5, d: .4, type: 'square', g: .2 }] },
    soft: { label: 'רך ונעים', notes: [
      { f: 392, t: 0, d: .7, type: 'triangle', g: .35 }, { f: 494, t: .4, d: .7, type: 'triangle', g: .35 },
      { f: 587, t: .8, d: 1, type: 'triangle', g: .35 }] },
    drum: { label: 'תוף', notes: [
      { f: 120, t: 0, d: .15, type: 'sine', g: .7 }, { f: 120, t: .35, d: .15, type: 'sine', g: .7 },
      { f: 180, t: .7, d: .15, type: 'sine', g: .6 }, { f: 120, t: 1.05, d: .25, type: 'sine', g: .7 }] },
  };
  const DEFAULT = 'classic';

  let ctx = null, timers = [], playing = false;
  function ac() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function seqDur(notes) { return Math.max(...notes.map(n => n.t + n.d)); }
  function schedule(name, when) {
    const c = ac(); if (!c) return;
    const s = SOUNDS[name] || SOUNDS[DEFAULT];
    for (const n of s.notes) {
      const t0 = when + n.t, o = c.createOscillator(), g = c.createGain();
      o.type = n.type || 'sine';
      if (Array.isArray(n.f)) { o.frequency.setValueAtTime(n.f[0], t0); o.frequency.exponentialRampToValueAtTime(n.f[1], t0 + n.d); }
      else o.frequency.setValueAtTime(n.f, t0);
      const gv = n.g || .4;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gv, t0 + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + n.d + .05);
    }
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; playing = false; hideBanner(); }
  function play(name, repeats) {
    stop(); const c = ac(); if (!c) return;
    name = SOUNDS[name] ? name : DEFAULT;
    playing = true;
    if (repeats === 'until') {
      const dur = seqDur(SOUNDS[name].notes);
      const loop = () => { if (!playing) return; schedule(name, c.currentTime + .05); timers.push(setTimeout(loop, (dur + .8) * 1000)); };
      loop();
    } else {
      const n = Math.max(1, Math.min(9, +repeats || 1)), dur = seqDur(SOUNDS[name].notes);
      for (let i = 0; i < n; i++) timers.push(setTimeout(() => schedule(name, ac().currentTime + .05), i * (dur + .7) * 1000));
      timers.push(setTimeout(() => { playing = false; hideBanner(); }, n * (dur + .7) * 1000));
    }
  }
  function stop() { clearTimers(); }
  function warm() { try { ac(); } catch {} }
  function preview(name) { stop(); const c = ac(); if (c) schedule(SOUNDS[name] ? name : DEFAULT, c.currentTime + .05); }

  // ---- timer-end integration ----
  function prefs() { try { return JSON.parse(localStorage.getItem('tavlin-settings') || '{}'); } catch { return {}; } }
  function onTimerEnd() {
    const p = prefs();
    if (p.timerSounds !== false) play(p.timerSound || DEFAULT, p.timerRepeats || 2);
    try { if (p.notifications !== false && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]); } catch {}
    showBanner();
  }
  function showBanner() {
    hideBanner();
    const b = document.createElement('div');
    b.id = 'timerDoneBanner'; b.className = 'timerDone';
    b.innerHTML = `<span>⏰ הטיימר הסתיים!</span><button type="button" id="timerDoneMute">השתק</button>`;
    document.body.append(b);
    b.querySelector('#timerDoneMute').onclick = () => stop();
    // auto-hide after 60s to avoid a stuck banner
    timers.push(setTimeout(hideBanner, 60000));
  }
  function hideBanner() { document.getElementById('timerDoneBanner')?.remove(); }

  // ---- settings UI ----
  function settingsHTML() {
    const p = prefs(), cur = p.timerSound || DEFAULT, rep = p.timerRepeats || '2';
    const rows = Object.entries(SOUNDS).map(([k, s]) =>
      `<label class="sndRow"><input type="radio" name="timerSound" value="${k}"${k === cur ? ' checked' : ''}><span>${s.label}</span><button type="button" class="sndPrev" data-prev="${k}" title="השמעה">▶</button></label>`).join('');
    return `<fieldset class="sndField"><legend>🔔 צליל טיימר</legend><div class="sndList">${rows}</div>
      <label class="sndRep">מספר חזרות<select name="timerRepeats">
      ${['1','2','3','4','5'].map(n => `<option value="${n}"${String(rep) === n ? ' selected' : ''}>${n}</option>`).join('')}
      <option value="until"${rep === 'until' ? ' selected' : ''}>חוזר עד לאישור</option></select></label>
      <p class="muted">הצלילים מובנים באפליקציה ועובדים גם בלי אינטרנט.</p></fieldset>`;
  }
  function bindPreview(root) {
    root.querySelectorAll('[data-prev]').forEach(b => b.onclick = e => { e.preventDefault(); preview(b.dataset.prev); });
  }

  return { SOUNDS, DEFAULT, play, stop, warm, preview, onTimerEnd, settingsHTML, bindPreview, prefs };
})();
