// airCough.js (v1316) — plays a real synthesized cough on avatar surfaces when the air watcher
// fires a bad-air reaction. Polls /air/status for a coughSeq counter (bumped server-side on each
// threshold crossing) and synthesizes the cough with the Web Audio API — no audio file needed.
// Browser autoplay policy may keep audio suspended until the first user interaction; we resume the
// context on the first gesture, so the cough is reliable once the page has been touched/clicked.
(function () {
  window.initAirCough = function () {
    let ctx = null, lastSeq = null;
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    const gesture = () => { ac(); window.removeEventListener("pointerdown", gesture); window.removeEventListener("keydown", gesture); };
    window.addEventListener("pointerdown", gesture); window.addEventListener("keydown", gesture);

    function oneCough(c, when, scale) {
      const dur = 0.19, n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;          // white noise burst (the "hh" rush)
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 600 * scale; bp.Q.value = 0.8;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1900;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.9 * scale, when + 0.008);          // fast attack
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);            // quick decay
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(c.destination);
      src.start(when); src.stop(when + dur);
      const o = c.createOscillator(); o.type = "sawtooth";                // low voiced "thump" of the cough
      o.frequency.setValueAtTime(175 * scale, when); o.frequency.exponentialRampToValueAtTime(85, when + 0.12);
      const og = c.createGain(); og.gain.setValueAtTime(0.0001, when); og.gain.linearRampToValueAtTime(0.22 * scale, when + 0.01); og.gain.exponentialRampToValueAtTime(0.001, when + 0.13);
      o.connect(og); og.connect(c.destination); o.start(when); o.stop(when + 0.14);
    }
    function cough() { const c = ac(); if (!c || c.state !== "running") return; const t = c.currentTime + 0.02; oneCough(c, t, 1.0); oneCough(c, t + 0.27, 0.82); }

    function poll() {
      fetch("/air/status", { cache: "no-store" }).then(r => r.json()).then(j => {
        if (!j || typeof j.coughSeq !== "number") return;
        if (lastSeq === null) { lastSeq = j.coughSeq; return; }            // baseline — don't cough on first load
        if (j.coughSeq > lastSeq) { lastSeq = j.coughSeq; cough(); }
      }).catch(() => {});
    }
    poll(); setInterval(poll, 4000);
  };
})();
