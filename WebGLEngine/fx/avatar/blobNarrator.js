// fx/avatar/blobNarrator.js -- Avataro as the speaking narrator. Because that is what blobulator avatars do.
// A blob has no jaw to hinge, so the mouth isn't drawn on -- it's CARVED: a negative metaball sits at the face and
// subtracts from the field, and the louder the voice the deeper it cuts, until it opens a real hole in the surface.
// Closed, the face is sealed and unbroken; speaking, it opens. That's a true property of the geometry, not a texture,
// so it can be (and is) verified: the field at the mouth is above the isosurface when silent and below it when talking.
// It breathes, and it bobs on the syllables. Pure + verified.
"use strict";
import { metaField } from "./pet.js";

function makeBlobNarrator(opts = {}) {
    let persona = opts.persona || "both";
    let smooth = 0, t = 0, bob = 0;
    const attack = opts.attack || 14;
    function step(dt, amp) {
        t += dt;
        smooth += ((amp || 0) - smooth) * Math.min(1, dt * attack);   // the mouth follows the voice, smoothed
        bob = Math.sin(t * 9) * smooth * 0.06;                        // a little nod on the syllables
        const breathe = 0.95 + Math.sin(t * 1.6) * 0.03;
        return [
            { id: "head", p: [0, bob, 0], r: breathe },
            { id: "brow", p: [0, 0.44 + bob, 0.30], r: 0.30 },
            { id: "chin", p: [0, -0.54 + bob * 1.5, 0.28], r: 0.34 },
            { id: "mouth", neg: true, p: [0, -0.22 + bob, 0.80], r: 0.10 + smooth * 0.44 }   // carves the opening
        ];
    }
    function isOpen(balls, iso = 1.0) { return metaField(balls, 0, -0.22, 0.55) < iso; }   // is there really a hole?
    return { step, isOpen, get amp() { return smooth; }, set persona(p) { persona = p; }, get persona() { return persona; },
        personaTint: () => persona === "avataro" ? [0.42, 0.62, 1.0] : persona === "avatarina" ? [1.0, 0.5, 0.72] : [0.72, 0.56, 0.95] };
}
export { makeBlobNarrator };
