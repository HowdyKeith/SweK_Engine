// waterTank.js (v1311) — shared "watering tank" overlay for any avatar surface.
// Creates a 2D canvas over (or behind) a host element, polls /water/status, and animates a
// sloshing water fill whose height scales to the watering duration. Used by avatarstage.html
// (behind the transparent avatar canvas) and phone.html's diorama (front, translucent, so the
// avatar reads as submerged because that canvas has its own opaque CSS background).
//
// window.initWaterTank({ mount, behind, insetBottom, z }) -> { destroy() }
(function () {
  window.initWaterTank = function (opts) {
    opts = opts || {};
    const mount = opts.mount; if (!mount) return null;
    const behind = !!opts.behind;
    const insetBottom = opts.insetBottom || 0;
    try { if (getComputedStyle(mount).position === "static") mount.style.position = "relative"; } catch {}

    const wc = document.createElement("canvas");
    wc.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:" + insetBottom + "px;pointer-events:none;z-index:" + (behind ? 0 : (opts.z || 3)) + ";";
    mount.insertBefore(wc, behind ? mount.firstChild : null);
    const cx = wc.getContext("2d"); if (!cx) { wc.remove(); return null; }

    let W = 0, H = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() { const r = wc.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0); wc.width = (W * dpr) | 0; wc.height = (H * dpr) | 0; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const ro = ("ResizeObserver" in window) ? new ResizeObserver(resize) : null; if (ro) try { ro.observe(mount); } catch {}
    window.addEventListener("resize", resize); resize();

    let st = { active: false, startedAt: 0, durationSec: 0 };
    function poll() {
      fetch("/water/status", { cache: "no-store" }).then(r => r.json()).then(j => {
        if (j && j.active) { const dur = j.durationSec || 1; const started = j.startedAt || (Date.now() - (j.fraction || 0) * dur * 1000); st = { active: true, startedAt: started, durationSec: dur }; }
        else st.active = false;
      }).catch(() => {});
    }
    poll(); const pid = setInterval(poll, 2000);
    function liveFrac() { if (!st.active) return 0; const el = (Date.now() - st.startedAt) / 1000; return Math.max(0, Math.min(1, st.durationSec > 0 ? el / st.durationSec : 0)); }

    const bubbles = []; let displayFrac = 0; const t0 = performance.now();
    const bodyA = behind ? 0.80 : 0.42, topA = behind ? 0.55 : 0.30;   // front mode = more translucent so the avatar shows through
    function sy(x, level, t, a1, a2) { return level + Math.sin(x * 0.018 + t * 1.7) * a1 + Math.sin(x * 0.045 - t * 2.6) * a2; }

    let raf;
    function frame(now) {
      const t = (now - t0) / 1000; const target = st.active ? liveFrac() : 0;
      displayFrac += (target - displayFrac) * (st.active ? 0.08 : 0.05); if (!st.active && displayFrac < 0.002) displayFrac = 0;
      cx.clearRect(0, 0, W, H);
      if (displayFrac > 0.001) {
        const level = H * (1 - displayFrac); const a1 = Math.min(16, H * 0.02 + 6), a2 = a1 * 0.5, step = 8;
        const g = cx.createLinearGradient(0, level, 0, H);
        g.addColorStop(0, "rgba(74,156,224," + topA + ")"); g.addColorStop(1, "rgba(18,68,128," + bodyA + ")");
        cx.fillStyle = g; cx.beginPath(); cx.moveTo(0, H); cx.lineTo(0, sy(0, level, t, a1, a2));
        for (let x = 0; x <= W; x += step) cx.lineTo(x, sy(x, level, t, a1, a2));
        cx.lineTo(W, H); cx.closePath(); cx.fill();

        cx.strokeStyle = "rgba(200,236,255,0.5)"; cx.lineWidth = 2; cx.beginPath();
        for (let x = 0; x <= W; x += step) { const y = sy(x, level, t, a1, a2); x === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y); }
        cx.stroke();

        if (st.active && displayFrac > 0.04 && Math.random() < 0.4) bubbles.push({ x: Math.random() * W, y: H - 4, r: 1.5 + Math.random() * 3, v: 12 + Math.random() * 26 });
        cx.fillStyle = "rgba(210,238,255,0.45)";
        for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.y -= b.v * 0.016; b.x += Math.sin((t + i) * 2) * 0.3; if (b.y < sy(b.x, level, t, a1, a2) + 2) { bubbles.splice(i, 1); continue; } cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 6.283); cx.fill(); }

        if (st.active) { const rem = Math.max(0, Math.ceil(st.durationSec - (Date.now() - st.startedAt) / 1000)); cx.fillStyle = "rgba(222,242,255,0.85)"; cx.font = "12px ui-monospace, monospace"; cx.textAlign = "right"; cx.fillText("\uD83D\uDCA7 " + rem + "s", W - 10, Math.max(16, level - 8)); }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return { destroy() { try { cancelAnimationFrame(raf); } catch {} try { clearInterval(pid); } catch {} try { if (ro) ro.disconnect(); } catch {} try { wc.remove(); } catch {} } };
  };
})();
