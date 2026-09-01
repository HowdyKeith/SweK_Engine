// WebGLEngine/tools/ship/changedPaths.mjs -- v4283
//
// *** THE PRE-FILTER BUILT TO PREVENT SILENT GREEN LIGHTS HAD ONE OF ITS OWN, AND THE DOCUMENTED WORKFLOW
// WALKED STRAIGHT INTO IT. ***
//
// tools/ship/affected.mjs answers "which gates can this change reach" by matching changed-file strings against
// ENGINE-RELATIVE paths -- `physics/render/pathTracer.mjs`. Nothing ever checked that the strings it was handed
// were in that form, or named files that exist at all. A path it cannot account for reaches no gate, and
// reaching no gate is reported as a legitimate finding and exits ZERO.
//
// So every one of these runs nothing and passes, in well under a second:
//
//   WebGLEngine/physics/render/pathTracer.mjs        <- what `git diff --name-only` prints, from ANY directory
//   /home/user/.../physics/render/pathTracer.mjs     <- what tab-completion and most tooling produces
//   physics/render/pathTracer.mjs,main.js            <- a comma-joined list, the obvious guess at the syntax
//   physics/render/pathTrcaer.mjs                    <- a typo
//
// *** THE FIRST ONE IS THE SERIOUS ONE. *** git prints repo-root-relative paths whatever directory it is run
// from, HANDOFF.md documents feeding changed files to --affected, and the two do not compose. Anyone who wired
// the ritual together the obvious way got 0 of 1355 gates and a green run, forever, and the failure looks
// exactly like the good news that the change was well contained.
//
// ---- WHAT THIS MODULE REFUSES TO DO ------------------------------------------------------------------------
//
// *** IT DOES NOT MAKE "NOTHING REACHES THIS" AN ERROR. *** That verdict is real and is the graveyard census's
// entire subject: a module no check can reach is worth knowing about. The bug was never that zero can be
// reported -- it is that zero was reported for inputs NOBODY HAD ESTABLISHED WERE FILES. Those are different
// states and this module's whole job is to keep them apart:
//
//   the path names a file, and no gate reaches it   -> a finding, passed through untouched
//   the path names a file in another spelling       -> normalised, and SAID OUT LOUD
//   the path names nothing at all                   -> a refusal, because it is a question, not an answer
//
// Nor does it silently fix anything. A normalisation nobody is told about is a second way to be quietly wrong.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const ROOT = path.resolve(ENG, "..");

// DERIVED, NOT TYPED. The engine's name inside the repo is read off the two paths rather than written down;
// a literal "WebGLEngine" here would be a fourth copy of a fact the filesystem already holds, and this session
// has spent several rounds removing exactly that shape.
export const ENGINE_REL = path.relative(ROOT, ENG).replace(/\\/g, "/");

const slash = (p) => p.replace(/\\/g, "/");
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * What is this string, really?
 *
 * Returns { input, kind, rel, detail }. `rel` is the engine-relative path when one could be established and
 * null otherwise. `kind` is one of:
 *
 *   engine-relative  already the form affected.mjs matches. Passed through.
 *   dot-slash        "./x" -- the same file wearing a prefix. Normalised.
 *   repo-relative    "WebGLEngine/x" -- git's form, from any directory. Normalised.
 *   absolute         an absolute path inside the engine. Normalised.
 *   outside-engine   a real file in the repo but not under the engine (docs/, .github/). KEPT, and counted,
 *                    because it genuinely reaches no gate and that is not the same as a mistake.
 *   comma-joined     one argument holding several paths. REFUSED rather than split -- see below.
 *   missing          names no file in either root. REFUSED.
 */
export function classifyPath(input) {
    const s = slash(String(input));

    // *** A RELATIVE PATH CAN STILL POINT OUTSIDE THE ENGINE, AND path.join WILL HAPPILY TAKE IT THERE. ***
    // "../docs/CHANGELOG.md" joined to the engine root is a real file, so a bare isFile test would have called
    // it engine-relative and handed affected.mjs a string beginning "../" that matches no key. Containment is
    // asserted rather than assumed: the joined path must still be INSIDE the engine.
    const insideEng = (p) => {
        const r = slash(path.relative(ENG, p));
        return r !== "" && !r.startsWith("../") && !path.isAbsolute(r) ? r : null;
    };

    // The leading "./" is stripped BEFORE anything is tested, so the returned rel is the one form affected.mjs
    // keys on. The first draft returned "./main.js" verbatim, which deduplicates against "main.js" as two
    // different files -- a normaliser that leaves two spellings of one path is not a normaliser.
    const dot = s.startsWith("./");
    const bare = dot ? s.slice(2) : s;

    // Order is load-bearing: engine-relative is tested FIRST, so a file that exists under both roots resolves
    // the way affected.mjs would read it rather than the way this function happens to check.
    if (!path.isAbsolute(bare)) {
        const j = path.join(ENG, bare);
        const r = insideEng(j);
        if (r && isFile(j))
            return dot ? { input, kind: "dot-slash", rel: r, detail: "leading ./ removed" }
                       : { input, kind: "engine-relative", rel: r, detail: "" };
        // "../docs/CHANGELOG.md" -- a real file, named the way somebody standing in the engine would name it,
        // that simply is not under the engine. A REFUSAL HERE WOULD BE SAFE AND STILL WRONG: safe because it
        // stops rather than passes, wrong because the file exists and reaching no gate is the true answer
        // about it. The distinction this module is for cuts both ways.
        if (!r && isFile(j)) {
            const rr = slash(path.relative(ROOT, j));
            if (!rr.startsWith("../")) return { input, kind: "outside-engine", rel: null, detail: rr };
        }
    }

    if (path.isAbsolute(s)) {
        const r = slash(path.relative(ENG, s));
        if (isFile(s) && !r.startsWith("../"))
            return { input, kind: "absolute", rel: r, detail: "made relative to the engine root" };
        if (isFile(s)) {
            const rr = slash(path.relative(ROOT, s));
            return rr.startsWith("../")
                ? { input, kind: "missing", rel: null, detail: "an absolute path outside this repository" }
                : { input, kind: "outside-engine", rel: null, detail: rr };
        }
        return { input, kind: "missing", rel: null, detail: "no such file" };
    }

    if (isFile(path.join(ROOT, bare))) {
        const pre = ENGINE_REL + "/";
        if (bare.startsWith(pre))
            return { input, kind: "repo-relative", rel: bare.slice(pre.length),
                     detail: "git prints this form from every directory" };
        return { input, kind: "outside-engine", rel: null, detail: bare };
    }

    // *** THE COMMA CASE IS REFUSED, NOT SPLIT, AND THE REASON IS NOT SQUEAMISHNESS. *** A comma is a legal
    // character in a filename, so splitting would guess -- and a selector that guesses wrong under-selects,
    // which is the one failure mode affected.mjs is written to never have. Refusing costs the caller one
    // retype and cannot cost anyone a missed gate.
    if (s.includes(",")) {
        const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
        const real = parts.filter((x) => isFile(path.join(ENG, x)) || isFile(path.join(ROOT, x)));
        if (real.length > 1)
            return { input, kind: "comma-joined", rel: null,
                     detail: `${real.length} of ${parts.length} pieces are real files -- pass them separated by SPACES` };
    }
    return { input, kind: "missing", rel: null, detail: "no such file under the engine or the repository root" };
}

export const REFUSING = new Set(["missing", "comma-joined"]);
export const NORMALISED = new Set(["dot-slash", "repo-relative", "absolute"]);

/**
 * Classify a whole list. Returns { resolved, seen, refusals, notes, outside }.
 *
 * `resolved` is what affected.mjs should be given: engine-relative, de-duplicated, order preserved.
 * `refusals` is non-empty when the caller must be stopped. `notes` is what must be PRINTED when it is not.
 */
export function normaliseChanged(list) {
    const seen = (list || []).map(classifyPath);
    const refusals = seen.filter((c) => REFUSING.has(c.kind));
    const outside = seen.filter((c) => c.kind === "outside-engine");
    const resolved = [];
    for (const c of seen) if (c.rel && !resolved.includes(c.rel)) resolved.push(c.rel);
    const notes = seen.filter((c) => NORMALISED.has(c.kind))
                      .map((c) => `${c.input} -> ${c.rel}   (${c.kind}: ${c.detail})`);
    return { resolved, seen, refusals, notes, outside };
}

/** The lines a caller prints before refusing. Kept here so every caller refuses the same way. */
export function refusalLines(res) {
    const out = ["*** REFUSING: " + res.refusals.length + " of " + res.seen.length +
                 " path(s) could not be established as files. ***"];
    for (const c of res.refusals) out.push("    " + c.input + "   -- " + c.kind + ": " + c.detail);
    out.push("A path that names nothing reaches no gate, and a run of no gates EXITS ZERO. That is a green");
    out.push("light bought with a typo, so it is refused here rather than reported as a finding.");
    if (res.resolved.length) out.push("The other " + res.resolved.length + " path(s) were fine: " + res.resolved.join(" "));
    return out;
}
