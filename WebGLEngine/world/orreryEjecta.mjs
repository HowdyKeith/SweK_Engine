// ===================================================================
// world/orreryEjecta.mjs -- v4266
// -------------------------------------------------------------------
// *** BACKLOG #46 ASKED FOR "VENDORING AS IMPACT EJECTA" AND NOTHING
// *** IN THE ORRERY MODELLED IT. *** world/orrery.mjs places a body by
// its licence state, its size and the date git says it arrived. That
// answers "what did we take and is it papered". It cannot answer the
// question the metaphor is actually about: HOW FAR DID THE MATERIAL
// SPREAD. A dependency that landed and stayed where it fell is a
// different object from one whose fragments are embedded through the
// whole tree, and the orrery drew them identically.
//
// Ejecta is the engine files that REACH a body. Measured:
//
//     three      67 importers        box3d      21
//     krbn        7                  htmx        5
//     taichi-js   4                  jolt        3
//     gifenc      3                  draco       2
//     fonts       2                  heerich     1
//     wasm        1                  grass       0
//     keyhunt     0                  slug        0
//
// *** THOSE ARE CODE-ONLY COUNTS AND THE FIRST DRAFT'S WERE NOT. *** Counting raw
// source gave box3d 31 and three 70; ten of box3d's "importers" were files that
// name vendor/box3d/ in a COMMENT. Stripping comments is the same rule v4262 and
// v4264 each arrived at independently, and it moved every figure here.
//
// ---- AND THE THREE ZEROES ARE NOT UNUSED DEPENDENCIES -------------
//
// *** grass, keyhunt AND slug CONTAIN NO CODE AT ALL. *** vendor/grass
// is one LICENSE file. vendor/keyhunt is one ATTRIBUTION.txt.
// vendor/slug is a LICENSE and a PROVENANCE.txt. They have zero
// importers because there is nothing to import: they are licence
// RECORDS for sources that were reached, filed under vendor/ because
// that is where the orrery looks.
//
// So the orrery has been drawing three planets made entirely of
// paperwork -- 21% of its bodies -- as though they were captured
// code, and counting their bytes as mass. That is the exact mirror of
// v4263, which found two bodies made of real copied code (Ashima's
// GLSL, Arase's QR generator) that the orrery CANNOT SEE because they
// do not live under the top-level vendor/. The register was wrong in
// both directions at once.
//
// ---- WHAT IS REFUSED, AND WHY ------------------------------------
//
// A first pass counted CITATIONS as well as imports -- files that
// merely name the body. *** THAT NUMBER IS NOISE AND IS NOT SHIPPED.
// *** It is a substring match on a directory name: "wasm" scored 216
// because the word appears in 216 files that have nothing to do with
// vendor/wasm, and "grass" scored 73 on grassField and grassModel.
// A measure that cannot tell a dependency from a common noun is not a
// measure. Imports are counted because an import specifier naming
// vendor/<name>/ is unambiguous.
// ===================================================================
"use strict";

/** What a body is made of. A planet with no code is a filed licence, not a captured dependency. */
export const SUBSTANCE = Object.freeze({ CODE: "CODE", PAPER_ONLY: "PAPER_ONLY" });

/**
 * Is this file paperwork rather than payload?
 *
 * Kept deliberately narrow and anchored to the FILENAME's start: world/orrery.mjs's own isLicenceFile has to
 * recognise IBMPlexSerif-OFL.txt and ATTRIBUTION.txt, and this list is the same idea used for the opposite
 * purpose -- there, to find provenance; here, to discount it from mass.
 */
export function isPaperFile(p) {
    const base = String(p || "").split("/").pop();
    return /^(LICEN[CS]E|COPYING|NOTICE|ATTRIBUTION|PROVENANCE|README|AUTHORS|PATENTS)/i.test(base);
}

/**
 * Split a scanned body into paperwork and payload.
 *
 * `codeBytes` is the number that should drive a planet's radius. Using total bytes makes a licence file into
 * mass, which is how three empty planets came to have a size at all.
 */
export function substance(body) {
    const files = (body && body.files) || [];
    const paper = files.filter((f) => isPaperFile(f.path));
    const code = files.filter((f) => !isPaperFile(f.path));
    const codeBytes = code.reduce((n, f) => n + (f.bytes || 0), 0);
    return {
        name: body && body.name,
        files: files.length, paper: paper.length, code: code.length,
        bytes: files.reduce((n, f) => n + (f.bytes || 0), 0),
        codeBytes,
        state: code.length === 0 ? SUBSTANCE.PAPER_ONLY : SUBSTANCE.CODE,
    };
}

/**
 * Count the engine files that IMPORT anything under vendor/<name>/.
 *
 * `files` is a list of {path, source} outside vendor/. The match is on an import-like specifier containing
 * `vendor/<name>/`, which cannot fire on the bare word -- see the header on why the citation count was
 * refused.
 */
export function ejectaOf(name, files) {
    const needle = "vendor/" + name + "/";
    return files.filter((f) => f.source.includes(needle)).map((f) => f.path);
}

/**
 * *** THE SECOND GUARD THIS FUNCTION USED TO CARRY WAS INERT, MEASURED DIRECTLY RATHER THAN INFERRED. ***
 *
 * The first draft matched `vendor/<name>/` and THEN required the hit to sit inside a quoted specifier. All 32
 * files containing `vendor/box3d/` also satisfy the quoted test, so the guard excluded nothing: the path
 * fragment is already unambiguous, and no sentence in 3,900 engine files carries it outside an import.
 *
 * A guard whose removal changes no count is not caution, it is an assertion that cannot fail, and this tree
 * has found three of those in its own gates already (v4255, v4256, v4258). It is gone.
 *
 * *** AND THE SABOTAGE THAT "PROVED" IT INERT PROVED NOTHING: *** it reported 0 red, and 0 red was a CRASH
 * whose exit code I did not read. The inertness is true; my evidence for it was not, and the direct
 * measurement above is what actually establishes it.
 */
/**
 * The measured spread, recorded so the gate compares against a number rather than re-deriving one silently.
 *
 * *** EVERY FIGURE HERE COMES FROM THE GATE'S OWN SWEEP, AND IT TOOK THREE TRIES TO MEAN THAT. ***
 * (1) The first draft recorded box3d as 29, from a throwaway probe with a looser regex, while ejectaOf
 * measured 31. (2) The gate then counted ITSELF -- its control fixture names vendor/box3d/box3d.js -- and
 * then main.js counted too, because this round's ENGINE_VERSION note quotes that path while explaining the
 * problem. (3) With comments stripped and the gate excluded, box3d is 21. A separate probe written to confirm
 * it returned 20, because it used `return` where it needed `continue` and silently abandoned a directory.
 *
 * So: the numbers here are the ones the SHIPPED sweep prints. Every time this baseline was taken from
 * something else -- a probe, a looser regex, an un-stripped read -- it disagreed with the code that ships.
 */
// *** three MOVED 67 -> 68 AT v4279, AND THE REASON IS RECORDED BECAUSE A RATCHET THAT MOVES SILENTLY IS
// NOT A RATCHET. *** The new importer is tools/ship/webgpuHarness.mjs, added at v4270, which loads three in
// order to render the SHIPPING three.js pass to pixels and compare it against the WGSL port. It is a real
// import of the real library, not a mention in prose and not the scanner counting itself -- both of which
// this file's own header records happening before. Established by diffing the importer list at v4266 against
// HEAD, which returned exactly one added path.
// *** AND three-webgpu WAS MISSING ENTIRELY UNTIL v4329, WHICH IS A DIFFERENT DEFECT FROM A MOVED COUNT. ***
// It was vendored on 2026-09-02 with seven importers. The gate loops over THIS object's keys, so a body with
// no key here is not checked and not reported -- it is invisible, and the gate said ALL GREEN over it. The
// gate now asserts that every body in the bake has an entry, so the next arrival cannot land unmeasured.
export const EJECTA_BASELINE = Object.freeze({
    three: 70, "three-webgpu": 7, box3d: 21,   /* v4303: 68 -> 69, song-globe.html imports three (the song globe, #141); v4322: 70 -- tools/ship/tsl-selfcheck.mjs NAMES vendor/three/three.module.js in a check that no page mixes the two three builds, and a scanner counts the mention: said here rather than excused */ krbn: 8,   /* v4322: krbn-lyapunov.html (the sweep branch) */ htmx: 5, "taichi-js": 4, jolt: 3, gifenc: 3,
    draco: 2, fonts: 2, heerich: 1, wasm: 1, grass: 0, keyhunt: 0, slug: 0,
});

/** The three that are paperwork rather than payload, named so a rise or a fall is visible. */
export const PAPER_ONLY_BODIES = Object.freeze(["grass", "keyhunt", "slug"]);

/**
 * Every directory named `vendor` in the tree, not just the top-level one.
 *
 * *** world/orrery.mjs's scanner reads path.join(engineRoot, "vendor") AND NOTHING ELSE, *** so ui/vendor/
 * has been invisible to it since the directory was created. v4263 found Kazuhiko Arase's 2,237-line QR
 * generator sitting there, out of licence compliance, in a folder literally called vendor.
 */
export function vendorDirs(engineRoot, readdir, join) {
    const found = [];
    const walk = (dir, rel) => {
        let entries = [];
        try { entries = readdir(dir); } catch { return; }
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            if (/^(node_modules|\.git|GPU_Assets|demos_code)$/.test(e.name)) continue;
            const child = join(dir, e.name), childRel = rel ? rel + "/" + e.name : e.name;
            if (e.name === "vendor") { found.push(childRel); continue; }   // do not recurse INTO a vendor dir
            walk(child, childRel);
        }
    };
    walk(engineRoot, "");
    return found.sort();
}

/** A body's mass for drawing: code only. Paper-only bodies get zero, which is the honest radius. */
export const massOf = (body) => substance(body).codeBytes;
