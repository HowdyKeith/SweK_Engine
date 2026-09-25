// WebGLEngine/render/slabPath.mjs -- v4718: WHERE fsr.html's slab is at scene time t, as one function the page and the
// analysis both call.
//
// *** THE LINEAR PATH TAKES THE SLAB OUT OF VIEW, AND FOUR HYPOTHESES READ THAT AS SIGNAL. *** The slab is 2.4 units wide,
// 4 units from the eye, under 2.19 units of half-view; along x it moves 0.055 * speed per frame against a camera dollying
// 0.02. At x4 it starts to leave by frame 5 and is gone by frame 17, so across a 40-frame harvest "later" means "less
// slab", and v4717 found 39-68% of motion's-gain ranking went with that clock. `sway` moves the slab at the SAME speed but
// reverses it -- a triangle wave of amplitude SWAY_AMP centred on the camera's own track along the slab's axis -- so it
// never leaves the view, and frame order stops meaning slab presence.
//
// `linear` is the page's default and computes exactly `t * SLAB_DX * speed`, the expression every earlier harvest used.
// Browser-safe: no node imports.
"use strict";

export const SLAB_DX = 0.055;      // world units per frame at speed x1 -- fsr.html's constant, now owned here
export const DOLLY = 0.02;         // the camera's world units per frame along +x -- fsr.html's constant, now owned here
export const SWAY_AMP = 0.9;       // the slab's half-width is 1.2 and the half-view 2.19, so |offset| <= 0.99 keeps it whole
export const SLAB_PATHS = Object.freeze(["linear", "sway"]);

/** Triangle wave of slope +-1 and range [-1, 1], zero at u = 0 and rising. */
export const tri = (u) => 1 - Math.abs((((u + 1) % 4) + 4) % 4 - 2);

/**
 * The slab's scalar offset along its direction at scene time t. `dirX` is the direction's x component (1 along x, 0 for
 * vertical): the sway is centred on the camera's track along the slab's own axis, which is DOLLY * t along x and nothing
 * along z.
 */
export function slabOffset(t, speed, path = "linear", dirX = 1) {
    // LINEAR IS THE PAGE'S OWN EXPRESSION, ASSOCIATED THE SAME WAY: (t * SLAB_DX) * speed. At every speed the page offers the
    // other association gives the same bits -- 1, 2, 4 and 8 are powers of two, and multiplying by one is exact -- so this is
    // not what keeps the page's harvests identical today. It is kept because a speed that is not a power of two WOULD differ
    // in the last bit, and frameSway-selfcheck tries such speeds so that the row can fail.
    if (path === "linear") return t * SLAB_DX * speed;
    if (path === "sway") return DOLLY * t * dirX + SWAY_AMP * tri((SLAB_DX * speed * t) / SWAY_AMP);
    throw new Error(`slabPath.slabOffset: unknown path "${path}" -- one of ${SLAB_PATHS.join(", ")}`);
}

/** Scene times in (t0, t1] at which the sway reverses. None on the linear path, which never turns. */
export function turnsBetween(t0, t1, speed, path = "linear") {
    if (path === "linear") return [];
    if (path !== "sway") throw new Error(`slabPath.turnsBetween: unknown path "${path}"`);
    const half = (2 * SWAY_AMP) / (SLAB_DX * speed), out = [];   // frames from one turn to the next; first turn at half / 2
    for (let k = Math.ceil((t0 - half / 2) / half); ; k++) { const tk = half / 2 + k * half; if (tk > t1) break; if (tk > t0) out.push(tk); }
    return out;
}
