// physics/mesh/ambientOcclusion-selfcheck.mjs
//
// Run: node physics/mesh/ambientOcclusion-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves occlusion-based color ramping MEASURES enclosure rather than painting it. An isolated convex sphere is
// exposed everywhere (AO ~ 0). Two balls blended into a peanut have a concave NECK that is genuinely enclosed --
// sampling outward from a neck vertex lands inside the neighbouring bulge -- so the neck's AO is high while the
// far tips stay low. The ramp then darkens the enclosed and brightens the exposed. The load-bearing line is the
// `field > iso` inside/outside test; SABOTAGE flips it to `< iso` and the neck-darker-than-tips check fails,
// because an occlusion term with the sign backwards lights the crevices and shades the spikes.

import { sphereField, wyvill, wyvillGrad, marchingTets, ambientOcclusion, occlusionRamp } from "./marchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / Math.max(a.length, 1); };

// 1. an isolated convex sphere is EXPOSED everywhere -> AO near zero
const sph = sphereField(1.0);
const sm = marchingTets(sph.f, sph.g, { N: 24, iso: 0 });
const sphAO = ambientOcclusion(sm.verts, sph.f, sph.g, { iso: 0, radius: 0.2 });
const mSph = mean(sphAO);
ok("!! an isolated convex sphere is EXPOSED -- AO near zero everywhere", mSph < 0.15,
   `${sm.verts.length} verts, mean AO ${mSph.toFixed(3)} (a convex surface occludes nothing)`);

// 2. two balls blended into a peanut -> the concave NECK is occluded, the tips are not
const balls = [{ cx: -0.65, cy: 0, cz: 0, r: 0.9, s: 1 }, { cx: 0.65, cy: 0, cz: 0, r: 0.9, s: 1 }];
const wf = (x, y, z) => wyvill(balls, x, y, z), wg = (x, y, z) => wyvillGrad(balls, x, y, z);
const m = marchingTets(wf, wg, { N: 32, lo: -1.8, hi: 1.8, iso: 0.25 });
const ao = ambientOcclusion(m.verts, wf, wg, { iso: 0.25, radius: 0.45 });
let neckSum = 0, neckN = 0, tipSum = 0, tipN = 0;
for (let i = 0; i < m.verts.length; i++) {
    const x = m.verts[i][0];
    if (x > -0.22 && x < 0.22) { neckSum += ao[i]; neckN++; }
    else if (x > 1.0 || x < -1.0) { tipSum += ao[i]; tipN++; }
}
const neckAO = neckSum / Math.max(neckN, 1), tipAO = tipSum / Math.max(tipN, 1);
ok("!! the CREVICE is occluded and the tips are not -- AO measures real enclosure", neckAO > tipAO + 0.1,
   `neck AO ${neckAO.toFixed(3)} (${neckN} verts) vs tip AO ${tipAO.toFixed(3)} (${tipN} verts)`);
ok("...and the neck is genuinely enclosed, not marginally so", neckAO > 0.15 && tipAO < 0.02,
   `neck AO ${neckAO.toFixed(3)} vs tips fully exposed at ${tipAO.toFixed(3)} -- a real pocket, not noise`);

// 3. the ramp darkens the enclosed and brightens the exposed
const rgb = occlusionRamp(Float32Array.from([0, 1]));   // [exposed, occluded]
const exposedLum = rgb[0] + rgb[1] + rgb[2], occludedLum = rgb[3] + rgb[4] + rgb[5];
ok("...and the ramp darkens the enclosed, brightens the exposed", exposedLum > occludedLum + 0.5,
   `exposed luma ${exposedLum.toFixed(2)} > occluded luma ${occludedLum.toFixed(2)}`);

// 4. determinism -- same mesh, same AO, bit for bit
const ao2 = ambientOcclusion(m.verts, wf, wg, { iso: 0.25, radius: 0.45 });
let identical = ao.length === ao2.length; for (let i = 0; i < ao.length && identical; i++) if (ao[i] !== ao2[i]) identical = false;
ok("...and AO is deterministic -- fixed directions, recomputes bit-identical", identical,
   "fixed sample dirs and + - * / sqrt only, so it can be folded into the fingerprint later if wanted");

console.log(fails ? "\nambientOcclusion-selfcheck: " + fails + " FAILED" : "\nambientOcclusion-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
