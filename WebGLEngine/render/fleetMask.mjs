// WebGLEngine/render/fleetMask.mjs -- v4317 (Level 17)
//
// LEVEL 17: THE IDENTITY PICTURE AS A MASK. Level 15 drew every race in its own fragment shader; a POST look --
// badTv, crt, the SwiftUI ports -- cannot be done per race in a fragment stage, because by then the pixel does not
// know whose it is. The pick picture does: every pixel names its record and its fleet. So the pick picture becomes
// a STRENGTH FIELD (Level 11's kind: an RGBA8 texture whose red is the effect's strength, 0..1), 1 where the chosen
// race is and 0 elsewhere, and the badTv FIELD pipeline (render/badTvDevicePass.mjs, Level 11) applies its effect
// through it: outside the mask the picture passes through to the byte, inside the race flickers.
//
// THIS ROUND THE MASK GOES THROUGH THE CPU: the pick picture and the colour picture are read back (device.frame's
// read), the mask is built from the hits, both go up as textures, and one full-screen pass draws the result. A
// render attachment would keep all of it on the device; the arithmetic and the gate are the same either way, and
// the readbacks are the honest price of not having built that yet. Said here and in the gate.
"use strict";

import { badTvFieldPipelineDesc, packKnobs, KNOB_ORDER, FIELD_BINDING } from "./badTvDevicePass.mjs";
import { decodePick } from "./gpuDriven.mjs";

/** The mask: an RGBA8 field of the pick picture's size, red 255 where a pixel names one of `fleets`, else 0. */
export function maskFromPick(pick, fleets, { soft = 0 } = {}) {
    const want = new Set(Array.isArray(fleets) ? fleets : [fleets]);
    const w = pick.width, h = pick.height, data = new Uint8Array(w * h * 4);
    let inside = 0;
    for (let i = 0; i < w * h; i++) { const hit = pick.pixels ? decodePick(pick.pixels, i * 4) : pick.hits[i]; const on = hit && want.has(hit.fleet); if (on) inside++;
        const v = on ? 255 : Math.round(soft * 255); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    return { width: w, height: h, data, inside, outside: w * h - inside };
}

/**
 * The masked pass: `source` is a read-back frame ({ pixels, width, height }), `mask` a field from maskFromPick(); the
 * badTv field pipeline draws source through the mask into the device's target (or offscreen with read: true).
 * Returns the frame result (a Promise of pixels when read). Textures are made per call and destroyed after.
 */
export async function maskedBadTv(device, { source, mask, knobs = null, read = false, offscreen = false, time = 0 }) {
    const pipe = device.pipeline(badTvFieldPipelineDesc());
    const src = device.texture({ width: source.width, height: source.height, data: source.pixels, nearest: true });
    const fld = device.texture({ width: mask.width, height: mask.height, data: mask.data, nearest: true });
    const k = knobs || packKnobs({ time });
    const fr = device.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], k[i]); pass.texture("tDiffuse", src, 0); pass.texture(FIELD_BINDING, fld, 1); pass.draw(3); }, { read, offscreen, depth: false });
    const out = read ? await fr : fr;
    try { src.destroy(); fld.destroy(); } catch (e) {}
    return out;
}
/** Compare a masked result to its source: how many pixels changed inside the mask and outside it. */
export function maskDiff(source, result, mask, { tol = 0 } = {}) {
    let inChanged = 0, outChanged = 0, inside = 0, outside = 0, worstOut = 0;
    for (let i = 0; i < source.width * source.height; i++) { const on = mask.data[i * 4] > 127; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(source.pixels[i * 4 + c] - result.pixels[i * 4 + c]));
        if (on) { inside++; if (d > tol) inChanged++; } else { outside++; if (d > tol) outChanged++; worstOut = Math.max(worstOut, d); } }
    return { inside, outside, inChanged, outChanged, worstOut };
}
