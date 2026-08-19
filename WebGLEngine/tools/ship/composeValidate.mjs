// WebGLEngine/tools/ship/composeValidate.mjs -- v3701
// ---------------------------------------------------------------------------------------------------------------
// IS THIS DIORAMA LAYOUT A THING THE STAGE CAN ACTUALLY BUILD?
//
// diorama-composer.html writes a composition -- { avatar, scene, pet, room, gauges[], props[] } -- to
// /diorama/composition and to localStorage, and NOTHING HAS EVER CHECKED IT. A layout naming an avatar that was
// since renamed, a gauge style that does not exist, or a prop mesh that was deleted is saved happily and fails
// silently on the stage, where the only symptom is something missing from a picture.
//
// *** THIS EXISTS BECAUSE OF WHAT COMES NEXT, AND THE ORDER MATTERS. *** The plan is presets, then a small local
// model that proposes a composition. A MODEL WHOSE OUTPUT IS ACCEPTED BECAUSE IT PARSED IS THE VOYAGER FAILURE
// THIS TREE ALREADY CRITICISED: Voyager keeps a generated skill when the code did not throw and a critic
// approves, which is the model judging its own work. JSON.parse succeeding is the weakest possible check, and
// building the producer before the checker is how it becomes the only one.
//
// *** WHAT THIS CAN AND CANNOT SAY, STATED FIRST BECAUSE IT IS THE WHOLE BOUNDARY. *** It answers "can the stage
// build this" -- every name real, every number in range, nothing duplicated. IT HAS NO OPINION ON WHETHER THE
// RESULT LOOKS GOOD, and there is no answer key for that: a diorama is taste, and taste is Keith's eye. A
// VALIDATOR THAT PASSED SOMETHING UGLY IS WORKING CORRECTLY.
//
// THE OPTION LISTS ARE PASSED IN, NEVER HARDCODED HERE. The composer fills its selects from /avatar/imported and
// /assets/list at runtime plus six built-in avatar names, so the allowed sets are a property of THE BOX, not of
// this file. A validator carrying its own copy would drift the first time somebody imported a mesh -- and would
// then reject a layout that is perfectly buildable, which is worse than not checking at all.
"use strict";

/** The gauge styles the composer offers. Three, and they are in its own STYLES array. */
export const STYLES = ["ring", "gyro", "barrel"];
/** The scenes its scene select offers. */
export const SCENES = ["diorama", "focus"];
/** The six vitals GAUGES declares, in order -- the array index IS the gauge identity in the saved layout. */
export const VITALS = ["hunger", "energy", "mood", "focus", "social", "health"];

/**
 * @param {object} comp                the composition to check
 * @param {object} opts
 * @param {string[]} opts.avatars      names the avatar select would offer on this box
 * @param {string[]} opts.meshes       names the prop select would offer on this box
 * @param {number} opts.maxProps       how many props the stage will carry
 * @returns {{ok:boolean, problems:Array<{field:string,why:string}>, checked:number}}
 *
 * RETURNS EVERY PROBLEM, NOT THE FIRST. A layout with four broken references should say so once, not four
 * times over four save-and-retry cycles -- and a producer (a model, especially) needs the whole list to fix in
 * one pass rather than a trickle that looks like progress.
 */
export function validateComposition(comp, { avatars = [], meshes = [], maxProps = 8 } = {}) {
    const problems = [];
    let checked = 0;
    const bad = (field, why) => problems.push({ field, why });

    if (!comp || typeof comp !== "object" || Array.isArray(comp)) {
        return { ok: false, checked: 1, problems: [{ field: "(root)", why: "not an object -- a composition is { avatar, scene, pet, room, gauges, props }" }] };
    }

    // --- avatar ------------------------------------------------------------------------------------------------
    checked++;
    if (typeof comp.avatar !== "string" || !comp.avatar) {
        bad("avatar", "missing. The stage has nothing to put on it.");
    } else if (avatars.length && !avatars.includes(comp.avatar)) {
        // NAMED, AND THE LIST IS QUOTED: "unknown avatar" sends somebody hunting; "unknown avatar 'Xbo' -- did
        // you mean Xbot" is a fix. A validator that says only that something is wrong has done half a job.
        bad("avatar", "'" + comp.avatar + "' is not offered on this box. Known: " + avatars.slice(0, 8).join(", ") +
                      (avatars.length > 8 ? " (+" + (avatars.length - 8) + ")" : ""));
    }

    // --- scene, pet, room --------------------------------------------------------------------------------------
    checked++;
    if (comp.scene !== undefined && !SCENES.includes(comp.scene)) bad("scene", "'" + comp.scene + "' is not one of " + SCENES.join(", "));
    checked++;
    for (const k of ["pet", "room"]) {
        if (comp[k] !== undefined && typeof comp[k] !== "boolean") bad(k, "must be true or false, got " + typeof comp[k]);
    }

    // --- gauges ------------------------------------------------------------------------------------------------
    checked++;
    if (comp.gauges !== undefined) {
        if (!Array.isArray(comp.gauges)) bad("gauges", "must be an array, one entry per vital");
        else {
            if (comp.gauges.length !== VITALS.length) {
                // The saved layout is POSITIONAL -- index i is vital i -- so a short array silently re-assigns
                // every gauge after the gap. THIS IS THE QUIET ONE: nothing throws, the colours just move.
                bad("gauges", "has " + comp.gauges.length + " entries but the layout is POSITIONAL and there are " +
                              VITALS.length + " vitals (" + VITALS.join(", ") + "). A short array shifts every gauge after the gap.");
            }
            comp.gauges.forEach((g, i) => {
                if (!g || typeof g !== "object") { bad("gauges[" + i + "]", "not an object"); return; }
                if (g.show !== undefined && typeof g.show !== "boolean") bad("gauges[" + i + "].show", "must be true or false");
                if (g.style !== undefined && !STYLES.includes(g.style)) bad("gauges[" + i + "].style", "'" + g.style + "' is not one of " + STYLES.join(", "));
                if (g.color !== undefined) {
                    const c = g.color;
                    if (!Array.isArray(c) || c.length !== 3 || !c.every((n) => typeof n === "number" && n >= 0 && n <= 1)) {
                        bad("gauges[" + i + "].color", "must be three numbers in 0..1 (the composer writes normalised RGB, not 0-255)");
                    }
                }
                if (g.pos !== undefined && g.pos !== null) {
                    const p = g.pos;
                    if (!p || typeof p.x !== "number" || typeof p.y !== "number") bad("gauges[" + i + "].pos", "must be {x, y} numbers");
                    else if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) bad("gauges[" + i + "].pos", "(" + p.x + ", " + p.y + ") is outside the pad -- x and y are fractions of it, 0..1");
                }
            });
        }
    }

    // --- props -------------------------------------------------------------------------------------------------
    checked++;
    if (comp.props !== undefined) {
        if (!Array.isArray(comp.props)) bad("props", "must be an array");
        else {
            if (comp.props.length > maxProps) bad("props", comp.props.length + " props but the stage carries " + maxProps);
            const seen = new Set();
            comp.props.forEach((p, i) => {
                const glb = p && p.glb;
                if (typeof glb !== "string" || !glb) { bad("props[" + i + "]", "has no glb name"); return; }
                if (seen.has(glb)) bad("props[" + i + "]", "'" + glb + "' is already on the stage -- two copies of one mesh land in the same place and read as one");
                seen.add(glb);
                if (meshes.length && !meshes.includes(glb)) {
                    bad("props[" + i + "]", "'" + glb + "' is not a mesh this box has. Known: " + meshes.slice(0, 6).join(", ") +
                                            (meshes.length > 6 ? " (+" + (meshes.length - 6) + ")" : ""));
                }
            });
        }
    }

    return { ok: problems.length === 0, problems, checked };
}

/** One line per problem, or one line saying it is buildable -- and never saying it is GOOD. */
export function reportLines(comp, opts) {
    const r = validateComposition(comp, opts);
    if (r.ok) return ["[composeValidate] BUILDABLE -- " + r.checked + " groups checked. This says the stage can " +
                      "build it, NOT that it looks right: there is no answer key for a diorama."];
    return ["[composeValidate] " + r.problems.length + " problem(s):"].concat(r.problems.map((p) => "  " + p.field + ": " + p.why));
}
