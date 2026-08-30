// FILE: gpu/glbLoad.js
// VERSION: v4174 -- the front door that decides WHICH loader a .glb needs, so a caller does not have to.
//
// *** THIS EXISTS BECAUSE THE ADVICE WAS IN A THROWN STRING AND NOTHING ACTED ON IT. ***
//
// GLBParser.js is deliberately self-contained: it has NO imports at all, parses the container by hand, and is
// what face/robotFaceAvatar.js, face/miniAvatar.js and face/avatarStage.js use. Meeting a Draco-compressed
// file it throws a genuinely helpful message -- "Load it through three's GLTFLoader instead, which handles
// the extension in full: gpu/gltfDraco.js attaches the decoder only for files that need it."
//
// A HELPFUL ERROR IS NOT A ROUTE. Every caller had to read that sentence, know it applied to them, and
// implement the fallback itself; none of the three did. gpu/gltfDraco.js was therefore imported by NOTHING
// but its own gate, which is the orphan shape referenceKind exists to catch.
//
// *** AND MY OWN v4169 SWEEP MISSED IT, BY THE EXACT DEFECT THAT SWEEP WAS FIXING. *** That round wired five
// orphaned modules and cleared gltfDraco as already-wired, because a grep for the STRING "gltfDraco.js" hit
// GLBParser.js -- where it appears inside the error message above. A MENTION COUNTED AS A WIRE, in the round
// whose whole subject was that a sentence is not a wire.
//
// The split is kept rather than merged: pulling Draco into GLBParser would drag three.js and a 256 KB decoder
// into the one module that currently needs neither, and every avatar page would pay for a format almost none
// of them use. So GLBParser stays cheap and uncoupled, gltfDraco stays lazy, and THIS file is the seam.
"use strict";
import { needsDraco, peekGlb } from "./glbPeek.mjs";

/** What loadGlb would do with this buffer, without doing it. Exported because a caller may want to ask. */
export function routeFor(buffer) {
    const peek = peekGlb(buffer);
    if (!peek.ok) return { ok: false, route: null, why: peek.error || "not a GLB" };
    const d = needsDraco(buffer);
    if (!d.ok) return { ok: false, route: null, why: d.error || "could not read the extension list" };
    // *** extensionsRequired IS THE SPEC'S WORD AND IT OVERRIDES WHAT WE THINK WE COULD PARSE. *** glTF says
    // a file listing an extension there cannot be loaded without it. Even where no primitive carries the
    // extension and GLBParser would happily read every accessor, a conformant loader must not quietly do so.
    if (d.inRequired) {
        return { ok: true, route: "draco", verdict: d,
                 why: "KHR_draco_mesh_compression is in extensionsRequired -- the spec says this file cannot " +
                      "be loaded without it, whatever we could otherwise parse" };
    }

    // *** DECLARED-BUT-UNUSED IS A THIRD ANSWER, AND THE FIRST DRAFT OF THIS FILE DESCRIBED IT IN A COMMENT
    // WHILE THE CODE DID THE OPPOSITE. *** needsDraco returns the CONSERVATIVE verdict -- true if the
    // extension is declared at all -- and reports `declaredButUnused` separately for the finer question. The
    // comment here claimed that case routed to `plain`; the code tested `d.needsDraco` first, so it never
    // could. A COMMENT DESCRIBING BEHAVIOUR THE CODE DOES NOT HAVE is the defect this tree finds most often,
    // and writing one into a brand-new file took about four minutes.
    //
    // The rule the fixture forced out is finer than either version: a file that declares the extension and
    // compresses NO primitive is readable by GLBParser, so routing it to the decoder fetches 256 KB to decode
    // nothing -- but only once extensionsRequired has been ruled out above.
    if (d.declaredButUnused) {
        return { ok: true, route: "plain", verdict: d,
                 why: "declares KHR_draco_mesh_compression but compresses none of its " + d.totalPrimitives +
                      " primitives, and does not require it -- GLBParser can read this, no decoder needed" };
    }
    if (d.needsDraco) {
        return { ok: true, route: "draco", verdict: d,
                 why: "KHR_draco_mesh_compression is used by " + d.dracoPrimitives + " of " +
                      d.totalPrimitives + " primitives" };
    }
    return { ok: true, route: "plain", why: "no Draco", verdict: d };
}

/**
 * Load a GLB, choosing the loader by what the file actually contains.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {object} deps  the loaders, INJECTED -- see below
 * @param {Function} deps.parsePlain   (buffer) => parsed, normally a GLBParser call
 * @param {Function} [deps.parseDraco] (buffer) => Promise<parsed>, normally gltfDraco's
 *
 * *** THE LOADERS ARE PARAMETERS, WHICH KEEPS THIS FILE FREE OF THREE AND OF THE DECODER. *** Importing
 * either here would undo the laziness the split exists for: this module is the ROUTER, and a router that
 * pulls in every destination is just the merged module with extra steps. It is also what lets the gate drive
 * both branches with no GL context and no three.js, which is the only environment it has.
 */
export async function loadGlb(buffer, deps = {}) {
    const r = routeFor(buffer);
    if (!r.ok) return { ok: false, error: r.why };
    if (r.route === "plain") {
        if (typeof deps.parsePlain !== "function") return { ok: false, error: "loadGlb: no parsePlain supplied" };
        try { return { ok: true, route: "plain", why: r.why, result: await deps.parsePlain(buffer) }; }
        catch (e) { return { ok: false, route: "plain", error: String(e && e.message || e) }; }
    }
    if (typeof deps.parseDraco !== "function") {
        // NAMES WHAT IS MISSING AND WHY, rather than falling through to a parser that will throw a message
        // about a different subject. The old failure mode was GLBParser's accessor error, which describes a
        // symptom (no bufferView) three levels below the cause.
        return { ok: false, route: "draco", error: "this GLB needs a Draco decoder and none was supplied",
                 why: r.why, hint: "pass parseDraco -- gpu/gltfDraco.js's loader fetches the decoder lazily" };
    }
    try { return { ok: true, route: "draco", why: r.why, result: await deps.parseDraco(buffer) }; }
    catch (e) { return { ok: false, route: "draco", error: String(e && e.message || e) }; }
}
