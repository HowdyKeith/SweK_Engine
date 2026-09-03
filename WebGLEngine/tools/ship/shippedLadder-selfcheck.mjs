// THE SHIPPED LADDERS, PRICED FOR THE FIRST TIME (v4375).
//
// v4374 derived LOD thresholds from a measurement and closed by naming what it had not done: "the shipped pages,
// which still carry typed thresholds (0.012 in orrery-gpu.html, [0.004, 0.012] in universe-gpu.html, [0.025, 0.04]
// in gpu-rig-check.html) and are not rewired by this round". This round prices them. It does not rewire them
// either, and the reason is the finding rather than an omission.
//
// *** THE SHIPPED RUNGS ARE THE SAME GEOMETRY IN DIFFERENT COLOURS. *** Both pages build their ladder from
// render/gpuDriven.mjs quadMesh(subdiv, colour), which lays a FLAT quad from (-1,-1,0) to (1,1,0) and subdivides
// it. Subdividing a flat quad moves no vertex off the plane and changes no silhouette, and both pages draw with
// the default flat pipeline -- RENDER_WGSL, which reads `p` and `color` and nothing else, so there is no normal to
// shade with and no vertex stage to displace. What differs between rung and rung is the colour each was given:
// orrery-gpu's two greens, universe-gpu's three blues. That is a TELL, deliberately -- a viewer can watch the
// ladder work -- and it is not an approximation, so no fidelity budget can price it. render/lodBudget.mjs
// ladderKind says so by name rather than handing back a threshold that would read as a fidelity claim.
//
// AND THE PROSE BESIDE IT SAYS SOMETHING ELSE. orrery-gpu.html line 103 reads "LODs: a finer disc up close, a
// coarser one far away". quadMesh makes a SQUARE, and the finer one is not finer in any way the picture can show.
// The comment describes an approximation ladder; the code builds a tell. This gate measures which it is.
//
// WHAT IT COSTS, WHICH IS NOT NOTHING: the near rung draws 72 triangles where 2 would give a picture identical to
// the last bit. That is vertex work spent on a difference no pixel can carry, and it is measured here rather than
// argued -- across a scene, at the page's own typed threshold.
//
// v4376 -- AND THE BODIES ARE SQUARES (section 3). v4375 found the shipped ladders are tells and noted, in passing,
// that orrery-gpu.html's comment calls its bodies "a finer disc up close, a coarser one far away" while quadMesh
// builds a square. This measures it: a body covers 1,369 pixels where a disc of the same reach covers 1,060, a ratio
// of 1.2915 against the 4/pi = 1.2732 that a square over its inscribed disc must give -- DERIVED from the two areas
// and not asserted, with the 1.4% excess being edge coverage at this size. The default pipeline's fragment is
// "return v.color;", with no discard and no distance-to-centre test, so there is nothing anywhere to round a corner.
//
// render/gpuDriven.mjs discMesh is the ladder that comment describes, and it is the OTHER KIND: priced the same way
// with one colour across it, a 10-gon and a 5-gon against a 32-gon differ by up to 1,911 pixels, so ladderKind says
// APPROXIMATION where it said TELL, and the 64-pixel policy derives real thresholds -- 0.0354 and 0.0286 -- where the
// shipped quad ladder had no crossing to report at all. A 32-gon is already the disc to 0 pixels, so the fine rung is
// not what makes a body square.
//
// THE PAGES ARE NOT CHANGED. Which shape a planet is belongs to whoever owns the look; what this round does is put
// both numbers beside the choice -- a body would get rounder and SMALLER (an inscribed disc covers 0.7743 of the
// square, measured, against pi/4 = 0.7854) and the cheap end of the ladder would cost MORE, since an n-gon is n
// triangles where the quad is 2.
//
// v4377 -- AND THE SWAP IS DONE (section 4). Both pages draw DISCS, and neither carries a typed threshold: each
// calls render/lodBudget.mjs discLadderThresholds with its own canvas width.
//
// *** A THRESHOLD CANNOT BE ONE CONSTANT, AND THAT IS MEASURED RATHER THAN REASONED. *** A rung's cost in PIXELS is
// an area on the screen, so it grows with the square of the frame width and a pixel budget is met at a different
// angular size on a different canvas. Derived from one record at four widths, the crossings for rung 1 are 0.0625,
// 0.0354, 0.0151 and 0.0075 at 128, 256, 512 and 1024 -- and metric x width is 8.00, 9.06, 7.72 and 7.75, constant
// to a fifth across an eightfold change of resolution. So the law is metric = K / width, and K is derived, not typed.
//
// K IS THE SMALLEST OF THE MEASURED WIDTHS AND NOT THE MEAN, because the policy is a CEILING. That choice went
// unchecked until a sabotage swapped it for the mean and cost nothing; section 4 now feeds every derived threshold
// back into the record and demands the cost stay inside the budget, and the mean then reads 80.9 px against 64.
//
// AND THE RECORD HAD TO GROW TWICE, both times because the gate asked it a question it could not answer: it stopped
// at 512 while the orrery's canvas is 640, which made the shipped page an EXTRAPOLATION; and at 1024 its distance
// sweep did not reach far enough for rung 2 to come inside 64 pixels, so the derivation failed closed and refused
// the whole ladder -- the fail-closed path working on real data rather than on a fixture.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createRequire } from "node:module";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { discLadderThresholds, costAtMetric } from "../../render/lodBudget.mjs";
import { LOD_RECORD } from "../../render/lodRecord.mjs";
import { lodThresholdsFor, ladderKind, priceRung, FRAME, COST_PIXELS } from "../../render/lodBudget.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const skip = webgpuSkipReason();
const W = 256;

console.log("\n1. WHAT THE PAGES ACTUALLY DECLARE, read out of the pages rather than remembered");
{
    const orrery = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    const universe = fs.readFileSync(path.join(ENG, "universe-gpu.html"), "utf8");
    // the WHOLE declaration line: a colour array closes with "]" too, so stopping at the first one reads a fragment
    const lodLine = (src) => (src.split("\n").find((l) => l.startsWith("const lods = ")) || "");
    const thLine = (src) => (src.match(/thresholds: \[[^\]]*\]/) || [""])[0];
    const oL = lodLine(orrery), uL = lodLine(universe);
    // v4377 -- THIS SECTION USED TO ASSERT quadMesh AND WENT STALE THE MOMENT THIS GATE'S OWN ROUND SWAPPED THE
    // PAGES. It now reads what they are: discs, from one mesh source, with the ladder ordered by gpuDriven rather
    // than by the array. The quad ladder it used to describe is still measured, in section 2, as the kind of thing
    // it was -- the measurement did not stop being true when the pages stopped being it.
    ok("both shipped ladders are built from discMesh(segments, colour) and nothing else -- no second mesh source, no per-rung shape",
        /discMesh\(/.test(oL) && /discMesh\(/.test(uL) && !/quadMesh\(/.test(oL) && !/quadMesh\(/.test(uL) &&
        !/Mesh\(/.test(oL.replace(/discMesh\(/g, "")) && !/Mesh\(/.test(uL.replace(/discMesh\(/g, "")),
        `orrery: ${oL.trim().slice(0, 60)}...; universe: ${uL.trim().slice(0, 60)}...`);
    const colours = (l) => [...l.matchAll(/\[([\d.,\s]+)\]/g)].map((m) => m[1].trim());
    ok(`  and every rung was given a DIFFERENT colour on purpose: orrery ${colours(oL).length} rungs, universe ${colours(uL).length}, no two alike`,
        new Set(colours(oL)).size === colours(oL).length && new Set(colours(uL)).size === colours(uL).length && colours(uL).length === 3,
        `orrery ${colours(oL).join(" | ")}; universe ${colours(uL).join(" | ")}`);
    ok("  and neither page brings its own render pipeline, so both draw with gpuDriven's default flat look: `p` and `color`, no normal and no vertex displacement",
        !/makeGpuDrivenScene\(device, \{ lods[^}]*pipeline:/.test(orrery) && !/makeGpuDrivenScene\(device, \{ lods[^}]*pipeline:/.test(universe),
        "which is why subdividing a flat quad can change nothing: there is no stage that reads the extra vertices");
    ok("*** and the comment and the code now AGREE: the orrery's ladder has said \"a finer disc up close\" since the line was written, and as of v4377 that is what it builds ***",
        /a finer disc up close, a coarser one far away/.test(orrery) && /G\.discMesh\(32/.test(orrery) && /G\.discMesh\(5/.test(orrery),
        "v4376 measured the disagreement -- 1369 covered pixels against an inscribed disc's 1060, a ratio of 1.2915 against 4/pi = 1.2732 -- and this round closed it in the direction of the prose rather than by editing the prose");
}

console.log("\n2. THE QUAD LADDER THAT SHIPPED UNTIL v4377, PRICED TWICE: as it shipped, and with ONE colour across it so only geometry can differ");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, DIST: [3, 4, 6, 9, 14, 22, 36, 60] }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        // the LADDERS EXACTLY AS THE PAGES DECLARE THEM, and the same subdivisions under one colour
        const LADDERS = {
            orrery: { shipped: [[6, [0.62, 0.94, 0.71, 1]], [1, [0.55, 0.75, 0.62, 1]]], subdiv: [6, 1] },
            universe: { shipped: [[5, [0.85, 0.92, 1, 1]], [2, [0.55, 0.7, 0.95, 1]], [1, [0.35, 0.5, 0.8, 1]]], subdiv: [5, 2, 1] },
        };
        const ONE = [0.7, 0.8, 0.9, 1];
        const RAD = 0.5;
        // ONE RUNG, NO FALLBACK. gpuDriven RANKS a ladder by its meshes rather than by the order given, so a probe
        // whose two rungs tie on triangle count can be handed either of them -- which is what happened on the first
        // run here and made every subdiv-1 rung read as though its geometry differed by thousands of pixels.
        const shoot = (mesh, dist) => { const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh }],
                thresholds: [], records: Float32Array.from([0, 0, 0, RAD]) });
            const eye = [0, 0, dist];
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 300), G.lookAt(eye, [0, 0, 0])), eye };
            return sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels; };
        const out = { ladders: {}, errs: null };
        try {
            for (const [name, L] of Object.entries(LADDERS)) {
                const shipped = [], geometry = [];
                for (let k = 1; k < L.shipped.length; k++) { shipped.push({ rung: k, samples: [] }); geometry.push({ rung: k, samples: [] }); }
                for (const d of a.DIST) {
                    const baseS = (await shoot(G.quadMesh(L.shipped[0][0], L.shipped[0][1]), d)).pixels;
                    const baseG = (await shoot(G.quadMesh(L.subdiv[0], ONE), d)).pixels;
                    const count = (base, p) => { let ch = 0, cov = 0;
                        for (let i = 0; i * 4 < base.length; i++) { let diff = 0;
                            for (let c = 0; c < 3; c++) diff = Math.max(diff, Math.abs(base[i * 4 + c] - p[i * 4 + c]));
                            if (diff) ch++;
                            if (base[i * 4] + base[i * 4 + 1] + base[i * 4 + 2] > 24) cov++; }
                        return { changed: ch, covered: cov }; };
                    for (let k = 1; k < L.shipped.length; k++) {
                        const pS = (await shoot(G.quadMesh(L.shipped[k][0], L.shipped[k][1]), d)).pixels;
                        const pG = (await shoot(G.quadMesh(L.subdiv[k], ONE), d)).pixels;
                        shipped[k - 1].samples.push({ metric: RAD / d, ...count(baseS, pS) });
                        geometry[k - 1].samples.push({ metric: RAD / d, ...count(baseG, pG) });
                    }
                }
                out.ladders[name] = { shipped, geometry, tris: L.subdiv.map((s) => s * s * 2) };
            }
            // WHAT THE TELL COSTS IN VERTEX WORK: the orrery's own scene, at its own typed threshold
            const COUNT = 400, RAD2 = 0.35;
            const records = new Float32Array(COUNT * 4);
            for (let i = 0; i < COUNT; i++) records.set([((i % 20) - 9.5) * 0.9, (Math.floor(i / 20) - 9.5) * 0.9, -6 - (i % 7) * 3, RAD2], i * 4);
            // ONLY THE SHIPPED LADDER IS RUN. Collapsing the near rung to subdiv 1 to compare pictures would tie the
            // two rungs on triangle count, and gpuDriven ranks by the meshes -- the same trap that spoiled this
            // gate's first run. The picture question is answered per rung above; what is left is arithmetic over the
            // measured region counts, which needs no second scene.
            const lodsShipped = [{ name: "far", mesh: G.quadMesh(1, [0.55, 0.75, 0.62, 1]) }, { name: "near", mesh: G.quadMesh(6, [0.62, 0.94, 0.71, 1]) }];
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 300), G.lookAt([0, 0, 9], [0, 0, 0])), eye: [0, 0, 9] };
            const sc = G.makeGpuDrivenScene(dev, { lods: lodsShipped, thresholds: [0.012], records, cap: COUNT });
            await sc.frame({ ...cam, read: true, clear: [0.03, 0.03, 0.03, 1] }).pixels;
            out.scene = { counts: await sc.readCounts(), ranges: sc.ranges.map((r2) => r2.indexCount), count: COUNT };
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness priced both shipped ladders twice over eight distances", r.ok && r.result && !r.result.error && r.result.ladders,
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const R = r.result;
        for (const [name, L] of Object.entries(R.ladders)) {
            for (const rec of L.shipped) { const s = priceRung(rec.samples), g = priceRung(L.geometry[rec.rung - 1].samples);
                console.log(`        ${name} rung ${rec.rung} (${L.tris[rec.rung]} tris vs ${L.tris[0]})  as shipped: ` +
                    s.rows.map((x) => `${x.metric.toFixed(4)}->${String(x.cost).padStart(5)}`).join(" "));
                console.log(`        ${" ".repeat(name.length + 8)}${" ".repeat(String(L.tris[rec.rung]).length + 12)}geometry only: ` +
                    g.rows.map((x) => `${x.metric.toFixed(4)}->${String(x.cost).padStart(3)}`).join(" ")); }
        }
        for (const [name, L] of Object.entries(R.ladders)) {
            const K = ladderKind(L.shipped, L.geometry);
            ok(`*** ${name}-gpu.html's QUAD ladder was a TELL, not an approximation: with ONE COLOUR across it the worst rung differs by ${K.geometryWorst} pixels at any distance measured, inside the ${K.budget}-pixel budget; as it shipped it differed by up to ${K.shippedWorst} ***`,
                K.kind === "tell" && K.geometryWorst <= K.budget && K.shippedWorst > 20 * Math.max(1, K.geometryWorst),
                `${K.why}. The residue is the rasteriser rather than the shape: a subdivided flat quad splits its interior into triangles whose shared edges land a few pixels differently at some sizes, and ${K.geometryWorst} of them is what that costs`);
            const D = lodThresholdsFor(L.geometry, { policy: FRAME(COST_PIXELS) });
            // EVERY rung takes the BOUND path -- v4374 built it and had no real data for it until now -- and what the
            // LADDER then does depends on how many rungs it has, which is worth seeing rather than smoothing over.
            const bounded = D.per.every((p) => p.bounded === true);
            if (L.geometry.length === 1)
                ok(`  and the ${COST_PIXELS}-pixel policy returns a BOUND rather than a crossing, flagged: one priced rung, free at every metric measured, so the largest measured is reported as a bound and not as a threshold`,
                    bounded && D.thresholds !== null && D.thresholds.length === 1,
                    `${D.per.map((p) => `rung ${p.rung}: ${p.why}`).join(" | ")}`);
            else
                ok(`  and with TWO free rungs the LADDER is refused outright, which is the right answer: both bounds land on the same metric, so they do not fall, and a ladder whose rungs cost nothing has no fidelity ordering between them`,
                    bounded && D.thresholds === null && /do not fall/.test(D.why),
                    `${D.why} -- reporting a pair here would be two numbers with nothing behind them, and the refusal is the module declining to invent an ordering the measurement does not contain`);
        }
        const S = R.scene;
        const drawn = S.counts.reduce((t, c, r2) => t + c * (S.ranges[r2] / 3), 0);
        const flat = S.counts.reduce((t, c) => t + c * 2, 0);
        const worstGeom = Math.max(...Object.values(R.ladders).map((L) => ladderKind(L.shipped, L.geometry).geometryWorst));
        ok(`*** AND THE SUBDIVISION IS VERTEX WORK ALMOST NO PIXEL CARRIES: ${S.count} instances at the page's own threshold of 0.012 draw ${drawn} triangles, where the same picture -- to within the ${worstGeom} pixels the per-rung pricing above measured -- needs ${flat} ***`,
            drawn > flat * 2 && worstGeom < 100 && (R.errs || []).length === 0,
            `regions ${S.counts.join(" / ")} with index counts ${S.ranges.join(" / ")}; ${(drawn / Math.max(1, flat)).toFixed(1)}x the triangles. On this software rasteriser a triangle is nearly free, so the saving is a COUNT and not a time, which is said here rather than left to be assumed`);
        report("THIS IS NOT A DEFECT IN THE PAGES AND IS NOT REPORTED AS ONE. Three distinct colours chosen for three rungs is " +
            "not an accident: it is how a person watches a ladder work, and removing it would be a product decision rather than a " +
            "correction, which is why this round prices the ladders and rewires nothing. What it settles is that \"LOD threshold\" " +
            "names two different things in this tree -- the distance a TELL changes colour, typed with impunity because there is no " +
            "fidelity to get wrong, and the distance an APPROXIMATION may coarsen, which v4374 showed can be derived. Only the " +
            "generated ladder is the second kind.");
    }
}

console.log("\n3. THE BODIES ARE SQUARES (v4376), and the LADDER THE COMMENT DESCRIBES, priced beside the one that ships");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { W, DIST: [3, 4, 6, 9, 14, 22, 36, 60], SEG: [32, 10, 5] }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.W;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const RAD = 0.5, ONE = [0.7, 0.8, 0.9, 1];
        const shoot = (mesh, dist) => { const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh }], thresholds: [], records: Float32Array.from([0, 0, 0, RAD]) });
            const eye = [0, 0, dist];
            const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 300), G.lookAt(eye, [0, 0, 0])), eye };
            return sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels; };
        const covered = (px) => { let c = 0; for (let i = 0; i * 4 < px.length; i++) if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 24) c++; return c; };
        const out = {};
        try {
            // (1) IS A BODY A SQUARE? Cover it and compare against the two shapes it could be.
            const D0 = 6;
            out.shape = { quad: covered((await shoot(G.quadMesh(1, ONE), D0)).pixels),
                          disc: covered((await shoot(G.discMesh(64, ONE), D0)).pixels),
                          disc32: covered((await shoot(G.discMesh(32, ONE), D0)).pixels) };
            // (2) the DISC ladder, priced the way v4375 priced the shipped one: as it would ship, and one colour
            const COLS = [[0.62, 0.94, 0.71, 1], [0.58, 0.85, 0.66, 1], [0.55, 0.75, 0.62, 1]];
            const shipped = [], geometry = [];
            for (let k = 1; k < a.SEG.length; k++) { shipped.push({ rung: k, samples: [] }); geometry.push({ rung: k, samples: [] }); }
            for (const d of a.DIST) {
                const bS = (await shoot(G.discMesh(a.SEG[0], COLS[0]), d)).pixels, bG = (await shoot(G.discMesh(a.SEG[0], ONE), d)).pixels;
                const count = (base, p) => { let ch = 0, cov = 0;
                    for (let i = 0; i * 4 < base.length; i++) { let diff = 0;
                        for (let c = 0; c < 3; c++) diff = Math.max(diff, Math.abs(base[i * 4 + c] - p[i * 4 + c]));
                        if (diff) ch++; if (base[i * 4] + base[i * 4 + 1] + base[i * 4 + 2] > 24) cov++; }
                    return { changed: ch, covered: cov }; };
                for (let k = 1; k < a.SEG.length; k++) {
                    shipped[k - 1].samples.push({ metric: RAD / d, ...count(bS, (await shoot(G.discMesh(a.SEG[k], COLS[k]), d)).pixels) });
                    geometry[k - 1].samples.push({ metric: RAD / d, ...count(bG, (await shoot(G.discMesh(a.SEG[k], ONE), d)).pixels) });
                }
            }
            out.disc = { shipped, geometry, tris: a.SEG.slice(), seg: a.SEG.slice() };
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness covered a body and priced the disc ladder", r2.ok && r2.result && !r2.result.error && r2.result.disc,
        r2.ok ? (r2.result && r2.result.error) : (r2.reason || (r2.pageErrors || []).join("; ")));
    if (r2.ok && r2.result && !r2.result.error) {
        const R2 = r2.result, SH = R2.shape;
        const ratio = SH.quad / SH.disc, PI4 = 4 / Math.PI;
        ok(`*** A SHIPPED BODY IS A SQUARE, AND ITS PAGE'S COMMENT CALLS IT A DISC: it covers ${SH.quad} pixels where a disc of the same reach covers ${SH.disc} -- a ratio of ${ratio.toFixed(4)} against the 4/pi = ${PI4.toFixed(4)} a square-over-inscribed-disc must give ***`,
            Math.abs(ratio - PI4) < 0.02 && SH.quad > SH.disc,
            `derived, not asserted: a square of half-width r covers 4r^2 and the disc inscribed in it pi*r^2. The default pipeline's fragment is "return v.color;" with no discard and no distance test, so there is nothing anywhere to round a corner off`);
        ok(`  and a 32-gon is already the disc to ${Math.abs(SH.disc32 - SH.disc)} pixels, so the ladder's fine rung is not what makes a body square`,
            Math.abs(SH.disc32 - SH.disc) < SH.disc * 0.01, `${SH.disc32} against ${SH.disc} for a 64-gon`);
        const K = ladderKind(R2.disc.shipped, R2.disc.geometry);
        for (const rec of R2.disc.geometry) { const g = priceRung(rec.samples);
            console.log(`        disc rung ${rec.rung} (${R2.disc.seg[rec.rung]}-gon, ${R2.disc.tris[rec.rung]} tris)  geometry only: ` +
                g.rows.map((x) => `${x.metric.toFixed(4)}->${String(x.cost).padStart(4)}`).join(" ")); }
        ok(`*** AND THE DISC LADDER IS AN APPROXIMATION WHERE THE SHIPPED ONE IS A TELL: its geometry differs by up to ${K.geometryWorst} pixels with one colour across it, against the ${K.budget}-pixel budget, so ladderKind classifies it the other way ***`,
            K.kind === "approximation" && K.geometryWorst > K.budget,
            `${K.why}. The same classifier, the same policy, the same page's ladder shape -- and the answer is different because the geometry now differs`);
        const D = lodThresholdsFor(R2.disc.geometry, { policy: FRAME(COST_PIXELS) });
        ok(`*** SO A REAL THRESHOLD IS DERIVABLE FOR IT: at ${COST_PIXELS} pixels the disc ladder comes out at ${D.thresholds ? D.thresholds.map((x) => x.toPrecision(3)).join(", ") : "NOTHING"}, where the shipped quad ladder had no crossing to report at all ***`,
            !!D.thresholds && D.ordered && D.per.every((p) => p.bounded === false),
            D.thresholds ? D.per.map((p) => `rung ${p.rung}: ${p.why}`).join(" | ") : D.why);
        report(`WHAT SWAPPING WOULD COST, both numbers, so the choice is a choice: a body would get ROUNDER and SMALLER -- an ` +
            `inscribed disc covers pi/4 = 0.785 of the square, measured here as ${(SH.disc / SH.quad).toFixed(4)} -- and the cheap end of ` +
            `the ladder would cost MORE, since an n-gon is n triangles where the quad is 2. What it would buy is a page whose comment is ` +
            `true and a ladder with fidelity to price. THE PAGES ARE NOT CHANGED BY THIS ROUND: which shape a planet is belongs to whoever ` +
            `owns the look, and now it comes with numbers attached instead of a preference.`);
    }
}

console.log("\n4. THE SWAP, IN THE PAGES (v4377): discs, thresholds derived from the frozen record, and both pages loaded");
{
    const orrery = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    const universe = fs.readFileSync(path.join(ENG, "universe-gpu.html"), "utf8");
    ok("*** both pages draw DISCS now, and neither carries a typed threshold any more: each derives from render/lodRecord.mjs through discLadderThresholds ***",
        /G\.discMesh\(/.test(orrery) && /G\.discMesh\(/.test(universe) && !/G\.quadMesh\(/.test(orrery.split("const lods")[1].split("\n")[0]) &&
        /discLadderThresholds\(cv\.width/.test(orrery) && /discLadderThresholds\(cv\.width/.test(universe) &&
        !/thresholds: \[0\.012\]/.test(orrery) && !/thresholds: \[0\.004, 0\.012\]/.test(universe),
        "the typed 0.012 and [0.004, 0.012] are gone; what replaced them is a call, and the number it returns depends on the canvas");
    const D = discLadderThresholds(256);
    ok(`  and the derivation is a LAW rather than a constant: metric = K / width with K = ${D.k.map((x) => x.toFixed(2)).join(", ")}, the SMALLEST of the ${D.widths.length} widths in the record (${D.widths.join(", ")}), spread ${D.spread.map((x) => x.toFixed(2) + "x").join(" and ")}`,
        D.thresholds && D.k.length === 2 && D.spread.every((x) => x < 1.3) && !D.extrapolating,
        `${D.why}. The smallest and not the mean: the policy is a CEILING, so the threshold that honours it at every width measured is the conservative one, and a mean would exceed the budget at whichever resolution came in below it`);
    // *** AND THE CONSERVATIVE CHOICE IS CHECKED, NOT TRUSTED. *** Taking K as the smallest of the measured widths
    // rather than their mean cost NOTHING when it was first sabotaged -- nothing verified what the choice was for.
    // This feeds each derived threshold back into the record at its own width and demands the cost it implies be
    // inside the budget. A mean K exceeds it at whichever width came in lowest, which is the whole point of the min.
    const kept = [];
    for (const w of LOD_RECORD.widths) { const th = discLadderThresholds(w).thresholds;
        LOD_RECORD.byWidth[w].forEach((rec, i) => { const c = costAtMetric(rec.samples, th[i]);
            if (c != null) kept.push({ w, rung: rec.rung, metric: th[i], cost: c }); }); }
    const over = kept.filter((x) => x.cost > COST_PIXELS + 1e-6);
    ok(`*** the derived threshold is fed BACK into the record at every width and every rung, and the cost it implies is inside the ${COST_PIXELS}-pixel budget in all ${kept.length} cases (worst ${Math.max(...kept.map((x) => x.cost)).toFixed(1)} px) ***`,
        kept.length === LOD_RECORD.widths.length * 2 && over.length === 0,
        over.length ? over.map((x) => `w=${x.w} rung ${x.rung}: ${x.cost.toFixed(1)} px`).join(", ")
                    : `this is what taking the SMALLEST K buys, and it went unchecked until a sabotage that swapped it for the mean cost 0 red`);
    ok(`  a width outside the measured range is served but FLAGGED as an extrapolation rather than answered silently`,
        discLadderThresholds(1920).extrapolating === true && /OUTSIDE that range/.test(discLadderThresholds(1920).why) && discLadderThresholds(256).extrapolating === false,
        `at 1920 the pair would be ${discLadderThresholds(1920).thresholds.map((x) => x.toPrecision(3)).join(", ")}`);
    ok(`  the frozen record says what it is and what it is not: ${LOD_RECORD.widths.length} widths x ${LOD_RECORD.distances.length} distances x ${LOD_RECORD.segments.length - 1} rungs, at v${LOD_RECORD.at.slice(1)}, rewritable by tools/ship/freezeLod.mjs`,
        LOD_RECORD.widths.length === 4 && LOD_RECORD.segments[0] === 32 && fs.existsSync(path.join(ENG, "tools/ship/freezeLod.mjs")),
        `segments ${LOD_RECORD.segments.join("/")}, radius ${LOD_RECORD.radius}`);
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    // AND THE PAGES ARE LOADED, because a page that parses is not a page that runs
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".wgsl": "text/plain" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]);
        const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const load = async (url) => { const pg = await br.newPage({ viewport: { width: 640, height: 480 } });
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto(url, { waitUntil: "load" }); await pg.waitForTimeout(6000);
        const st = await pg.evaluate(() => ({ route: (document.getElementById("route") || {}).textContent || "",
            used: (window.__lodTh && window.__lodTh.used) || null, width: (document.getElementById("stage") || {}).width || null }));
        return { errs, ...st }; };
    const port = srv.address().port;
    const o = await load(`http://127.0.0.1:${port}/?history=0`);
    const u = await load(`http://127.0.0.1:${port}/universe-gpu.html`);
    await br.close(); srv.close();
    ok("*** both swapped pages LOAD and throw nothing -- a page that parses is not a page that runs, and this round changed what they draw ***",
        o.errs.length === 0 && u.errs.length === 0 && /webgpu|webgl2/.test(o.route),
        `orrery: ${o.route.slice(0, 70) || "(no route line)"}; errors ${o.errs.slice(0, 1).join(" | ") || "none"} / ${u.errs.slice(0, 1).join(" | ") || "none"}`);
    if (o.used && o.width) {
        const want = discLadderThresholds(o.width);
        ok(`*** and the threshold the ORRERY ACTUALLY RAN is the one the record derives for its own canvas: ${o.used.map((x) => x.toPrecision(4)).join(", ")} at width ${o.width}, interpolated and not extrapolated ***`,
            o.used.length === 1 && Math.abs(o.used[0] - want.thresholds[1]) < 1e-12 && want.extrapolating === false,
            `derived for width ${o.width}: ${want.thresholds.map((x) => x.toPrecision(4)).join(", ")}; a two-rung ladder switches on the COARSE rung's. The record covers ${want.widths.join(", ")}, and 640 sits inside it -- it did NOT on the first freeze, which stopped at 512 and made the shipped page an extrapolation`);
    } else ok("the orrery reported the threshold it ran", false, JSON.stringify({ used: o.used, width: o.width }).slice(0, 160));
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4377 (the swap):
//   BC K taken as the MEAN of the measured widths instead of the SMALLEST -> exit=0, 0 RED FIRST, the fifth sabotage
//      this session to find a check nobody had written. The conservative choice is load-bearing -- a mean K exceeds
//      the budget at whichever width came in lowest -- and nothing verified it. Section 4 now feeds each derived
//      threshold BACK into the record at its own width and demands the cost inside the budget; re-run, the mean K
//      reads 80.9 px at width 128 against a 64-pixel ceiling, and the sabotage costs 1 red.
//   BD the orrery deriving at a fixed 256 instead of its own canvas width -> exit=1, 2 red: the page stops asking
//      the record about the canvas it has, and the threshold it runs stops matching the one the record derives for
//      it. A resolution-scaled law typed back into a constant is the thing this round replaced.
// MEASURED at v4376 (the disc):
//   BA discMesh CIRCUMSCRIBING the quad instead of inscribing it (every vertex scaled by sqrt(2)) -> exit=1, 1 red:
//      the square-over-disc ratio stops matching 4/pi, because it is no longer that pair of shapes. The check is
//      against a closed form, so it fails on the shape rather than on a tolerance.
//   BB every rung built at 3 segments, so the ladder stops approximating -> exit=1, 3 red: the shape claim, the
//      classification (three triangles at every rung is a TELL again), and the derivation, which then has no
//      crossing to report. One line, and the round's whole argument goes with it.
// MEASURED at v4375.
//   AY the tell/approximation distinction removed, so every ladder classifies as an approximation -> exit=1, 2 red,
//      one per shipped page. The distinction is the whole content of this gate: without it a ladder that differs
//      only in colour is handed a fidelity verdict, which is the reading this round exists to refuse.
//   AZ the policy's budget read as 0 inside the classifier, so the rasteriser's own residue counts as approximation
//      -> exit=1, 2 red. 20 and 63 pixels of interior-edge difference would then make both shipped ladders read as
//      approximations that a fidelity budget could price. The line is the POLICY's number, and this says why it
//      cannot be an exact zero.
//
// AND THIS GATE'S OWN FIRST RUN WAS WRONG THREE WAYS, ALL OF THEM THE GATE'S AND NOT THE PAGES':
//   (1) The probe drew its subject through a TWO-rung scene whose rungs tied on triangle count. gpuDriven RANKS a
//       ladder by its meshes rather than by the order given, so it was handed either one -- and every subdiv-1 rung
//       read as though its geometry differed by thousands of pixels. One rung and no fallback is the fix.
//   (2) The `const lods = [...]` line was read with a regex that stops at the first "]", which a colour array
//       closes too, so section 1 was matching a fragment and reported zero rungs.
//   (3) A script meant for the gate wrote its text over render/lodBudget.mjs -- a `p` where `p2` was meant -- and
//       the module was restored from the last commit rather than retyped. Recorded because the tree's own habit is
//       that a mistake made while building the check belongs beside the check.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: gpu-rig-check.html's [0.025, 0.04], whose ladder is quadMesh too but whose page is a rig probe rather " +
    "than a scene; whether the tell should be a debug TOGGLE rather than the shipped default, which is a product decision and not " +
    "this gate's to make; what the tell costs on a real rig rather than on SwiftShader, where a triangle is nearly free and the " +
    "vertex saving measured here is a count and not a time; and every number the rig has not signed.");
process.exit(fails ? 1 : 0);
