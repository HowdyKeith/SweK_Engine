// WebGLEngine/render/denoiseScenes-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseScenes-selfcheck.mjs
//
// GATES render/denoiseScenes.mjs, the pre-registration's section 3 and 4 as code. Its exports, each named here: IMAGE,
// SPP_IN, SPP_REF, ALBEDO_FLOOR, CHANNELS, SPLITS, SPLITS_R2, isDatasetSeed, renderSeeds, makeScene, guideBuffers,
// renderImages, inputChannels, remodulate.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** Every scene this gate draws is seeded from 900000 up, outside every
// split; the rows that touch the splits ask only for their seeds and for the refusal, which throws before rendering.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   D1  the reference rendered with the input's seed (C5 broken)                 1 RED
//   D2  the dataset-seed refusal switched off                                    1 RED
//   D3  family B with no microfacet sphere                                       1 RED
//   D6  SPLITS_R2's T1 on round 1's T1 range (3000)                              2 RED
//   D7  SPLITS_R2 left out of the refusal                                        1 RED
//   D4  an emitter's base colour taken from its albedo (0) instead of 1          1 RED
//   D5  remodulate multiplying by the raw albedo, not the floored one            1 RED -- ZERO on the first draft, whose
//       round trip never saw an albedo under the floor; the near-black row was written for it
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = await import(pathToFileURL(path.join(ENG, "render", "denoiseScenes.mjs")).href);
const { IMAGE, SPP_IN, SPP_REF, ALBEDO_FLOOR, CHANNELS, SPLITS, SPLITS_R2, isDatasetSeed, renderSeeds, makeScene, guideBuffers,
        renderImages, inputChannels, remodulate } = D;

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();

console.log("1. THE SPLITS AND THE NUMBERS THE PRE-REGISTRATION FIXED");
{
    const sizes = Object.fromEntries(Object.entries(SPLITS).map(([k, v]) => [k, v.seeds.length]));
    ok("  train 24, val 4, T1 12, T2 12 -- families A, A, A, B", sizes.train === 24 && sizes.val === 4 && sizes.T1 === 12 && sizes.T2 === 12 &&
        SPLITS.train.family === "A" && SPLITS.val.family === "A" && SPLITS.T1.family === "A" && SPLITS.T2.family === "B", JSON.stringify(sizes));
    const all = Object.values(SPLITS).flatMap((s) => s.seeds);
    ok("!! no scene seed is in two splits", new Set(all).size === all.length && all.every(isDatasetSeed), `${all.length} seeds, ${new Set(all).size} distinct`);
    ok("  64 x 64, 4 samples in, 1024 in the reference, the 0.01 albedo floor, 9 channels", IMAGE === 64 && SPP_IN === 4 && SPP_REF === 1024 && ALBEDO_FLOOR === 0.01 && CHANNELS === 9);
    // C5, asserted over the whole dataset: every render seed of every scene is distinct from every other
    const rs = all.flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    ok("!! C5 -- the input, reference and second-reference render seeds of all 52 scenes are 156 distinct numbers", new Set(rs).size === rs.length && rs.length === 156);
    let refused = 0;
    for (const s of all) { try { renderImages(SPLITS.T2.seeds.includes(s) ? "B" : "A", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused++; } }
    ok("!! every dataset seed is REFUSED without { harvest: true } -- nothing can look at the data before the harvest round", refused === all.length, `${refused} of ${all.length} refused`);
    ok("  ...and a seed outside the splits is not", !isDatasetSeed(900000) && !isDatasetSeed(999));
    // the re-run's splits (pre-registration section 13)
    const r1 = new Set(all), newTests = [...SPLITS_R2.T1.seeds, ...SPLITS_R2.T2.seeds];
    ok("!! the re-run keeps round 1's training and validation scenes and draws NEW test scenes: 12 of family A, 12 of B, on no range any split used",
        SPLITS_R2.train === SPLITS.train && SPLITS_R2.val === SPLITS.val && SPLITS_R2.T1.family === "A" && SPLITS_R2.T2.family === "B" &&
        SPLITS_R2.T1.seeds.length === 12 && SPLITS_R2.T2.seeds.length === 12 && new Set(newTests).size === 24 && newTests.every((s) => !r1.has(s)),
        `T1 from ${SPLITS_R2.T1.seeds[0]}, T2 from ${SPLITS_R2.T2.seeds[0]}`);
    let refusedR2 = 0;
    for (const s of newTests) { try { renderImages(SPLITS_R2.T2.seeds.includes(s) ? "B" : "A", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refusedR2++; } }
    const both = [...all, ...newTests].flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    ok("!! the new test seeds are refused without { harvest: true } too, and C5 holds over both rounds: 76 scenes, 228 distinct render seeds",
        refusedR2 === 24 && new Set(both).size === both.length && both.length === 228, `${refusedR2} of 24 refused`);
}

console.log("\n2. THE TWO FAMILIES, OVER 300 SCENES OF EACH");
{
    const stat = { A: { micro: 0, band: 0, r: new Set(), n: [], bad: 0 }, B: { micro: 0, band: 0, r: new Set(), n: [], bad: 0, half: 0 } };
    for (let k = 0; k < 300; k++) for (const f of ["A", "B"]) {
        const S = makeScene(f, 900000 + k), st = stat[f], spheres = S.scene.slice(1, -1);
        st.n.push(spheres.length); st.r.add(S.lightRadius); if (S.skyKind === "band") st.band++;
        const m = spheres.filter((s) => s.roughness !== undefined).length; st.micro += m;
        if (f === "B" && m === Math.floor(spheres.length / 2)) st.half++;
        // resting on the ground, not overlapping, within the pre-registered ranges
        for (const s of spheres) {
            if (Math.abs(s.centre[1] - s.radius) > 1e-12 || s.radius < 0.25 || s.radius > 0.7) st.bad++;
            if (s.roughness !== undefined && (s.roughness < 0.1 || s.roughness > 0.5 || !s.F0)) st.bad++;
        }
        for (let i = 0; i < spheres.length; i++) for (let j = i + 1; j < spheres.length; j++)
            if (Math.hypot(spheres[i].centre[0] - spheres[j].centre[0], spheres[i].centre[2] - spheres[j].centre[2]) < spheres[i].radius + spheres[j].radius) st.bad++;
        const L = S.scene[S.scene.length - 1];
        if (!(L.emit >= 4 && L.emit <= 12) || L.radius !== S.lightRadius) st.bad++;
    }
    const range = (a) => `${Math.min(...a)}-${Math.max(...a)}`;
    ok("!! family A: no microfacet sphere, a gradient sky, an emitter of radius 0.5", stat.A.micro === 0 && stat.A.band === 0 && [...stat.A.r].join() === "0.5",
        `spheres ${range(stat.A.n)}`);
    ok("!! family B: half the spheres microfacet in every scene, a hard-band sky, an emitter of radius 0.25", stat.B.half === 300 && stat.B.band === 300 && [...stat.B.r].join() === "0.25",
        `${stat.B.micro} microfacet spheres over 300 scenes, spheres ${range(stat.B.n)}`);
    ok("  every sphere rests on the ground, none overlaps another, every number in its pre-registered range", stat.A.bad === 0 && stat.B.bad === 0 &&
        Math.min(...stat.A.n, ...stat.B.n) >= 3 && Math.max(...stat.A.n, ...stat.B.n) <= 6, `violations: A ${stat.A.bad}, B ${stat.B.bad}`);
    const a = makeScene("B", 900123), b = makeScene("B", 900123), c = makeScene("A", 900123);
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0.05, 0], [0.3, 0.2, 0.9]];
    ok("  deterministic in (family, seed), and the family changes the scene", JSON.stringify(a.scene) === JSON.stringify(b.scene) && dirs.every((d) => a.sky(d) === b.sky(d)) &&
        JSON.stringify(a.scene) !== JSON.stringify(c.scene));
}

console.log("\n3. THE GUIDE BUFFERS, ON A SCENE WHOSE ANSWERS ARE KNOWN");
{
    // a Lambertian sphere dead ahead, a microfacet one to its right, an emitter to its left, sky behind
    const S = { eye: [0, 0, 5], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 40, scene: [
        { centre: [0, 0, 0], radius: 1, albedo: [0.2, 0.4, 0.6] },
        { centre: [1.6, 0, 0], radius: 0.4, roughness: 0.3, F0: [0.9, 0.5, 0.1] },
        { centre: [-1.6, 0, 0], radius: 0.4, albedo: 0, emit: 5 }] };
    const w = 32, h = 32, G = guideBuffers(S, w, h), at = (buf, x, y) => [0, 1, 2].map((c) => buf[(y * w + x) * 3 + c]);
    const centre = at(G.normal, 16, 16), cAlb = at(G.albedo, 16, 16);
    ok("!! at the image centre: the Lambertian sphere's albedo, and a normal facing the camera", cAlb.join() === "0.2,0.4,0.6" && centre[2] > 0.99, `normal ${centre.map((v) => v.toFixed(3))}`);
    let micro = null, emit = null, sky = null;
    for (let x = 0; x < w; x++) {
        const a = at(G.albedo, x, 16).join(), n = at(G.normal, x, 16);
        if (a === "0.9,0.5,0.1") micro = micro ?? x;
        if (x < 6 && a === "1,1,1" && Math.hypot(...n) > 0.99) emit = emit ?? x;
    }
    const corner = at(G.albedo, 0, 0), cornerN = at(G.normal, 0, 0);
    sky = corner.join() === "1,1,1" && cornerN.join() === "0,0,0";
    ok("  a microfacet hit's base colour is its F0, an emitter's is 1 (with its normal), the sky's is 1 with a zero normal", micro !== null && emit !== null && sky,
        `F0 first seen at x ${micro}, emitter at x ${emit}`);
}

console.log("\n4. THE INPUT, ITS INVERSE, AND A RENDER");
{
    const I = renderImages("B", 900007, { w: 12, h: 10, sppIn: 4, sppRef: 16, ref2: true });
    const x = inputChannels(I.input, I.albedo, I.normal, 12, 10);
    const irr = new Float64Array(12 * 10 * 3);
    for (let p = 0; p < 120; p++) for (let c = 0; c < 3; c++) irr[p * 3 + c] = x[p * 9 + c];
    const back = remodulate(irr, I.albedo);
    let worst = 0; for (let i = 0; i < back.length; i++) worst = Math.max(worst, Math.abs(back[i] - I.input[i]) / Math.max(1e-300, Math.abs(I.input[i])));
    ok("!! remodulate inverts the demodulation -- relative error " + worst.toExponential(1) + ", one rounding of a divide and a multiply", worst < 4e-16);
    ok("  the channels are [irradiance, albedo, normal], channels last", x.length === 120 * 9 && x[9 + 3] === I.albedo[3] && x[9 + 6] === I.normal[3]);
    const dark = inputChannels([0.5, 0.5, 0.5], [0, 0.005, 1], [0, 0, 1], 1, 1);
    ok("  a near-black albedo is divided by the 0.01 floor, never by zero", dark[0] === 50 && dark[1] === 50 && dark[2] === 0.5);
    // the round trip above never sees an albedo under the floor; this one does -- D5 (remodulate multiplying by the raw
    // albedo) went ZERO red without it, and would have returned a black pixel 100x too dark
    const back2 = remodulate([dark[0], dark[1], dark[2]], [0, 0.005, 1]);
    ok("!! ...and remodulate multiplies by the SAME floor, so a near-black pixel survives the round trip", back2[0] === 0.5 && back2[1] === 0.5 && back2[2] === 0.5, Array.from(back2).join(", "));
    const differ = I.input.some((v, i) => v !== I.ref[i]) && I.ref.some((v, i) => v !== I.ref2[i]);
    ok("  the input and both references are independent renders, all finite and non-negative", differ && [I.input, I.ref, I.ref2].every((a) => a.every((v) => Number.isFinite(v) && v >= 0)),
        `seeds ${JSON.stringify(I.seeds)}`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether these scenes are a FAIR test. That is a judgement the pre-registration made in prose; " +
    "this gate holds the code to that prose, not the prose to the world.");
process.exit(fails ? 1 : 0);
