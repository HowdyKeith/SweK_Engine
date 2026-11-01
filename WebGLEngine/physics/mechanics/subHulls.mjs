// WebGLEngine/physics/mechanics/subHulls.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HULLS the submarine pilots are trained and audited on, by name: variants of the EXPLORER (physics/mechanics/subModel6dof.mjs). `TRAINED` are the five the multi-vessel search trained on
// (tools/trainSubRobust.mjs); `WIDE` are hulls NO pilot has been trained on until the wide round: a lighter and a heavier boat (mass and inertia scale together), a draggy hull, tiny fins, a weak-righting
// hull, a hull four times the Munk moment, and a combination of the awkward ones. `model(name)` builds the vessel; `SPECS` is the table.
"use strict";
import * as S from "./subModel6dof.mjs";

const E = S.EXPLORER, scale = (k) => ({ mass: E.mass * k, inertia: E.inertia.map((v) => v * k) });
export const SPECS = Object.freeze({
    nominal: {}, munk3: { munk: 3000 }, munk0: { munk: 0 }, fins06: { finArea: E.finArea * 0.6 }, righting25: { bg: E.bg * 2.5 },
    // ---- the wide round: nothing above was a training hull for the wide pilots' predecessors in this sense
    light: scale(0.7), heavy: scale(1.4), draggy: { cdAxial: E.cdAxial * 1.8, cdCross: E.cdCross * 1.4 }, tinyFins: { finArea: E.finArea * 0.4 },
    weakRighting: { bg: E.bg * 0.4 }, munk5: { munk: 5000 }, awkward: { ...scale(1.3), finArea: E.finArea * 0.6, munk: 2500, bg: E.bg * 0.6 },
    // ---- v4901: a boat whose main ballast is a quarter of its weight (the EXPLORER's tank trims 3%). In no pilot set: it is a vessel to SURFACE on -- blown to the stop it floats with its centre 0.3 m down (the crown 0.3 m out of the
    // water, against the EXPLORER's 4 cm) -- and a flood of 6% is within what its tank can trim out, which the EXPLORER's cannot.
    highRider: { ballastRange: 0.25 },
});
export const TRAINED = Object.freeze(["nominal", "munk3", "munk0", "fins06", "righting25"]);
export const WIDE = Object.freeze(["light", "heavy", "draggy", "tinyFins", "weakRighting", "munk5", "awkward"]);
/** The hulls by name with a one-line description, for a picker. */
export const LABELS = Object.freeze({ nominal: "Explorer (nominal)", munk3: "Munk x3 (unstable)", munk0: "no Munk moment", fins06: "fins x0.6", righting25: "righting x2.5", light: "light (0.7x mass)", heavy: "heavy (1.4x mass)", draggy: "draggy hull", tinyFins: "tiny fins (0.4x)", weakRighting: "weak righting (0.4x)", highRider: "high rider (25% main ballast)", munk5: "Munk x5 (extreme)", awkward: "awkward combination (extreme)" });
export const model = (name) => { if (!Object.prototype.hasOwnProperty.call(SPECS, name)) throw new Error("subHulls: no hull named " + name); return S.createSubModel(Object.freeze({ ...E, ...SPECS[name] })); };
