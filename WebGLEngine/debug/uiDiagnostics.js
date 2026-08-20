// FILE: debug/uiDiagnostics.js
// VERSION: v1 — round 306
//
// Console diagnostic tools to identify (a) which DOM overlay elements
// are visible as "black panels" and (b) where main-thread CPU time goes
// when FPS is low. Both are pure observation — no UI mutations.
//
// Usage (paste into browser console):
//   await window._uiAudit()       // dumps overlays, returns array of records
//   await window._fpsProfile(5)   // samples frame timing for 5 seconds
//
// Why these exist: when CSS rules cause unexpected element sizing (e.g.
// round 305's `canvas { width:100vw }` bleed), it's surprisingly hard
// to identify which element is the culprit. _uiAudit walks all elements
// matching common overlay patterns (fixed/absolute, large rect, dark bg)
// and reports them with enough info to fix the offender by name.

function _rgbToHex(rgb) {
    if (!rgb || rgb === "rgba(0, 0, 0, 0)") return null;
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return rgb;
    const r = +m[1], g = +m[2], b = +m[3], a = m[4] != null ? +m[4] : 1;
    if (a === 0) return null;
    return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}${a < 1 ? ` α=${a.toFixed(2)}` : ""}`;
}

function _looksDark(hex) {
    if (!hex) return false;
    const m = hex.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!m) return false;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (r + g + b) / 3 < 32;
}

function _describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const id  = el.id ? `#${el.id}` : "";
    const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0,3).join(".")}` : "";
    return `${tag}${id}${cls}`;
}

/**
 * Walk the DOM and identify overlay elements (fixed/absolute positioned)
 * that might be the "black panels" the user can see.
 *
 * Returns an array of records, sorted by area descending. Each record:
 *   { selector, rect, bg, isCanvas, attrW, attrH, source }
 *
 * Also prints a formatted table to the console.
 */
window._uiAudit = function _uiAudit({ minArea = 5000, includeAll = false } = {}) {
    const all = document.querySelectorAll("*");
    const records = [];
    for (const el of all) {
        const cs = getComputedStyle(el);
        const pos = cs.position;
        if (pos !== "fixed" && pos !== "absolute") continue;
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area < minArea && !includeAll) continue;
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const bg = _rgbToHex(cs.backgroundColor);
        const isCanvas = el.tagName === "CANVAS";
        const rec = {
            selector: _describeElement(el),
            rect: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
            },
            zIndex: cs.zIndex,
            bg,
            isCanvas,
            attrW: isCanvas ? el.width : null,
            attrH: isCanvas ? el.height : null,
            styleW: el.style.width || null,
            styleH: el.style.height || null,
            looksDark: _looksDark(bg),
            element: el,
        };
        records.push(rec);
    }
    records.sort((a, b) => (b.rect.w * b.rect.h) - (a.rect.w * a.rect.h));

    console.group(`[_uiAudit] ${records.length} positioned overlays (area >= ${minArea}px²)`);
    console.table(records.map(r => ({
        selector: r.selector,
        pos: `(${r.rect.x},${r.rect.y})`,
        size: `${r.rect.w}×${r.rect.h}`,
        z: r.zIndex,
        bg: r.bg || "—",
        canvas: r.isCanvas ? `attr=${r.attrW}×${r.attrH} style=${r.styleW||"—"}×${r.styleH||"—"}` : "—",
        dark: r.looksDark ? "■" : "",
    })));
    const dark = records.filter(r => r.looksDark);
    if (dark.length) {
        console.warn(`[_uiAudit] ${dark.length} dark-background overlay(s) — these may be the black panels:`);
        for (const r of dark) console.warn("  ", r.selector, r.rect, r.bg, r.element);
    }
    console.groupEnd();
    return records;
};

/**
 * Sample frame timing for N seconds. Records frame intervals, identifies
 * slow frames (>33 ms = under 30 FPS), and reports:
 *   - Frame interval percentiles (p50, p95, p99)
 *   - Worst 5 frames with timestamps
 *   - Hint about possible causes based on patterns
 */
window._fpsProfile = function _fpsProfile(seconds = 5) {
    return new Promise((resolve) => {
        const samples = [];
        let last = performance.now();
        const stopAt = last + seconds * 1000;
        console.log(`[_fpsProfile] sampling for ${seconds}s...`);

        function tick(now) {
            const dt = now - last;
            samples.push({ t: now, dt });
            last = now;
            if (now < stopAt) {
                requestAnimationFrame(tick);
            } else {
                _reportFpsProfile(samples, seconds, resolve);
            }
        }
        requestAnimationFrame(tick);
    });
};

function _reportFpsProfile(samples, seconds, resolve) {
    if (samples.length < 2) {
        console.warn("[_fpsProfile] not enough samples");
        resolve({ samples: [] });
        return;
    }
    const dts = samples.slice(1).map(s => s.dt).sort((a, b) => a - b);
    const p = (q) => dts[Math.min(dts.length - 1, Math.floor(dts.length * q))];
    const avgFps = (samples.length - 1) / seconds;
    const slowFrames = samples.slice(1).filter(s => s.dt > 33);
    const verySlowFrames = samples.slice(1).filter(s => s.dt > 100);
    console.group("[_fpsProfile] frame timing report");
    console.log(`Avg FPS: ${avgFps.toFixed(1)} (${samples.length - 1} frames in ${seconds.toFixed(1)}s)`);
    console.log(`Frame interval p50: ${p(0.5).toFixed(1)}ms · p95: ${p(0.95).toFixed(1)}ms · p99: ${p(0.99).toFixed(1)}ms · max: ${p(1).toFixed(1)}ms`);
    console.log(`Slow frames (>33ms): ${slowFrames.length} / ${samples.length - 1}  (${(100*slowFrames.length/(samples.length-1)).toFixed(1)}%)`);
    console.log(`Very slow (>100ms): ${verySlowFrames.length}`);
    if (slowFrames.length) {
        const worst = [...slowFrames].sort((a, b) => b.dt - a.dt).slice(0, 5);
        console.log("Worst 5 frame intervals:");
        for (const s of worst) console.log(`  ${s.dt.toFixed(1)}ms @ t=${(s.t).toFixed(0)}`);
    }

    // Round 307 — snapshot of common heavy-system entity counts.
    // Lets you see WHAT'S in the world when FPS is bad.
    const snap = {};
    try {
        if (window.kaijuCity?.stats) snap.kaijuCity = window.kaijuCity.stats();
    } catch {}
    try {
        if (window.kaiju?.list) snap.kaijuCount = window.kaiju.list().length;
    } catch {}
    try {
        if (window.particles?.count) snap.particles = window.particles.count();
        else if (window.particles?._pool) snap.particles = window.particles._pool.length;
    } catch {}
    try {
        if (window.ragdoll?.snapshot) snap.ragdoll = window.ragdoll.snapshot();
    } catch {}
    try {
        if (window.civManager?.getAll) snap.civs = window.civManager.getAll().length;
    } catch {}
    try {
        if (window._perfStats) snap.perfStats = window._perfStats;
    } catch {}
    // Count backdrop-filter elements (known perf trap)
    try {
        const bfCount = Array.from(document.querySelectorAll("*"))
            .filter(el => {
                const cs = getComputedStyle(el);
                return cs.backdropFilter && cs.backdropFilter !== "none";
            }).length;
        snap.backdropFilterElements = bfCount;
        if (bfCount > 0) {
            console.warn(`  ⚠ ${bfCount} element(s) with active backdrop-filter — known per-frame perf cost on most GPUs`);
        }
    } catch {}
    if (Object.keys(snap).length) {
        console.log("World snapshot:", snap);
    }

    // Heuristic hints
    const hints = [];
    if (p(0.5) > 30) hints.push("Sustained slow frames — suggests continuous heavy work in render loop (CSM passes? entity-count quadratic? particle overflow?)");
    if (p(0.95) > p(0.5) * 3) hints.push("Big tail variance — suggests periodic GC pauses or burst work (worker message handling, biome decor planning, AI ticks)");
    if (verySlowFrames.length > 0) hints.push("Frames >100ms — could be synchronous network/disk work (Ollama, ComfyUI), large allocations, or a single offender doing too much per tick");
    if (snap.backdropFilterElements > 0) hints.push(`backdrop-filter elements present — see ⚠ above`);
    if (snap.kaijuCount > 20) hints.push(`Many kaiju (${snap.kaijuCount}) — per-tick AI/IK cost grows roughly linearly with count`);
    if (snap.particles > 500) hints.push(`Lots of particles (${snap.particles}) — particle update + draw can dominate per frame at high counts`);
    if (hints.length) {
        console.warn("Hints:");
        for (const h of hints) console.warn("  ", h);
    } else {
        console.log("No obvious patterns — try perf.show() for worker-pool breakdown");
    }
    console.groupEnd();
    resolve({ samples, p50: p(0.5), p95: p(0.95), avgFps, slowCount: slowFrames.length, snap });
}

console.log("[uiDiagnostics] tools loaded — try window._uiAudit() and window._fpsProfile(5)");
