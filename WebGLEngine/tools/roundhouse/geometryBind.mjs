// tools/roundhouse/geometryBind.mjs
//
// v2818 -- roundhouse device: MARCHING TETS on an implicit field (physics/mesh/marchingCubes.js). Different in
// KIND from every other device here -- this one grades GEOMETRY, not physics -- which is exactly why it is worth
// having: a lab that only ever asks fluid questions cannot catch a mesh extractor that lies.
//
// NOTE ON watertight(): the module returns {watertight, boundaryEdges}, NOT a bare boolean. The observable here
// is the BOOLEAN, because numericVerdict's `equals` comparator would otherwise be handed an object and compare it
// to `true` forever -- a claim that could never crystallise and never say why. boundaryEdges is reported
// alongside, since "how many edges are unpaired" is the number you actually want when it fails.
//
// THE ANSWER KEY IS BUILT INTO THE FIELD. sphereField(R) hands back not only f and its gradient but the exact
// enclosed volume 4/3 pi R^3, so the extractor is graded against a number it was never shown. Three independent
// things must all hold, and they fail in different ways:
//
//   ON THE SURFACE  every vertex the extractor places must SIT on the isosurface. maxSurfaceDeviation measures
//                   the worst one. An extractor that interpolates edges wrongly fails here while still producing
//                   a closed, plausible-looking blob.
//   WATERTIGHT      every edge shared by EXACTLY two triangles -- a closed manifold. A case-table hole fails here
//                   while every vertex still sits perfectly on the surface.
//   VOLUME          the enclosed volume must converge to 4/3 pi R^3 as resolution rises. Getting the surface and
//                   the topology right and the volume wrong would mean the triangles are wound inconsistently.
//
// Modes:
//   "sphere"    -- one resolution. Reports all three, plus the analytic volume for comparison.
//   "converge"  -- two resolutions. Reports whether the volume error SHRANK, which is the property that
//                  distinguishes a discretisation error from a bug.
//   "blob"      -- the metaball field instead, where there is no closed-form volume: watertightness and surface
//                  deviation still apply, so the device reports those and NO volume claim. Stated rather than
//                  quietly reporting a number with no truth behind it.

import { sphereField, wyvill, wyvillGrad, marchingTets, meshVolume, watertight, maxSurfaceDeviation } from "../../physics/mesh/marchingCubes.js";

// v3902 -- ONE declaration of the mode list. It lived in geomDefaults' whitelist AND in the device object --
// the THIRD device this round found carrying that duplicate (splat and multigridgpu were the others), and on
// splatBind the second copy SILENTLY COERCED a new plant mode to the primary, so both arms read bit-identical
// numbers and the plant looked like it had fired. THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED.
export const GEOM_MODES = ["sphere", "blob", "converge", "midpoint"];

export const GEOM_OBSERVABLES = [
    "surfaceDeviation", "watertight", "boundaryEdges", "boundaryDetectorFires",
    "volumeMeasured", "volumeTheory", "volumeErrFrac",
    "triangles", "vertices", "resolution", "volumeErrCoarse", "volumeErrFine", "converged", "hasVolumeTruth",
];

const DEF = { N: 28, R: 1.0, lo: -1.5, hi: 1.5, Ncoarse: 18, Nfine: 32 };

export function geomDefaults(hyp) {
    const h = { mode: "sphere", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // marching tets is O(N^3) with six tets per cell -- bounded so a proposal cannot pin the builder
    c.N = Math.min(56, Math.max(8, num(c.N, DEF.N) | 0));
    c.Ncoarse = Math.min(40, Math.max(8, num(c.Ncoarse, DEF.Ncoarse) | 0));
    c.Nfine = Math.min(56, Math.max(c.Ncoarse + 4, num(c.Nfine, DEF.Nfine) | 0));
    c.R = Math.min(1.3, Math.max(0.2, num(c.R, DEF.R)));
    h.config = c;
    if (!GEOM_MODES.includes(h.mode)) h.mode = "sphere";   // v3902 -- ONE declaration, read here and by the device
    return h;
}

// *** v3902 -- `midpoint` IS THE PLANT, AND IT IS THE DEFECT THIS DEVICE'S HEADER ALREADY NAMES. ***
// "An extractor that interpolates edges wrongly fails here while still producing a closed, plausible-looking
// blob." The classic wrong interpolation is placing each vertex at the MIDPOINT of its crossing edge instead
// of at the linearly interpolated zero -- and that is produced here WITHOUT TOUCHING THE MODULE, by handing
// the extractor sign(f) instead of f. Linear interpolation between -1 and +1 lands at the midpoint every time,
// and sign(f) changes sign exactly where f does, so THE TOPOLOGY IS UNTOUCHED: identical triangle count,
// identical watertightness. Only the vertices move. The grading still uses the TRUE f.
//
// *** AND THE VOLUME KEY GETS BETTER UNDER IT, WHICH IS THE REASON surfaceDeviation IS WHAT GETS DECLARED. ***
// Measured AT THIS DEVICE'S OWN RESOLUTION (I first quoted numbers from a scratch run at N=24 and they were
// not this device's -- corrected): volumeErrFrac 8.5203e-3 -> 2.9779e-3, so a device graded on enclosed volume
// alone would report the BROKEN extractor as NEARLY THREE TIMES MORE ACCURATE. surfaceDeviation meanwhile goes
// 8.6035e-3 -> 1.7953e-1, twenty-one times worse. THREE KEYS THAT DO NOT AGREE ABOUT WHICH MESH IS BETTER --
// which is exactly why this device carries three, and why the volume key alone would have been worse than
// nothing here: it does not merely miss the defect, it endorses it.
// *** v4075 -- boundaryEdges IS A LOAD-BEARING NEGATIVE (0 means the mesh is closed), AND NONE OF THE FOUR
// FIXTURES IN THIS DEVICE HAS EVER BEEN BROKEN. *** An observable census flagged it as moved by nothing in
// every mode, and MEASURED it is honest -- all four extract a closed mesh and boundaryEdges reads 0 every
// time. But that leaves the detector itself unproven: the same shape strokeMorph's resampler endpoint check
// was found in (v4070) and mpmstep's noSidewaysDrift was found in before blockFell. A comment beside this
// observable already says WHY it exists ("so watertight never crystallises to a claim with no evidence"); it
// did not yet say the crystallisation could actually fail.
//
// The witness: drop the LAST triangle watertight() just accepted and run the identical counter again. Every
// edge of a removed triangle that was shared with exactly one neighbour becomes a boundary edge, so this must
// report a positive count -- derived from the mesh the run actually produced, not a second typed fixture.
const boundaryDetectorFires = (tris) => tris.length > 0 && watertight(tris.slice(0, -1)).boundaryEdges > 0;

function runSphere(c, N, midpoint = false) {
    const fld = sphereField(c.R);
    const field = midpoint ? ((x, y, z) => Math.sign(fld.f(x, y, z))) : fld.f;
    const m = marchingTets(field, fld.g, { N, lo: c.lo, hi: c.hi, iso: 0 });
    const vol = meshVolume(m.verts, m.tris);
    return {
        dev: maxSurfaceDeviation(m.verts, fld.f, 0),
        tight: watertight(m.tris),
        detects: boundaryDetectorFires(m.tris),
        vol: Math.abs(vol),
        theory: fld.volume,
        tris: m.tris.length, verts: m.verts.length,
    };
}

export async function buildGeometry(hyp, base = {}) {
    const h = geomDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "blob") {
        // no closed-form volume here, so no volume claim is offered -- stated, not quietly fabricated
        // Wyvill balls are {cx,cy,cz,r,s} -- the first attempt here used {x,y,z,r} and every ball fell outside
        // its own falloff, so the field was zero everywhere and the extractor returned ZERO triangles. Same class
        // of mistake as the interferometer's metaball shape: an invented struct produces silence, not an error.
        const balls = [{ cx: -0.3, cy: 0, cz: 0, r: 0.9, s: 1 }, { cx: 0.4, cy: 0.2, cz: 0, r: 0.8, s: 1 }];
        const f = (x, y, z) => wyvill(balls, x, y, z);
        const g = (x, y, z) => wyvillGrad(balls, x, y, z);
        const m = marchingTets(f, g, { N: c.N, lo: c.lo, hi: c.hi, iso: 0.5 });
        return {
            surfaceDeviation: maxSurfaceDeviation(m.verts, f, 0.5),
            watertight: watertight(m.tris).watertight,
            boundaryEdges: watertight(m.tris).boundaryEdges,
            boundaryDetectorFires: boundaryDetectorFires(m.tris),
            triangles: m.tris.length, vertices: m.verts.length,
            resolution: c.N, hasVolumeTruth: false,
        };
    }

    if (h.mode === "converge") {
        const a = runSphere(c, c.Ncoarse), b = runSphere(c, c.Nfine);
        const ea = Math.abs(a.vol - a.theory) / a.theory, eb = Math.abs(b.vol - b.theory) / b.theory;
        return {
            volumeErrCoarse: ea, volumeErrFine: eb,
            converged: eb < ea,                       // the property that separates discretisation from a bug
            volumeTheory: a.theory,
            watertight: a.tight.watertight && b.tight.watertight,
            boundaryEdges: a.tight.boundaryEdges + b.tight.boundaryEdges,
            boundaryDetectorFires: a.detects && b.detects,
            surfaceDeviation: Math.max(a.dev, b.dev),
            hasVolumeTruth: true,
        };
    }

    const r = runSphere(c, c.N, h.mode === "midpoint");
    return {
        surfaceDeviation: r.dev,
        watertight: r.tight.watertight,
        boundaryEdges: r.tight.boundaryEdges,
        boundaryDetectorFires: r.detects,
        volumeMeasured: r.vol,
        volumeTheory: r.theory,
        volumeErrFrac: Math.abs(r.vol - r.theory) / r.theory,
        triangles: r.tris, vertices: r.verts,
        resolution: c.N, hasVolumeTruth: true,
    };
}

export const geometryDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: GEOM_MODES, name: "marching-tets-geometry", observables: GEOM_OBSERVABLES, build: buildGeometry, defaults: geomDefaults,
    // `surfaceDeviation` (8.6035e-3 -> 1.7953e-1) and emphatically NOT `volumeErrFrac`, which IMPROVES under
    // this plant (8.5203e-3 -> 2.9779e-3), nor `watertight`/`triangles`/`vertices`, which are bit-identical
    // because the topology never moves -- only the vertex positions along the crossing edges do.
    // v4129 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // knob path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED,
    // surfaceDeviation 8.60e-3 -> 0.1795 under mode "midpoint", matching the header's own quoted 8.6035e-3 ->
    // 1.7953e-1.
    plantMode: "midpoint", plantFlips: "surfaceDeviation", plantKind: "mode" };
