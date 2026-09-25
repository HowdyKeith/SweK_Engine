// WebGLEngine/render/frameVerdicts.mjs -- v4713: what the frame-level arc FOUND, in a form the page reads.
//
// *** FOUR HYPOTHESES ABOUT WHEN TO GENERATE A FRAME WERE MEASURED, AND THE PAGE SAID ONE THING ABOUT FRAME
// GENERATION: THAT IT HAD NEVER RUN ON A PICTURE. *** fsr.html's OFF readout was written before v4681 turned the path
// on, and it outlived that by thirty-one rounds and 1,911 harvested frames. The ON readout printed each frame's
// advantage over a cross-fade with nothing to say what four rounds had learned about predicting it, and the vertical
// slab option existed only for H10 while naming no verdict. v4704 did this for the per-block arc
// (render/genGateVerdicts.mjs); this is the same for the frame arc, and tools/ship/frameVerdicts-selfcheck.mjs grades
// every entry the same way: each closing must carry each number, each verdict is RE-DERIVED from its result file
// through the statistic that decided it, and every count and headroom figure here is recomputed from the caches.
//
// Browser-safe: no node imports. The page imports it directly.
"use strict";

/** The four, in the order they were measured. `numbers` must each appear in the named closing's verdict. */
export const FRAME_VERDICTS = Object.freeze([
    Object.freeze({ id: "H7", round: "v4706", closing: "since388", doc: "render/frame-gate-preregistration.md", verdict: "not supported",
        signal: "spatial detail",
        claim: "a frame's spatial detail predicts where generation beats a cross-fade, across scenes and within them",
        evidence: "reading \"neither\": across-scene rho 0.3214 at x2 (exact p 0.2488) and 0.0000 at x4",
        numbers: Object.freeze(["0.3214", "0.2488", "0.0000"]) }),
    Object.freeze({ id: "H8", round: "v4708", closing: "since390", doc: "render/frame-holes-preregistration.md", verdict: "not reported",
        signal: "occlusion",
        claim: "within a scene, the frames with more occlusion are where generation does worse, at x1 and x8",
        evidence: "x1 left no hole in six of seven scenes, so it cannot answer; the x8 cell cleared, sign p 0.0078, and is not promoted",
        numbers: Object.freeze(["0.0078"]) }),
    Object.freeze({ id: "H9", round: "v4710", closing: "since392", doc: "render/frame-holed-preregistration.md", verdict: "not supported",
        signal: "occlusion",
        claim: "frames with any hole lose more than frames with none, at x8 and upscale 1.5x and 3x",
        evidence: "3x cleared; 1.5x did not, sign p 8/128, because checker's holed frames scored +0.305 dB",
        numbers: Object.freeze(["8/128", "+0.305"]) }),
    Object.freeze({ id: "H10", round: "v4712", closing: "since394", doc: "render/frame-vertical-preregistration.md", verdict: "not supported",
        signal: "occlusion", option: Object.freeze({ select: "slabdir", value: "z" }),
        claim: "H9's contrast holds when the slab moves vertically, across the dolly",
        evidence: "5 of 7 scenes, t p 0.356; bars's holed frames scored +2.202 dB and smooth's +0.912 -- where generation WON",
        numbers: Object.freeze(["0.356", "+2.202", "+0.912"]) }),
    Object.freeze({ id: "H11", round: "v4715", closing: "since397", doc: "render/frame-gain-preregistration.md", verdict: "not supported",
        signal: "motion's gain",
        claim: "a frame's summed gain from motion over standing still predicts where generation beats a cross-fade, on both geometries",
        evidence: "sign 1 of 7 in both cells: 12 of 14 scene-cells ranked BACKWARDS, mean rho -0.412 and -0.397, with the same exception on both",
        numbers: Object.freeze(["12 of 14", "-0.412", "-0.397"]) }),
    Object.freeze({ id: "H12", round: "v4717", closing: "since399", doc: "render/frame-reverse-preregistration.md", verdict: "not supported",
        signal: "motion's gain, reversed",
        claim: "H11's backwards ranking holds at x2, a speed it was not seen at, on both geometries",
        evidence: "13 of 14 scene-cells backwards, but forward stopped at 6 of 7 with zone against it, sign p 0.0625; vertical cleared and is not promoted",
        numbers: Object.freeze(["13 of 14", "0.0625"]) }),
    Object.freeze({ id: "H13", round: "v4717", closing: "since399", doc: "render/frame-reverse-preregistration.md", verdict: "not supported",
        signal: "motion's gain, clock removed",
        claim: "the backwards ranking survives when the frame's position in the window is partialled out",
        evidence: "neither cell clears; 39% of the forward mean rho and 68% of the vertical goes with the clock",
        numbers: Object.freeze(["39%", "68%"]) }),
    Object.freeze({ id: "H14", round: "v4719", closing: "since401", doc: "render/frame-sway-preregistration.md", verdict: "not supported",
        signal: "motion's gain, slab in view", option: Object.freeze({ select: "slabpath", value: "sway" }),
        claim: "the backwards ranking holds when the slab never leaves the view, on both geometries",
        evidence: "13 of 14 scene-cells backwards at 57% and 65% of the linear path's strength; forward cleared, vertical stopped at 6 of 7 with bars against it",
        numbers: Object.freeze(["13 of 14", "57%", "65%"]) }),
]);

/** How much picture the arc stands on: frames harvested with both dB, per hypothesis. The gate counts the caches. */
// H13 is measured on H12's frames, so it has no entry of its own: a frame is counted once however many hypotheses read it.
export const FRAME_MEASURED = Object.freeze({ H7: 546, H8: 546, H9: 546, H10: 273, H11: 546, H12: 546, H14: 546 });

/** The round the path first ran on a picture, and how many scenes every hypothesis declared. Both graded by the gate. */
export const FRAME_FIRST_RUN = Object.freeze({ round: "v4681", closing: "since366" });
export const FRAME_SCENE_COUNT = 7;

/** Where the arc stands. The headroom is v4706's frame oracle over the better fixed policy, recomputed by the gate. */
// v4715 -- the finding is built from QUOTES, each graded against the closing it came from, so it can say no more than they did.
export const FRAME_ARC = Object.freeze({ standsAt: "v4719", closing: "since401",
    quotes: Object.freeze([
        Object.freeze({ closing: "since388", text: "spatial detail is not what separates" }),
        Object.freeze({ closing: "since394", text: "a hole is not a signal a frame gate can carry to geometry it has not seen" }),
        Object.freeze({ closing: "since397", text: "motion's gain over standing still ranks frames backwards on both geometries" }),
        Object.freeze({ closing: "since399", text: "a large share of that ranking goes with the window's clock" }),
        Object.freeze({ closing: "since401", text: "with the slab whole in view, a weaker backwards ranking survives" }),
    ]),
    finding: "spatial detail is not what separates the frames generation wins; a hole is not a signal a frame gate can carry to " +
             "geometry it has not seen; and motion's gain over standing still ranks frames backwards on both geometries, at x2 " +
             "as at x4 -- but a large share of that ranking goes with the window's clock; and with the slab whole in view, a weaker " +
             "backwards ranking survives, clearing on one geometry and not the other",
    headroom: Object.freeze({ round: "v4706", closing: "since388", speed: "4",
        scenes: Object.freeze({ ramp: "+0.368", smooth: "+0.232" }) }) });

export function frameVerdictFor(select, value) {
    return FRAME_VERDICTS.find((v) => v.option && v.option.select === select && v.option.value === value) || null;
}

/** The suffix a page option carries when a hypothesis was the reason it exists. Empty otherwise. */
export function frameOptionSuffix(select, value) {
    const v = frameVerdictFor(select, value);
    return v ? ` -- ${v.id} ${v.verdict.toUpperCase()} at ${v.round}` : "";
}

const total = () => Object.values(FRAME_MEASURED).reduce((s, n) => s + n, 0);

/** The sentence the ON readout ends with: what predicting this frame's advantage has come to. */
export function frameNote() {
    const h = FRAME_ARC.headroom, list = FRAME_VERDICTS.map((v) => `${v.id} (${v.signal}) ${v.verdict.toUpperCase()} at ${v.round}`).join(", ");
    return ` WHETHER TO GENERATE A FRAME IS AN OPEN QUESTION: ${list} -- ${FRAME_VERDICTS.length} hypotheses over ` +
           `${total()} harvested frames (${FRAME_VERDICTS.map((v) => v.doc).join(", ")}). Headroom exists: at ` +
           `x${h.speed} a frame oracle would gain ${Object.entries(h.scenes).map(([s, g]) => `${g} dB on ${s}`).join(" and ")} ` +
           `over the better fixed policy (${h.round}). As of ${FRAME_ARC.standsAt}, ${FRAME_ARC.finding}.`;
}

/** What the OFF readout says the path has done -- replacing a sentence that said it had never run. */
export function frameOffNote() {
    return `the path has run on pictures since ${FRAME_FIRST_RUN.round}, and ${FRAME_VERDICTS.length} pre-registered hypotheses about when to ` +
           `use it were measured on ${total()} frames across ${FRAME_SCENE_COUNT} scenes (${FRAME_VERDICTS.map((v) => `${v.id} ${v.verdict}`).join(", ")}). ` +
           `Turning it on costs a second truthPersp per frame and shows whether it beats a cross-fade on THIS frame.`;
}
