// physics/hologramKnob.mjs -- v4586
//
// THE SOURCE-SEPARATION KNOB OF THE HOLOGRAM SCENE, ADJUDICATED BY READING THE GEOMETRY BACK OUT OF THE FRINGES. The scene
// (physics/hologram.js) puts two coherent point sources sep apart, lambda = 0.5, a screen at D = 1000 spanning +-60 sampled
// at N = 240 points, and draws the intensity. The key: the bright fringes' spacing is lambda D / sep, so the separation is
// RECOVERED from the measured peak spacing (hologram.recoverSeparation) and must return the knob. The scan is the scene's
// own (scanScreen), the recovery is the module's own, and the comparison is this file's.
//
// IT REFUSES ON ITS OWN SUBJECT: below sep = 10 fewer than three peaks fit the 120-wide screen (one at sep = 4, 6 and 8,
// measured), so there is no spacing to read and the candidate is refused as unmeasurable -- AND THE PAGE'S SLIDER STARTS
// AT 8, inside that region: its default range opens on a hologram whose separation cannot be read back. Said, not fixed
// here. The tolerance is the screen's pitch: a peak is located to within half a sample either side, so the spacing of two
// peaks carries at most one pitch, and the bound is TOL_PITCHES * pitch / (lambda D / sep) -- 2.4 % at sep = 12, 12 % at
// sep = 60 -- against measured residuals of 8.4e-4 to 6.2e-3. Derived from the sampling, not from the run.
//
// Run: node physics/labKnobs-selfcheck.mjs
"use strict";
import { pathToFileURL } from "node:url";
import * as H from "./hologram.js";

export const LAMBDA = 0.5, D = 1000, HW = 60, N = 240;
export const PITCH = 2 * HW / (N - 1);
export const TOL_PITCHES = 2;
export const MIN_PEAKS = 3;

export function measure(sep) {
    const sc = H.scanScreen(H.twoSources(sep), LAMBDA, D, HW, N);
    const expected = H.fringeSpacing(LAMBDA, D, sep), recovered = sc.spacing > 0 ? H.recoverSeparation(sc.spacing, LAMBDA, D) : null;
    return { sep, peaks: sc.peaks.length, spacing: sc.spacing, expected, recovered, pitch: PITCH };
}

export function adjudicate(sep) {
    if (!Number.isFinite(sep) || sep <= 0) return { pass: false, evidence: { sep, reason: "the separation must be finite and positive" } };
    const m = measure(sep), law = "fringe spacing = lambda D / sep, so the separation recovered from the peak spacing must return the knob";
    if (m.peaks < MIN_PEAKS) return { pass: false, evidence: { ...m, law, reason: `${m.peaks} bright fringe${m.peaks === 1 ? "" : "s"} on a screen of +-${HW}: fewer than ${MIN_PEAKS}, so no spacing can be read (the page's slider starts at 8, inside this region)` } };
    const rel = Math.abs(m.recovered - sep) / sep, tol = TOL_PITCHES * PITCH / m.expected;
    return { pass: rel <= tol, evidence: { ...m, law, rel, tol } };
}

/** THE PREFERENCE, without the adjudicator: the WIDEST fringes a person can see -- the smallest separation -- which sends the
 *  greedy pick to sep = 4, where one fringe fills the screen and nothing can be read back: the search wants what the screen
 *  cannot measure, and the adjudicator says so. */
export function score(sep) { return Number.isFinite(sep) && sep > 0 ? 1 / sep : -Infinity; }
export function propose({ current = 20 } = {}) { return [4, 8, 10, 12, 16, 20, 30, 40, 60].filter((v) => v !== current); }

export const MEASURED_V4586 = {
    belowTenNothingCanBeRead: "peaks on the screen: 1 at sep = 4, 6 and 8; 3 at 10, 12, 16; 5 at 20; 15 at 60 -- the slider's minimum of 8 sits inside the unreadable region",
    theRecoveryFloor: "recovered / sep: 10.008 / 10, 11.926 / 12 (6.2e-3, the worst), 20.017 / 20, 40.034 / 40, 59.835 / 60 -- every residual under the pitch-derived bound",
};

export function reportLines() {
    const L = ["[hologramKnob] the separation read back from the fringes, refusing where fewer than three fit"];
    for (const s of [4, 8, 10, 12, 20, 60]) { const a = adjudicate(s), e = a.evidence; L.push(`    sep ${String(s).padStart(3)}  ${a.pass ? "PASS  " : "refuse"}  ${e.recovered != null ? "recovered " + e.recovered.toFixed(3) + " rel " + e.rel.toExponential(2) + " tol " + e.tol.toExponential(2) : e.reason}`); }
    return L;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
