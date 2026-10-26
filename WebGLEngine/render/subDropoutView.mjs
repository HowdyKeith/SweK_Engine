// WebGLEngine/render/subDropoutView.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/subDropoutView-selfcheck.mjs, which drives the page that mounts it)
//
// THE COMPASS-DROPOUT VIEW OF THE SUB AQUARIUM: one dive replayed for four pilots side by side through the same compass dropout (render/subDropoutScene.mjs flies and records it; this file only draws and controls). A plan of the four tracks (the stretches flown with the compass
// dark drawn heavy), the heading of each against the target with the dark windows shaded and the heading the plain autopilot BELIEVES drawn in grey, the error against the target, a legend with each pilot's blurb and its score, a dive picker, play/pause, a speed picker and a scrub bar.
// Every word that reaches the page is set with textContent; nothing is parsed as markup. mountDropoutView(root, { circuit }) builds its own elements inside `root`, flies the first dive at once, and returns a controller { setDive, setTick, play, pause, state, dispose } for the gate.
"use strict";
import { DIVES, TICK, pilotDefs, flyScene, compassLine, planBounds, resultLine, notesFor } from "./subDropoutScene.mjs";

const PLAN_W = 1000, PLAN_H = 360, CHART_W = 1000, HEAD_H = 200, ERR_H = 150;
const hsl = (hue, a = 1) => `hsl(${hue} 75% 58% / ${a})`;
const SPEEDS = [1, 4, 10, 30];

export function mountDropoutView(root, { circuit, doc = (typeof document !== "undefined" ? document : null), raf = (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null), caf = (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : null), now = () => (typeof performance !== "undefined" ? performance.now() : 0) }) {
    const el = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; };
    const defs = pilotDefs(circuit);
    root.textContent = "";
    const intro = el("p", "One dive, flown by four pilots through the same compass dropout. Press play. Heavy stretches of a track are flown with the compass dark.", "sub");
    const bar = el("div", null, "dropbar"), diveSel = el("select"), playBtn = el("button", "play"), speedSel = el("select"), scrub = el("input"), clock = el("span", "", "sub");
    diveSel.title = "Which dive to fly"; speedSel.title = "Replay speed"; scrub.type = "range"; scrub.min = "0"; scrub.max = "1799"; scrub.value = "0"; scrub.title = "Scrub through the dive";
    DIVES.forEach((d, i) => { const o = el("option", d.label); o.value = String(i); diveSel.appendChild(o); });
    SPEEDS.forEach((s) => { const o = el("option", s + "×"); o.value = String(s); if (s === 4) o.selected = true; speedSel.appendChild(o); });
    for (const [label, node] of [["dive", diveSel], ["speed", speedSel]]) { const l = el("label", label + " "); l.appendChild(node); bar.appendChild(l); }
    bar.appendChild(playBtn); bar.appendChild(scrub); bar.appendChild(clock);
    const mkCanvas = (w, h, label) => { const c = el("canvas"); c.width = w; c.height = h; c.setAttribute("aria-label", label); return c; };
    const plan = mkCanvas(PLAN_W, PLAN_H, "Plan view of the four tracks"), heads = mkCanvas(CHART_W, HEAD_H, "Heading against time, the dark windows shaded"), errs = mkCanvas(CHART_W, ERR_H, "Heading error against time");
    const legend = el("div", null, "droplegend"), notes = el("div", null, "dropnotes");
    for (const s of notesFor()) notes.appendChild(el("p", s, "sub"));
    for (const n of [intro, bar, plan, heads, errs, legend, notes]) root.appendChild(n);
    plan.id = "dropPlan"; heads.id = "dropHeads"; errs.id = "dropErrs"; playBtn.id = "dropPlay"; diveSel.id = "dropDive"; speedSel.id = "dropSpeed"; scrub.id = "dropScrub"; clock.id = "dropClock"; legend.id = "dropLegend";

    let scene = null, dive = 0, tick = 0, playing = false, last = 0, handle = null, disposed = false;
    const rows = new Map();
    const buildLegend = () => {
        legend.textContent = ""; rows.clear();
        for (const p of scene.pilots) {
            const row = el("div", null, "droprow"), sw = el("span", null, "sw"), body = el("div"), nm = el("div", p.name, "nm"), bl = el("div", p.blurb, "sub"), live = el("div", "", "sub"), res = el("div", resultLine(p, scene), "sub");
            sw.style.background = hsl(p.hue); body.appendChild(nm); body.appendChild(bl); body.appendChild(live); body.appendChild(res); row.appendChild(sw); row.appendChild(body); legend.appendChild(row); rows.set(p.id, live);
        }
    };
    const tx = (i, w) => (i / Math.max(1, scene.ticks - 1)) * w;
    const shade = (g, w, h) => { g.fillStyle = "rgba(120,140,170,.16)"; for (const [a, b] of scene.windows) g.fillRect(tx(a, w), 0, tx(b, w) - tx(a, w), h); };
    const line = (g, arr, n, w, h, lo, hi, color, width, dash) => {
        g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath();
        for (let i = 0; i < n; i++) { const x = tx(i, w), y = h - ((arr[i] - lo) / (hi - lo)) * (h - 12) - 6; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.setLineDash([]);
    };
    function drawPlan() {
        const g = plan.getContext("2d"), b = planBounds(scene), s = Math.min(PLAN_W / (b.maxX - b.minX), PLAN_H / (b.maxY - b.minY)), px = (x) => (x - b.minX) * s, py = (y) => (b.maxY - y) * s;   // north up: a right turn is clockwise on the screen
        g.clearRect(0, 0, PLAN_W, PLAN_H); g.fillStyle = "#04101c"; g.fillRect(0, 0, PLAN_W, PLAN_H);
        g.strokeStyle = "#1c2c44"; g.lineWidth = 1; for (let x = Math.ceil(b.minX / 50) * 50; x < b.maxX; x += 50) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), PLAN_H); g.stroke(); } for (let y = Math.ceil(b.minY / 50) * 50; y < b.maxY; y += 50) { g.beginPath(); g.moveTo(0, py(y)); g.lineTo(PLAN_W, py(y)); g.stroke(); }
        const p0 = scene.pilots[0], ox = px(p0.x[0]), oy = py(p0.y[0]), tl = 90 * s;   // the target heading, drawn from the start
        g.strokeStyle = "rgba(255,255,255,.45)"; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(scene.target.heading) * tl, oy + Math.sin(scene.target.heading) * tl); g.stroke(); g.setLineDash([]);
        for (const p of scene.pilots) {
            const n = Math.min(Math.floor(tick) + 1, p.ticks);
            for (let i = 1; i < n; i++) { g.strokeStyle = hsl(p.hue, p.dark[i] ? 0.95 : 0.5); g.lineWidth = p.dark[i] ? 3.5 : 1.5; g.beginPath(); g.moveTo(px(p.x[i - 1]), py(p.y[i - 1])); g.lineTo(px(p.x[i]), py(p.y[i])); g.stroke(); }
            const i = Math.max(0, n - 1); g.save(); g.translate(px(p.x[i]), py(p.y[i])); g.rotate(p.heading[i]); g.fillStyle = hsl(p.hue); g.strokeStyle = "#0009"; g.beginPath(); g.ellipse(0, 0, 13, 4.4, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
        }
    }
    function drawHeads() {
        const g = heads.getContext("2d"); g.clearRect(0, 0, CHART_W, HEAD_H); g.fillStyle = "#04101c"; g.fillRect(0, 0, CHART_W, HEAD_H); shade(g, CHART_W, HEAD_H);
        let lo = scene.target.heading, hi = scene.target.heading; for (const p of scene.pilots) for (let i = 0; i < p.ticks; i += 6) { if (p.heading[i] < lo) lo = p.heading[i]; if (p.heading[i] > hi) hi = p.heading[i]; }
        lo -= 0.2; hi += 0.2; const t = (scene.target.heading - lo) / (hi - lo);
        g.strokeStyle = "rgba(255,255,255,.5)"; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, HEAD_H - t * (HEAD_H - 12) - 6); g.lineTo(CHART_W, HEAD_H - t * (HEAD_H - 12) - 6); g.stroke(); g.setLineDash([]);
        const plain = scene.pilots[0], n0 = Math.min(Math.floor(tick) + 1, plain.ticks);
        line(g, plain.believed, n0, CHART_W, HEAD_H, lo, hi, "rgba(190,200,215,.8)", 1.5, [3, 3]);
        for (const p of scene.pilots) line(g, p.heading, Math.min(Math.floor(tick) + 1, p.ticks), CHART_W, HEAD_H, lo, hi, hsl(p.hue), 2);
        const x = tx(tick, CHART_W); g.strokeStyle = "#fff"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, HEAD_H); g.stroke();
        g.fillStyle = "#7c93b8"; g.font = "12px monospace"; g.fillText("heading (rad): target dashed white; what the plain autopilot believes dashed grey; shaded = compass dark", 8, 14);
    }
    function drawErrs() {
        const g = errs.getContext("2d"); g.clearRect(0, 0, CHART_W, ERR_H); g.fillStyle = "#04101c"; g.fillRect(0, 0, CHART_W, ERR_H); shade(g, CHART_W, ERR_H);
        for (const p of scene.pilots) line(g, p.error, Math.min(Math.floor(tick) + 1, p.ticks), CHART_W, ERR_H, 0, Math.PI, hsl(p.hue), 2);
        const x = tx(tick, CHART_W); g.strokeStyle = "#fff"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ERR_H); g.stroke();
        g.fillStyle = "#7c93b8"; g.font = "12px monospace"; g.fillText("error against the target heading (0 to pi rad)", 8, 14);
    }
    function paintAll() {
        if (!scene) return;
        const i = Math.min(Math.floor(tick), scene.ticks - 1);
        clock.textContent = `t = ${(i * scene.dt).toFixed(1)} s of ${(scene.ticks * scene.dt).toFixed(0)} s · ${compassLine(scene.windows, i, scene.dt)}`;
        for (const p of scene.pilots) { const k = Math.min(i, p.ticks - 1), live = rows.get(p.id); if (live) live.textContent = `now: heading error ${p.error[k].toFixed(2)} rad · ${p.depth[k].toFixed(0)} m`; }
        scrub.value = String(i); drawPlan(); drawHeads(); drawErrs();
    }
    function setDive(k) {
        dive = Math.max(0, Math.min(DIVES.length - 1, k | 0)); diveSel.value = String(dive); scene = flyScene(DIVES[dive].scenario, defs); tick = 0; scrub.max = String(scene.ticks - 1); buildLegend(); paintAll();
    }
    function frame(t) {
        if (!playing || disposed) return;
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
        tick = Math.min(scene.ticks - 1, tick + dt * (Number(speedSel.value) || 4) / TICK);
        paintAll();
        if (tick >= scene.ticks - 1) { setPlaying(false); return; }
        handle = raf(frame);
    }
    function setPlaying(on) {
        playing = !!on; playBtn.textContent = playing ? "pause" : (tick >= scene.ticks - 1 ? "replay" : "play"); last = 0;
        if (playing) { if (tick >= scene.ticks - 1) tick = 0; if (raf) handle = raf(frame); } else if (handle !== null && caf) { caf(handle); handle = null; }
    }
    diveSel.addEventListener("change", () => { setPlaying(false); setDive(Number(diveSel.value)); playBtn.textContent = "play"; });
    playBtn.addEventListener("click", () => setPlaying(!playing));
    scrub.addEventListener("input", () => { tick = Number(scrub.value) || 0; paintAll(); });
    setDive(0);
    root.dataset.ready = "1";
    return {
        setDive, setTick(k) { tick = Math.max(0, Math.min(scene.ticks - 1, k)); paintAll(); }, play: () => setPlaying(true), pause: () => setPlaying(false),
        state: () => ({ dive, tick: Math.floor(tick), playing, ticks: scene.ticks, scores: scene.pilots.map((p) => p.score), windows: scene.windows }),
        dispose() { disposed = true; playing = false; if (handle !== null && caf) caf(handle); root.textContent = ""; },
    };
}
