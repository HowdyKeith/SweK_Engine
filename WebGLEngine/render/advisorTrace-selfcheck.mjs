// WebGLEngine/render/advisorTrace-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node render/advisorTrace-selfcheck.mjs   (about 2 s)
//
// THE GATE OF render/advisorTrace.mjs AND ITS PLACE ON sub-aquarium.html: the advice over time for a sub whose rule advisor is on (backlog `advisor-toggle-on-the-aquarium-page`, the "view of the advice over time" it listed as NOT DONE).
//   1  pointOf: a point only from a row with needs, a clock and the advisor on
//   2  record: one trace a sub, the window, the point cap, a repeated clock replaces, a clock that goes back starts again, a sub that leaves or turns the advisor off keeps nothing
//   3  summaryOf and summaryLine: the seconds each advice held and the number of times SURFACE came on
//   4  the chart: the charge and threshold paths in the plot, each band's rectangles where and only where it was advised, the empty chart, clamping, the SVG text escaped, mountSvg builds the same nodes with createElementNS
//   5  the tank: the snapshot's needs reading carries the event's clock (t), and the advisor's threshold arrives in the trace from a real tank
//   6  the page: it imports the module, holds a hidden panel, records every snapshot, draws only the selected sub's trace and never as markup, and a hidden .panel is not shown
// SABOTAGED -- 39 mutants, each alone in place and restored (count of red rows): render/advisorTrace.mjs T01 the advisor-off row given a point (3) | T02 a missing clock accepted (1) | T03 the advices not made booleans (1) |
//   T04 a NaN reading kept (1) | T05 a backwards clock not restarting (1) | T06 a repeated clock appended (1) | T07 the window not cut (1) | T08 the cap not held (1) | T09 absent subs kept (3) | T10 a non-Map accepted (1) | T11 a 200 s window (4) |
//   T12 the last point holding its advice for 5 s (2) | T13 every advised point a surfacing (3) | T14 the first advised point not counted (2) | T15 the summary's threshold the charge (1) | T16 "times" always (1) | T17 the charge not clamped (1) |
//   T18 the depth upside down (1) | T19 the threshold solid (1) | T20 the charge not drawn (2) | T21 a band at every point (1) | T22 a band before the window not clipped (1) | T23 the plot at 28 px (1) | T24 one colour for the bands (1) |
//   T26 mountSvg's titles lost (1) | T27 mountSvg putting the chart in twice (1) | T28 the HTML namespace (1) | T29 no label (1);
//   render/subAquariumSim.mjs S01 the needs clock dropped (2) | S02 the clock in milliseconds (2); sub-aquarium.html P01 the module not imported (1) | P02 the panel shown at first (1) | P03 the hidden rule gone (1) | P04 updateAdvisor not called (1) |
//   P05 the first advised sub drawn, not the selected one (1) | P06 a redraw every frame (1) | P07 the chart written as markup with innerHTML (1) | P08 the panel never hiding (1).
// THREE WENT 0 RED ON THE FIRST PASS AND GOT ROWS: T03 (every fixture passed booleans already), T27 (the fake document kept only the first child it was given), and T12, which was a broken mutant (it did not parse; the gate exited 1
//   with no row red, which is not a catch) -- rewritten, it goes red on 2. ONE IS EQUIVALENT: T25, the SVG text not escaped. Nothing that reaches traceSvg can carry a markup character (pointOf makes every reading a number or null; every word is
//   this file's own), so the escape is kept as a guard against a future caller and the row that claimed it was tested was rewritten to say what IS tested. 38 of 39 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./advisorTrace.mjs";
import * as A from "./subAquariumSim.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const J = JSON.stringify;
const row = (id, t, o = {}) => ({ id, needs: { t, frac: o.frac ?? 0.8, depth: o.depth ?? 20, collapseDepth: 60, advisor: { on: o.on ?? true, threshold: o.threshold ?? 0.4, surface: !!o.surface, pump: !!o.pump, repair: !!o.repair } } });
console.log("advisorTrace-selfcheck -- the advice over time on the Sub Aquarium\n");

sec("1. pointOf");
guarded("section 1", () => {
    const p = T.pointOf(row("a", 12, { frac: 0.5, threshold: 0.45, depth: 30, surface: true, repair: true }));
    ok("a row with needs, a clock and the advisor on gives its time, charge, threshold, depth, collapse depth and the three advices as booleans", J(p) === J({ t: 12, frac: 0.5, threshold: 0.45, depth: 30, collapse: 60, surface: true, pump: false, repair: true }), J(p));
    const off = row("a", 1, { on: false }), noClock = row("a", 1); delete noClock.needs.t; const noAdv = row("a", 1); delete noAdv.needs.advisor;
    ok("no point from: no row, no needs, the advisor off, no advisor field, no clock (or a clock that is not a number)", [null, undefined, { id: "a" }, off, noAdv, noClock, row("a", NaN)].every((r) => T.pointOf(r) === null));
    const loose = { id: "a", needs: { t: 1, frac: 0.5, depth: 1, collapseDepth: 60, advisor: { on: true, threshold: 0.4, surface: 1, pump: "", repair: undefined } } };
    ok("the advices are BOOLEANS whatever the row carries (1 -> true, '' -> false, missing -> false)", J(T.pointOf(loose)) === J({ t: 1, frac: 0.5, threshold: 0.4, depth: 1, collapse: 60, surface: true, pump: false, repair: false }), J(T.pointOf(loose)));
    ok("a reading that is not a number is null in the point, not NaN", T.pointOf(row("a", 3, { frac: "x" })).frac === null);
});

sec("2. record");
guarded("section 2", () => {
    const m = new Map();
    for (let t = 0; t <= 10; t++) T.record(m, [row("a", t), row("b", t, { on: t < 5 })]);
    ok("one trace a sub with the advisor on, a point a new clock value (11 points for t 0..10); the sub whose advisor went off at t 5 keeps nothing", m.get("a").length === 11 && !m.has("b"), J([...m.keys()]));
    T.record(m, [row("a", 10, { frac: 0.1 })]);
    ok("a snapshot at the same clock REPLACES the last point (the page draws many frames a tank second at low speed): still 11 points, the newest reading", m.get("a").length === 11 && m.get("a")[10].frac === 0.1);
    T.record(m, [row("a", 3)]);
    ok("a clock that goes BACK is a new event on the same sub: the trace starts again with that point", m.get("a").length === 1 && m.get("a")[0].t === 3);
    const w = new Map(); for (let t = 0; t <= 400; t += 10) T.record(w, [row("a", t)]);
    ok("the window keeps the last TRACE_SECONDS (300): at t 400 the oldest point is t 100", T.TRACE_SECONDS === 300 && w.get("a")[0].t === 100 && w.get("a").length === 31, J(w.get("a").map((p) => p.t).slice(0, 3)));
    const c = new Map(); for (let t = 0; t < 50; t++) T.record(c, [row("a", t * 0.01)], { maxPoints: 20 });
    ok("the point cap holds (20 asked: the 20 newest, oldest t 0.30)", c.get("a").length === 20 && Math.abs(c.get("a")[0].t - 0.3) < 1e-9);
    T.record(m, []);
    ok("a sub that is no longer in the snapshot keeps nothing", m.size === 0);
    let threw = null; try { T.record({}, []); } catch (e) { threw = e.message; }
    ok("record refuses traces that are not a Map, by name", /^advisorTrace\.record: traces must be a Map/.test(threw || ""), threw || "did not throw");
    ok("record returns the Map it was given", T.record(m, [row("z", 1)]) === m && m.has("z"));
});

sec("3. summaryOf and summaryLine");
guarded("section 3", () => {
    const pts = [0, 10, 20, 30, 40, 50].map((t, i) => T.pointOf(row("a", t, { surface: i === 1 || i === 2 || i === 4, pump: i === 0, repair: i === 5, frac: 0.42, threshold: 0.45, depth: 31.6 })));
    const s = T.summaryOf(pts);
    ok("each advice is held until the next point: surface 30 s (t 10-30 and 40-50), pump 10 s, repair 0 s (the last point holds for no time); SURFACE came on twice; the span is 50 s", J(s) === J({ surface: 30, pump: 10, repair: 0, surfacings: 2, span: 50 }), J(s));
    ok("a trace that starts advised counts that as a surfacing", T.summaryOf([T.pointOf(row("a", 0, { surface: true })), T.pointOf(row("a", 1, { surface: true }))]).surfacings === 1);
    ok("the line says the span, the newest charge against its threshold at its depth, and the counts", T.summaryLine(pts) === "last 50 s: charge 42% against a threshold of 45% at 32 m; advised to surface 2 times (30 s), pump 10 s, repair 0 s", T.summaryLine(pts));
    ok("one surfacing is 'time', not 'times'; an empty trace says no advice yet", /surface 1 time \(/.test(T.summaryLine([T.pointOf(row("a", 0, { surface: true })), T.pointOf(row("a", 4))])) && T.summaryLine([]) === "no advice yet" && T.summaryLine(null) === "no advice yet");
});

sec("4. the chart");
guarded("section 4", () => {
    const pts = [0, 100, 200, 300].map((t, i) => T.pointOf(row("a", t, { frac: [1, 0.6, 0.3, 0.2][i], threshold: 0.4, depth: [0, 30, 60, 30][i], surface: i === 2, pump: i === 1 })));
    const sh = T.traceShapes(pts), paths = sh.nodes.filter((n) => n.tag === "path"), byTitle = (t) => paths.find((p) => p.title && p.title.startsWith(t));
    ok("three paths: depth, threshold (dashed, red) and charge, in that order (the charge drawn last, on top)", J(paths.map((p) => p.title.split(" ")[0])) === '["depth","the","charge"]' && byTitle("the rule").attrs["stroke-dasharray"] === "4 3" && byTitle("the rule").attrs.stroke === "#d9534f");
    const ch = byTitle("charge").attrs.d, ys = [...ch.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    const plot = sh.nodes.find((n) => n.tag === "rect" && n.attrs.fill === "none").attrs;
    ok("the charge path spans the plot left to right over the 300 s window and maps 1 to the top and 0.2 a fifth of the way up", ys.length === 4 && Math.abs(ys[0][0] - plot.x) < 0.11 && Math.abs(ys[3][0] - (plot.x + plot.width)) < 0.11 && Math.abs(ys[0][1] - plot.y) < 0.11 && Math.abs(ys[3][1] - (plot.y + plot.height * 0.8)) < 0.11, J(ys));
    const dp = [...byTitle("depth").attrs.d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => +m[2]);
    ok("the depth path puts the surface at the top and the collapse depth (60 m) at the bottom", Math.abs(dp[0] - plot.y) < 0.11 && Math.abs(dp[2] - (plot.y + plot.height)) < 0.11, J(dp));
    const bands = (k) => sh.nodes.filter((n) => n.band === k).map((n) => [n.attrs.x, n.attrs.width]), span = plot.width / 300;
    ok("a rectangle for each stretch advised and none for the rest: surface t 200-300, pump t 100-200, no repair", J(bands("surface")) === J([[+(plot.x + 200 * span).toFixed(1), +(100 * span).toFixed(1)]]) && J(bands("pump")) === J([[+(plot.x + 100 * span).toFixed(1), +(100 * span).toFixed(1)]]) && bands("repair").length === 0, J([bands("surface"), bands("pump")]));
    ok("each band row is labelled with its own word, below the plot and in its own colour", J(sh.nodes.filter((n) => n.tag === "text" && T.BANDS.some((b) => b.label === n.text)).map((n) => n.text)) === '["surface","pump","repair"]' && sh.nodes.filter((n) => n.band).every((n) => n.attrs.y >= plot.y + plot.height && n.attrs.fill === T.BANDS.find((b) => b.key === n.band).color));
    ok("a band label fits left of the plot (the plot starts at least 40 px in)", plot.x >= 40, String(plot.x));
    const over = T.traceShapes([T.pointOf(row("a", 0, { frac: 1.7, threshold: -0.3 })), T.pointOf(row("a", 1, { frac: 1.7, threshold: -0.3 }))]), oy = (t) => +over.nodes.find((n) => n.title && n.title.startsWith(t)).attrs.d.split(",")[1].split("L")[0];
    ok("a reading outside 0..1 is drawn at the edge, not off the chart", Math.abs(oy("charge") - plot.y) < 0.11 && Math.abs(oy("the rule") - (plot.y + plot.height)) < 0.11);
    const empty = T.traceShapes([]);
    ok("the empty chart says no advice yet and draws no path and no band", empty.nodes.some((n) => n.text === "no advice yet") && !empty.nodes.some((n) => n.tag === "path" || n.band) && empty.label === "no advice yet");
    const old = T.traceShapes([T.pointOf(row("a", 0, { pump: true })), T.pointOf(row("a", 500))]).nodes.filter((n) => n.band === "pump");
    ok("a band that began before the window starts at the window's left edge", old.length === 1 && Math.abs(old[0].attrs.x - plot.x) < 0.11, J(old.map((n) => n.attrs)));
    const svg = T.traceSvg(pts);
    ok("traceSvg is one svg with the summary as its label, the same nodes, its titles and texts in it", /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 360 130"/.test(svg) && svg.includes('aria-label="' + T.summaryLine(pts) + '"') && (svg.match(/<path /g) || []).length === 3 && svg.includes("<title>charge</title>") && svg.endsWith("</svg>"));
    ok("traceSvg writes only this file's words and numbers: no point field reaches it as text (pointOf makes every reading a number or null), and the empty chart's sentence is in it", !/NaN|undefined|null/.test(svg) && T.traceSvg([]).includes(">no advice yet<"));
    // mountSvg with a small fake document: what the page's browser would be asked to build
    const made = [], mk = (ns, tag) => { const el = { ns, tag, attrs: {}, kids: [], text: "", setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); return c; } }; Object.defineProperty(el, "textContent", { set(v) { el.text = v; }, get() { return el.text; } }); made.push(el); return el; };
    const doc = { createElementNS: mk, createTextNode: (t) => ({ textNode: t }) }; let replaced = null; const host = { ownerDocument: doc, replaceChildren: (...x) => { replaced = x; } };
    const el = T.mountSvg(host, sh);
    ok("mountSvg builds every node with createElementNS in the SVG namespace, sets the attributes and puts text and titles in as text, then replaces the host's children with it alone", J(replaced && replaced.length) === "1" && replaced[0] === el && el.tag === "svg" && made.every((m) => m.ns === "http://www.w3.org/2000/svg") && el.kids.length === sh.nodes.length &&
        el.attrs["aria-label"] === sh.label && el.kids.some((k) => k.kids.some((c) => c.tag === "title" && c.text === "charge")) && el.kids.some((k) => k.kids.some((c) => c.textNode === "pump")) && el.kids[0].attrs.width === String(sh.nodes[0].attrs.width));
});

sec("5. the tank");
guarded("section 5", () => {
    const tank = A.createTank(); tank.sync([{ id: "a", name: "Sub a", hue: 100, pilot: "autopilot", from: "x", local: true, weights: null }]);
    const step = (s) => { for (let i = 0; i < Math.round(s * 30); i++) tank.step(1 / 30); };
    step(10); tank.setNeeds("a", "battery"); tank.setAdvisor("a", true); const m = new Map();
    for (let k = 0; k < 6; k++) { step(5); T.record(m, tank.snapshot()); }
    const pts = m.get("a") || [], snap = tank.snapshot()[0];
    ok("the snapshot's needs reading carries the event's clock t, in tank seconds since the needs began (30 s of steps: 30, to a tick)", snap.needs && Math.abs(snap.needs.t - 30) < 0.05, snap.needs && String(snap.needs.t));
    ok("a real tank's advised sub gives six points 5 s apart, each with the rule's threshold for its depth (needsAdvisor.adviceOf), not a constant", pts.length === 6 && pts.every((p, i) => i === 0 || Math.abs(p.t - pts[i - 1].t - 5) < 0.05) && pts.every((p) => p.threshold > 0 && p.threshold < 1 && p.frac > 0), J(pts.map((p) => [p.t.toFixed(1), p.threshold && p.threshold.toFixed(3)])));
    tank.setAdvisor("a", false); T.record(m, tank.snapshot());
    ok("turning the advisor off in the tank empties the trace", !m.has("a"));
});

sec("6. the page");
guarded("section 6", () => {
    const html = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8"), fn = (name) => { const i = html.indexOf("function " + name + "("); return i < 0 ? "" : html.slice(i, html.indexOf("\n}\n", i)); };
    ok("the page imports the module from its own folder", /import \* as ADV from "\/render\/advisorTrace\.mjs";/.test(html));
    ok("the page has the advisor panel, HIDDEN until a sub is advised, with the chart box and the summary line", /<section class="panel plist" id="advPanel" aria-label="The advisor's advice over time" hidden>/.test(html) && /<div id="advTrace"/.test(html) && /<div class="sub" id="advSum"><\/div>/.test(html));
    ok("a hidden .panel is not shown (the panel rule's display:flex would override the hidden attribute)", /\.panel\[hidden\] \{ display:none; \}/.test(html));
    const ua = fn("updateAdvisor");
    ok("every snapshot is recorded (updateStats calls updateAdvisor first, and it calls ADV.record with the whole snapshot)", /function updateStats\(snap\) \{\n  updateAdvisor\(snap\);/.test(html) && /ADV\.record\(advTraces, snap\)/.test(ua));
    ok("only the SELECTED sub's trace is drawn; with none (or no advice) the panel hides", /selected \? advTraces\.get\(selected\) : null/.test(ua) && /if \(!pts \|\| !pts\.length\) \{ panel\.hidden = true;/.test(ua));
    ok("it redraws only when the selected sub or its newest point changes, not every frame", /if \(selected \+ ":" \+ tNow === advDrawn\) return;/.test(ua));
    ok("the chart is BUILT, never written as markup (mountSvg with traceShapes; the name goes in as textContent)", /ADV\.mountSvg\(\$\("advTrace"\), ADV\.traceShapes\(pts\)\)/.test(ua) && /\$\("advWho"\)\.textContent = /.test(ua) && /\$\("advSum"\)\.textContent = ADV\.summaryLine\(pts\)/.test(ua) && !/innerHTML|outerHTML|insertAdjacentHTML/.test(ua));
});

finished = true;
console.log(fails ? `\nadvisorTrace-selfcheck: ${fails} FAILED` : "\nadvisorTrace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
