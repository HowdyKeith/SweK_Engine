// tools/roundhouse/mpmPlasticBind.mjs -- v3792
//
// *** THE FOURTH AND LAST OF MPM'S BASIC PIECES. v3789 the transfer, v3790 the grid step, v3791 the elastic
// stress -- which shipped saying outright that squeezing that material makes it spring back FOR EVER, which is
// exactly what snow and sand do not do. This is the return mapping that fixes it. ***
//
// *** TWO KEYS, AND THEY DISAGREE ABOUT THE PLANT, WHICH IS WHY THE DEVICE EXISTS.
//   THE CLAMP IS A VERDICT: after return mapping every elastic singular value lies in [1-thetaC, 1+thetaS]
//     BY CONSTRUCTION. A value outside means the clamp did not run. IT IS ALSO THE CHECK MOST PEOPLE WRITE.
//   THE SPLIT IS AN IDENTITY: F_e * F_p MUST STILL EQUAL THE TOTAL F, EXACTLY. The multiplicative split is
//     BOOKKEEPING, NOT A PHYSICAL PROCESS -- moving deformation between the factors cannot create or destroy
//     any of it.
// MEASURED: skipping the F_p update leaves the clamp PERFECT -- singular values 0.975000 in BOTH arms, the
// verdict passes -- WHILE THE SPLIT DRIFTS 1.110e-16 -> 1.857. A SNOWBALL SHRINKS WITH NO FORCE ACTING ON IT
// AND THE OBVIOUS CHECK SAYS EVERYTHING IS FINE. ***

import { returnMap, svd2, splitDrift, fromSvd } from "../../physics/mpm/plasticity.mjs";
import { mul, det } from "../../physics/mpm/constitutive.mjs";

export const MPMPLASTIC_OBSERVABLES = [
    "splitDrift", "splitHolds", "singularMin", "singularMax", "clampHolds", "clamped",
    "svdResidual", "volumeChange", "thetaC", "thetaS",
];

export const MPMPLASTIC_MODES = ["split", "clamp", "svd", "nofp"];

const DEF = { thetaC: 0.025, thetaS: 0.0075, fe: [0.85, 0.05, -0.03, 0.92] };
const I2M = [1, 0, 0, 1];

export function mpmPlasticDefaults(hyp) {
    const h = { mode: "split", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.thetaC = Math.min(0.9, Math.max(1e-4, num(c.thetaC, DEF.thetaC)));
    c.thetaS = Math.min(0.9, Math.max(1e-4, num(c.thetaS, DEF.thetaS)));
    if (!Array.isArray(c.fe) || c.fe.length !== 4 || !c.fe.every(Number.isFinite)) c.fe = DEF.fe.slice();
    h.config = c;
    if (!MPMPLASTIC_MODES.includes(h.mode)) h.mode = "split";
    return h;
}

export async function buildMpmPlastic(hyp, base = {}) {
    const h = mpmPlasticDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const keepPlastic = h.mode !== "nofp";      // *** THE PLANT: skip the F_p update. ***
    const out = { thetaC: c.thetaC, thetaS: c.thetaS };

    if (h.mode === "svd") {
        // The decomposition itself, before anything is clamped: U diag(S) V^T must rebuild the original.
        const { U, S, V } = svd2(c.fe);
        const back = fromSvd(U, S, V);
        out.svdResidual = Math.max(...back.map((v, i) => Math.abs(v - c.fe[i])));
        out.singularMin = Math.min(...S);
        out.singularMax = Math.max(...S);
        return out;
    }

    const r = returnMap(c.fe, I2M, { thetaC: c.thetaC, thetaS: c.thetaS, keepPlastic });
    const sv = svd2(r.Fe).S;
    out.clamped = r.clamped;
    out.singularMin = Math.min(...sv);
    out.singularMax = Math.max(...sv);
    // A VERDICT: the clamp either put every value in range or it did not run. The epsilon is for the SVD
    // round-trip, not for the clamp -- the clamp itself is exact.
    out.clampHolds = out.singularMin >= (1 - c.thetaC) - 1e-9 && out.singularMax <= (1 + c.thetaS) + 1e-9;
    out.splitDrift = splitDrift(r.Fe, r.Fp, r.total);
    out.splitHolds = out.splitDrift < 1e-9;
    // How much total volume the split invented or lost -- zero when the identity holds.
    out.volumeChange = Math.abs(det(mul(r.Fe, r.Fp)) - det(r.total));
    return out;
}

export const mpmPlasticDevice = {
    modes: MPMPLASTIC_MODES,
    // "split" is FIRST so the contract compares the plant against the mode that owns the identity.
    plantMode: "nofp", plantFlips: "splitDrift", plantKind: "mode",
    name: "mpm-return-mapping", observables: MPMPLASTIC_OBSERVABLES,
    build: buildMpmPlastic, defaults: mpmPlasticDefaults,
};
