// WebGLEngine/physics/esSlabCollide.js — v3832 (Long Silence: altitude-band ship collision)
//
// THE FIX FOR THE FALSE VERTICAL COLLISION. es-box3d-fly3d flies ships in three dimensions but box3d resolves
// contacts in the x-z plane only -- its swk_body_ship LOCKS the y axis on purpose (ES ships fly in a plane), and
// the shipped WASM exposes no per-pair contact filter and no setPosition. So two ships stacked 700 units apart in
// altitude, sharing an x-z footprint, ram each other in the plane as if the altitude were not there. box3d cannot
// be told otherwise without rebuilding it, and the WASM does not build in this sandbox.
//
// So collision authority for the fly3d ships moves here, to an exact slab test with no baked plane in it: two
// ships touch only when their footprints overlap in x-z AND their altitudes overlap within a vertical band. The
// plane projection becomes a slab (a flat cylinder). Out of the band, nothing happens -- the false collision is
// simply gone. In the band, the response is a velocity impulse along the 3D contact normal, because velocity is
// the only lever box3d leaves open (setVelocity / impulse; position is box3d's and read back each sync). Altitude
// is flight-model-owned, never read back from box3d, so the vertical part of the separation can also be applied
// as a hard positional nudge -- reflecting exactly which authority owns which axis.
//
// PURE: no box3d, no Three, no DOM. The Three/box3d wiring (dormant box3d footprint so it stops double-resolving,
// nudge for x-z, direct alt writeback) lives in physics/esBox3d.js and es-box3d-fly3d.html. Gated headless in
// physics/esSlabCollide-selfcheck.mjs.
//
// Ship shape: { x, y, alt, vx, vy, valt } -- (x, y) is the ES plane (y is box3d's z), alt is the free axis.
// Contact/response is ORDER-INDEPENDENT: every pair's impulse is computed from the SAME pre-response velocities,
// deltas are accumulated, and the caller applies them once. Iterating the ships in any order gives one answer.

// The slab contact between two ships, or null when they do not touch. rH is the COMBINED horizontal radius
// (footprintA + footprintB), rV the COMBINED vertical half-height. Contact requires BOTH an x-z overlap and an
// altitude overlap -- dropping the altitude half is the whole bug this module exists to remove.
//
// Returns { nx, ny, nalt, pen } where (nx, ny, nalt) is the unit separation normal pointing from a toward b and
// `pen` is the penetration depth along it. The normal is the axis of MINIMUM penetration (the minimum translation
// vector for a cylinder): ships barely overlapping in altitude pop apart vertically, ships side by side at the
// same altitude pop apart horizontally.
export function slabContact(a, b, rH, rV) {
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    const dalt = (b.alt || 0) - (a.alt || 0);
    const hdist = Math.hypot(dx, dy);
    if (hdist >= rH) return null;                 // no x-z overlap
    const vdist = Math.abs(dalt);
    if (vdist >= rV) return null;                 // no altitude overlap -- OUT OF THE BAND, no contact
    const penH = rH - hdist;                      // how deep the footprints overlap
    const penV = rV - vdist;                      // how deep the altitude bands overlap
    if (penV < penH) {
        // Separate along altitude -- the shallower overlap. sign picks "push b the way it already leans".
        const s = dalt >= 0 ? 1 : -1;
        return { nx: 0, ny: 0, nalt: s, pen: penV };
    }
    // Separate horizontally. At exactly the same x-z (hdist 0) the direction is degenerate; pick +x
    // deterministically so the result never depends on floating-point noise.
    if (hdist < 1e-9) return { nx: 1, ny: 0, nalt: 0, pen: penH };
    return { nx: dx / hdist, ny: dy / hdist, nalt: 0, pen: penH };
}

// Resolve all pairwise slab collisions among `ships`, returning a per-ship array of deltas the caller applies:
//   { dvx, dvy, dvalt }  velocity changes -- dvx/dvy go to box3d (nudge), dvalt to the ship's own valt
//   { dalt }             a hard positional altitude separation (alt is flight-model-owned, so it is safe to set)
// opts: { rH, rV, restitution=0, invMass=1, slop=0.5, positional=0.5 }. invMass may be a number or (ship)=>number.
// restitution 0 is a dead stop along the normal; positional>0 adds a hard alt separation so vertical stacks do
// not sink. Momentum along the normal is conserved for equal masses: equal and opposite impulses.
export function resolveSlabCollisions(ships, opts = {}) {
    const rH = opts.rH === undefined ? 120 : opts.rH;
    const rV = opts.rV === undefined ? 80 : opts.rV;
    const e = opts.restitution === undefined ? 0 : opts.restitution;
    const slop = opts.slop === undefined ? 0.5 : opts.slop;
    const positional = opts.positional === undefined ? 0.5 : opts.positional;
    const invMassOf = typeof opts.invMass === "function" ? opts.invMass : () => (opts.invMass === undefined ? 1 : opts.invMass);

    const out = ships.map(() => ({ dvx: 0, dvy: 0, dvalt: 0, dalt: 0 }));
    for (let i = 0; i < ships.length; i++) {
        for (let j = i + 1; j < ships.length; j++) {
            const a = ships[i], b = ships[j];
            const c = slabContact(a, b, rH, rV);
            if (!c) continue;
            const imA = invMassOf(a), imB = invMassOf(b), imSum = imA + imB;
            if (imSum <= 0) continue;

            // Approach speed along the contact normal, from PRE-response velocities (order independence).
            const rvx = (b.vx || 0) - (a.vx || 0), rvy = (b.vy || 0) - (a.vy || 0), rvalt = (b.valt || 0) - (a.valt || 0);
            const vn = rvx * c.nx + rvy * c.ny + rvalt * c.nalt;
            if (vn < 0) {                                   // only push apart ships that are closing; never suck
                const jn = (-(1 + e) * vn) / imSum;
                out[i].dvx -= jn * imA * c.nx; out[i].dvy -= jn * imA * c.ny; out[i].dvalt -= jn * imA * c.nalt;
                out[j].dvx += jn * imB * c.nx; out[j].dvy += jn * imB * c.ny; out[j].dvalt += jn * imB * c.nalt;
            }

            // Hard positional separation on the altitude axis only (box3d owns x-z position; alt is ours). Split
            // by inverse mass. Only when the minimum-translation axis is vertical -- a horizontal MTV has nalt 0.
            if (positional > 0 && c.nalt !== 0) {
                const push = (Math.max(c.pen - slop, 0) * positional);
                out[i].dalt -= push * (imA / imSum) * c.nalt;
                out[j].dalt += push * (imB / imSum) * c.nalt;
            }
        }
    }
    return out;
}
