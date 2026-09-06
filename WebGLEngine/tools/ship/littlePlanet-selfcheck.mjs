// WebGLEngine/tools/ship/littlePlanet-selfcheck.mjs -- v4482
//
// Run: node tools/ship/littlePlanet-selfcheck.mjs
//
// Grades render/littlePlanet.mjs -- the wiring of v4463's stereographic projection onto world/procPlanet.js's
// equirectangular bake -- and the two consumers it now has in ui/orreryDraw.js and orrery.html.
//
// *** SECTION 1 IS THE ONE THAT WOULD HAVE CAUGHT THE BUG NOBODY WOULD SEE. *** The two modules disagree about
// what "lon" means by exactly 90 degrees, in the same winding sense, and a world rotated a quarter turn still
// looks like a world. The check does not read the constant back: it builds directions through procPlanet's own
// formula, runs them through stereographic's dirToLonLat, and asserts the offset is CONSTANT and equal to what
// LON_QUARTER_TURN undoes -- and separately that composing the bridge with the inverse is the identity.
//
// *** AND SECTION 4 CHECKS A PROPERTY OF THE SOURCE, WHICH IS THE ONLY REASON THE FILTER IS FREE. *** The
// module's footprint-aware sampler was built for a speckle that measurement says does not happen, because
// procPlanet's pole rows are uniform in all five world types. That is a fact about procPlanet, not about this
// file, so it is checked HERE against freshly baked planets -- the day a world type grows a polar feature,
// this row goes red and says the filter has started earning its place.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../../render/littlePlanet.mjs";
import * as St from "../../render/stereographic.js";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
const stripLineComments = (t) => t.replace(/^\s*\/\/.*$/gm, " ");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = L.MEASURED_AT_V4482;
const near = (a, b, e) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;

// procPlanet's OWN direction formula, transcribed from bakeEquirect's three lines and checked against it below.
const procDir = (lon, lat) => { const c = Math.cos(lat); return [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)]; };

// ---- 1. *** THE 90 DEGREES THE TWO MODULES DISAGREE BY *** ---------------------------------------------------
{
    const bake = read("world", "procPlanet.js");
    ok("the direction formula this check uses is the one bakeEquirect actually writes",
        /const dx = cl \* Math\.cos\(lon\), dy = sl, dz = cl \* Math\.sin\(lon\);/.test(bake) &&
        /const lat = \(0\.5 - \(y \+ 0\.5\) \/ h\) \* Math\.PI;/.test(bake),
        "a transcription that drifts from its original grades nothing");

    const offs = [], lats = [];
    for (const latd of [-80, -60, -20, 0, 35, 70, 88]) for (const lond of [-170, -90, -30, 0, 45, 130, 179]) {
        const lat = (latd * Math.PI) / 180, lon = (lond * Math.PI) / 180;
        const [ls, phs] = St.dirToLonLat(...procDir(lon, lat));
        let o = ls - lon; while (o > Math.PI) o -= 2 * Math.PI; while (o < -Math.PI) o += 2 * Math.PI;
        offs.push(o); lats.push(Math.abs(phs - lat));
    }
    const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
    const spread = Math.max(...offs.map((o) => Math.abs(o - mean)));
    say(`over ${offs.length} (lon, lat) pairs: longitude offset ${(mean * 180 / Math.PI).toFixed(6)} deg, spread ${spread.toExponential(2)}`);
    ok("!! *** THE TWO MODULES MEAN DIFFERENT THINGS BY 'lon', BY EXACTLY 90 DEGREES ***",
        near((mean * 180) / Math.PI, M.lonOffsetDeg, 1e-9) && spread < 1e-14 &&
        Math.max(...lats) < 1e-14 && M.lonOffsetSpreadRad < 1e-14,
        `latitude agrees to ${Math.max(...lats).toExponential(2)} rad and longitude is off by a CONSTANT quarter ` +
        "turn. A world rotated 90 degrees still looks like a world, which is why only arithmetic finds this");

    // A rotation, not a reflection: increasing one longitude increases the other.
    const a = St.dirToLonLat(...procDir(0, 0))[0], b = St.dirToLonLat(...procDir(0.1, 0))[0];
    ok("...and it is a ROTATION about the polar axis, not a mirror",
        b > a && near(b - a, 0.1, 1e-12) && M.isReflection === false,
        `procPlanet lon +0.1 rad moves stereographic lon by ${(b - a).toFixed(6)} rad, the same sense. ` +
        "A reflection would have shown up as a mirrored world, which someone might eventually have noticed");

    // *** AND THE BRIDGE IS CHECKED BY ROUND TRIP, NOT BY READING ITS CONSTANT BACK. ***
    let worst = 0;
    for (let i = 0; i < 40; i++) {
        const lon = -Math.PI + (i / 40) * 2 * Math.PI, lat = -1.2 + (i / 40) * 2.4;
        const uv = L.equirectUV(L.stereoLonToEquirectLon(St.dirToLonLat(...procDir(lon, lat))[0]), lat);
        let want = lon / (2 * Math.PI) + 0.5; want -= Math.floor(want);
        let d = Math.abs(uv[0] - want); if (d > 0.5) d = 1 - d;      // the seam is a wrap, not an error
        worst = Math.max(worst, d, Math.abs(uv[1] - (0.5 - lat / Math.PI)));
    }
    ok("!! the bridge ROUND TRIPS: a procPlanet (lon, lat) survives the trip through stereographic and back",
        worst < 1e-12,
        `worst texture-coordinate error ${worst.toExponential(2)} over 40 points. This is what makes ` +
        "LON_QUARTER_TURN a measurement rather than a number somebody typed");
}

// ---- 2. THE LANDMARKS, AND EVERY PLANE POINT HAVING AN IMAGE --------------------------------------------------
{
    const at = (u, v) => St.dirToLonLat(...St.littlePlanetDir(u, v))[1] * 180 / Math.PI;
    say(`latitude at plane radius 0 / 2 / 20 / 1e6: ${at(1e-9, 0).toFixed(3)} / ${at(2, 0).toFixed(3)} / ${at(20, 0).toFixed(3)} / ${at(1e6, 0).toFixed(3)} deg`);
    ok("the centre is the NADIR, plane radius 2 is the HORIZON exactly, and the zenith is approached and never reached",
        near(at(1e-9, 0), -90, 1e-6) && Math.abs(at(2, 0)) < 1e-12 && at(20, 0) > 78 && at(1e6, 0) < 90,
        "2 = 2*tan(45 deg), which is why the horizon lands on a round number and not on a fitted constant");

    // *** AND EVERY ONE OF THOSE PROBES SITS ON v = 0, WHERE A MIRROR IS INVISIBLE -- v4463's OWN DEFECT,
    // MADE AGAIN HERE. *** littlePlanetDir's rotation is (vx, vy, vz) -> (vx, vz, -vy). On the u axis vy is 0,
    // so flipping that sign changes nothing at all and a sabotage that turned the rotation into a reflection
    // cost zero red. v4463 found exactly this in its own handedness check, fixed it there, and the same hands
    // wrote a fresh gate one round later with the same blind spot. Off the axis the mirror is a HALF TURN in
    // longitude, and that is what is asserted.
    const lonAt = (u, v) => St.dirToLonLat(...St.littlePlanetDir(u, v))[0];
    say(`longitude at (0, 2) and (0, -2): ${lonAt(0, 2).toFixed(6)} and ${lonAt(0, -2).toFixed(6)} rad`);
    ok("!! the rotation is not a MIRROR: opposite points on the v axis land on opposite meridians",
        Math.abs(lonAt(0, 2)) < 1e-12 && near(Math.abs(lonAt(0, -2)), Math.PI, 1e-12) &&
        near(St.littlePlanetDir(0, 2)[2], -1, 1e-12) && near(St.littlePlanetDir(0, -2)[2], 1, 1e-12),
        "a reflected rotation sends (0, 2) to the meridian (0, -2) belongs on, and every landmark on the u " +
        "axis survives it untouched because they all have vy = 0");

    const tex = bakeEquirect(planetSpec(913430330), 64, 32);
    const shot = L.renderLittlePlanet(tex, { size: 96 });
    let opaque = 0;
    for (let i = 3; i < shot.rgba.length; i += 4) if (shot.rgba[i] === 255) opaque++;
    ok("a frame is FULLY covered -- every plane point has an image, so there is no hole to punch",
        opaque === 96 * 96 && shot.rgba.length === 96 * 96 * 4,
        `${opaque} of ${96 * 96} pixels opaque. The one direction with no image is the zenith, and it is at ` +
        "infinity: no finite pixel is it");

    // spin must MOVE the picture and must wrap cleanly
    const a = L.renderLittlePlanet(tex, { size: 64, spin: 0 });
    const b = L.renderLittlePlanet(tex, { size: 64, spin: 1.1 });
    const c = L.renderLittlePlanet(tex, { size: 64, spin: 1.1 - 2 * Math.PI });
    const differ = (x, y) => { let n = 0; for (let i = 0; i < x.rgba.length; i += 4) if (x.rgba[i] !== y.rgba[i]) n++; return n; };
    // *** AND THE WRAP IS A CONTRACT ON THE RETURNED COORDINATE, NOT ON THE PICTURE. *** Replacing
    // equirectUV's Math.floor with `% 1` cost zero red at first, because sampleEquirect wraps the COLUMN too
    // and rescued the negative u downstream -- so the picture was identical and the comment claiming the floor
    // is what keeps a negative spin on the texture was wrong. Two independent guards, one of them invisible.
    // planeToEquirect's own output is asserted directly now, at spins on both sides of zero.
    let outOfRange = 0;
    for (const spin of [-9, -Math.PI, -0.3, 0, 0.3, Math.PI, 9]) for (let i = 0; i < 16; i++) {
        const t = L.planeToEquirect(1.7 * Math.cos(i), 1.7 * Math.sin(i), spin);
        if (!(t[0] >= 0 && t[0] < 1) || !(t[1] >= 0 && t[1] <= 1)) outOfRange++;
    }
    ok("!! planeToEquirect returns texture coordinates IN RANGE at every spin, negative ones included",
        outOfRange === 0,
        "112 points across seven spins. sampleEquirect wraps the column as well, so this contract is invisible " +
        "in the picture -- which is why it is asserted on the value instead");

    ok("spin turns the world, and a spin one full turn away is the SAME picture",
        differ(a, b) > 200 && differ(b, c) === 0,
        `spin 1.1 moves ${differ(a, b)} pixels; spin 1.1 - 2*PI moves ${differ(b, c)} from it. The wrap in ` +
        "equirectUV uses Math.floor rather than %, so a negative spin lands in range instead of off the texture");
}

// ---- 3. *** THE SAMPLING RATE, RE-DERIVED -- #175 ASKED BY HOW MUCH *** ----------------------------------------
{
    const D = M.probeSize, R = D / 2, k = R / M.probeFit, W = M.probeW, H = M.probeH;
    let mn = Infinity, mx = 0, under = 0, n = 0, worstAt = null, ties = [];
    const hit = new Set();
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
        const u = ((i + 0.5) - R) / k, v = ((j + 0.5) - R) / k;
        const f = L.footprint(u, v, k, W, H); if (!f) continue;
        // *** AN EVEN-SIDED FRAME HAS NO CENTRE PIXEL. *** The first draft asserted worstAt.i === D/2 and went
        // red: at 512 the four pixels around (255.5, 255.5) are equidistant and tie for the maximum to the last
        // bit, so which one "is" the worst depends only on iteration order. The tie is collected instead.
        if (f.worst > mx) { mx = f.worst; worstAt = { i, j, texLat: f.texLat, texLon: f.texLon }; ties = [[i, j]]; }
        else if (f.worst === mx) ties.push([i, j]);
        if (f.worst < mn) mn = f.worst;
        if (f.worst > 1) under++;
        n++;
        const t = L.planeToEquirect(u, v);
        hit.add(Math.min(H - 1, Math.floor(t[1] * H)) * W + Math.min(W - 1, Math.floor(t[0] * W)));
    }
    say(`${D}px frame over a ${W}x${H} bake: footprint ${mn.toFixed(4)} .. ${mx.toFixed(2)} texels/pixel`);
    ok("!! *** THE SAMPLING RATE SPANS 511 TO 1 ACROSS ONE FRAME *** -- #175's question, answered as a number",
        near(mn, M.footprintMin, 5e-4) && near(mx, M.footprintMax, 5e-2) &&
        near(mx / mn, M.footprintRange, 1) &&
        near((100 * under) / n, M.undersampledPct, 5e-2) &&
        near((100 * hit.size) / (W * H), M.sourceReachedPct, 5e-2),
        `${((100 * under) / n).toFixed(2)}% of pixels span more than one texel; ` +
        `${((100 * hit.size) / (W * H)).toFixed(2)}% of the source is reached at all`);

    say(`the maximum is attained by ${ties.length} pixels: ${JSON.stringify(ties)}`);
    ok("!! ...AND THE WORST PIXELS ARE THE FOUR AT THE CENTRE, WHERE THE PROJECTION IS AT ITS BEST",
        ties.length === M.worstPixelTieCount &&
        ties.every(([i, j]) => Math.abs(i + 0.5 - D / 2) <= 0.5 && Math.abs(j + 0.5 - D / 2) <= 0.5) &&
        M.worstIsCentre === true &&
        near(St.stereoScale(...St.stereoUnproject(1e-9, 0)), M.magAtNadir, 1e-6) &&
        near(St.stereoScale(...St.stereoUnproject(2, 0)), M.magAtHorizon, 1e-12) &&
        near(worstAt.texLon / worstAt.texLat, M.centreAnisotropy, 1),
        `the stereographic magnification at the nadir is ${M.magAtNadir} -- its MINIMUM over the frame -- and ` +
        `the centre pixel still reads ${worstAt.texLat.toFixed(3)} texels across in latitude and ` +
        `${worstAt.texLon.toFixed(2)} in longitude. The blow-up is the EQUIRECT's cos(lat) singularity, not ` +
        "the projection's. A little planet looks straight down and an equirectangular map is worst straight down");
}

// ---- 4. *** THE SOURCE PROPERTY THAT MAKES THE FILTER FREE, AND THE CONTROL THAT PROVES IT WORKS *** ------------
{
    const W = M.probeW, H = M.probeH;
    const spread = (tex, row) => {
        const mn = [255, 255, 255], mx = [0, 0, 0];
        for (let c = 0; c < tex.w; c++) { const o = (row * tex.w + c) * 4;
            for (let k = 0; k < 3; k++) { if (tex.rgba[o + k] < mn[k]) mn[k] = tex.rgba[o + k]; if (tex.rgba[o + k] > mx[k]) mx[k] = tex.rgba[o + k]; } }
        return Math.max(...mx.map((v, i) => v - mn[i]));
    };
    const types = new Map();
    let worstPole = 0, worstType = null;
    for (let s = 1; s <= M.seedsSurveyed; s++) {
        const spec = planetSpec(s * 7919), tex = bakeEquirect(spec, W, H);
        // *** BOTH ROWS, AND THE MAX -- NOT THE SOUTH ROW AND NOT A MEAN. *** The module's first draft claimed
        // every type was exactly 0; it had been read off per-type MEANS with a max over the south row alone,
        // and gas giants reach 1 on the north. A summary quoted as an extremum is how that overclaim happened.
        const p = Math.max(spread(tex, 0), spread(tex, H - 1)), e = spread(tex, H >> 1);
        if (!types.has(spec.type)) types.set(spec.type, { n: 0, pole: 0, eq: 0 });
        const b = types.get(spec.type); b.n++; b.pole = Math.max(b.pole, p); b.eq += e;
        if (p > worstPole) { worstPole = p; worstType = spec.type; }
    }
    for (const [t, b] of types) say(`${t.padEnd(8)} ${String(b.n).padStart(3)} seeds: worst pole-row spread ${b.pole}, mean equator ${(b.eq / b.n).toFixed(2)}`);
    const perType = [...types].every(([t, b]) => b.pole === M.poleRowSpreadByType[t]);
    const eqOk = [...types].every(([t, b]) => Math.abs(b.eq / b.n - M.equatorMeanByType[t]) <= 5e-3);
    ok("!! *** procPlanet's POLE ROWS ARE FLAT TO AT MOST ONE LEVEL IN EVERY WORLD TYPE -- WHY THE FILTER IS FREE ***",
        perType && eqOk && types.size === M.worldTypes &&
        worstPole === M.poleRowSpreadWorst && worstType === M.poleRowSpreadWorstType &&
        Object.values(M.poleRowSpreadByType).filter((v) => v === 0).length === 4,
        `${M.seedsSurveyed} seeds, ${types.size} world types: four types at exactly 0 and ${worstType} at ` +
        `${worstPole}, against equator means from ${Math.min(...Object.values(M.equatorMeanByType)).toFixed(2)} ` +
        `to ${Math.max(...Object.values(M.equatorMeanByType)).toFixed(2)}. ` +
        "*** THIS ROW IS ABOUT procPlanet, NOT ABOUT littlePlanet: the day a world type grows a polar feature " +
        "it goes red and the filter starts earning its place instead of being found to have been needed ***");

    const tex = bakeEquirect(planetSpec(913430330), W, H);
    const diff = (a, b) => { let n = 0, mxd = 0; for (let i = 0; i < a.rgba.length; i += 4) {
        const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
        if (d > 0) n++; if (d > mxd) mxd = d; } return { n, mxd }; };
    const real = diff(L.renderLittlePlanet(tex, { size: 512, maxLonTaps: 1 }), L.renderLittlePlanet(tex, { size: 512 }));
    ok("...so on a real bake the filter moves 129 pixels by one level, which is the honest size of its effect",
        real.n === M.filterMovesPixels && real.mxd === M.filterMovesLevels,
        `${real.n} pixels differ, max channel ${real.mxd}. The reason first written down for building this ` +
        "filter -- that the centre would speckle and the speckle would move with frame size -- is FALSE here");

    // *** THE CONTROL. *** A source that DOES vary along its pole rows, so a filter that did nothing fails.
    const chk = { w: W, h: H, rgba: new Uint8ClampedArray(W * H * 4) };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4, v = ((x * 37 + y * 11) % 2) ? 20 : 235;
        chk.rgba[o] = chk.rgba[o + 1] = chk.rgba[o + 2] = v; chk.rgba[o + 3] = 255;
    }
    const ctl = diff(L.renderLittlePlanet(chk, { size: 512, maxLonTaps: 1 }), L.renderLittlePlanet(chk, { size: 512 }));
    ok("!! CONTROL: on a source with detail at the poles the SAME filter moves 0.89% of pixels by 143 levels",
        near((100 * ctl.n) / (512 * 512), M.controlMovesPct, 5e-3) && ctl.mxd === M.controlMovesLevels &&
        ctl.n > 10 * real.n,
        `${ctl.n} pixels, max channel ${ctl.mxd}. A filter whose effect is small must be shown to be CAPABLE ` +
        "of a large one, or 'it changes almost nothing' and 'it does nothing' are the same measurement");

    // and taps really are one almost everywhere -- the filter is not blurring the frame
    let multi = 0;
    const R = 256, k = R / 2;
    for (let j = 0; j < 512; j++) for (let i = 0; i < 512; i++) {
        const f = L.footprint(((i + 0.5) - R) / k, ((j + 0.5) - R) / k, k, W, H);
        if (f && Math.round(f.texLon) > 1) multi++;
    }
    ok("...and it takes ONE tap over 99.1% of the frame, so it is not a blur wearing a footprint's name",
        multi === M.pixelsTakingMoreThanOneTap && multi / (512 * 512) < 0.01,
        `${multi} of ${M.framePixels} pixels take more than one tap`);
}

// ---- 5. *** THE WIRING: v4463's MODULE HAD ONE IMPORTER AND IT WAS ITS OWN GATE *** ------------------------------
{
    const draw = read("ui", "orreryDraw.js"), page = read("orrery.html");
    const drawCode = stripLineComments(draw), pageCode = stripLineComments(page);
    ok("!! render/stereographic.js is reached from shipping code now, not only from its own selfcheck",
        /from "\.\/stereographic\.js"/.test(read("render", "littlePlanet.mjs")) &&
        /from "\.\.\/render\/littlePlanet\.mjs"/.test(drawCode) &&
        M.stereographicImportersBefore === 1,
        "v4463 closed with 'nothing in main.js calls this yet; it is a module and a gate, not a wired effect', " +
        "and that was still exactly true when this round started");
    ok("...and orrery.html actually DRAWS it, in code rather than in a comment",
        /drawLittlePlanet\(ctx, focus/.test(pageCode) && /SURFACE_LITTLE/.test(pageCode) &&
        /surfMode === 2/.test(pageCode),
        "an import with no call site is the same unwired module one directory along");

    // The label is the honesty, as orrerySeed-selfcheck insists for the other two surfaces.
    ok("!! the third framing SAYS it is the same generated surface, not a third source of truth",
        /SURFACE_LITTLE = "seeded, from the ground \(little planet\)"/.test(draw) &&
        /the same \$\{sp2\.type\} world from commit/.test(page),
        "mode 2 is a projection of mode 1's bake. A viewer who thought it was a separate measurement would be " +
        "misled by a page whose whole point is that its pictures come from somewhere nameable");

    // *** CALLED, NOT GREPPED. *** drawLittlePlanet is invoked against a stub 2D context.
    const mod = await import("../../ui/orreryDraw.js");
    const calls = [];
    const stub = {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img, x, y) => calls.push({ w: img.width, h: img.height, x, y, sum: img.data.reduce((a, b) => a + b, 0) }),
    };
    const shot = mod.drawLittlePlanet(stub, { seed: 913430330, name: "probe" }, 100, 80, 32, 0.3, 64);
    ok("!! drawLittlePlanet is CALLED here against a stub context, so dead code cannot pass this",
        calls.length === 1 && calls[0].w === 64 && calls[0].h === 64 &&
        calls[0].x === 100 - 32 && calls[0].y === 80 - 32 && calls[0].sum > 0 &&
        shot && shot.size === 64 && shot.undersampled >= 0,
        // *** THE GUARD IS THE POINT, NOT THE PADDING. *** Written without it this line read calls[0].w on an
        // empty array when the sabotage that removes putImageData was applied, so the row CRASHED instead of
        // failing by name and took every section after it down with it. That is v4434's shape, and v4478 hit it
        // too: a detail string is evaluated whether the check passed or not, so it must survive the failure the
        // check exists to catch. Third instance in two rounds, which is why it is written down here.
        (calls.length
            ? `one putImageData of ${calls[0].w}x${calls[0].h} at (${calls[0].x}, ${calls[0].y}), pixel sum ${calls[0].sum}. `
            : "*** putImageData was never called: nothing reached the canvas. *** ") +
        "v4480's finding: an assertion about where text sits is satisfied by a branch that is present and dead");

    ok("...and it draws the SAME bake drawSeededPlanet draws, from one cache rather than a second one",
        /seededPlanetFor\(body, size\)/.test(drawCode.slice(drawCode.indexOf("export function drawLittlePlanet"))) &&
        (drawCode.match(/_planetCache/g) || []).length >= 2 &&
        !/bakeEquirect\(/.test(drawCode.slice(drawCode.indexOf("export function drawLittlePlanet"))),
        "two framings of one world must not be able to disagree about the world");
}

console.log("littlePlanet-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
