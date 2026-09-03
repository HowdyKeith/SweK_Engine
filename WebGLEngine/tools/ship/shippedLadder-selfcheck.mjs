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
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
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
    ok("both shipped ladders are built from quadMesh(subdiv, colour) and nothing else -- no second mesh source, no per-rung shape",
        /quadMesh\(/.test(oL) && /quadMesh\(/.test(uL) && !/Mesh\(/.test(oL.replace(/quadMesh\(/g, "")) && !/Mesh\(/.test(uL.replace(/quadMesh\(/g, "")),
        `orrery: ${thLine(orrery)}; universe: ${thLine(universe)}`);
    const colours = (l) => [...l.matchAll(/\[([\d.,\s]+)\]/g)].map((m) => m[1].trim());
    ok(`  and every rung was given a DIFFERENT colour on purpose: orrery ${colours(oL).length} rungs, universe ${colours(uL).length}, no two alike`,
        new Set(colours(oL)).size === colours(oL).length && new Set(colours(uL)).size === colours(uL).length && colours(uL).length === 3,
        `orrery ${colours(oL).join(" | ")}; universe ${colours(uL).join(" | ")}`);
    ok("  and neither page brings its own render pipeline, so both draw with gpuDriven's default flat look: `p` and `color`, no normal and no vertex displacement",
        !/makeGpuDrivenScene\(device, \{ lods[^}]*pipeline:/.test(orrery) && !/makeGpuDrivenScene\(device, \{ lods[^}]*pipeline:/.test(universe),
        "which is why subdividing a flat quad can change nothing: there is no stage that reads the extra vertices");
    ok("  the comment beside the orrery's ladder calls it a finer DISC, and quadMesh builds a square -- the prose describes an approximation the code does not build",
        /a finer disc up close, a coarser one far away/.test(orrery) && /positions\[o \+ 2\] = 0;/.test(fs.readFileSync(path.join(ENG, "render/gpuDriven.mjs"), "utf8")),
        "quadMesh writes z = 0 for every vertex; a subdivided flat quad is the same flat quad");
}

console.log("\n2. PRICED TWICE: as they ship, and with ONE colour across the ladder so only geometry can differ");
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
            ok(`*** ${name}-gpu.html's ladder is a TELL, not an approximation: with ONE COLOUR across it the worst rung differs by ${K.geometryWorst} pixels at any distance measured, inside the ${K.budget}-pixel budget; as shipped it differs by up to ${K.shippedWorst} ***`,
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

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4375.
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
