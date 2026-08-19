// hazeLayer.js (v1314) — "smog" overlay for avatar surfaces, the dark mirror of waterTank.js.
// Polls /air/status; when PM2.5 severity rises, a drifting brown-grey haze + floating particulate
// specks thicken over the avatar. Subtle by design so it tints rather than hides the avatar.
//
// window.initHazeLayer({ mount, insetBottom, z }) -> { destroy() }
(function () {
  window.initHazeLayer = function (opts) {
    opts = opts || {};
    const mount = opts.mount; if (!mount) return null;
    const insetBottom = opts.insetBottom || 0;
    try { if (getComputedStyle(mount).position === "static") mount.style.position = "relative"; } catch {}

    const hc = document.createElement("canvas");
    hc.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:" + insetBottom + "px;pointer-events:none;z-index:" + (opts.z || 2) + ";";
    mount.appendChild(hc);
    const cx = hc.getContext("2d"); if (!cx) { hc.remove(); return null; }

    let W = 0, H = 0; const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() { const r = hc.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0); hc.width = (W * dpr) | 0; hc.height = (H * dpr) | 0; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    const ro = ("ResizeObserver" in window) ? new ResizeObserver(resize) : null; if (ro) try { ro.observe(mount); } catch {}
    window.addEventListener("resize", resize); resize();

    let sev = 0;   // target severity 0..1 from /air/status
    function poll() { fetch("/air/status", { cache: "no-store" }).then(r => r.json()).then(j => { if (j && typeof j.severity === "number") sev = Math.max(0, Math.min(1, j.severity)); }).catch(() => {}); }
    poll(); const pid = setInterval(poll, 5000);

    // a few slow drifting cloud blobs + a field of floating specks
    const blobs = []; for (let i = 0; i < 5; i++) blobs.push({ x: Math.random(), y: 0.2 + Math.random() * 0.7, r: 0.22 + Math.random() * 0.22, spd: (0.005 + Math.random() * 0.015) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28 });
    const specks = [];
    let disp = 0; const t0 = performance.now();
    let raf;
    function frame(now) {
      const t = (now - t0) / 1000;
      disp += (sev - disp) * 0.04;
      cx.clearRect(0, 0, W, H);
      if (disp > 0.015) {
        // overall brown-grey tint
        cx.fillStyle = "rgba(150,140,110," + (disp * 0.26).toFixed(3) + ")";
        cx.fillRect(0, 0, W, H);
        // drifting soft blobs
        for (const b of blobs) {
          let bx = ((b.x + t * b.spd) % 1 + 1) % 1; const cxp = bx * W, cyp = (b.y + Math.sin(t * 0.3 + b.ph) * 0.03) * H, rad = b.r * Math.max(W, H);
          const g = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, rad);
          g.addColorStop(0, "rgba(165,152,120," + (disp * 0.16).toFixed(3) + ")"); g.addColorStop(1, "rgba(165,152,120,0)");
          cx.fillStyle = g; cx.beginPath(); cx.arc(cxp, cyp, rad, 0, 6.283); cx.fill();
        }
        // particulate specks; count scales with severity
        const want = Math.floor(disp * 70);
        while (specks.length < want) specks.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 10, r: 0.6 + Math.random() * 1.6 });
        while (specks.length > want) specks.pop();
        cx.fillStyle = "rgba(78,70,52," + (0.35 + disp * 0.4).toFixed(3) + ")";
        for (const s of specks) { s.x += s.vx * 0.016 + Math.sin((t + s.y) * 1.5) * 0.2; s.y += s.vy * 0.016; if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; } if (s.x < -4) s.x = W + 4; else if (s.x > W + 4) s.x = -4; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill(); }
      } else if (specks.length) specks.length = 0;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return { destroy() { try { cancelAnimationFrame(raf); } catch {} try { clearInterval(pid); } catch {} try { if (ro) ro.disconnect(); } catch {} try { hc.remove(); } catch {} } };
  };
})();
