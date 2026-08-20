// tools/autoExtremity-selfcheck.mjs
//
// Run: node tools/autoExtremity-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the auto-extremity bridge: raise the mountain amplitude and the fitted world height rises with it, and
// the tallest column ALWAYS fits -- the world is sized from the content, never the content clipped to the world.
// Domain warp displaces the sample coordinates by a bounded amount and is deterministic. The load-bearing line is
// worldHeight = maxHeight + 1 + headroom; SABOTAGE it to a fixed constant and the tall-mountain "nothing is
// clipped" check fails, because a world that ignores its content lets the mountain poke through the ceiling.

import { fbm2, domainWarp2, warpedTerrainHeight, voxelTypeForHeight, fitExtremity } from "../world/autoExtremity.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. fbm is bounded and deterministic
let allIn = true; for (let i = 0; i < 500; i++) { const v = fbm2(i * 0.13, i * 0.29, 1); if (v < -0.01 || v > 1.01) allIn = false; }
ok("!! fractal noise stays in [0,1] and recomputes identically", allIn && fbm2(3.3, 7.1, 1) === fbm2(3.3, 7.1, 1),
   `sample fbm(3.3,7.1)=${fbm2(3.3, 7.1, 1).toFixed(4)}`);

// 2. domain warp displaces the coordinate by a BOUNDED amount, deterministically
let maxDisp = 0; for (let i = 0; i < 200; i++) {
    const [wx, wz] = domainWarp2(i, i * 0.7, { warpAmp: 4 });
    maxDisp = Math.max(maxDisp, Math.abs(wx - i), Math.abs(wz - i * 0.7));
}
const [wx1, wz1] = domainWarp2(5, 9, { warpAmp: 4 }), [wx2, wz2] = domainWarp2(5, 9, { warpAmp: 4 });
ok("!! domain warp displaces coordinates by a bounded amount, deterministically", maxDisp <= 4.01 && wx1 === wx2 && wz1 === wz2,
   `max displacement ${maxDisp.toFixed(2)} <= warpAmp 4, and it is stable`);
ok("...and warpAmp 0 is the identity (no warp)", (() => { const [a, b] = domainWarp2(5, 9, { warpAmp: 0 }); return a === 5 && b === 9; })(),
   "with no amplitude the coordinate is untouched");

// 3. higher mountain amplitude -> taller peaks
const lowHt = (x, z) => warpedTerrainHeight(x, z, { amp: 4, seed: 2 });
const highHt = (x, z) => warpedTerrainHeight(x, z, { amp: 20, seed: 2 });
const lowFit = fitExtremity(lowHt, { size: 24 }), highFit = fitExtremity(highHt, { size: 24 });
ok("!! taller mountains (bigger amplitude) produce a taller peak", highFit.maxHeight > lowFit.maxHeight + 5,
   `low amp peak ${lowFit.maxHeight}, high amp peak ${highFit.maxHeight}`);

// 4. AUTO-EXTREMITY: the fitted world height rises WITH the mountains
ok("!! the fitted world height increases as the mountains get higher", highFit.worldHeight > lowFit.worldHeight,
   `low world ${lowFit.worldHeight}, high world ${highFit.worldHeight} -- the extremity grew to fit`);

// 5. nothing is ever clipped: the tallest column fits under the fitted ceiling, at every amplitude
let neverClipped = true, worst = null;
for (const amp of [2, 6, 12, 24, 48]) {
    const f = fitExtremity((x, z) => warpedTerrainHeight(x, z, { amp, seed: 5 }), { size: 24 });
    if (f.maxHeight >= f.worldHeight) { neverClipped = false; worst = `amp ${amp}: peak ${f.maxHeight} >= world ${f.worldHeight}`; }
}
ok("!! nothing is clipped -- the tallest column fits under the ceiling at every amplitude", neverClipped,
   worst || "peak < worldHeight for amp in [2..48] -- the world is sized from the content");

// 6. shaping to voxel type: peaks are snow/rock, valleys water
ok("!! voxel type is shaped by height -- snow caps, water fills the lows",
   voxelTypeForHeight(19, 20) === "snow" && voxelTypeForHeight(2, 20) === "water" && highFit.tallestType === "snow",
   `peak type ${highFit.tallestType}, per-type ${JSON.stringify(highFit.perType)}`);

console.log(fails ? "\nautoExtremity-selfcheck: " + fails + " FAILED" : "\nautoExtremity-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
