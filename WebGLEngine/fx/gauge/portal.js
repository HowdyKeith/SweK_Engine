// fx/gauge/portal.js -- the gauge as a place you can go.
//
// The wormhole gauge already reads the blob's energy as a throat that opens. So make that literal: the throat IS the
// door. To pass through, the blob has to arrive at the portal's height AND still have enough in the tank to hold the
// throat open -- and since the aperture is computed from the same wormholeGeometry the gauge draws, the door you see
// is exactly the door you must fit through. There is no second rule hiding behind the picture.
//
// That gives the climb a real fail mode with a real shape: burn everything getting up here and you arrive to a shut
// door. You have to get there high AND solvent. Then you fall through, cross, and drop back in out of the black hole
// on the far side -- gravity waiting for you exactly as it was, because nothing was ever lost, only moved.
"use strict";
import { wormholeGeometry } from "./spacetimeGauges.js";

// Can it get through? The aperture is the gauge's own throat -- what you see is what you must fit through.
function canPass(y, energy, opts = {}) {
    const portalY = opts.portalY == null ? 3.0 : opts.portalY;
    const R = opts.radius == null ? 1.0 : opts.radius;          // world size of the gauge face
    const minOpen = opts.minOpen == null ? 0.35 : opts.minOpen; // a throat narrower than this cannot be squeezed through
    const throat = wormholeGeometry(energy).throat;
    const aperture = throat * R;
    const dy = Math.abs(y - portalY);
    if (throat < minOpen) return { pass: false, reason: "throat too narrow -- not enough left in the tank", throat, aperture, dy };
    if (dy > aperture) return { pass: false, reason: "missed the throat", throat, aperture, dy };
    return { pass: true, reason: "through", throat, aperture, dy };
}

// phases: flying -> transit (it is inside, and nowhere) -> emerging (falling out of the black hole) -> flying
function makePortal(opts = {}) {
    const entryY = opts.entryY == null ? 3.0 : opts.entryY;
    const exitY = opts.exitY == null ? 4.4 : opts.exitY;
    const transitTime = opts.transitTime == null ? 0.9 : opts.transitTime;
    const cfg = { portalY: entryY, radius: opts.radius == null ? 1.0 : opts.radius, minOpen: opts.minOpen == null ? 0.35 : opts.minOpen };
    let phase = "flying", t = 0, passes = 0, lastReason = "";
    // offer the blob to the door. It only opens if the blob earned it.
    function tryEnter(st) {
        if (phase !== "flying") return { pass: false, reason: "already in transit", throat: 0, aperture: 0, dy: 0 };
        const r = canPass(st.y, st.energy, cfg);
        lastReason = r.reason;
        if (r.pass) { phase = "transit"; t = 0; passes++; }
        return r;
    }
    // returns null while it is in the throat (it is nowhere), or the state to resume at when it drops back in
    function step(dt, st) {
        if (phase === "transit") { t += dt; if (t >= transitTime) { phase = "emerging"; t = 0;
            return { y: exitY, vy: 0, heat: st.heat, energy: st.energy, emerged: true }; }   // nothing lost -- only moved
            return null; }
        if (phase === "emerging") { t += dt; if (t > 0.4) phase = "flying"; }
        return undefined;
    }
    return { tryEnter, step, canPass: (st) => canPass(st.y, st.energy, cfg), get phase() { return phase; }, get passes() { return passes; },
        get lastReason() { return lastReason; }, get transit() { return phase === "transit" ? t / transitTime : 0; }, cfg, entryY, exitY };
}
export { makePortal, canPass };
