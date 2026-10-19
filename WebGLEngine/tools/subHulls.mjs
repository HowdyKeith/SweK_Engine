// WebGLEngine/tools/subHulls.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HULLS the submarine pilots are trained and audited on, by name: variants of the EXPLORER (physics/mechanics/subModel6dof.mjs). `TRAINED` are the five the multi-vessel search trained on
// (tools/trainSubRobust.mjs); `WIDE` are hulls NO pilot has been trained on until the wide round: a lighter and a heavier boat (mass and inertia scale together), a draggy hull, tiny fins, a weak-righting
// hull, a hull four times the Munk moment, and a combination of the awkward ones. `model(name)` builds the vessel; `SPECS` is the table.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

const E = S.EXPLORER, scale = (k) => ({ mass: E.mass * k, inertia: E.inertia.map((v) => v * k) });
export const SPECS = Object.freeze({
    nominal: {}, munk3: { munk: 3000 }, munk0: { munk: 0 }, fins06: { finArea: E.finArea * 0.6 }, righting25: { bg: E.bg * 2.5 },
    // ---- the wide round: nothing above was a training hull for the wide pilots' predecessors in this sense
    light: scale(0.7), heavy: scale(1.4), draggy: { cdAxial: E.cdAxial * 1.8, cdCross: E.cdCross * 1.4 }, tinyFins: { finArea: E.finArea * 0.4 },
    weakRighting: { bg: E.bg * 0.4 }, munk5: { munk: 5000 }, awkward: { ...scale(1.3), finArea: E.finArea * 0.6, munk: 2500, bg: E.bg * 0.6 },
});
export const TRAINED = Object.freeze(["nominal", "munk3", "munk0", "fins06", "righting25"]);
export const WIDE = Object.freeze(["light", "heavy", "draggy", "tinyFins", "weakRighting", "munk5", "awkward"]);
export const model = (name) => { if (!Object.prototype.hasOwnProperty.call(SPECS, name)) throw new Error("subHulls: no hull named " + name); return S.createSubModel(Object.freeze({ ...E, ...SPECS[name] })); };
