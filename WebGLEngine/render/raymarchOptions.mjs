// WebGLEngine/render/raymarchOptions.mjs -- v3351
//
// *** EVERY OPTION IS SEEABLE OR MEASURED. A THIRD KIND EXISTS AND THE POINT OF THIS FILE IS TO REFUSE IT. ***
//
// Keith's requirement for the ray-march demo: "all the options selectable that either i could see, or we could
// measure live". That is the lab's governing rule pointed at a renderer -- an instrument is only real if it can
// be graded against truth we own, and a control is only real if moving it produces either a DIFFERENCE A PERSON
// CAN JUDGE or a NUMBER THE ENGINE CAN REPORT.
//
// SO EVERY OPTION DECLARES ITS BUCKET AND THE GATE FAILS ON ANY THAT DECLARES NEITHER:
//
//   SEEABLE   moving it changes the picture in a way a person can judge, and the demo's job is to make the
//             difference LEGIBLE -- an A/B that also moves the camera is not an A/B.
//   MEASURED  moving it changes a number the engine reports live, without a human in the loop.
//   BOTH      the interesting ones. The brick skip is the type case: it MUST change the query count and MUST
//             NOT change the picture, and only checking one of those would miss the failure that matters.
//   NEITHER   a slider that is neither is DECORATION -- exactly the "plausible-looking readout with no
//             checkable answer" the lab's rule calls out. It is not shipped, and the reason is recorded.
//
// *** THE THIRD BUCKET IS WHERE THE FINDINGS ARE, WHICH IS WHY IT IS RECORDED RATHER THAN DELETED. *** An option
// that turns out seeable-but-not-measurable is a gap in the instruments; measurable-but-not-seeable is usually
// the honest answer for a performance knob; and one that is neither is a fact about the option worth keeping.
"use strict";

// v3352 -- *** TWO THINGS TAKEN FROM AngeTheGreat'S ENGINE SIMULATOR, whose keybind list IS this contract
// written by somebody who never wrote it down: an OSCILLOSCOPE with pageable views beside a DYNO whose stats go
// to an information panel. ***
//
// (1) BOTH CHANNELS AT ONCE. Engine Sim does not make you choose between hearing the engine and reading the
//     dyno -- the waveform and the number are on screen together, so one change is judged twice by different
//     faculties. v3351 declared `sees` and `measures` per option and left the page free to show them one at a
//     time, which would let a disagreement between eye and instrument go unnoticed. THE DISAGREEMENT IS THE
//     WHOLE VALUE: the brick skip is right only when the number moves AND the picture does not.
//
// (2) *** RPM HOLD, WHICH IS THE ONE I HAD MISSED ENTIRELY. *** Engine Sim pins the engine speed so every other
//     reading becomes comparable. An A/B toggle taken from two different camera positions is not an A/B -- it
//     is two pictures -- and v3351 shipped six options with nothing holding the camera still. Every SEEABLE
//     option now declares what must be PINNED while it is judged, and the gate refuses one that declares none.
//     A COMPARISON WITHOUT A HELD VARIABLE IS A CONFOUND WEARING A TOGGLE.
export const PINS = {
    camera: "eye position, direction and fov held exactly -- the A/B redraws the same frame with one thing changed",
    frame: "the same region contents: no chunk streams in or out between the two halves of a comparison",
    volume: "the same uploaded volume bytes, so a difference cannot be the upload rather than the option",
};

/** Buckets. BOTH is not a third state, it is the conjunction -- kept explicit so a reader cannot skim past it. */
export const SEEABLE = "seeable";
export const MEASURED = "measured";

/**
 * `sees`     what a person is being asked to look at. Null if nothing visibly changes.
 * `measures` the observable the engine reports as it moves. Null if nothing is reported.
 * `expect`   what SHOULD happen -- pre-registered, so a demo run is a test rather than a slideshow.
 * `owner`    who adjudicates: "eye" or "engine". BOTH options name the engine, because a number can refuse
 *            while an eye is still deciding, and the cheaper refusal should run first.
 */
export const OPTIONS = [
    {
        id: "brickSkip", label: "Brick skip (8^3 occupancy)", kind: "toggle", def: true,
        sees: "nothing -- the picture must be IDENTICAL",
        measures: "solid queries per frame",
        expect: "queries fall sharply; the image does not change at all. CPU measured 94.0% fewer over 5000 rays " +
                "with first-hit voxel, face normal, step count and t all bit-identical. THE GPU NUMBER HAS NEVER " +
                "BEEN TAKEN -- that is what this control is for.",
        pin: ["camera", "frame", "volume"],
        owner: "engine",
        why: "the asymmetry is the safety argument: a brick wrongly OCCUPIED costs a fetch, a brick wrongly " +
             "EMPTY passes a ray through a wall silently. A picture that changes here is the unsafe direction.",
    },
    {
        id: "depthComposite", label: "Depth composite with raster boxes", kind: "toggle", def: true,
        sees: "boxes BURY into the voxels instead of floating in front",
        measures: "worst ndc-z delta between the probe matrix and the marcher's depth expression",
        expect: "on: partly-buried boxes, and the buried fraction changes MORE toward the screen edges. off: " +
                "boxes float regardless of geometry. The delta stays at the gated 2.33e-10.",
        pin: ["camera", "frame"],
        owner: "engine",
        why: "a box floating in FRONT of everything looks identical whether depth works or not -- only a " +
             "partly-buried one changes when depth is wrong, which is why the probe boxes are placed to be buried.",
    },
    {
        id: "maxSteps", label: "Max DDA steps", kind: "range", def: 256, min: 32, max: 512, step: 32,
        sees: "distant geometry vanishing as the budget drops",
        measures: "mean steps per pixel, and the fraction of rays that exhaust the budget",
        expect: "lowering it truncates the far field FIRST, because a ray that runs out returns a miss rather " +
                "than a wrong hit. The exhausted fraction should rise before anything near the camera moves.",
        pin: ["camera", "frame"],
        owner: "engine",
    },
    {
        id: "pomLayers", label: "Parallax layers", kind: "range", def: 32, min: 4, max: 64, step: 4,
        sees: "carved depth on flat faces, and stair-stepping when too few",
        measures: "UV error against a 4000-layer reference",
        expect: "32 layers land within 0.01 UV of the reference; more layers lower the error monotonically. " +
                "KNOWN LIMIT, stated on the page: POM does not alter geometry, so face edges never clip.",
        pin: ["camera"],
        owner: "engine",
    },
    {
        id: "regionWindow", label: "Region window (chunks per side)", kind: "range", def: 4, min: 2, max: 6, step: 1,
        sees: "how far the marched region extends before the raster world takes over",
        measures: "texture bytes, derive milliseconds, chunks loaded vs declared NOT LOADED",
        expect: "bytes go as the cube of the side; derive time follows. A chunk that has not streamed is " +
                "reported NOT LOADED rather than drawn as air -- they look identical and mean opposite things.",
        pin: ["camera"],
        owner: "engine",
    },
    {
        id: "uintVolume", label: "R8UI volume (vs unorm)", kind: "toggle", def: true,
        sees: "nothing -- material ids must survive either way",
        measures: "id round-trip: all 256 ids recovered, or the count that did not",
        expect: "IDENTICAL. v3041 measured the unorm round trip as NOT broken -- all 256 ids survive float32 -- " +
                "so this removes a dependency rather than fixing a bug, and a difference here would be news.",
        pin: ["camera", "frame"],
        owner: "engine",
    },
];

/**
 * *** REFUSED, AND KEPT. *** Each of these was considered and is neither seeable nor measurable as things
 * stand. Deleting them would leave the page looking complete; a reader would have no way to tell a control
 * that was rejected from one nobody thought of.
 */
export const REFUSED = [
    { id: "fogDensity", why: "SEEABLE but there is no key: fog is a look, not a claim. It would be a slider " +
        "whose only verdict is whether Keith likes it -- which is a legitimate thing to want and is NOT an " +
        "option in the sense this page is about. Belongs on an aesthetics page with no readout pretending." },
    { id: "brickJumpToExit", why: "MEASURABLE in principle and DELIBERATELY NOT WIRED. v3042 measured it " +
        "changing ZERO first hits and ZERO faces over 4000 rays -- which makes it a CANDIDATE and not a " +
        "justification. It ships behind its own name awaiting its own equivalence gate, and putting it on a " +
        "demo would present an unproven equivalence as a user choice." },
    { id: "shaderPrecision", why: "NEITHER, here. highp is what WebGL2 gives and there is no lowp path to " +
        "compare against, so the control would have one position. v3062 measured f32-vs-f64 divergence at " +
        "1.16% of rays and ONLY at near-ties -- that is a finding, not a knob." },
];

/** An option is admissible only if it declares at least one bucket AND says what to expect. */
export function bucketsOf(o) {
    const b = [];
    if (o.sees && !/^nothing\b/.test(o.sees)) b.push(SEEABLE);
    if (o.measures) b.push(MEASURED);
    // "sees: nothing -- the picture must be IDENTICAL" is a REAL visual claim: sameness is judgeable, and for
    // the brick skip it is the load-bearing half. It counts as seeable ONLY when a measure backs it.
    if (o.sees && /^nothing\b/.test(o.sees) && o.measures) b.push(SEEABLE);
    return b;
}

export function admissible(o) {
    return bucketsOf(o).length > 0 && typeof o.expect === "string" && o.expect.length > 30 && pinnedOk(o);
}

/**
 * *** ANYTHING JUDGED BY EYE MUST NAME WHAT IS HELD WHILE IT IS JUDGED. *** Engine Sim's RPM hold, pointed at a
 * renderer. A toggle compared across two camera positions is two pictures, not an A/B, and the difference a
 * person reports is then partly the move. Every pin must be one this file declares -- a free-text pin is a pin
 * nobody can enforce.
 */
export function pinnedOk(o) {
    if (!bucketsOf(o).includes(SEEABLE)) return true;
    return Array.isArray(o.pin) && o.pin.length > 0 && o.pin.every((k) => k in PINS);
}

/** Both channels at once, never one at a time -- the disagreement between them is the value. */
export function channelsOf(o) {
    return { visual: o.sees || null, numeric: o.measures || null,
             bothAtOnce: Boolean(o.sees && o.measures) };
}
