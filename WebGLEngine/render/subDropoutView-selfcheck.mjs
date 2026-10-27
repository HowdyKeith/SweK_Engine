// WebGLEngine/render/subDropoutView-selfcheck.mjs -- UNNUMBERED
//
// THE GATE OF THE COMPASS-DROPOUT VIEW (render/subDropoutView.mjs) AND OF THE WAY sub-aquarium.html MOUNTS IT. The scene it draws is gated by render/subDropoutScene-selfcheck.mjs.
//   1  THE SOURCE  the view sets every word with textContent and parses nothing as markup (no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, a handler set as an attribute); loads nothing from outside; imports only its scene; no Math.random. The page mounts it AFTER the
//                  tank is running, by dynamic imports inside try/catch (a static import of the view would let a broken view take the tank down with it), says so on the page when it cannot, loads the circuit as a vendored JSON import, and has the section it mounts into.
//   2  THE VIEW    mounted in Node on a fake DOM that records every drawing call and REFUSES to parse markup: the controls and canvases exist with their ids; the first dive is flown and shown (the clock, the legend rows, the result lines); the drawing at a chosen tick (how many
//                  stretches are heavy, which are shaded, which line is dashed grey and flat in the dark, the error against the target); play and pause by a fake frame clock (the speed, the clamp of a long frame, the end, the replay); the scrub bar; the dive picker; dispose.
//   3  THE LIVE PAGE  (needs a browser; SKIPPED, and said, without one) the page loads with no script error and no console error, the view mounts, draws pixels in all three canvases, plays, scrubs and changes dive, and the tank above it still runs.
// NOT CHECKED, said plainly: how it looks (a screenshot is written for a person to look at); a touch screen; a browser other than the one the sandbox has; that the numbers are the study's (render/subDropoutScene-selfcheck.mjs).
//
// SABOTAGE LOG (the thing broken -> the rows that went red; every mutant must be red BY NAME):
//   render/subDropoutView.mjs, 78 mutants: 70 red by name on the first run, EIGHT 0-red (fixed in the gate, then every one red by name: W25 W28 W29 W43 W45 W55 W56 W77). The rest, by what was broken: the source rules (words set with innerHTML or outerHTML, the root cleared with innerHTML, an eval, a fetch, an http
//   address, Math.random, a second import, a handler attribute); the canvases and controls (a canvas's height, the speeds, the default speed, the scrub range, the dive labels, the legend's blurb and result lines, the swatch, the order of the elements, the pickers' labels, the ready flag, the notes and the
//   intro); the drawing (the lightness of a hue, the time axis, the shade too faint or on one window only, the line's height inverted, a dark stretch drawn light, the alpha swapped, the plan's two axes, the plan's scale by the wrong side, the glyph turned the wrong way or by the world heading, the target line sloped or
//   in the wrong place, the plan a tick ahead or rounded, the plain pilot as narrow as the others, the background not painted, the believed line from the wrong pilot or solid or thick, the cursor, the heading scale without its pad or from the ticks so far, the target line's height, the error scale, the error chart
//   drawing the heading or not shaded); the clock (the total in tenths, a rounded tick, the live line's depth and decimals, the scrub bar showing a fractional tick); the controls (a new dive not starting over, a wild dive number, the picker out of step, a long frame not clamped, the speed ignored, the time divided
//   wrongly, the end not stopping, 'replay' missing or not starting over, pause not cancelling the frame, a stale clock on resume, a new dive not stopping play or not resetting the button, the scrub bar ignored, dispose leaving the root or the frame going, the legend piling up rows, setTick unclamped, the state's scores
//   cut). Findings: a line left dashed (W25) and a plan scaled by the larger side (W29: the two scales differ by 7 percent and the 20 m pad kept every point inside, so only an exactly-filled side catches it); the plan flipped (W28: the oracle flies straight, so its direction cannot tell a flip: the widest swing of the plain pilot
//   does); the heading scale's pad (W43) and the target line's height (W45: checked against where the oracle ends, on the target); an unclamped dive number that THREW with no row naming it (W55: that row now runs in a try, and the crash is a named red); the picker out of step (W56) and the intro (W77). Dead code the sabotage
//   found and cut: a `disposed` flag that `playing = false` already did, a `rows.clear()`, a literal scrub range the first dive overwrote, an unused `now`.
//   sub-aquarium.html (its dropout section and mount), 17 mutants, 17 red by name: a static import of the view, the view or its circuit file named wrongly, the circuit imported without its JSON attribute or handed over whole, the catch without its words or writing markup, the mount missing, the wait for the
//   tank's first frame gone, the section, the host or the heading renamed, the loading line gone, and three sentences of the section's description removed in turn.
//   THE FINAL FULL RUN over the finished gate (all 78 + 17) found a ninth: W37 (the plan's background not painted) went 0-red because an edit of the gate had cut its row (the 'first cleared and painted' row) along with the lines around it; the row is back and W37 is red by name. A gate edited after its sabotage is run again in full.
//   NOT CHECKED here: that the CSS lays the section out well (a screenshot is written for a person to look at).
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as TS from "../tools/ship/trainSubState.mjs";
import * as V from "./subDropoutScene.mjs";
import { mountDropoutView } from "./subDropoutView.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, ".."), require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
console.log("subDropoutView-selfcheck -- the compass-dropout view and how the Sub Aquarium mounts it\n");

const viewSrc = fs.readFileSync(path.join(HERE, "subDropoutView.mjs"), "utf8"), pageSrc = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
const code = (s) => s.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

console.log("1. THE SOURCE");
{
    const v = code(viewSrc);
    for (const [what, re] of [["innerHTML", /\.innerHTML\b/], ["outerHTML", /\.outerHTML\b/], ["insertAdjacentHTML", /insertAdjacentHTML/], ["document.write", /document\.write/], ["eval(", /\beval\s*\(/], ["new Function", /new\s+Function/], ["a handler set as an attribute (setAttribute(\"on...", /setAttribute\(\s*["']on/i], ["srcdoc", /srcdoc/], ["DOMParser / createContextualFragment / template parsing", /DOMParser|createContextualFragment|\.parseFromString/]])
        ok(`!! the view never uses ${what}`, !re.test(v));
    ok("!! the view loads nothing from outside: no http(s) address, no fetch, no XMLHttpRequest, no WebSocket, no import()", !/https?:\/\//.test(v) && !/\bfetch\s*\(/.test(v) && !/XMLHttpRequest|WebSocket|\bimport\s*\(/.test(v));
    ok("!! the view imports only its scene (render/subDropoutScene.mjs)", same([...v.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]), ["./subDropoutScene.mjs"]));
    ok("!! no Math.random and no Date (the view is as deterministic as its scene)", !/Math\.random|Date\.now|new Date/.test(v));
    ok("!! every word the view writes goes in with textContent (it is how the elements are made, and how the clock, the legend and the notes are written)", (v.match(/textContent/g) || []).length >= 8 && /e\.textContent = text/.test(v) && /clock\.textContent =/.test(v) && /live\.textContent =/.test(v));
    const pg = code(pageSrc), mount = pg.slice(pg.indexOf("requestAnimationFrame(frame);\n(async"));
    ok("!! the page imports the view by DYNAMIC import() and not by a static import (a broken view must not take the tank down with it)", /import\("\/render\/subDropoutView\.mjs"\)/.test(pg) && !/^import[^\n]*subDropout/m.test(pg));
    ok("!! the mount is the LAST thing the script does, after the tank's first frame was asked for, and sits in a try/catch that writes a message on the page ('unavailable ... The tank above is not affected')", mount.length > 100 && /try \{/.test(mount) && /catch \(e\)/.test(mount) && /unavailable here/.test(mount) && /The tank above is not affected/.test(mount) && /textContent = "The compass-dropout/.test(mount) && mount.indexOf("mountDropoutView") > mount.indexOf("import("));
    ok("!! the circuit is the vendored heading loop, imported as JSON ({ with: { type: \"json\" } }) from the engine's own folder, and handed over as { neurons, edges, io } only", /import\("\/vendor\/hemibrain\/hemibrain-cx-heading-loop\.json", \{ with: \{ type: "json" \} \}\)/.test(mount) && /circuit: \{ neurons: j\.neurons, edges: j\.edges, io: j\.io \}/.test(mount));
    ok("!! the page has the section the view mounts into: #dropout with a heading and #dropoutHost (which says it is loading until the view takes over)", /<section id="dropout"/.test(pg) && /<h2>When the compass goes dark<\/h2>/.test(pg) && /<div id="dropoutHost">/.test(pg) && /loading the dropout view/.test(pg) && /\$\("dropoutHost"\)/.test(mount));
    ok("the page's description of the section says what is held and what stays true, in plain words", /heading each is shown stays frozen/.test(pg) && /turning rate, depth and speed stay true/.test(pg) && /oracle navigator integrates the exact turning rate/.test(pg));
    ok("the mount waits a moment before the first dive is flown, so the tank paints a frame first", /setTimeout\(r, 60\)/.test(mount));
}

// ---- a fake DOM: it records what is drawn and REFUSES markup --------------------------------------------------------------------------------------------------------------------------------------------
function fakeDoc() {
    const made = [];
    class El {
        constructor(tag) { this.tag = tag; this.children = []; this._text = ""; this.listeners = {}; this.attrs = {}; this.style = {}; this.dataset = {}; this.className = ""; this._value = ""; this.id = ""; this.parent = null; if (tag === "canvas") this.ctx = fakeCtx(); made.push(this); }
        get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
        set textContent(v) { this._text = String(v); this.children.forEach((c) => { c.parent = null; }); this.children = []; }
        get value() { return this._value; } set value(v) { this._value = String(v); }
        get innerHTML() { throw new Error("innerHTML read"); } set innerHTML(v) { throw new Error("innerHTML set"); }
        get outerHTML() { throw new Error("outerHTML read"); } set outerHTML(v) { throw new Error("outerHTML set"); }
        insertAdjacentHTML() { throw new Error("insertAdjacentHTML"); }
        appendChild(c) { c.parent = this; this.children.push(c); if (this.tag === "select" && c.tag === "option") { if (!this._value || c.selected) this._value = c.value; } return c; }
        setAttribute(k, v) { if (/^on/i.test(k)) throw new Error("handler attribute " + k); this.attrs[k] = String(v); }
        addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
        fire(t) { for (const f of this.listeners[t] || []) f({ type: t, target: this }); }
        getContext() { return this.ctx; }
    }
    return { createElement: (tag) => new El(tag), made, byId: (id) => made.find((e) => e.id === id) };
}
function fakeCtx() {
    const ops = [], st = { fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", dash: [] };
    const rec = (name) => (...a) => { ops.push({ name, a, fillStyle: st.fillStyle, strokeStyle: st.strokeStyle, lineWidth: st.lineWidth, dash: st.dash }); };
    const ctx = { ops, st, setLineDash(d) { st.dash = d.slice(); }, getLineDash: () => st.dash };
    for (const n of ["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "stroke", "fill", "ellipse", "save", "restore", "translate", "rotate", "fillText"]) ctx[n] = rec(n);
    for (const k of ["fillStyle", "strokeStyle", "lineWidth", "font"]) Object.defineProperty(ctx, k, { get: () => st[k], set: (v) => { st[k] = v; } });
    return ctx;
}
function fakeClock() {
    const q = new Map(); let next = 1;
    const clock = { lastFn: null, raf: (fn) => { q.set(next, fn); clock.lastFn = fn; return next++; }, caf: (id) => { q.delete(id); }, pending: () => q.size, ids: () => [...q.keys()], tick(ms) { const fns = [...q.values()]; q.clear(); for (const f of fns) f(ms); } };
    return clock;
}
const tryRow = (label, fn) => { let r = false, n = ""; try { r = fn(); } catch (e) { n = "threw: " + String(e && e.message).slice(0, 120); } ok(label, r, n); };
const circuit = TS.loadCircuit();
const fresh = () => { const doc = fakeDoc(), root = doc.createElement("div"), clock = fakeClock(); let c; try { c = mountDropoutView(root, { circuit, doc, raf: clock.raf, caf: clock.caf }); } catch (e) { return { err: e }; } return { doc, root, clock, c, el: doc.byId }; };

console.log("\n2. THE VIEW (a fake DOM that refuses markup)");
const M = fresh();
const defs = V.pilotDefs(circuit), scenes = V.DIVES.map((d) => V.flyScene(d.scenario, defs));
if (M.err) { ok("!! the view mounts on a fake DOM without throwing", false, String(M.err.stack || M.err).slice(0, 300)); }
else {
    const { doc, root, clock, c, el } = M;
    ok("!! the view mounts without touching innerHTML, outerHTML, insertAdjacentHTML or an on-handler attribute (the fake DOM throws on all of them), and marks the root ready", root.dataset.ready === "1");
    const ids = ["dropPlan", "dropHeads", "dropErrs", "dropPlay", "dropDive", "dropSpeed", "dropScrub", "dropClock", "dropLegend"];
    ok("!! the nine controls have their ids, on the right kinds of element: three canvases (plan, heads, errs), a button, two selects, a range, a clock, a legend", ids.every((i) => el(i)) && same(["dropPlan", "dropHeads", "dropErrs"].map((i) => el(i).tag), ["canvas", "canvas", "canvas"]) && el("dropPlay").tag === "button" && el("dropDive").tag === "select" && el("dropSpeed").tag === "select" && el("dropScrub").tag === "input" && el("dropScrub").type === "range");
    ok("!! the canvases have the sizes the drawing assumes (1000x360 plan, 1000x200 headings, 1000x150 errors) and each says in words what it is (aria-label)", same(["dropPlan", "dropHeads", "dropErrs"].map((i) => [el(i).width, el(i).height]), [[1000, 360], [1000, 200], [1000, 150]]) && ["dropPlan", "dropHeads", "dropErrs"].every((i) => /view|against/.test(el(i).attrs["aria-label"] || "")));
    ok("!! the dive picker lists the three dives by label (text), starting on the first; the speed picker lists 1, 4, 10 and 30 times and starts on 4", same(el("dropDive").children.map((o) => o.textContent), V.DIVES.map((d) => d.label)) && el("dropDive").value === "0" && same(el("dropSpeed").children.map((o) => o.value), ["1", "4", "10", "30"]) && el("dropSpeed").value === "4" && el("dropSpeed").children.every((o) => /×$/.test(o.textContent)));
    ok("!! the scrub bar runs over the whole dive (0 to 1799), starts at 0, and the clock reads 't = 0.0 s of 60 s · compass valid' on the first tick", el("dropScrub").min === "0" && el("dropScrub").max === "1799" && el("dropScrub").value === "0" && el("dropClock").textContent === "t = 0.0 s of 60 s · compass valid");
    ok("!! the root holds, in order: the intro, the bar, the plan, the headings, the errors, the legend, the notes; the bar holds the two labelled pickers, the button, the scrub bar and the clock", same(root.children.map((n) => n.tag + (n.id ? "#" + n.id : "")), ["p", "div", "canvas#dropPlan", "canvas#dropHeads", "canvas#dropErrs", "div#dropLegend", "div"])
        && same(root.children[1].children.map((n) => n.id || n.tag), ["label", "label", "dropPlay", "dropScrub", "dropClock"]) && same(root.children[1].children.slice(0, 2).map((n) => n.textContent.replace(/[^a-z ]/gi, "").slice(0, 5)), ["dive ", "speed"])
        && root.children[0].textContent === "Press play. Heavy stretches of a track are flown with the compass dark; the grey dashed line is the heading the plain autopilot believes.");
    const rows = el("dropLegend").children;
    ok("!! the legend has one row per pilot in order, with the pilot's name, its blurb and its RESULT line (score, then the clean autopilot's), all as text", rows.length === 4 && rows.every((r, i) => { const t = r.textContent; return t.includes(defs[i].name) && t.includes(scenes[0].pilots[i].blurb) && t.includes(V.resultLine(scenes[0].pilots[i], scenes[0])); }) && el("dropLegend").textContent.includes("PD autopilot: score -0.943 (the clean autopilot -0.715)") && el("dropLegend").textContent.includes("autopilot + oracle navigator: score -0.715"));
    const swatch = (r) => r.children[0].style.background;
    ok("!! each legend row's swatch is the pilot's own hue (the colour its line has in every canvas)", rows.every((r, i) => swatch(r) === `hsl(${defs[i].hue} 75% 58% / 1)`));
    ok("!! the notes under the view are the scene's notes, each in its own paragraph, and say the study's numbers", root.children[root.children.length - 1].children.map((n) => n.textContent).join("|") === V.notesFor().join("|"));
    const ctx = (id) => el(id).ctx, strokes = (id) => ctx(id).ops.filter((o) => o.name === "stroke");
    const at = (k) => { for (const i of ["dropPlan", "dropHeads", "dropErrs"]) ctx(i).ops.length = 0; c.setTick(k); };
    // the plan at tick 300: inside the first window (205..684)
    at(300);
    const hues = defs.map((d) => d.hue), LW = [5, 2.5, 2, 2];
    const segsOf = (k, heavy) => strokes("dropPlan").filter((o) => o.strokeStyle.startsWith(`hsl(${hues[k]} `) && o.lineWidth === (heavy ? 3.5 : 1.5) + (k === 0 ? 3 : 0)), segs = (heavy) => [0, 1, 2, 3].flatMap((k) => segsOf(k, heavy));
    ok("!! at tick 300 the plan draws every pilot's track so far, and exactly the ticks flown with the compass DARK (205..300: 96 a pilot) heavy and opaque, the 204 others light and faint", segs(true).length === 4 * 96 && segs(false).length === 4 * 204 && segs(true).every((o) => /\/ 0\.95\)$/.test(o.strokeStyle)) && segs(false).every((o) => /\/ 0\.5\)$/.test(o.strokeStyle)));
    ok("!! each pilot's track is in its own hue: 96 heavy and 204 light segments for each of the four; the PLAIN pilot's is drawn 3 px wider than the others (so that a pilot that flew the same line shows inside its band)", hues.every((h, k) => segsOf(k, true).length === 96 && segsOf(k, false).length === 204));
    const planSegs = (hue) => { const o = ctx("dropPlan").ops, out = []; for (let i = 0; i + 3 < o.length; i++) if (o[i].name === "beginPath" && o[i + 1].name === "moveTo" && o[i + 2].name === "lineTo" && o[i + 3].name === "stroke" && o[i + 3].strokeStyle.startsWith(`hsl(${hue} `)) out.push([o[i + 1].a, o[i + 2].a]); return out; };
    const oracleSegs = (at(900), planSegs(140)), last = oracleSegs[oracleSegs.length - 1];
    ok("!! the plan is drawn the way the vessel turns: on the SCREEN the oracle's track at tick 900 runs in the direction of its own heading measured from the target heading (a right turn is clockwise on the screen), taken from its last drawn segment, and the dashed target line is HORIZONTAL (to the right), starting where the tracks start", near(Math.atan2(last[1][1] - last[0][1], last[1][0] - last[0][0]), scenes[0].pilots[1].heading[900] - scenes[0].target.heading, 0.05) && (() => { const o = ctx("dropPlan").ops, k = o.findIndex((x) => x.name === "stroke" && same(x.dash, [6, 6])), m = o[k - 2], l = o[k - 1], first = planSegs(140)[0][0]; return m.name === "moveTo" && l.name === "lineTo" && l.a[1] === m.a[1] && l.a[0] > m.a[0] && near(m.a[0], first[0], 1e-6) && near(m.a[1], first[1], 1e-6); })());
    at(1799);
    const pts = ctx("dropPlan").ops.filter((o) => o.name === "moveTo" || o.name === "lineTo").map((o) => o.a), trackPts = defs.flatMap((d) => planSegs(d.hue).flat());
    const ext = Math.max((Math.max(...trackPts.map((p) => p[0])) - Math.min(...trackPts.map((p) => p[0]))) / 1000, (Math.max(...trackPts.map((p) => p[1])) - Math.min(...trackPts.map((p) => p[1]))) / 360);
    const mU = scenes[0].pilots.flatMap((q) => Array.from(q.u)), mV = scenes[0].pilots.flatMap((q) => Array.from(q.v)), eu = Math.max(...trackPts.map((p) => p[0])) - Math.min(...trackPts.map((p) => p[0])), ev = Math.max(...trackPts.map((p) => p[1])) - Math.min(...trackPts.map((p) => p[1]));
    const sc1 = eu / (Math.max(...mU) - Math.min(...mU)), filled = (e, lim) => Math.abs(e + 40 * sc1 - lim) < 1.5, within = (e, lim) => e + 40 * sc1 <= lim + 1.5;
    ok("!! the whole dive fits the plan canvas and FILLS it in the dimension that limits it: every point lies inside 1000 x 360, and with the 20 m pad on each side (40 m at the scale of the drawing) one of the two sides is exactly full while the other is not over", trackPts.length > 7000 && trackPts.every((p) => p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= 360) && ((filled(eu, 1000) && within(ev, 360)) || (filled(ev, 360) && within(eu, 1000))) && ext < 1, `scale ${sc1.toFixed(3)} px/m, extent ${eu.toFixed(0)} x ${ev.toFixed(0)}`);
    const pl0 = planSegs(hues[0]), pv = scenes[0].pilots[0].v, kMax = Array.from(pv).reduce((m, v, k) => (Math.abs(v) > Math.abs(pv[m]) ? k : m), 0), yFirst = pl0[0][0][1], yMax = pl0[kMax - 1][1][1];
    ok("!! to the RIGHT of the target is DOWN the screen: at its widest swing the plain pilot is more than 10 m to the right of the target line (v), and that point is lower on the screen than the start by the scale of the drawing", Math.abs(pv[kMax]) > 10 && Math.sign(pv[kMax]) === Math.sign(yMax - yFirst) && near(yMax - yFirst, pv[kMax] * sc1, 2), `tick ${kMax}: v ${pv[kMax].toFixed(1)} m, y ${yFirst.toFixed(1)} -> ${yMax.toFixed(1)} px`);
    at(1799);
    ok("!! each canvas is first cleared and painted over its whole size with the dark water colour (the plan, the headings and the errors)", [["dropPlan", 1000, 360], ["dropHeads", 1000, 200], ["dropErrs", 1000, 150]].every(([id, w, h]) => { const o = ctx(id).ops, k = o.findIndex((x) => x.name === "clearRect"), f = o.findIndex((x) => x.name === "fillRect"); return k === 0 && same(o[k].a, [0, 0, w, h]) && f === 1 && same(o[f].a, [0, 0, w, h]) && o[f].fillStyle === "#04101c"; }));
    ok("!! before any dark tick (tick 100) no segment is heavy", (at(100), segs(true).length === 0 && segs(false).length === 4 * 100));
    ok("!! at tick 0 nothing of a track is drawn yet, but each pilot's glyph is (four ellipses) and the target heading's dashed line is", (at(0), segs(true).length === 0 && segs(false).length === 0 && ctx("dropPlan").ops.filter((o) => o.name === "ellipse").length === 4 && strokes("dropPlan").some((o) => same(o.dash, [6, 6]))));
    ok("!! the glyph of each pilot is turned to the heading it has at that tick, measured from the target heading (the plan's frame has the target pointing right), 4 of them", (at(300), ctx("dropPlan").ops.filter((o) => o.name === "rotate").every((o, i) => near(o.a[0], scenes[0].pilots[i].heading[300] - scenes[0].target.heading, 1e-6)) && ctx("dropPlan").ops.filter((o) => o.name === "rotate").length === 4));
    // headings
    at(300);
    const hs = strokes("dropHeads"), shaded = ctx("dropHeads").ops.filter((o) => o.name === "fillRect" && o.fillStyle === "rgba(120,140,170,.16)");
    ok("!! the heading chart shades the two dark windows: two translucent rectangles, starting at 205/1799 and 1279/1799 of the width and 480/1799 wide", shaded.length === 2 && near(shaded[0].a[0], 205 / 1799 * 1000, 1e-6) && near(shaded[1].a[0], 1279 / 1799 * 1000, 1e-6) && shaded.every((o) => near(o.a[2], 480 / 1799 * 1000, 1e-6) && o.a[3] === 200));
    const series = hs.filter((o) => /^hsl\(/.test(o.strokeStyle) || same(o.dash, [3, 3]));
    ok("!! the heading chart draws FIVE lines in this order: the heading the plain autopilot BELIEVES (grey, dashed 3 3, thin) and then the four true headings in the pilots' hues", series.length === 5 && /^rgba\(190,200,215/.test(series[0].strokeStyle) && same(series[0].dash, [3, 3]) && series[0].lineWidth === 1.5 && series.slice(1).every((o, i) => o.strokeStyle === `hsl(${hues[i]} 75% 58% / 1)` && o.lineWidth === LW[i] && same(o.dash, [])));
    const polyline = (ops, k) => { let n = 0; const ys = []; for (let i = 0; i < ops.length; i++) { if (ops[i].name === "stroke") { if (n === k) { let j = i - 1; while (j >= 0 && ops[j].name !== "beginPath") { if (ops[j].name === "lineTo" || ops[j].name === "moveTo") ys.unshift(ops[j].a); j--; } return ys; } n++; } } return null; };
    const allOps = ctx("dropHeads").ops, firstSeries = hs.indexOf(series[0]);
    const grey = polyline(allOps, firstSeries), plainTrue = polyline(allOps, hs.indexOf(series[1]));
    ok("!! the believed line is the plain autopilot's and is FLAT through the dark (the compass is held: every point of ticks 205 to 300 has the same height) while the true heading of the same pilot moves; both have 301 points", grey && plainTrue && grey.length === 301 && plainTrue.length === 301 && grey.slice(205).every((p) => p[1] === grey[205][1]) && plainTrue.slice(205).some((p) => Math.abs(p[1] - plainTrue[205][1]) > 5));
    ok("!! the believed line equals the true heading until the compass goes dark (ticks 0 to 204 are the same height for the plain pilot's belief and its truth), the truth leaving it after", grey.slice(0, 205).every((p, i) => near(p[1], plainTrue[i][1], 1e-6)) && Math.abs(grey[300][1] - plainTrue[300][1]) > 5);
    ok("!! the chart's cursor is a white vertical line at the tick (300/1799 of the width)", hs.some((o) => o.strokeStyle === "#fff" && o.lineWidth === 1) && ctx("dropHeads").ops.some((o) => o.name === "moveTo" && near(o.a[0], 300 / 1799 * 1000, 1e-6) && o.a[1] === 0));
    // errors
    const headY = (k, tick) => { const o = (at(tick), polyline(ctx("dropHeads").ops, strokes("dropHeads").indexOf(strokes("dropHeads").filter((x) => /^hsl\(/.test(x.strokeStyle))[k]))); return o; };
    const early = headY(0, 300), full = headY(0, 1799), allY = [0, 1, 2, 3].flatMap((k) => headY(k, 1799).map((p) => p[1]));
    ok("!! the heading chart keeps ONE scale for the whole dive: a point at tick 100 is at the same height whether the cursor is at 300 or at the end; every heading line of every pilot stays inside the chart with a margin (10 to 190 of 200: the scale has a pad) and the lines use most of its height (the extremes come within 25 pixels of both edges)", early[100][1] === full[100][1] && allY.every((y) => y >= 10 && y <= 190) && Math.min(...allY) < 29 && Math.max(...allY) > 171, `${Math.min(...allY).toFixed(1)}..${Math.max(...allY).toFixed(1)}`);
    at(1799);
    const oracleEnd = polyline(ctx("dropHeads").ops, strokes("dropHeads").indexOf(strokes("dropHeads").filter((x) => /^hsl\(/.test(x.strokeStyle))[1])), tgtOp = ctx("dropHeads").ops.findIndex((o, i, a) => o.name === "stroke" && same(o.dash, [6, 6]));
    const tgtY = ctx("dropHeads").ops[tgtOp - 1].a[1];
    ok("!! the target heading is drawn at the height of the target: the oracle's heading at the end of the dive (0.00 rad from the target) ends on the dashed target line, within 3 px", near(oracleEnd[oracleEnd.length - 1][1], tgtY, 3) && ctx("dropHeads").ops[tgtOp - 1].name === "lineTo" && ctx("dropHeads").ops[tgtOp - 2].a[1] === tgtY, `${oracleEnd[oracleEnd.length - 1][1].toFixed(1)} vs ${tgtY.toFixed(1)}`);
    at(300);
    const es = strokes("dropErrs").filter((o) => /^hsl\(/.test(o.strokeStyle)), ep = (k) => polyline(ctx("dropErrs").ops, strokes("dropErrs").indexOf(es[k]));
    const Y = (e) => 150 - (e / Math.PI) * (150 - 12) - 6;
    ok("!! the error chart draws one line per pilot in its hue, each point the pilot's ERROR AGAINST THE TARGET on a scale of 0 to pi (checked point by point against the scene)", es.length === 4 && es.every((o, i) => o.strokeStyle === `hsl(${hues[i]} 75% 58% / 1)` && o.lineWidth === LW[i] && same(o.dash, [])) && es.every((o, k) => { const ys = ep(k); return ys.length === 301 && ys.every((p, i) => near(p[1], Y(scenes[0].pilots[k].error[i]), 1e-9)); }));
    ok("!! the error chart shades the windows too", ctx("dropErrs").ops.filter((o) => o.name === "fillRect" && o.fillStyle === "rgba(120,140,170,.16)").length === 2);
    // the clock and the live lines
    ok("!! at tick 300 the clock says how long into the dive and that the compass is DARK with the seconds left in the window; at tick 100 it says valid; at tick 684 it still says dark, with 0.0 s left; at 685 valid again", (at(300), el("dropClock").textContent === "t = 10.0 s of 60 s · COMPASS DARK, 12.8 s left in this window") && (at(100), el("dropClock").textContent === "t = 3.3 s of 60 s · compass valid") && (at(684), el("dropClock").textContent === "t = 22.8 s of 60 s · COMPASS DARK, 0.0 s left in this window") && (at(685), /compass valid$/.test(el("dropClock").textContent)));
    at(300);
    ok("!! the live line of each pilot reads its heading error and depth AT THE TICK ('now: heading error 0.62 rad · 33 m'), and the scrub bar follows the tick", rows.every((r, i) => r.children[1].children[2].textContent === `now: heading error ${scenes[0].pilots[i].error[300].toFixed(2)} rad · ${scenes[0].pilots[i].depth[300].toFixed(0)} m`) && el("dropScrub").value === "300");
    ok("!! a tick past the end or before the start is held to the dive: 99999 reads the last tick (1799, 't = 60.0 s of 60 s · compass valid') and -5 reads the first", (c.setTick(99999), c.state().tick === 1799 && el("dropClock").textContent === "t = 60.0 s of 60 s · compass valid") && (c.setTick(-5), c.state().tick === 0 && el("dropClock").textContent === "t = 0.0 s of 60 s · compass valid"));
    ok("!! a fractional tick (playing makes them) is read as the tick it has reached, not rounded up: 304.7 reads 'tick 304' (10.1 s) on the clock, in the scrub bar and in the drawing (the same 96 heavy segments a pilot as at 300 would have 100 more light ones)", (at(304.7), el("dropClock").textContent === "t = 10.1 s of 60 s · COMPASS DARK, 12.7 s left in this window" && el("dropScrub").value === "304" && segs(true).length === 4 * 100 && segs(false).length === 4 * 204));
    // the scrub bar
    el("dropScrub").value = "500"; el("dropScrub").fire("input");
    ok("!! moving the scrub bar moves the dive to that tick (500: 16.7 s, dark, 6.2 s left) and redraws", el("dropClock").textContent === "t = 16.7 s of 60 s · COMPASS DARK, 6.2 s left in this window" && c.state().tick === 500);
    // play and pause by a fake frame clock
    c.setTick(0); clock.tick(0);
    const btn = el("dropPlay");
    ok("the button reads 'play' on a dive that is stopped", btn.textContent === "play");
    btn.fire("click");
    ok("!! pressing play asks for a frame and the button reads 'pause'", c.state().playing && clock.pending() === 1 && btn.textContent === "pause");
    clock.tick(1000);   // the first frame only starts the clock
    ok("the first frame only starts the clock: no time has passed yet", c.state().tick === 0 && clock.pending() === 1);
    clock.tick(1100);   // 100 ms later at 4x: 0.4 s of dive = 12 ticks
    ok("!! 100 ms of frame time at the speed 4x is 0.4 s of dive: 12 ticks", c.state().tick === 12, "tick " + c.state().tick);
    clock.tick(5000);   // a long gap (a hidden tab): clamped to 100 ms
    ok("!! a long frame (a hidden tab, 3.9 s) is clamped to 100 ms: it moves 12 ticks and not 468", c.state().tick === 24, "tick " + c.state().tick);
    el("dropSpeed").value = "30"; clock.tick(5100);
    ok("!! at 30x, 100 ms is 3 s of dive: 90 ticks", c.state().tick === 24 + 90, "tick " + c.state().tick);
    btn.fire("click");
    ok("!! pressing pause stops: the pending frame is cancelled, the button reads 'play' and the dive stays at its tick", !c.state().playing && clock.pending() === 0 && btn.textContent === "play" && c.state().tick === 114);
    btn.fire("click"); clock.tick(8000);
    ok("!! resuming after a pause: the first frame only restarts the clock (a stale clock must not make the dive jump): the tick is still 114; the next frame then moves 90", c.state().playing && c.state().tick === 114 && (clock.tick(8100), c.state().tick === 204));
    btn.fire("click");
    c.setTick(1790); btn.fire("click"); clock.tick(6000); clock.tick(6100);
    ok("!! at the end of the dive playing stops by itself: the dive reads its last tick (1799), no frame is pending, and the button reads 'replay'", c.state().tick === 1799 && !c.state().playing && clock.pending() === 0 && btn.textContent === "replay");
    btn.fire("click");
    ok("!! pressing 'replay' starts again from tick 0", c.state().tick === 0 && c.state().playing && btn.textContent === "pause");
    btn.fire("click");
    // the dive picker
    c.setTick(400); btn.fire("click");
    const wasPlaying = c.state().playing && clock.pending() === 1;
    el("dropDive").value = "1"; el("dropDive").fire("change");
    ok("!! choosing the second dive stops playback, goes back to tick 0 and flies it: the legend now shows the recovery dive's results (PD autopilot -0.794, the clean autopilot -0.426) and the clock is at 0", c.state().dive === 1 && c.state().tick === 0 && wasPlaying && !c.state().playing && clock.pending() === 0 && el("dropLegend").children.length === 4 && el("dropScrub").max === "1799" && el("dropLegend").textContent.includes("PD autopilot: score -0.794 (the clean autopilot -0.426)") && el("dropClock").textContent === "t = 0.0 s of 60 s · compass valid" && btn.textContent === "play");
    ok("!! the third dive's results are shown for the third dive (-0.745 against -0.472), and the scores the controller reports are those of the scene", (c.setDive(2), el("dropLegend").textContent.includes("PD autopilot: score -0.745 (the clean autopilot -0.472)") && same(c.state().scores, scenes[2].pilots.map((p) => p.score))) && same(c.state().windows, [[205, 685], [1279, 1759]]));
    ok("!! setDive keeps the picker in step: after setDive(2) the picker reads 2", el("dropDive").value === "2");
    tryRow("!! setDive holds a wild number to the three dives (99 is the third, -4 the first) and the picker follows", () => (c.setDive(1), el("dropDive").value === "1") && (c.setDive(99), c.state().dive === 2 && el("dropDive").value === "2") && (c.setDive(-4), c.state().dive === 0 && el("dropDive").value === "0"));
    // dispose
    c.setDive(0); btn.fire("click"); const ticksBefore = c.state().tick, queued = clock.lastFn; c.dispose();
    ok("!! dispose empties the root and stops the frames: nothing pending, and a frame that had already been asked for does nothing when it comes (it draws nothing and asks for nothing)", root.children.length === 0 && root.textContent === "" && clock.pending() === 0 && (ctx("dropPlan").ops.length = 0, queued(9000), queued(9100), clock.pending() === 0 && ctx("dropPlan").ops.length === 0 && ticksBefore === 0));
}

console.log("\n3. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 read source and run the view on a fake DOM, which cannot show that a real browser loads it, imports the vendored circuit as JSON, or draws a pixel");
    } else {
        const bridge = (await import("../ai-bridge/subAquariumBridge.js")).createBridge({ root: ENG }), types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const sendJson = (o, code2 = 200) => { res.writeHead(code2, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
            if (bridge.owns(req.url)) return bridge.handle(req, res, { sendJson, isTrusted: () => true }).catch((e) => sendJson({ ok: false, error: String(e) }, 500));
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await b.newContext({ viewport: { width: 1200, height: 1400 } })).newPage();
            const errs = [], cerrs = []; pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") cerrs.push(m.text()); });
            await pg.goto(base + "/sub-aquarium.html", { waitUntil: "load" });
            await pg.waitForFunction(() => { const h = document.getElementById("dropoutHost"); return h.dataset.ready === "1" || /unavailable/.test(h.textContent); }, null, { timeout: 30000 }).catch(() => {});
            ok("!! the page loads with no script error and no console error (the vendored circuit is imported as JSON, the view's modules all load)", errs.length === 0 && cerrs.length === 0, errs.concat(cerrs).join(" | ").slice(0, 300));
            ok("!! the view MOUNTS (the host is marked ready and does not say 'unavailable') and the section's heading is on the page", (await pg.getAttribute("#dropoutHost", "data-ready")) === "1" && !/unavailable/.test(await pg.textContent("#dropoutHost")) && /When the compass goes dark/.test(await pg.textContent("#dropout h2")));
            const px = await pg.evaluate(() => { const cnt = (id) => { const c = document.getElementById(id); if (!c) return { n: -1, hues: 0 }; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let n = 0; for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4); if (!seen.has(k)) seen.add(k); if (d[i] + d[i + 1] + d[i + 2] > 120) n++; } return { n, hues: seen.size }; }; return { plan: cnt("dropPlan"), heads: cnt("dropHeads"), errs: cnt("dropErrs") }; });
            ok("!! all three canvases are DRAWN at the start (bright pixels and several colours: the grid, the shading, the glyphs)", px.plan.n > 100 && px.heads.n > 100 && px.errs.n > 50 && px.plan.hues > 4 && px.heads.hues > 4 && px.errs.hues > 3, JSON.stringify(px));
            const legend = await pg.$$eval("#dropLegend .droprow", (r) => r.map((x) => x.querySelector(".nm").textContent));
            ok("!! the legend shows the four pilots by name, as text", same(legend, ["PD autopilot", "autopilot + oracle navigator", "autopilot + fly heading-loop estimator", "autopilot + random-wiring estimator (er:1)"]));
            ok("!! the first dive's result lines are on the page (PD autopilot -0.943 against the clean -0.715; the oracle -0.715)", /PD autopilot: score -0\.943 \(the clean autopilot -0\.715\)/.test(await pg.textContent("#dropLegend")) && /autopilot \+ oracle navigator: score -0\.715/.test(await pg.textContent("#dropLegend")));
            await pg.selectOption("#dropSpeed", "30"); await pg.click("#dropPlay");
            await pg.waitForFunction(() => /t = ([3-9]|[1-9]\d)\./.test(document.getElementById("dropClock").textContent), null, { timeout: 15000 }).catch(() => {});
            const played = await pg.textContent("#dropClock");
            ok("!! pressing play advances the clock in a real browser (at 30x: more than 3 s of dive within 15 s)", /t = ([3-9]|[1-9]\d)\./.test(played), played);
            await pg.click("#dropPlay");
            await pg.$eval("#dropScrub", (e) => { e.value = "500"; e.dispatchEvent(new Event("input")); });
            ok("!! the scrub bar works in a real browser: tick 500 reads 16.7 s with the compass dark", /^t = 16\.7 s of 60 s · COMPASS DARK, 6\.2 s left/.test(await pg.textContent("#dropClock")));
            const shadePx = await pg.evaluate(() => { const c = document.getElementById("dropHeads"), g = c.getContext("2d"), a = g.getImageData(Math.round(205 / 1799 * 1000) + 40, 190, 1, 1).data, o = g.getImageData(Math.round(700 / 1799 * 1000) + 10, 190, 1, 1).data; return { inWindow: Array.from(a), between: Array.from(o) }; });
            ok("!! the dark window is SHADED in the heading chart: a pixel inside the first window is lighter than one between the windows", shadePx.inWindow[0] + shadePx.inWindow[1] + shadePx.inWindow[2] > shadePx.between[0] + shadePx.between[1] + shadePx.between[2] + 20, JSON.stringify(shadePx));
            await pg.selectOption("#dropDive", "1");
            await pg.waitForFunction(() => /PD autopilot: score -0\.794/.test(document.getElementById("dropLegend").textContent), null, { timeout: 15000 }).catch(() => {});
            ok("!! choosing the recovery dive in a real browser shows its results (PD autopilot -0.794, the clean autopilot -0.426) and the clock back at 0", /PD autopilot: score -0\.794 \(the clean autopilot -0\.426\)/.test(await pg.textContent("#dropLegend")) && /^t = 0\.0 s/.test(await pg.textContent("#dropClock")));
            const tank = await pg.evaluate(() => { const c = document.getElementById("plan"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
            await pg.click("#seedBtn"); await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 6, null, { timeout: 8000 }).catch(() => {});
            ok("!! the tank above the view still works: its plan is painted and 'Offer my subs' puts six subs in the list, with no error from either", tank > 2000 && (await pg.$$eval("#list .row", (r) => r.length)) === 6 && errs.length === 0 && cerrs.length === 0, `plan pixels ${tank}`);
            try { await pg.screenshot({ path: process.env.DROPOUT_SHOT || "/tmp/sub-aquarium-dropout.png", fullPage: true }); report("screenshot at " + (process.env.DROPOUT_SHOT || "/tmp/sub-aquarium-dropout.png")); } catch {}
        } finally { await b.close(); server.close(); }
    }
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
