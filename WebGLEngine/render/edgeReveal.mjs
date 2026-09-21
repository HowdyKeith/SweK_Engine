// render/edgeReveal.mjs -- HOW MANY PIXELS A MOVING OCCLUDER UNCOVERS IN ONE FRAME, derived from the scene
// rather than counted after the fact.
//
// *** v4649 LEFT A QUESTION AND THIS ANSWERS IT. *** fsr.html's object-motion camera reports a genuine
// disocclusion count that ALTERNATES -- 212, 106, 212, 106 -- while the same camera with a static slab reads
// a flat 106. That round measured the alternation over five frames, could not explain it, and said so in its
// closing line rather than offering a plausible story. The story turned out to be exact, and it is this:
//
//     genuine(f) = H * (E(f-1) - E(f-2))
//
// where H is the occluder's screen HEIGHT IN WHOLE PIXELS and E(f) is the integer screen column of its
// trailing edge at frame f. A disocclusion is one column of newly uncovered background down the occluder's
// trailing edge, so the count is the height times the number of column boundaries the edge crossed.
//
// *** THE ALTERNATION IS THEREFORE NOT A PROPERTY OF THE DISOCCLUSION TEST AT ALL. IT IS AN INTEGER
// SAMPLING OF A NON-INTEGER SPEED. *** The edge advances at (objectSpeed - cameraSpeed) pixels per frame; on
// that page 1.538, which lies between 1 and 2, so consecutive frames cross either one boundary or two and the
// count is either H or 2H. Nothing is oscillating; a real number is being floored.
//
// ---- *** WHY THIS TAKES THE COLUMNS AND NOT THE SPEED, AND THE FIRST TWO ANSWERS WERE BOTH WRONG *** -------
//
// The obvious form predicts the step as floor(f*v) - floor((f-1)*v) from the speed v alone. Written that way
// it disagrees with the page, and this header said so at length: "right for five frames and then out of
// phase", "a doubled 212 a constant-speed model has no way to produce", "a speed is a summary of a sequence".
//
// *** ALL OF THAT IS FALSE AND IT WAS FALSIFIED BY RUNNING IT. *** Searching every phase from 0 to 1: at
// phase 0.237 the speed model reproduces ALL TEN measured frames, doubled 212 included, and a constant-speed
// floor difference repeats a value perfectly happily. It could hardly be otherwise -- the edge's position is
// LINEAR in f, so ceil(p0 + f*v - 0.5) and a phased floor difference are the same function written twice.
// The two models are not rivals. The first attempt simply left the phase at zero and blamed the formula.
//
// So this module earns its place for two narrower reasons, and they are the ones stated now:
//
//   * IT DERIVES THE PHASE INSTEAD OF ASKING FOR ONE. The phase IS the edge's sub-pixel offset at frame 0,
//     which the scene already determines; a caller who had to supply it would be computing this module's job
//     in order to call it, and a caller who guessed zero gets the sequence this round first shipped.
//   * IT DOES NOT ASSUME A CONSTANT SPEED. edgeAt and eyeAt are functions of the frame, so an occluder that
//     accelerates, or a camera that does, has no single v for the other form to take. The gate drives exactly
//     that case, because a module justified by a generality nobody exercises is justified by nothing.
//
// revealFromSpeed is exported alongside, with its phase argument, precisely so that "the two agree when the
// phase is right" is a row somebody can run rather than a sentence in a comment.
"use strict";

/**
 * The integer screen column of a plane-aligned edge at world x = `edgeX`, seen from an eye at `eyeX` looking
 * along the plane's normal from `dist` away, through a symmetric frustum of half-angle atan(tanFov) rendered
 * `w` pixels wide.
 *
 * *** ceil(p - 0.5), AND THE FIRST DRAFT WROTE floor(p) WITH A PARAGRAPH DEFENDING IT. *** That paragraph
 * cited render/temporalLockWgsl.mjs's floor, which is right there for a reason that does not apply here: that
 * one turns a uv into a TEXEL LOOKUP, and the texel a position falls inside is floor. This one answers a
 * different question -- WHICH COLUMN IS THE FIRST WHOSE CENTRE LIES INSIDE THE REGION -- and a pixel x is
 * inside iff x + 0.5 >= p, so the answer is ceil(p - 0.5). MEASURED against the page's own hit() over eleven
 * frames: ceil(p - 0.5) matches 11 of 11, floor(p) matches 5. The analogy was false and it was worth five
 * frames of wrong answers, which is exactly how long the speed model above survived too.
 *
 * NOT Math.round, though it agrees on every value in that sample. round(x) is floor(x + 0.5) and rounds a
 * half UP; at p exactly 2.5 the first column whose centre is inside is 2, and round gives 3. The two spellings
 * differ only on an exact tie, which is the class of thing v4559 measured costing this arc a full 8.6e-1 of
 * contrast. A convention that is right except at ties is not right.
 */
export function edgeColumn({ edgeX, eyeX, dist, tanFov, w }) {
    if (!(dist > 0)) throw new Error(`edgeColumn: dist must be positive -- got ${dist}. An edge at or behind the eye has no screen column.`);
    if (!(tanFov > 0)) throw new Error(`edgeColumn: tanFov must be positive -- got ${tanFov}`);
    const span = 2 * dist * tanFov;              // world units visible across the frame AT THAT DEPTH
    return Math.ceil(((edgeX - eyeX) / span + 0.5) * w - 0.5);
}

/**
 * The per-frame reveal sequence: how many pixels the occluder uncovers on each of `frames` frames.
 *
 * `height` is the occluder's screen height IN WHOLE PIXELS and is the caller's, because it is a count of
 * pixels and not a length -- on fsr.html the occluder is 2.4 world units at 43.932 px per unit, which is
 * 105.4, and the buffer contains 106. A module that recomputed it from the world size would be 0.6% wrong and
 * would disagree with the id buffer the consumer actually has.
 *
 * Returns { cols, reveal, edges } -- columns crossed per frame, height*cols, and the edge column per frame.
 * Index 0 is frame 0 and always reveals nothing: there is no previous frame for anything to be uncovered from.
 */
export function revealSequence({ edgeAt, eyeAt, dist, tanFov, w, height, frames }) {
    if (!Number.isInteger(height) || height < 1) throw new Error(`revealSequence: height must be a whole number of pixels -- got ${height}. It is a pixel count, not a length.`);
    if (!Number.isInteger(frames) || frames < 2) throw new Error(`revealSequence: frames must be an integer of at least 2 -- got ${frames}. One frame has no previous frame and so no reveal.`);
    const edges = [], cols = [], reveal = [];
    for (let f = 0; f < frames; f++) edges.push(edgeColumn({ edgeX: edgeAt(f), eyeX: eyeAt(f), dist, tanFov, w }));
    for (let f = 0; f < frames; f++) {
        const c = f === 0 ? 0 : edges[f] - edges[f - 1];
        cols.push(c);
        reveal.push(height * c);
    }
    return { cols, reveal, edges };
}

/**
 * The closed form: floor(f*v + phase) - floor((f-1)*v + phase), for a constant speed.
 *
 * Exported so the header's claim can be RUN. Given the right phase this is not an approximation of
 * revealSequence for linear motion -- it is the same function, and the gate holds them equal across every
 * frame rather than asserting a difference that is not there. Given the WRONG phase, or a motion that is not
 * linear, it is simply a different sequence.
 */
export function revealFromSpeed({ speed, height, frames, phase = 0 }) {
    const out = [];
    for (let f = 0; f < frames; f++)
        out.push(f === 0 ? 0 : height * (Math.floor(f * speed + phase) - Math.floor((f - 1) * speed + phase)));
    return out;
}
