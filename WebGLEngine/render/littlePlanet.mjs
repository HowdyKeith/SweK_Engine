// WebGLEngine/render/littlePlanet.mjs -- v4482
//
// *** THE LITTLE PLANET, WIRED TO THE EQUIRECTANGULAR BAKE IT WAS BUILT FOR -- AND THE TWO PROJECTIONS PUT
// THEIR SINGULARITIES IN THE SAME PLACE, WHICH IS THE MIDDLE OF THE PICTURE. ***
//
// v4463 built render/stereographic.js and said so in its own closing line: "Nothing in main.js calls this yet;
// it is a module and a gate, not a wired effect." Measured at the start of this round, that was still true --
// the ONLY importer of render/stereographic.js in the whole tree was its own selfcheck. Meanwhile
// world/procPlanet.js bakes an equirectangular texture that ui/orreryDraw.js already samples by latitude and
// longitude, and orrery.html already draws it. The producer and the consumer were three files apart and had
// never been introduced.
//
// ---- FINDING ONE: THE TWO MODULES DO NOT MEAN THE SAME THING BY "lon", AND THEY ARE OFF BY EXACTLY 90 DEG ---
//
// #144's family again. Both files carry a function whose output is called a longitude, and they disagree:
//
//     render/stereographic.js  dirToLonLat:  lon = atan2( x, -z)    dir = (c*sin lon, sin lat, -c*cos lon)
//     world/procPlanet.js      bakeEquirect: lon = atan2( z,  x)    dir = (c*cos lon, sin lat,  c*sin lon)
//
// MEASURED over 25 (lon, lat) pairs: latitude agrees to 2.22e-16 radians and longitude differs by a CONSTANT
// 90.000000 degrees, spread 8.88e-16, in the SAME winding sense. So it is a pure rotation about the polar axis
// and not a reflection -- which is exactly why nobody would have noticed by eye. A world rotated a quarter turn
// still looks like a world. LON_QUARTER_TURN below is that constant, applied once, named, and checked.
//
// ---- FINDING TWO: THE SAMPLING RATE SPANS 511 TO 1 ACROSS ONE FRAME ----------------------------------------
//
// #175 asked how uneven the sampling is and said the gate should say by how much. Over a 512-pixel frame with
// the horizon on the inscribed circle, reading a 256x128 bake: the footprint (equirect texels covered by one
// screen pixel) runs from 0.1128 to 57.62, a dynamic range of 511:1, and 1.99% of pixels are UNDERSAMPLED --
// they span more than one texel, which is where a nearest-neighbour read aliases. 51.77% of the source is
// reached at all; the rest is the far hemisphere, squeezed into the corners and past the frame edge.
//
// ---- FINDING THREE, AND IT IS THE ONE WORTH THE ROUND: THE WORST PIXEL IS THE CENTRE, AND STEREOGRAPHIC IS
// NOT WHAT IS WRONG WITH IT ------------------------------------------------------------------------------------
//
// At the nadir the stereographic magnification is 1.000 -- its MINIMUM over the whole frame, the best-behaved
// point in the projection. The blow-up there is the EQUIRECTANGULAR SOURCE'S own cos(lat) singularity: the
// nadir is the bake's south pole, where a row of w texels collapses onto one point. The centre pixel reads
// 0.318 texels across in latitude and 57.62 in longitude -- an anisotropy of 181:1 IN A SINGLE PIXEL.
//
// *** A LITTLE PLANET LOOKS STRAIGHT DOWN AND AN EQUIRECTANGULAR MAP IS WORST STRAIGHT DOWN. *** The one place
// the picture draws the eye is the one place the source cannot supply. So sampleEquirect below is
// FOOTPRINT-AWARE rather than nearest: it box filters along longitude by the span footprint() measures, which
// is one tap over 99.1% of the frame and up to 58 in the small disc at the centre.
//
// ---- AND FINDING FOUR IS THAT MY REASON FOR BUILDING THE FILTER WAS WRONG ------------------------------------
//
// The justification written first said a nearest read at the centre "picks one of fifty-seven equally valid
// texels and the choice changes with the frame size, so the centre would speckle and the speckle would move".
// *** MEASURED, IT DOES NOT. *** Filtered against nearest over the same frame: 129 pixels differ by ONE level.
// The centre pixel reads the same three bytes at 256, 384 and 512 px, filtered or not.
//
// The reason is a property of the source I did not know when I wrote that sentence. Over 200 seeds and all five
// world types, the colour spread along the pole rows is 0 for ice (29 seeds), molten (23), terran (66) and
// desert (42), and ONE 8-BIT LEVEL at worst for gas (40, on the north row of seed 1441258) -- against equator
// rows of the same bakes spreading 5.53 (gas) to 138.24 (ice). Two mechanisms produce it and both reduce to
// cos(lat): bakeEquirect's outermost row sits at 89.30 degrees, where cos is 0.0122, so a rocky world's ice
// blend is at t = 0.9996 and returns the palette's ice whatever the height underneath, and a gas giant's
// positional wobble is evaluated at dx, dz within +-0.0122 of zero.
//
// (The first draft of THIS paragraph said "exactly zero, every one of them". It was written off a table of
// per-type MEANS and a max over the south row only; the gate takes the max over both rows and found the gas
// giants' 1. A summary statistic quoted as if it were an extremum is the same species of error as a frozen
// number taken over a different sample than the check runs, which is v4462's and v4463's. The gate asserts the
// worst, per type, and names which type it is.)
//
// SO THE FILTER IS KEPT AND ITS JUSTIFICATION IS REPLACED, NOT ITS CODE. A control proves it does its job when
// there IS something to filter: on a checkerboard source it moves 0.89% of pixels by up to 143 levels -- the
// exact population footprint() predicts. It costs 1 ms of 101 for a 512px frame. And the gate now checks the
// SOURCE PROPERTY that makes it free, so the day a planet type grows a polar feature, that row goes red and
// the filter starts earning rather than being discovered to have been needed all along.
//
// ---- AND THREE SABOTAGES COST ZERO RED, EACH ONE A FINDING ABOUT THE CHECK ------------------------------------
//
// *** ONE OF THEM WAS v4463's OWN DEFECT, MADE AGAIN BY THE SAME HANDS ONE ROUND LATER. *** Turning
// littlePlanetDir's rotation into a REFLECTION -- (vx, vz, -vy) to (vx, vz, vy) -- changed nothing the gate
// could see, because every landmark it probed sat on the u axis where vy is zero and the sign has nothing to
// flip. v4463 found precisely this in its own handedness check, wrote down that "both landmarks are blind to a
// mirror by construction", fixed it there, and this file's first gate walked into it again. Off the axis the
// mirror is a HALF TURN in longitude: (0, 2) and (0, -2) must land on opposite meridians, and that is asserted.
//
// Replacing equirectUV's Math.floor with `% 1` also cost nothing, and the reason is worth keeping: sampleEquirect
// wraps the COLUMN as well, so a negative coordinate is rescued downstream and no pixel moves. Two independent
// guards, one of them invisible from the picture -- so the contract is asserted on the returned VALUE instead.
// The comment that claimed the floor is what keeps a negative spin on the texture was simply wrong.
//
// The third was not a weak check but a CRASH: the row that calls drawLittlePlanet against a stub context read
// calls[0] in its detail string, so removing putImageData threw instead of failing by name and killed every
// later section. v4434's shape, and v4478 hit it too. A detail string is evaluated whether the check passed or
// not, so it has to survive the failure the check exists to catch. Third instance in two rounds.
//
// ---- WHAT THIS IS NOT ----------------------------------------------------------------------------------------
//
// No shading. drawSeededPlanet applies a view-space lambert term because it draws a sphere seen from outside
// and half of it is night. This is the view from the surface looking down: the whole sphere is in frame at
// once, there is no terminator to draw, and inventing a world-space sun here would hide the surface behind a
// lighting choice nobody measured. The albedo is what the bake holds and it is what this shows.
//
// And this is CPU, in plain JS, returning bytes -- so a gate can read the pixels. stereoGLSL() exists and
// #174 is still open: nothing has compared the CPU pair against a GPU one by value.
//
// ---- WHAT THIS EXPORTS ------------------------------------------------------------------------------------
//
// The convention bridge: LON_QUARTER_TURN, stereoLonToEquirectLon, equirectUV. The pixel-to-source path:
// planeToEquirect, footprint, sampleEquirect. The picture: renderLittlePlanet, LITTLE_PLANET_DEFAULTS. And the
// numbers a check re-derives: MEASURED_AT_V4482.
"use strict";

import { stereoUnproject, stereoScale, littlePlanetDir, dirToLonLat } from "./stereographic.js";

/**
 * *** THE 90 DEGREES THE TWO MODULES DISAGREE BY, WRITTEN ONCE. ***
 * dirToLonLat(procPlanetDir(lon, lat)) === lon + PI/2, measured to 8.88e-16 over 25 pairs. So going the other
 * way -- stereographic's longitude into procPlanet's texture -- subtracts it.
 */
export const LON_QUARTER_TURN = -Math.PI / 2;

/** render/stereographic.js's longitude expressed in world/procPlanet.js's. */
export const stereoLonToEquirectLon = (lon) => lon + LON_QUARTER_TURN;

/**
 * (lon, lat) in procPlanet's convention -> texture coordinates in 0..1.
 * v matches bakeEquirect's own row rule: row 0 is the NORTH pole, which ui/orreryDraw.js already relies on.
 */
export function equirectUV(lon, lat, spin = 0) {
    let u = (lon + spin) / (2 * Math.PI) + 0.5;
    // Math.floor rather than `% 1`, which leaves a negative spin negative. *** THIS IS NOT WHAT KEEPS THE
    // PICTURE RIGHT: *** sampleEquirect wraps the COLUMN as well, so a negative u here is rescued downstream
    // and swapping this for `%` changes no pixel. It is the CONTRACT on what this function returns -- a
    // texture coordinate in 0..1 -- and the gate asserts it on the value, because a sabotage of it is
    // invisible in the frame. Two independent guards, and only one of them can be tested by looking.
    u -= Math.floor(u);
    return [u, 0.5 - lat / Math.PI];
}

/**
 * A point on the stereographic plane -> texture coordinates in the equirectangular bake.
 * The quarter turn is applied HERE and nowhere else, so there is one place for it to be wrong.
 */
export function planeToEquirect(u, v, spin = 0) {
    const ll = dirToLonLat(...littlePlanetDir(u, v));
    if (!ll) return null;
    return equirectUV(stereoLonToEquirectLon(ll[0]), ll[1], spin);
}

/**
 * *** HOW MANY SOURCE TEXELS ONE SCREEN PIXEL COVERS, SEPARATELY IN EACH AXIS. *** Two independent causes and
 * the finding is that the second one dominates:
 *
 *   mag  = 2/(1-z), the stereographic magnification -- plane units per radian, ISOTROPIC (that is conformality)
 *   lat  = (h/PI) texels per radian, uniform
 *   lon  = (w/2PI)/cos(lat) texels per radian OF ARC -- the equirect's own distortion, DIVERGING at the poles
 *
 * @param {number} u,v   the plane point
 * @param {number} k     screen pixels per plane unit
 * @param {number} w,h   the bake's dimensions
 */
export function footprint(u, v, k, w, h) {
    const p = stereoUnproject(u, v);
    const mag = stereoScale(p[0], p[1], p[2]);
    if (mag == null || !(k > 0)) return null;
    const ll = dirToLonLat(...littlePlanetDir(u, v));
    if (!ll) return null;
    const lat = ll[1];
    const pxPerRad = k * mag;
    const texLat = (h / Math.PI) / pxPerRad;
    const texLon = ((w / (2 * Math.PI)) / Math.max(1e-9, Math.cos(lat))) / pxPerRad;
    return { lat, mag, texLat, texLon, worst: texLat > texLon ? texLat : texLon };
}

/**
 * Read the bake at (tu, tv) averaging `lonTaps` texels along the row.
 *
 * *** ONE TAP IS NEAREST NEIGHBOUR AND THAT IS WHAT MOST OF THE FRAME GETS. *** The average only widens where
 * footprint() says the pixel really does span that many texels, which by finding three is the small disc at
 * the centre where the source's own rows have collapsed. Averaging everywhere would blur a picture that is
 * mostly oversampled; averaging nowhere speckles the one point the eye lands on.
 */
export function sampleEquirect(tex, tu, tv, lonTaps = 1) {
    const w = tex.w, h = tex.h, d = tex.rgba;
    const row = Math.min(h - 1, Math.max(0, Math.floor(tv * h)));
    const taps = Math.max(1, Math.min(w, Math.round(lonTaps)));
    const c0 = Math.floor(tu * w) - ((taps - 1) >> 1);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < taps; i++) {
        let c = (c0 + i) % w; if (c < 0) c += w;          // longitude WRAPS; latitude does not
        const o = (row * w + c) * 4;
        r += d[o]; g += d[o + 1]; b += d[o + 2];
    }
    return [r / taps, g / taps, b / taps];
}

/** The framing this view ships with, as data rather than as arguments scattered through a call. */
export const LITTLE_PLANET_DEFAULTS = Object.freeze({
    fit: 2,          // plane radius mapped to the frame's inscribed circle -- 2 is the HORIZON exactly
    maxLonTaps: 64,  // the centre wants 57.6 at 512px; the cap keeps a pathological frame size bounded
});

/**
 * Render the little planet into an RGBA byte array, no canvas involved, so a gate can read the pixels.
 *
 * @param {{rgba: Uint8ClampedArray, w: number, h: number}} tex   a world/procPlanet.js bake
 * @param {object} opts  size (square, pixels), fit, spin, maxLonTaps
 * @returns {{rgba: Uint8ClampedArray, size: number, k: number, undersampled: number, maxTaps: number}}
 */
export function renderLittlePlanet(tex, opts = {}) {
    const size = Math.max(2, (opts.size | 0) || 256);
    const fit = opts.fit != null ? opts.fit : LITTLE_PLANET_DEFAULTS.fit;
    const spin = opts.spin || 0;
    const maxTaps = opts.maxLonTaps != null ? opts.maxLonTaps : LITTLE_PLANET_DEFAULTS.maxLonTaps;
    const R = size / 2, k = R / fit;
    const out = new Uint8ClampedArray(size * size * 4);
    let under = 0, seenMaxTaps = 1;
    for (let j = 0; j < size; j++) {
        const v = ((j + 0.5) - R) / k;
        for (let i = 0; i < size; i++) {
            const u = ((i + 0.5) - R) / k;
            const o = (j * size + i) * 4;
            const t = planeToEquirect(u, v, spin);
            const f = footprint(u, v, k, tex.w, tex.h);
            // *** EVERY PLANE POINT HAS AN IMAGE, so there is no hole to punch. *** The one direction without
            // one is the zenith, and it is at infinity: no finite pixel is it. A frame is fully covered.
            if (!t || !f) { out[o + 3] = 255; continue; }
            if (f.worst > 1) under++;
            const taps = Math.min(maxTaps, Math.max(1, Math.round(f.texLon)));
            if (taps > seenMaxTaps) seenMaxTaps = taps;
            const c = sampleEquirect(tex, t[0], t[1], taps);
            out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
        }
    }
    return { rgba: out, size, k, undersampled: under, maxTaps: seenMaxTaps };
}

/**
 * *** WHAT v4482 MEASURED. *** Re-derived by tools/ship/littlePlanet-selfcheck.mjs from the functions above --
 * it does not read these back.
 */
export const MEASURED_AT_V4482 = Object.freeze({
    // Finding one: the convention gap, over 25 (lon, lat) pairs.
    lonOffsetDeg: 90, lonOffsetSpreadRad: 8.88e-16, latAgreementRad: 2.22e-16, isReflection: false,
    // Finding two: a 512px frame, horizon on the inscribed circle, over a 256x128 bake.
    probeSize: 512, probeFit: 2, probeW: 256, probeH: 128,
    footprintMin: 0.1128, footprintMax: 57.62, footprintRange: 511,
    undersampledPct: 1.99, sourceReachedPct: 51.77,
    // Finding three: the worst pixel is the centre, and the projection is at its BEST there.
    // *** AND AN EVEN-SIDED FRAME HAS NO CENTRE PIXEL: *** at 512 the four around (255.5, 255.5) tie for the
    // maximum to the last bit, which the first version of the check did not allow for and went red over.
    worstIsCentre: true, worstPixelTieCount: 4,
    magAtNadir: 1, magAtHorizon: 2,          // the stereographic magnification's minimum, and at lat 0
    centreTexLat: 0.318, centreTexLon: 57.62,
    centreAnisotropy: 181,                   // texLon / texLat at the middle pixel
    // *** FINDING FOUR: THE FILTER'S STATED REASON WAS WRONG, AND THE SOURCE IS WHY. ***
    seedsSurveyed: 200, worldTypes: 5,
    // *** THE WORST over both pole rows, per type -- not a mean, and not the south row alone. ***
    poleRowSpreadByType: Object.freeze({ ice: 0, gas: 1, molten: 0, terran: 0, desert: 0 }),
    poleRowSpreadWorst: 1, poleRowSpreadWorstType: "gas",
    equatorMeanByType: Object.freeze({ ice: 138.24, gas: 5.53, molten: 79.78, terran: 96.00, desert: 38.07 }),
    lastRowLatDeg: 89.30,                    // (0.5 - 127.5/128) * 180: not the pole, and cos is 0.0122 there
    filterMovesPixels: 129, filterMovesLevels: 1,        // on a real bake at 512px
    controlMovesPct: 0.89, controlMovesLevels: 143,      // on a checkerboard: the filter does work
    pixelsTakingMoreThanOneTap: 2324, framePixels: 262144,
    filterCostMs: 1, frameCostMs: 101,
    // Before this round.
    stereographicImportersBefore: 1,         // its own selfcheck, and nothing else in the tree
});
