// WebGLEngine/tools/ship/flyPortrait-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyPortrait-selfcheck.mjs      (about 10 s: sections 1 to 3 are arithmetic, section 4 opens fly-portrait.html in Chromium)
//
// THE GATE OF THE FLY'S SELF-PORTRAIT (brain/flyPortrait.mjs and fly-portrait.html; backlog `painting-fly`, stage P3, brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md). Nothing is trained and nothing is
// claimed about the fly: what is held is that the picture is the record's and the record is the fight's.
//   1  THE RECORD    writing the activity down does not change the duel; what is written is what the pilot's own decoder reads; the record is the seed's
//   2  THE RULE      a neuron's line: its place on the ring, time outward, the activity as the width of a wave, a silent neuron a straight spoke, the brush its cell type's
//   3  THE PICTURE   a pure function of the record, pinned; made of the brushes' own segments
//   4  THE PAGE      fly-portrait.html draws the picture this file computes, says the rule and what it is not, and redraws for another seed
// SABOTAGE LOG (2026-11-13) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), the gate run whole; every one red by name (the number is the rows that went red):
//   brain/flyPortrait.mjs: S1 the recording pilot flies with the ships swapped 1 | S2 only the encoder is written down 10 | S3 time runs inward 2 | S4 the width is the activity, not its root 3 | S5 a swing of 1.5 places 3
//     S6 a wave every 8 ticks 4 | S7 GFC3 drawn with the sketchy brush 2 | S8 no line is marked silent 3 | S9 the ring runs the other way 5 | S10 the brushes at their defaults 2 | S11 the picture's hash leaves out opacity and width 1
//     S13 the rule says the fly expresses itself 1 | S14 one neuron is counted as fired, whichever did 5 | S19 the record's largest is called 1 3 | S20 a point is turned by the tick before's activity 3
//     S12' the close-quarters duel flown without collisions 1
//   fly-portrait.html: S15 the page flies seed 1 whatever is asked 1 | S16 the page paints nothing 1 | S17 the page does not show the rule 1 | S18 the page's league pilot is the close-quarters file 4
//     S21 the page draws on a canvas half the size 2 | S22' the page paints every line white 1 | S23 the page paints every line in GFC2's colour 1
//     S25 the page does not ask whether a pilot's file arrived 1
//   TWO WENT 0 RED, AND EACH IS A ROW NOW. S12 (the close-quarters duel flown without collisions): the ships of seed 1 never touch, so the duel is the same either way and nothing here flew one where they do;
//   the row flies seed 2, where they ram once. S22 (every line painted white): nothing read a colour off the canvas; the row counts the bright pixels in each type's colour. S12' and S22' are those again.
//   S24 (the STANDOFF flown with collisions too): 0 RED, AND EQUIVALENT -- in a standoff the centres never come nearer than 55 m (brain/pilot6dofPolicy.mjs's own measurement), so there is nothing to collide.
//   AND ONE ROW OF THIS GATE WAS WRONG WHEN WRITTEN: it said no ink lies inside the ring. One pixel does -- the fur brush draws past its neighbour -- and the row now says fewer than 1 in 100.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../../brain/flyPortrait.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as Topo from "../../brain/gfcTopology.mjs";
import { mlpLayerCpu } from "../../render/brainTsl.mjs";
import { strokeSegments, NAMES } from "../../fx/procBrush.mjs";
import * as C from "../roundhouse/angularImpulseCensus.mjs";
import { shutdownServer } from "./serverShutdown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
async function section(fn) { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const weightsOf = (name) => Float32Array.from(JSON.parse(src(`brain/pilot6dofWeights${name}-d18.json`)).weights);
const LEAGUE = weightsOf("League"), N = 34, PLACE = 2 * Math.PI / N;
const REC = F.record(LEAGUE), PIC = F.portrait(REC);

console.log("flyPortrait-selfcheck -- the fly's self-portrait: one duel's record of the Giant Fiber Circuit's 34 neurons, drawn by a stated rule\n");

console.log("1. THE RECORD");
await section(() => {
    const bare = P6.duel(LEAGUE, "autopilot", { seed: 1, scenario: "joust", seconds: 30, collisions: true }), bare2 = P6.duel(LEAGUE, "autopilot", { seed: 2, scenario: "standoff", seconds: 30 }), rec2 = F.record(LEAGUE, { seed: 2, scenario: "standoff" });
    ok("!! WRITING THE ACTIVITY DOWN DOES NOT CHANGE THE DUEL: the recorded fight has the fingerprint and the length of the same duel flown by the pilot alone (the close-quarters duel of seed 1: 369 ticks; the standoff of seed 2)",
        REC.fingerprint === bare.fingerprint && REC.ticks === bare.ticks && REC.ticks === 369 && rec2.fingerprint === bare2.fingerprint && rec2.ticks === bare2.ticks && REC.fingerprint !== rec2.fingerprint, `${REC.ticks} and ${rec2.ticks} ticks`);
    const ram = P6.duel(LEAGUE, "autopilot", { seed: 2, scenario: "joust", seconds: 30, collisions: true }), noRam = P6.duel(LEAGUE, "autopilot", { seed: 2, scenario: "joust", seconds: 30, collisions: false }), recRam = F.record(LEAGUE, { seed: 2 });
    ok("!! THE CLOSE-QUARTERS DUEL IS FLOWN WITH THE SHIPS ABLE TO TOUCH, as the league that trained the pilot flew it: in seed 2 they ram once, the record is that duel's (260 ticks) and not the one where they pass through each other (281) -- seed 1's ships never touch, so it cannot say",
        ram.rams === 1 && ram.ticks === 260 && noRam.ticks === 281 && recRam.fingerprint === ram.fingerprint && recRam.ticks === 260 && recRam.fingerprint !== noRam.fingerprint && bare.rams === 0, `${ram.rams} ram, ${recRam.ticks} ticks`);
    // what is written is what the decoder reads: replay the duel, and at every tick the pilot's own five outputs are the decoder on the recorded row
    const layers = P6.layersOf(LEAGUE), dec = layers[layers.length - 1]; let t = 0, worst = 0, rows = 0;
    const probe = (body, target, o) => { const y = P6.forward(LEAGUE, P6.features(body, target, o)), z = mlpLayerCpu(dec, REC.activity.subarray(t * N, t * N + N), 1); for (let i = 0; i < 5; i++) worst = Math.max(worst, Math.abs(Math.tanh(z[i]) - y[i])); t++; rows++; return P6.pilotFor(LEAGUE)(body, target, o); };
    P6.duel(probe, "autopilot", { seed: 1, scenario: "joust", seconds: 30, collisions: true });
    ok("!! WHAT IS WRITTEN IS WHAT THE PILOT'S OWN DECODER READS: the duel flown again, and at each of its 369 ticks the pilot's five outputs are its decoder applied to that tick's recorded row, to the bit", rows === 369 && worst === 0, `worst ${worst}`);
    ok("the record is 369 x 34 activities, none below 0 (relu), its largest 1.064, and it says of itself what it is", REC.activity.length === 369 * N && REC.neurons === N && F.NEURONS === N && REC.activity.every((v) => v >= 0) && Math.abs(REC.max - 1.0637) < 1e-3 && Math.max(...REC.activity) === REC.max && REC.seed === 1 && REC.scenario === "joust" && REC.opponent === "autopilot");
    const silent = Array.from({ length: N }, (_, i) => i).filter((i) => { for (let k = 0; k < REC.ticks; k++) if (REC.activity[k * N + i] > 0) return false; return true; });
    ok("!! 27 OF THE 34 NEURONS FIRED in this duel, and the seven that did not are named: units 15, 17, 18, 19, 27, 29 and 30 (three GFC3, four GFC4)", REC.active === 27 && J(silent) === J([15, 17, 18, 19, 27, 29, 30]) && J(silent.map((i) => Topo.NEURON_TYPES[i])) === J(["GFC3", "GFC4", "GFC4", "GFC3", "GFC3", "GFC4", "GFC4"]), J(silent));
    const again = F.record(LEAGUE), other = F.record(LEAGUE, { seed: 2 }), shipped = F.record(weightsOf("Default"));
    ok("!! THE RECORD IS THE DUEL'S: the same pilot and seed give the same record (hash f9891dde), another seed another, another pilot another", REC.hash === "f9891dde" && again.hash === REC.hash && J(Array.from(again.activity)) === J(Array.from(REC.activity)) && other.hash !== REC.hash && shipped.hash !== REC.hash && shipped.active !== REC.active, `${REC.hash}, seed 2 ${other.hash}, the shipped pilot ${shipped.hash} (${shipped.active} fired)`);
    const zero = F.record(P6.zeroWeights());
    ok("the zero pilot's record is silence (no neuron fires), and a pilot of the wrong size or a duel that is not one is refused", zero.active === 0 && zero.max === 0 && zero.ticks > 0 && throws(() => F.record(new Float32Array(929)), /930 weights/) && throws(() => F.record(LEAGUE, { scenario: "melee" }), /joust or standoff/));
    ok("activityOf() is the encoder and the three steps of the pilot's own layers, and the hash is of float32s, in order", J(Array.from(F.activityOf(LEAGUE, [1, 0.1, -0.2, 0.3, 0, 0, 0, 0.5, 0.4, 0, 1, 0]))) === J(Array.from([0, 1, 2, 3].reduce((h, i) => mlpLayerCpu(layers[i], h, 1), Float32Array.from([1, 0.1, -0.2, 0.3, 0, 0, 0, 0.5, 0.4, 0, 1, 0])))) && layers.length === 5 &&
        F.hashFloats([1, 2]) !== F.hashFloats([2, 1]) && F.hashFloats([]) === 0x811c9dc5 && F.hashFloats([0.1]) === F.hashFloats([Math.fround(0.1)]));
});

console.log("\n2. THE RULE");
await section(() => {
    const S = F.strokes(REC), c = F.SIZE / 2, polar = (p) => ({ r: Math.hypot(p.x - c, p.y - c), a: Math.atan2(p.y - c, p.x - c) }), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    ok("one line a neuron, in the circuit's order, carrying its Neuprint body, its cell type and instance, and 369 points", S.length === N && S.every((s, i) => s.neuron === i && s.bodyId === Topo.NEURON_ORDER[i] && s.type === Topo.NEURON_TYPES[i] && s.instance === Topo.NEURON_INSTANCES[i] && s.points.length === 369));
    ok("!! TIME RUNS OUTWARD: every line starts on the ring (0.08 of the canvas from the centre) and ends at 0.46 of it, its distance from the centre growing by the same step each tick", S.every((s) => { const r = s.points.map((p) => polar(p).r); return Math.abs(r[0] - 0.08 * F.SIZE) < 1e-9 && Math.abs(r[368] - 0.46 * F.SIZE) < 1e-9 && r.every((v, t) => Math.abs(v - (0.08 + 0.38 * t / 368) * F.SIZE) < 1e-9); }) && F.INNER === 0.08 && F.OUTER === 0.46);
    // the wave, computed here from the record and not from the module's line
    let worst = 0, widest = 0;
    for (const s of S) s.points.forEach((p, t) => { const want = -Math.PI / 2 + s.neuron * PLACE + 1.25 * PLACE * Math.sqrt(REC.activity[t * N + s.neuron] / REC.max) * Math.sin(2 * Math.PI * t / 9), d = Math.abs(wrap(polar(p).a - want)); worst = Math.max(worst, d); widest = Math.max(widest, Math.abs(wrap(polar(p).a - (-Math.PI / 2 + s.neuron * PLACE)))); });
    ok("!! THE ACTIVITY IS THE WIDTH OF THE LINE'S WAVE: every point of every line is at its neuron's place on the ring (-90 degrees + i x 360/34) turned by 1.25 places x sqrt(activity / the record's largest) x sin(2 pi t / 9), and no line leaves its spoke by more than 1.25 places",
        worst < 1e-9 && widest <= 1.25 * PLACE + 1e-12 && widest > 1.0 * PLACE && F.SWING_PLACES === 1.25 && F.WAVE_TICKS === 9, `worst ${worst.toExponential(1)}, widest ${(widest / PLACE).toFixed(3)} places`);
    ok("!! A NEURON THAT NEVER FIRES IS A STRAIGHT SPOKE, and only those: the seven silent neurons' lines are marked silent and never leave their angle; each of the 27 others does", S.filter((s) => s.silent).length === 7 && S.every((s) => { const home = -Math.PI / 2 + s.neuron * PLACE, off = Math.max(...s.points.map((p) => Math.abs(wrap(polar(p).a - home)))); return s.silent ? off < 1e-12 : off > 1e-4; }));
    ok("!! THE BRUSH AND THE COLOUR ARE THE CELL TYPE'S: GFC1 ribbon, GFC2 sketchy, GFC3 fur, GFC4 shaded -- four types, four of the tree's brushes, four colours", S.every((s) => s.brush === F.BRUSH_OF[s.type] && s.colour === F.COLOURS[s.type]) && J(F.BRUSH_OF) === J({ GFC1: "ribbon", GFC2: "sketchy", GFC3: "fur", GFC4: "shaded" }) &&
        Object.values(F.BRUSH_OF).every((b) => NAMES.includes(b)) && new Set(Object.values(F.COLOURS)).size === 4 && J(Object.keys(F.COLOURS)) === J([...new Set(Topo.NEURON_TYPES)].sort()));
    // a record made here: one neuron on, at half the largest for the first half
    const T = 40, act = new Float32Array(T * N); for (let t = 0; t < T; t++) { act[t * N + 5] = t < 20 ? 0.5 : 1; } const mine = { ticks: T, neurons: N, activity: act, max: 1, active: 1 }, M = F.strokes(mine);
    const dev = (s, t) => wrap(polar(s.points[t]).a - (-Math.PI / 2 + s.neuron * PLACE));
    ok("on a record made here (one neuron on, at half the largest and then at the largest) only that neuron's line waves, by sqrt(1/2) of the full width and then by all of it", M.every((s) => (s.neuron === 5) === !s.silent) && Math.abs(dev(M[5], 2) - 1.25 * PLACE * Math.SQRT1_2 * Math.sin(2 * Math.PI * 2 / 9)) < 1e-9 && Math.abs(dev(M[5], 29) - 1.25 * PLACE * Math.sin(2 * Math.PI * 29 / 9)) < 1e-9);
    ok("a record of silence is 34 straight spokes, and what is not a record of this circuit is refused", F.strokes({ ticks: 3, neurons: N, activity: new Float32Array(3 * N), max: 0, active: 0 }).every((s) => s.silent && s.points.every((p, t) => Math.abs(dev(s, t)) < 1e-12)) && throws(() => F.strokes({ ticks: 3, neurons: N, activity: new Float32Array(5) }), /not a record of this circuit/) && throws(() => F.strokes(null), /not a record/));
});

console.log("\n3. THE PICTURE");
await section(() => {
    const again = F.portrait(F.record(LEAGUE)), copy = { ...REC, activity: Float32Array.from(REC.activity) }, moved = { ...REC, activity: Float32Array.from(REC.activity) }; moved.activity[200 * N + 3] += 0.2;
    ok("!! THE PICTURE IS A PURE FUNCTION OF THE RECORD, PINNED: 41,627 segments, hash b4dd2db4; the same from a second flight and from a copy of the record's numbers; another when one activity of one neuron at one tick is moved", PIC.hash === "b4dd2db4" && PIC.segments === 41627 && again.hash === PIC.hash && F.portrait(copy).hash === PIC.hash && F.portrait(moved).hash !== PIC.hash, `${PIC.segments} segments, ${PIC.hash}`);
    const S = F.strokes(REC);
    ok("!! IT IS MADE OF THE BRUSHES' OWN SEGMENTS: each neuron's are fx/procBrush.mjs's strokeSegments() of its line with its type's brush, and the count is their sum", PIC.strokes.length === N && PIC.strokes.every((s, i) => J(s.segments) === J(strokeSegments(S[i].points, S[i].brush, F.BRUSH_OPTS)) && s.brush === S[i].brush && s.colour === S[i].colour && s.silent === S[i].silent && !("points" in s)) && PIC.strokes.reduce((a, s) => a + s.segments.length, 0) === PIC.segments && PIC.active === 27);
    const all = PIC.strokes.flatMap((s) => s.segments);
    ok("every segment lies on the canvas, with an opacity above 0 and at most 1 and a width of at least half a pixel; a half-size canvas gives a picture of its own", all.every((g) => [g.x1, g.y1, g.x2, g.y2].every((v) => v >= 0 && v <= F.SIZE) && g.alpha > 0 && g.alpha <= 1 && g.width >= 0.5) && F.portrait(REC, { size: 360 }).size === 360 && F.portrait(REC, { size: 360 }).hash !== PIC.hash);
    const rule = F.ruleLines().join(" ");
    ok("!! THE RULE IS SAID WHERE THE PICTURE IS, AND WHAT IT IS NOT: time outward, the activity as the wave's width, a silent neuron a straight spoke, each type's brush -- and 'Not the fly expressing itself'", /Time runs outward/.test(rule) && /activity is the width of its line's wave/.test(rule) && /never fires is a straight spoke/.test(rule) && Object.entries(F.BRUSH_OF).every(([t, b]) => rule.includes(`${t} ${b}`)) && /Not the fly expressing itself/.test(rule) && /chosen by a person/.test(rule));
    ok("the defaults are the close-quarters duel of seed 1 against the autopilot", J(F.DEFAULTS) === J({ seed: 1, scenario: "joust", opponent: "autopilot", seconds: 30 }));
});

console.log("\n4. THE PAGE (fly-portrait.html in Chromium)");
await section(async () => {
    const html = src("fly-portrait.html"), files = [...html.matchAll(/file: "\/(brain\/pilot6dofWeights\w+-d18\.json)"/g)].map((m) => m[1]);
    ok("the page offers the three shipped 6-DOF pilots, league-trained first, and each file is a 930-weight brain of the Giant Fiber Circuit", J(files) === J(["brain/pilot6dofWeightsLeague-d18.json", "brain/pilot6dofWeightsDefault-d18.json", "brain/pilot6dofWeightsClose-d18.json"]) && files.every((f) => { const j = JSON.parse(src(f)); return j.weights.length === 930 && j.policy === "pilot6dofPolicy" && /Giant Fiber Circuit/.test(j.citation); }));
    const { srv, origin } = await C.serveTree(ENG), browser = await C.launchBrowser(); let first = null, second = null, third = null, text = "", ink = null, hues = null, lost = null; const errors = [];
    try {
        const p = await browser.newPage({ viewport: { width: 1180, height: 800 } }); p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`${origin}/fly-portrait.html`, { waitUntil: "load", timeout: 60000 });
        await p.waitForFunction(() => window.swekPortrait, null, { timeout: 30000 });
        first = await p.evaluate(() => window.swekPortrait); text = await p.evaluate(() => document.querySelector("aside").textContent);
        ink = await p.evaluate(() => { const c = document.getElementById("pad"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let lit = 0, hub = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4, on = d[i] + d[i + 1] + d[i + 2] > 60; if (on) { lit++; if (Math.hypot(x - c.width / 2, y - c.height / 2) < 0.07 * c.width) hub++; } } return { lit, hub, width: c.width, height: c.height }; });
        hues = await p.evaluate((cols) => { const c = document.getElementById("pad"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, want = Object.entries(cols).map(([t, h]) => { const v = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)), m = Math.max(...v); return [t, v.map((x) => x / m)]; }), out = Object.fromEntries(want.map(([t]) => [t, 0])); let other = 0; for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m < 110) continue; const n = [d[i] / m, d[i + 1] / m, d[i + 2] / m], hit = want.find(([, w]) => Math.abs(w[0] - n[0]) + Math.abs(w[1] - n[1]) + Math.abs(w[2] - n[2]) < 0.3); if (hit) out[hit[0]]++; else other++; } return { ...out, other }; }, F.COLOURS);
        await p.evaluate(() => { window.swekPortrait = null; }); await p.fill("#seed", "2"); await p.dispatchEvent("#seed", "change"); await p.waitForFunction(() => window.swekPortrait, null, { timeout: 30000 }); second = await p.evaluate(() => window.swekPortrait);
        await p.evaluate(() => { window.swekPortrait = null; }); await p.selectOption("#pilot", "shipped"); await p.waitForFunction(() => window.swekPortrait, null, { timeout: 30000 }); third = await p.evaluate(() => window.swekPortrait);
        const q = await browser.newPage(); await q.route("**/pilot6dofWeightsLeague-d18.json", (r) => r.fulfill({ status: 404, body: "gone" }));
        await q.goto(`${origin}/fly-portrait.html`, { waitUntil: "load", timeout: 60000 }); await q.waitForFunction(() => window.swekPortrait, null, { timeout: 30000 });
        lost = await q.evaluate(() => ({ p: window.swekPortrait, text: document.getElementById("stats").textContent }));
    } finally { await browser.close(); await shutdownServer(srv); }
    ok("!! A PILOT'S FILE THAT DOES NOT ARRIVE IS SAID, BY NAME, and nothing is drawn as if it had: the page answers that the league pilot's file answered 404", !!lost && /pilot6dofWeightsLeague-d18\.json answered 404/.test(lost.p.error || "") && /could not be drawn: .*answered 404/.test(lost.text) && lost.p.hash === undefined, lost ? lost.text : "");
    ok("!! THE PAGE DRAWS THE PICTURE THIS FILE COMPUTES: the league pilot's close-quarters duel of seed 1, 369 ticks, 27 of 34 fired, the record's hash and the picture's the ones pinned above, and no error on the page",
        !!first && first.error === null && first.pilot === "league" && first.scenario === "joust" && first.seed === 1 && first.ticks === 369 && first.active === 27 && first.neurons === 34 && first.recordHash === REC.hash && first.hash === PIC.hash && first.segments === PIC.segments && errors.length === 0, first ? `${first.recordHash} ${first.hash} ${errors[0] || ""}` : "no portrait");
    ok("!! THERE IS INK ON THE CANVAS AND THE HUB IS LEFT DARK: tens of thousands of lit pixels on the 720 x 720 canvas, and inside the ring the lines start on fewer than 1 in 100 (not none: the fur brush draws past its neighbour, and one such line reaches in)", !!ink && ink.width === 720 && ink.height === 720 && ink.lit > 20000 && ink.hub < 0.01 * Math.PI * (0.07 * 720) ** 2, ink ? `${ink.lit} lit, ${ink.hub} in the hub` : "");
    ok("!! EACH CELL TYPE IS PAINTED IN ITS OWN COLOUR: among the canvas's bright pixels there are hundreds in each of the four types' colours, and fewer in no type's colour than in any one of them", !!hues && Object.keys(F.COLOURS).every((t) => hues[t] > 300 && hues[t] > hues.other), J(hues));
    ok("!! THE RULE AND WHAT THE PICTURE IS NOT ARE ON THE PAGE, in the module's own lines, with how many neurons fired", F.ruleLines().every((l) => text.includes(l)) && /27 of 34 neurons fired/.test(text) && Object.keys(F.COLOURS).every((t) => text.includes(t)));
    const r2 = F.record(LEAGUE, { seed: 2 }), r3 = F.record(weightsOf("Default"), { seed: 2 });
    ok("!! ANOTHER SEED AND ANOTHER PILOT ARE ANOTHER PICTURE, each this file's: seed 2, then the shipped pilot on seed 2", !!second && !!third && second.seed === 2 && second.recordHash === r2.hash && second.hash === F.portrait(r2).hash && second.hash !== PIC.hash && third.pilot === "shipped" && third.recordHash === r3.hash && third.hash === F.portrait(r3).hash && third.hash !== second.hash && third.error === null,
        second && third ? `${second.hash}, ${third.hash}` : "no redraw");
});

console.log(`\nflyPortrait-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
