// WebGLEngine/render/denoiseScenes-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseScenes-selfcheck.mjs
//
// GATES render/denoiseScenes.mjs, the pre-registration's section 3 and 4 as code. Its exports, each named here: IMAGE,
// SPP_IN, SPP_REF, ALBEDO_FLOOR, CHANNELS, SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, familyOf, isDatasetSeed, strideOf,
// renderSeeds, makeScene, guideBuffers,
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
//   D8  SPLITS_R3's T2 on the re-run's T2 range (6000)                           1 RED
//   D9  SPLITS_R3 left out of the refusal                                        1 RED
//   D10 SPLITS_R4's T1 on the kernel round's range (7000)                        1 RED
//   D11 strideOf accepts a stride below nine                                     1 RED
//   D12 family C's two emitters both warm                                        1 RED
//   D13 family C's diffuse spheres without their roughness (plain Lambertian)    1 RED
//   D14 family A's emitter range moved (4-12 -> 4-13)                            2 RED
//   D15 SPLITS_R5's H2 set drawn from family B                                   2 RED
//   D16 familyOf ignores a split's per-seed families                             1 RED
//   D17 SPLITS_R6's H2 set on round 5's range (15000)                            1 RED
//   D18 family R's Lambertian spheres given a roughness (sigma) -- C leaking in  1 RED
//   D19 family R's emitters coloured                                             2 RED
//   D20 family R's uniform sky allowed down to 0.01                              1 RED
//   D21 family C's ground sigma range moved (0.2-0.5 -> 0.2-0.6)                 2 RED
//   D22 SPLITS_R7's H2 set drawn from family R                                   1 RED
//   D4  an emitter's base colour taken from its albedo (0) instead of 1          1 RED
//   D5  remodulate multiplying by the raw albedo, not the floored one            1 RED -- ZERO on the first draft, whose
//       round trip never saw an albedo under the floor; the near-black row was written for it
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = await import(pathToFileURL(path.join(ENG, "render", "denoiseScenes.mjs")).href);
const { IMAGE, SPP_IN, SPP_REF, ALBEDO_FLOOR, CHANNELS, SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, familyOf, isDatasetSeed, strideOf, renderSeeds,
        makeScene, guideBuffers, renderImages, inputChannels, remodulate } = D;
const { intersect, cameraBasis, pixelRay } = await import(pathToFileURL(path.join(ENG, "physics", "render", "pathTracer.mjs")).href);

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
    // the kernel-predicting round's splits (section 15)
    const seen = new Set([...all, ...newTests]), r3Tests = [...SPLITS_R3.T1.seeds, ...SPLITS_R3.T2.seeds];
    let refusedR3 = 0;
    for (const s of r3Tests) { try { renderImages(SPLITS_R3.T2.seeds.includes(s) ? "B" : "A", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refusedR3++; } }
    const three = [...all, ...newTests, ...r3Tests].flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    ok("!! the kernel round keeps the training and validation scenes and draws NEW test scenes again -- 7000 (A) and 8000 (B), on no range either earlier round used -- refused without harvest; C5 over all three rounds: 100 scenes, 300 distinct render seeds",
        SPLITS_R3.train === SPLITS.train && SPLITS_R3.val === SPLITS.val && SPLITS_R3.T1.family === "A" && SPLITS_R3.T2.family === "B" &&
        SPLITS_R3.T1.seeds.length === 12 && SPLITS_R3.T2.seeds.length === 12 && new Set(r3Tests).size === 24 && r3Tests.every((s) => !seen.has(s)) &&
        refusedR3 === 24 && new Set(three).size === three.length && three.length === 300, `T1 from ${SPLITS_R3.T1.seeds[0]}, T2 from ${SPLITS_R3.T2.seeds[0]}; ${refusedR3} of 24 refused`);
    // the temporal round's splits (section 17)
    const seen3 = new Set([...all, ...newTests, ...r3Tests]), r4Tests = [...SPLITS_R4.T1.seeds, ...SPLITS_R4.T2.seeds];
    let refusedR4 = 0;
    for (const s of r4Tests) { try { renderImages(SPLITS_R4.T2.seeds.includes(s) ? "B" : "A", s, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refusedR4++; } }
    const four = [...all, ...newTests, ...r3Tests, ...r4Tests].flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    ok("!! the temporal round keeps the training and validation scenes and draws NEW test scenes -- 9000 (A) and 10000 (B), on no earlier range -- refused without harvest; C5 over four rounds: 124 scenes, 372 render seeds",
        SPLITS_R4.train === SPLITS.train && SPLITS_R4.val === SPLITS.val && SPLITS_R4.T1.family === "A" && SPLITS_R4.T2.family === "B" &&
        SPLITS_R4.T1.seeds.length === 12 && SPLITS_R4.T2.seeds.length === 12 && new Set(r4Tests).size === 24 && r4Tests.every((s) => !seen3.has(s)) &&
        refusedR4 === 24 && new Set(four).size === four.length && four.length === 372, `T1 from ${SPLITS_R4.T1.seeds[0]}, T2 from ${SPLITS_R4.T2.seeds[0]}; ${refusedR4} of 24 refused`);
    const bad = [() => strideOf(new Float64Array(8 * 5), 5), () => strideOf(new Float64Array(9 * 5 + 1), 5)].filter((f) => { try { f(); return false; } catch { return true; } }).length;
    ok("  strideOf: 9 for a single frame, 13 for the temporal input, and a stride below nine or a fraction refused",
        strideOf(new Float64Array(9 * 6), 6) === 9 && strideOf(new Float64Array(13 * 6), 6) === 13 && bad === 2);
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

console.log("\n5. THE THIRD FAMILY AND THE MIXED SPLITS (pre-registration section 19)");
{
    // families A and B must draw exactly what they drew before family C existed: every number of 40 scenes of each, and
    // each sky at three directions, summed with position weights. 3551749752.4726539 over 4,884 numbers, recorded
    // before makeScene learned family C.
    let fp = 0, k = 1;
    const walk = (v) => { if (typeof v === "number") fp += v * ((k++ % 97) + 1); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const key of Object.keys(v).sort()) if (key !== "sky") walk(v[key]); };
    for (const fam of ["A", "B"]) for (let s = 900000; s < 900040; s++) { const S = makeScene(fam, s); walk(S); for (const d of [[0, 1, 0], [0, -1, 0], [0.6, 0.2, 0.77]]) walk(S.sky(d)); }
    ok("!! families A and B are untouched by family C: the fingerprint of 80 scenes is the one recorded before C existed", fp.toPrecision(17) === "3551749752.4726539" && k === 4885,
        `${fp.toPrecision(17)} over ${k - 1} numbers`);
    let shape = true, lights = true, sky = true, mats = true, nGloss = 0, nRough = 0, noAB = true;
    for (let s = 900000; s < 900300; s++) {
        const S = makeScene("C", s), L = S.scene.filter((o) => o.emit), body = S.scene.slice(1).filter((o) => !o.emit);
        shape &&= S.family === "C" && S.scene[0].radius === 100 && S.scene[0].sigma >= 0.2 && S.scene[0].sigma <= 0.5 && body.length >= 3 && body.length <= 6;
        const warm = L[0]?.emit, cool = L[1]?.emit;
        lights &&= L.length === 2 && L.every((o) => o.radius >= 0.15 && o.radius <= 0.3) && Array.isArray(warm) && Array.isArray(cool) &&
            Math.abs(warm[1] / warm[0] - 0.7) < 1e-12 && Math.abs(warm[2] / warm[0] - 0.4) < 1e-12 && Math.abs(cool[0] / cool[2] - 0.4) < 1e-12 &&
            Math.abs(cool[1] / cool[2] - 0.6) < 1e-12 && warm[0] >= 18 && warm[0] <= 42 && cool[2] >= 18 && cool[2] <= 42;
        const kv = S.sky([0, 1, 0]); sky &&= kv >= 0.01 && kv <= 0.05 && S.sky([0.3, -0.9, 0.1]) === kv;
        body.forEach((o, i) => {
            if (i % 2 === 1) { mats &&= o.roughness >= 0.03 && o.roughness <= 0.1 && o.ior >= 1.4 && o.ior <= 1.7 && o.albedo === undefined; nGloss++; }
            else { mats &&= o.sigma >= 0.3 && o.sigma <= 0.7 && Array.isArray(o.albedo) && o.roughness === undefined; nRough++; }
        });
        for (const fam of ["A", "B"]) noAB &&= makeScene(fam, s).scene.every((o) => o.sigma === undefined && o.ior === undefined);
    }
    ok("!! family C over 300 scenes: a rough-diffuse ground, 3-6 spheres alternating rough diffuse (sigma 0.3-0.7) and glossy dielectric (roughness 0.03-0.1, ior 1.4-1.7)",
        shape && mats && nGloss > 300 && nRough > 300, `${nRough} rough-diffuse, ${nGloss} glossy`);
    ok("!! ...lit by two emitters of radius 0.15-0.3, one warm (1 : 0.7 : 0.4) and one cool (0.4 : 0.6 : 1), strength 18-42, under a uniform sky of 0.01-0.05", lights && sky);
    ok("  ...and neither material is anywhere in families A or B", noAB);
    // the guide buffers on a family C scene: a rough-diffuse hit gives its albedo, a glossy hit and an emitter give 1
    const S = makeScene("C", 900007), G = guideBuffers(S, 24, 24), B = cameraBasis(S);
    let checked = 0, right = true;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const hit = intersect(S.eye, pixelRay(x, y, 0.5, 0.5, 24, 24, B), S.scene); if (!hit) continue;
        const o = hit.sphere, want = o.emit || o.roughness !== undefined ? [1, 1, 1] : o.albedo, p = (y * 24 + x) * 3;
        right &&= [0, 1, 2].every((c) => G.albedo[p + c] === want[c]); checked++;
    }
    ok("  family C's guide buffers: a rough-diffuse hit carries its albedo; a glossy hit and an emitter carry 1", right && checked > 200, `${checked} pixels`);
    // the mixed splits
    const T = SPLITS_R5, mixed = [T.train, T.val, T.T1];
    const seen4 = new Set([SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4].flatMap((S2) => Object.values(S2).flatMap((x) => x.seeds)));
    const newSeeds = [...T.train.seeds.slice(12), ...T.val.seeds.slice(2), ...T.T1.seeds, ...T.T2.seeds];
    ok("!! SPLITS_R5: train 12 A (round 1's first twelve) + 12 new B; val 2 + 2; H1's set 6 new A + 6 new B; H2's set 12 of family C -- every new seed on a range no earlier split touched",
        T.train.seeds.length === 24 && T.train.seeds.slice(0, 12).every((s2, i) => s2 === SPLITS.train.seeds[i]) && T.train.families.filter((f) => f === "A").length === 12 &&
        T.val.seeds.length === 4 && T.T1.seeds.length === 12 && T.T1.families.filter((f) => f === "B").length === 6 && T.T2.family === "C" && !T.T2.families &&
        T.T2.seeds.length === 12 && newSeeds.every((s2) => !seen4.has(s2)) && mixed.every((sp) => sp.families.length === sp.seeds.length));
    ok("  familyOf reads a mixed split's own entry per seed, and a single-family split's family", familyOf(T.train, 0) === "A" && familyOf(T.train, 23) === "B" &&
        familyOf(T.T1, 6) === "B" && familyOf(T.T2, 3) === "C" && familyOf(SPLITS.T2, 0) === "B");
    let refused5 = 0;
    for (const s2 of newSeeds) { try { renderImages("C", s2, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused5++; } }
    const five = [...new Set([...seen4, ...newSeeds])].flatMap((s2) => { const r = renderSeeds(s2); return [r.input, r.ref, r.ref2]; });
    ok("!! every new seed is refused without harvest, and C5 holds over five rounds' scenes", refused5 === newSeeds.length && new Set(five).size === five.length,
        `${refused5} of ${newSeeds.length} refused; ${five.length} render seeds`);
    // the emitter-mask round's splits (section 21)
    const U = SPLITS_R6, seen5 = new Set([...seen4, ...newSeeds]), r6 = [...U.T1.seeds, ...U.T2.seeds];
    let refused6 = 0;
    for (const s2 of r6) { try { renderImages("C", s2, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused6++; } }
    const six = [...new Set([...seen5, ...r6])].flatMap((s2) => { const r = renderSeeds(s2); return [r.input, r.ref, r.ref2]; });
    ok("!! SPLITS_R6: round 5's training and validation scenes, and NEW test scenes -- H1 6 A (16000) + 6 B (17000), H2 12 of C (18000) -- refused without harvest; C5 over six rounds",
        U.train === T.train && U.val === T.val && U.T1.families.join() === T.T1.families.join() && U.T2.family === "C" && U.T2.seeds.length === 12 &&
        r6.every((s2) => !seen5.has(s2)) && new Set(r6).size === 24 && refused6 === 24 && new Set(six).size === six.length, `${six.length} render seeds`);
}

console.log("\n6. THE RANDOMIZED FAMILY AND ITS SPLITS (pre-registration section 23)");
{
    // family C is the test family again: it must draw exactly what rounds 5 and 6 drew. 1793200622.0119343 over 2,780
    // numbers, recorded before makeScene learned family R.
    let fp = 0, k = 1;
    const walk = (v) => { if (typeof v === "number") fp += v * ((k++ % 97) + 1); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const key of Object.keys(v).sort()) if (key !== "sky") walk(v[key]); };
    for (let s2 = 900000; s2 < 900040; s2++) { const S = makeScene("C", s2); walk(S); for (const d of [[0, 1, 0], [0, -1, 0], [0.6, 0.2, 0.77]]) walk(S.sky(d)); }
    ok("!! family C is untouched by family R: the fingerprint of 40 C scenes is the one recorded before R existed", fp.toPrecision(17) === "1793200622.0119343" && k === 2781,
        `${fp.toPrecision(17)} over ${k - 1} numbers`);
    let shape = true, mats = true, lights = true, sky = true, eye = true, noC = true, nLamb = 0, nMetal = 0;
    const kinds = new Set(), lo = { alb: 1, rough: 1, rad: 1 }, hi = { alb: 0, rough: 0, rad: 0 };
    for (let s2 = 900000; s2 < 900300; s2++) {
        const S = makeScene("R", s2), g = S.scene[0], L = S.scene.filter((o) => o.emit), body = S.scene.slice(1).filter((o) => !o.emit);
        shape &&= S.family === "R" && g.radius === 100 && g.albedo.every((v) => v >= 0.2 && v <= 0.8) && body.length >= 2 && body.length <= 8 &&
            body.every((o) => o.radius >= 0.15 && o.radius <= 0.8 && Math.abs(o.centre[1] - o.radius) < 1e-12 && Math.abs(o.centre[0]) <= 2 && Math.abs(o.centre[2]) <= 2);
        for (const o of body) {
            if (o.roughness === undefined) { mats &&= o.albedo.every((v) => v >= 0.05 && v <= 0.95); nLamb++; lo.alb = Math.min(lo.alb, ...o.albedo); hi.alb = Math.max(hi.alb, ...o.albedo); }
            else { mats &&= o.roughness >= 0.05 && o.roughness <= 0.8 && o.F0.every((v) => v >= 0.2 && v <= 1) && o.albedo === undefined; nMetal++; lo.rough = Math.min(lo.rough, o.roughness); hi.rough = Math.max(hi.rough, o.roughness); }
        }
        const power = L.reduce((a, o) => a + o.radius * o.radius * o.emit, 0);
        lights &&= L.length >= 1 && L.length <= 2 && L.every((o) => typeof o.emit === "number" && o.emit <= 30 && o.radius >= 0.15 && o.radius <= 0.5) && power <= 3 + 1e-12;
        for (const o of L) { lo.rad = Math.min(lo.rad, o.radius); hi.rad = Math.max(hi.rad, o.radius); }
        kinds.add(S.skyKind);
        if (S.skyKind === "uniform") sky &&= S.sky([0, 1, 0]) >= 0.1 && S.sky([0, 1, 0]) <= 0.8 && S.sky([0.3, -0.9, 0.1]) === S.sky([0, 1, 0]);
        const R = Math.hypot(S.eye[0], S.eye[2]); eye &&= R >= 3.5 && R <= 5.5 && S.eye[1] >= 0.7 && S.eye[1] <= 2.5 && S.fovDeg === 40;
        noC &&= S.scene.every((o) => o.sigma === undefined && o.ior === undefined && !Array.isArray(o.emit));
    }
    ok("!! family R over 300 scenes: a Lambertian ground, 2-8 resting spheres, each Lambertian (two in three) or a microfacet conductor; 1-2 white emitters sharing a power of at most 3",
        shape && mats && lights && eye && nLamb / (nLamb + nMetal) > 0.6 && nLamb / (nLamb + nMetal) < 0.73, `${nLamb} Lambertian, ${nMetal} conductors`);
    ok("  ...under a gradient, a band or a uniform sky -- all three drawn, the uniform one never below 0.1", sky && kinds.size === 3);
    ok("!! ...and NOTHING of family C's: no rough diffuse, no dielectric, no coloured emitter, anywhere in 300 scenes", noC);
    ok("  R is broad: its draws reach past A's and B's ranges -- albedo below 0.1 and above 0.9, roughness below 0.1 and above 0.7, emitter radius 0.15-0.5",
        lo.alb < 0.1 && hi.alb > 0.9 && lo.rough < 0.1 && hi.rough > 0.7 && lo.rad < 0.17 && hi.rad > 0.48,
        `albedo ${lo.alb.toFixed(2)}-${hi.alb.toFixed(2)}, roughness ${lo.rough.toFixed(2)}-${hi.rough.toFixed(2)}, radius ${lo.rad.toFixed(2)}-${hi.rad.toFixed(2)}`);
    // the splits
    const V = SPLITS_R7, seen6 = new Set([SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6].flatMap((S2) => Object.values(S2).flatMap((x) => x.seeds)));
    const r7 = Object.values(V).flatMap((x) => x.seeds);
    let refused7 = 0;
    for (const s2 of r7) { try { renderImages("R", s2, { w: 2, h: 2, sppIn: 1, sppRef: 1 }); } catch (e) { if (/dataset seed/.test(e.message)) refused7++; } }
    const seven = [...new Set([...seen6, ...r7])].flatMap((s2) => { const r = renderSeeds(s2); return [r.input, r.ref, r.ref2]; });
    ok("!! SPLITS_R7: 96 training scenes of R, 4 for val, 12 for H1, and family C for H2 -- every seed new, refused without harvest; C5 over seven rounds",
        V.train.family === "R" && V.train.seeds.length === 96 && V.val.family === "R" && V.val.seeds.length === 4 && V.T1.family === "R" && V.T1.seeds.length === 12 &&
        V.T2.family === "C" && V.T2.seeds.length === 12 && r7.every((s2) => !seen6.has(s2)) && new Set(r7).size === r7.length && refused7 === r7.length &&
        new Set(seven).size === seven.length, `${refused7} of ${r7.length} refused; ${seven.length} render seeds`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether these scenes are a FAIR test. That is a judgement the pre-registration made in prose; " +
    "this gate holds the code to that prose, not the prose to the world.");
process.exit(fails ? 1 : 0);
