// WebGLEngine/physics/blobVitals.js — v2605
//
// HE CANNOT STARVE. EVERY WAY HE HAS EVER DIED WAS A BUG WE SHIPPED.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith: "What are the features of our blobarium/blobulator aquarium so I can examine it as a product so as to
// look for accessories, feeding options, tank cleaning. Quality of life... I'm serious though." Then: "We have
// reactions that we tried to give the avatar, also to alter its configuration."
//
// He already built the vocabulary. ui/TamagotchiView.js:
//
//     { type: "tama", action: "feed" | "play" | "sleep" | "alert" | "happy" | "sad" | "speak" }
//     hunger 0..100, happiness 0..100, energy 0..100 -- decaying at 1Hz
//
// A TAMAGOTCHI'S STATS DECAY SO YOU MUST INTERVENE. THAT IS THE GAME. And that is exactly where the blob does
// not fit, BECAUSE v2596 ALREADY PROVED HE CANNOT STARVE: the field's peak can never fall below max(a) = 2.280,
// because at the tallest lump's own centre u = 1 so it contributes exactly its amplitude, and every other lump
// can only ADD. THERE IS NO DECAY TO FIGHT. He has no hunger. Nothing runs down. HE CANNOT DIE OF NEGLECT.
//
// BUT HE HAS DIED. FOUR TIMES, AND I KILLED HIM EVERY TIME:
//
//   1. v2595  DISMANTLED.  blobsToBodies passed `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS. box3d
//             did its job perfectly and blew the closest pair from 0.2103 to 1.1255 in one second, 5.4x apart.
//             A metaball's peak IS interpenetration; a rigid solver's job is to REMOVE interpenetration. TWO
//             CORRECT THINGS WANTING OPPOSITE OUTCOMES.
//   2. v2596  DISSOLVED.   Bake him into a 64^3 grid and advect: peak 75.3% -> 63.0% -> 55.8% -> 50.5% WHILE
//             THE MASS STAYS CONSTANT. He does not evaporate, HE SMEARS. Numerical diffusion IS the heat
//             equation, measured at D = 0.01141 with nobody's hand on the dial.
//   3. v2597  DROPPED.     The aquarium had NO BOTTOM. Gravity on at -9.8, no floor: measured 872 units below
//             the x-ray after fifteen seconds. And it LOOKED FINE for the length of a glance.
//   4. v2597  VANISHED.    The warmth slider called setTransform(id, x, y, z) -- THREE LOOSE NUMBERS -- when
//             the real signature is setTransform(idx, p, q) WITH ARRAYS. p[0] was undefined, undefined went
//             into the wasm, POSITION BECAME NaN. DRAGGING THE SLIDER MADE HIM DISAPPEAR.
//
// FOUR DEATHS. FOUR BUGS. ZERO NEGLECT.
//
// So the honest answer to "what accessories does he need": NOT A FEEDING TUBE. He needs the four gauges that
// would have caught the four times I killed him. A TAMAGOTCHI'S STATS ARE A GAME. THESE ARE A SMOKE ALARM.
//
// AND EVERY ONE OF THESE IS A REAL BUG THAT REALLY SHIPPED -- NOT A HYPOTHETICAL FAILURE MODE I INVENTED TO
// HAVE SOMETHING TO GAUGE. That is the whole difference between an instrument and a decoration.
import { blobFieldAt } from "../simulation/tomo/blobPhantom.js";
import { peakFloor } from "./blobThermal.js";

/** How far apart the two nearest lumps are. THE DISMANTLING GAUGE (death #1). */
export function closestPair(blobs) {
    let m = Infinity;
    for (let i = 0; i < blobs.length; i++)
        for (let j = i + 1; j < blobs.length; j++)
            m = Math.min(m, Math.hypot(blobs[i].x - blobs[j].x, blobs[i].y - blobs[j].y, blobs[i].z - blobs[j].z));
    return m;
}

/** The field's tallest point, sampled. THE DISSOLVING GAUGE (death #2). */
export function fieldPeak(blobs, { n = 15, ext = 2 } = {}) {
    let m = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const v = blobFieldAt((i / n) * 2 * ext - ext, (j / n) * 2 * ext - ext, (k / n) * 2 * ext - ext, blobs);
        if (v > m) m = v;
    }
    return m;
}

/**
 * Four vitals. Each one is a real death, not a hypothetical.
 *
 * @param baseline {closestPair} captured at reset, so "dismantled" means CHANGED, not merely large.
 *   A blob that STARTS spread out is not sick. A blob that GETS spread out is being solved apart.
 */
export function vitals(blobs, baseline = null) {
    const floor = peakFloor(blobs);
    const pair = closestPair(blobs);
    const peak = fieldPeak(blobs);
    const finite = blobs.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z));
    const inTank = blobs.every((b) => Math.abs(b.y) < 4 && Math.abs(b.x) < 4 && Math.abs(b.z) < 4);

    return {
        // 4. REAL -- checked FIRST, because a NaN blob passes every other test by accident.
        //    NaN comparisons are ALL false, so `Math.abs(NaN) < 4` is false and inTank would catch it -- but
        //    only by luck, and a gauge that is right by luck is a gauge that will be wrong by luck.
        real: finite,
        // 3. HOME -- is he still where the x-ray is looking? (death #3: 872 units down)
        home: finite && inTank,
        // 1. TOGETHER -- has the solver been pulling him apart? (death #1: 0.2103 -> 1.1255)
        together: finite && (baseline == null || pair < baseline * 2.5),
        // 2. HIMSELF -- is the field still standing up? (death #2: peak 50.5% and falling, no floor)
        //    THE FLOOR IS THE POINT: v2596 proved the peak CANNOT fall below max(a) while he is made of lumps.
        //    So peak < floor does not mean "sad" -- IT MEANS THE MATHS BROKE.
        himself: finite && peak >= floor - 1e-9,
        closestPair: pair,
        peak,
        floor,
    };
}

/**
 * One line a human can read. NOT a mood -- A DIAGNOSIS.
 *
 * "happy" would be a lie: v2596 measured the peak WANDERING, sometimes ABOVE where it started, because lumps
 * drift together and overlap builds a taller peak. THAT IS WHAT A TEMPERATURE LOOKS LIKE, NOT A MOOD, and
 * dressing it as one would make a fluctuation look like a feeling.
 */
export function diagnose(v) {
    if (!v.real) return "NOT REAL -- a coordinate is NaN. v2597 shipped this: setTransform with loose numbers instead of arrays.";
    if (!v.home) return "GONE -- he has left the imaged volume. v2597 shipped this: the aquarium had no bottom.";
    if (!v.together) return "COMING APART -- the solver is separating the lumps. v2595 shipped this: field radius used as collision radius.";
    if (!v.himself) return "IMPOSSIBLE -- the peak is below the amplitude floor, which cannot happen while he is made of lumps. Something is not a lump any more.";
    return "well";
}
