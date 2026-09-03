// WebGLEngine/ui/stageFlags.mjs -- v4419
//
// *** ONE DECLARATION OF A RULE THAT TWO FILES HAD TO AGREE ABOUT. ***
//
// avatarstage.html resolved `?pet` inline, and v4419 changed that resolution: `embed=1` used to FORCE the pet
// off and now only DEFAULTS it off. A change to a rule is exactly the moment the rule needs a gate, and a gate
// cannot test a line that lives inside a page's inline module without either driving a browser or RESTATING
// the rule -- and a restated rule is a second declaration that drifts from the first, which is the defect this
// tree names more often than any other.
//
// So the rule moved here. avatarstage.html imports it; ui/stageFlags-selfcheck.mjs imports the same function.
// There is one place where "is the pet on" is decided and both readers get their answer from it.
//
// ---- WHY THE RULE CHANGED, WHICH IS THE WHOLE ROUND ---------------------------------------------------------
//
// v3656 set `_pet = _embed ? false : ...` and wrote down why: "a wandering pet is small enough to fit a
// 143x210 box and a 1.8u rigged figure is not, so the only thing that ever landed in frame was the thing that
// wanders. AN EMBEDDED AVATAR IS ONE AVATAR."
//
// *** THAT REASON IS A BOX SIZE, AND v4414 RETIRED THE BOX. *** server.html's SVG dials came out and the
// avatar took the whole of #dialsRow: host/row went 0.263 -> 1.000, and the 143x210 panel measures 676 px
// wide now. A room that fits one figure fits the figure and the llama. The veto outlived its reason by five
// versions, which is the shape v4414 found in the same file and v4418 found in backendParity's baseline.
//
// *** AND A VETO IS LOOSENED TO A DEFAULT ONLY AFTER COUNTING WHO RELIES ON IT. *** Measured across the whole
// tree: exactly TWO callers pass embed=1, and BOTH already pass pet=0 explicitly. So no shipping caller moves,
// and their pet=0 -- redundant while the veto stood -- is load-bearing again, which is the better state for a
// flag to be in.
"use strict";

/**
 * Is the wandering pet on?
 *
 * @param {string|null} petParam  the raw `?pet` value: null when absent, "0"/"1" (or anything) when present
 * @param {boolean} embed         whether `?embed=1` was given
 * @param {boolean|undefined} compPet  a composition's own default, or undefined when it has no opinion
 *
 * THE ORDER IS THE POINT AND IT IS THREE RULES, NOT TWO:
 *   1. AN EXPLICIT ?pet WINS ALWAYS -- embedded or not. This is the v4419 change, and it is the difference
 *      between a default (overridable) and a veto (not).
 *   2. Otherwise an EMBEDDED stage defaults the pet OFF -- v3656's rule, kept, because a panel that has not
 *      asked for the llama should still get one avatar.
 *   3. Otherwise the composition decides, and a stage with no opinion anywhere shows the pet -- v1352.
 */
export function resolvePet(petParam, embed, compPet) {
    if (petParam !== null && petParam !== undefined) return petParam !== "0";
    if (embed) return false;
    return compPet !== undefined ? !!compPet : true;
}

/** What v4419 measured, so a later round reads a number rather than re-deriving one and calling it the same. */
export const MEASURED_AT_V4419 = Object.freeze({
    // Callers in the whole tree passing embed=1, and how many pass pet explicitly. THREE AFTER THIS ROUND:
    // the two that already shipped (both pet=0) plus stage3d (pet=1). The number that justified loosening the
    // veto is the SECOND one -- every embed caller states its own pet, so none of them inherits the default.
    embedCallers: 3, embedCallersWithExplicitPet: 3, embedCallersBeforeStage3d: 2,
    // The box v3656's veto was written for, and what v4414 made it.
    boxThen: "143x210", rowNow: 676, hostOverRowThen: 0.263, hostOverRowNow: 1.0,
});
