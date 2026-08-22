// WebGLEngine/tools/ship/composePropose.mjs -- v3703
// ---------------------------------------------------------------------------------------------------------------
// A SMALL LOCAL MODEL PROPOSES A DIORAMA. THE VALIDATOR DECIDES WHETHER IT IS BUILDABLE. NOBODY DECIDES WHETHER
// IT IS GOOD.
//
// This is the third of three rounds and the order was the argument: v3701 built the validator, v3702 the
// presets, and only now the producer. *** A MODEL WHOSE OUTPUT IS ACCEPTED BECAUSE IT PARSED IS THE VOYAGER
// FAILURE THIS TREE CRITICISED *** -- Voyager keeps a generated skill when the code did not throw and an LLM
// critic approves, which is the model judging its own work. JSON.parse succeeding is the weakest check there
// is, and building the producer first is how it becomes the only one.
//
// THREE RULES, AND THEY ARE WHY THIS FILE IS SHORT:
//   1. IT PROPOSES. It never writes diorama.json, never touches a preset, and the route that calls it returns a
//      proposal for a person to look at. The composer fills its controls and the person still has to save.
//   2. THE REPLY IS PARSED STRICTLY AND NEVER REPAIRED. No "close enough" coercion, no filling in a missing
//      slot with a default, no snapping an unknown avatar to the nearest name. REPAIRING A REPLY IS THE MODEL
//      BEING GRADED BY SOMETHING THAT ALREADY DECIDED TO AGREE WITH IT -- and it hides exactly the failure the
//      validator exists to show.
//   3. NO MODEL IS NOT AN EMPTY PROPOSAL. If ollama is not there, or returns nothing, that is reported as its
//      own state. "The model suggested nothing" and "there was no model" are different findings, and a caller
//      that cannot tell them apart will read the second as the first.
"use strict";
import { validateComposition, STYLES, SCENES, VITALS } from "./composeValidate.mjs";

/**
 * The prompt is BUILT FROM THE BOX'S OWN OPTION LISTS, so the model is never asked to invent a name. That is
 * not a substitute for validation -- a small model will still return a mesh that was never offered -- but it
 * removes the failures that are the prompt's fault rather than the model's.
 */
export function buildPrompt({ avatars = [], meshes = [], maxProps = 8 } = {}) {
    return [
        "Compose a small diorama stage. Reply with ONLY a JSON object, no prose, no code fence.",
        "",
        "Shape:",
        '{"avatar":"<one of the avatars>","scene":"<one of the scenes>","pet":true,"room":true,',
        ' "gauges":[{"show":true,"style":"<one of the styles>","color":[r,g,b]}, ... one per vital, IN ORDER],',
        ' "props":[{"glb":"<one of the meshes>"}, ...]}',
        "",
        "avatars: " + (avatars.length ? avatars.join(", ") : "(none available)"),
        "scenes: " + SCENES.join(", "),
        "styles: " + STYLES.join(", "),
        "vitals IN THIS ORDER (" + VITALS.length + " gauges, positional): " + VITALS.join(", "),
        "meshes: " + (meshes.length ? meshes.join(", ") : "(none available)"),
        "",
        "Rules: colour components are 0..1, not 0-255. At most " + maxProps + " props. No mesh twice.",
        "Use only names from the lists above.",
    ].join("\n");
}

/**
 * Strict parse. Accepts a bare JSON object, or one wrapped in a ``` fence, and NOTHING ELSE.
 * *** THE FENCE IS TOLERATED AND THE CONTENT IS NOT. *** Stripping a code fence is reading the reply; coercing
 * "Xbo" to "Xbot" or supplying a missing `scene` would be REWRITING it, and a proposal somebody else fixed is
 * not evidence that the model can compose.
 */
export function parseReply(text) {
    const raw = String(text == null ? "" : text).trim();
    if (!raw) return { ok: false, error: "the model returned nothing" };
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = (fenced ? fenced[1] : raw).trim();
    const start = body.indexOf("{"), end = body.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false, error: "no JSON object in the reply", raw };
    try {
        const obj = JSON.parse(body.slice(start, end + 1));
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "reply was not an object", raw };
        return { ok: true, composition: obj };
    } catch (e) { return { ok: false, error: "reply was not valid JSON: " + (e && e.message), raw }; }
}

/**
 * @param {function} callModel  async (prompt) => string. INJECTED, exactly the way escalateRoute injects its
 *                              caller -- so this file needs no network, and the gate can drive it with a stub
 *                              that returns a known bad reply. A producer that could only be tested with a live
 *                              model would never be tested here at all.
 * @returns {{state:string, composition?:object, validation?:object, error?:string, raw?:string, prompt:string}}
 *
 * STATES: "proposed" (parsed AND buildable), "unbuildable" (parsed, validator says no -- the composition and
 * the problems both come back so a person can see what it tried), "unreadable" (did not parse), "no-model"
 * (nothing to ask). FOUR STATES BECAUSE THEY ARE FOUR DIFFERENT THINGS TO DO NEXT.
 */
export async function proposeComposition(callModel, opts = {}) {
    const prompt = buildPrompt(opts);
    if (typeof callModel !== "function") {
        return { state: "no-model", error: "no local model is available on this box", prompt };
    }
    let text;
    try { text = await callModel(prompt); }
    catch (e) { return { state: "no-model", error: "the model call failed: " + String((e && e.message) || e), prompt }; }

    const p = parseReply(text);
    if (!p.ok) return { state: "unreadable", error: p.error, raw: p.raw, prompt };

    // *** A PROPOSAL MUST FILL THE STAGE; A PERSON MAY LEAVE GAPS. *** validateComposition treats scene, gauges
    // and props as OPTIONAL, and for a hand-edited layout that is right -- the composer defaults what is
    // missing. But a model replying {"avatar":"Xbot"} has done almost nothing and would come back "proposed",
    // which is ACCEPTED BECAUSE IT PARSED wearing a different hat. Completeness is required OF THE PRODUCER,
    // not of the format, so the requirement lives here rather than in the validator.
    const v = validateComposition(p.composition, opts);
    for (const slot of ["scene", "gauges", "props"]) {
        if (p.composition[slot] === undefined) {
            v.problems.push({ field: slot, why: "the model left this out. A person may leave a slot to its default; A PROPOSAL HAS TO FILL THE STAGE." });
            v.ok = false;
        }
    }
    // THE COMPOSITION COMES BACK EVEN WHEN IT IS UNBUILDABLE. A person can see what the model tried and fix one
    // slot; hiding it would leave "the model failed" with nothing to look at, which teaches nobody anything.
    return { state: v.ok ? "proposed" : "unbuildable", composition: p.composition, validation: v, prompt };
}

export function reportLines(r) {
    const L = ["[composePropose] " + r.state];
    if (r.error) L.push("  " + r.error);
    if (r.validation && !r.validation.ok) for (const p of r.validation.problems) L.push("  " + p.field + ": " + p.why);
    if (r.state === "proposed") {
        L.push("  BUILDABLE -- and that is ALL it means. There is no answer key for a diorama, so whether this");
        L.push("  one is worth keeping is a person's call. Nothing has been saved.");
    }
    return L;
}
