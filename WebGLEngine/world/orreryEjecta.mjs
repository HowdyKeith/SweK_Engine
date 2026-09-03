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
import * as IP from "../tools/ship/importPosition.mjs";
import { isLicenceFile } from "./orrery.mjs";

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
    // v4418 -- *** THE LICENCE HALF IS DELEGATED, BECAUSE THE SAME FILE WAS PAPERWORK TO ONE FUNCTION AND
    // PAYLOAD TO ANOTHER IN THIS MODULE. *** The comment above justified anchoring at the filename's start on
    // the grounds that a false positive here zeroes real payload -- a fair worry, and it made
    // IBMPlexSerif-OFL.txt and shaders/ASHIMA-LICENSE.txt into CODE MASS while world/orrery.mjs's
    // isLicenceFile, in the same tree, called them licences. Measured across vendor/: isLicenceFile matches 17
    // files and every one of them is a real licence, so the feared false positive does not exist here. What is
    // kept is the non-licence half -- PROVENANCE and README and AUTHORS are paperwork and are not licences.
    return isLicenceFile(base) || /^(PROVENANCE|README|AUTHORS|PATENTS|VERSIONS)/i.test(base);
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
 * v4410 -- *** THE SAME QUESTION, ASKED POSITIONALLY. *** ejectaOf above asks whether the source CONTAINS
 * `vendor/<name>/`. That is true of a file that imports the body and equally true of one that quotes the path
 * inside a sentence, and v4406 found tools/ship/gateSweep.mjs filed as a box3d importer because a sweep
 * closing's verdict string explains that box3dLoader imports it.
 *
 * MEASURED ACROSS ALL 15 BODIES, and the old rule is wrong in BOTH directions: of its 138 entries, 12 are
 * records rather than dependencies -- and it MISSES 17 files that depend on a body through
 * `path.join(..., "vendor", "box3d", ...)`, which contains no `vendor/box3d/` substring at all. The corrected
 * population is 143. ejectaOf is kept, unchanged, because the gate compares the two and the difference is the
 * measurement.
 */
export function dependantsOf(name, files) {
    const needle = "vendor/" + name + "/";
    return files.filter((f) => IP.depends(f.source, needle, name)).map((f) => f.path).sort();
}

/** The occurrences the old rule counted that are records rather than dependencies. */
export function mentionsOf(name, files) {
    const needle = "vendor/" + name + "/";
    return ejectaOf(name, files).filter((p) => {
        const f = files.find((x) => x.path === p);
        return f && IP.kindOf(f.source, needle, name) === "record";
    }).sort();
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
/*
 * v4410 -- *** FROZEN BY NAME, NOT BY COUNT, WHICH IS THE THING THIS FILE'S OWN CAUSE OF DEATH WAS. ***
 *
 * EJECTA_BASELINE was a map of NUMBERS -- three: 70, box3d: 21 -- and its inline comments show what that cost:
 * every time the count moved, somebody had to work out WHICH file had arrived, and twice the answer was that
 * no file had arrived at all and a scanner had counted a sentence. v4399 stated the rule after the same thing
 * happened to the register: a count ratchet drifts with the tree and cannot say which entry moved, and the
 * round that raises it is the one least able to tell.
 *
 * So the record is now the LIST. The counts below are derived from it and can never disagree with it. A gate
 * comparing against this reports an arrival and a departure BY NAME, and the round that changes one has to say
 * which and why -- which is what the two comments preserved above were doing by hand.
 */
export const DEPENDANTS_AT_V4410 = Object.freeze({
    "box3d": Object.freeze([
        "ai-bridge/doctorBridge.js",
        "ai-bridge/server.js",
        "physics/backendRouting-selfcheck.mjs",
        "physics/box3d/box3dConformance-selfcheck.mjs",
        "physics/box3d/box3dLoader.js",
        "physics/box3d/box3dNode.mjs",
        "physics/box3d/sensorsCcd-selfcheck.mjs",
        "physics/box3d/wasmBuild-selfcheck.mjs",
        "physics/box3dFingerprint-selfcheck.mjs",
        "physics/box3dMathImports-selfcheck.mjs",
        "physics/wheelJoint-selfcheck.mjs",
        "simulation/life/paramecium3d-selfcheck.mjs",
        "simulation/life/parameciumBox3d-selfcheck.mjs",
        "simulation/life/parameciumDrive-selfcheck.mjs",
        "tools/crossarch-box3d.mjs",
        "tools/crossarchBox3d-selfcheck.mjs",
        "tools/macSession.mjs",
        "tools/roundhouse/backendRotation.mjs",
        "tools/roundhouse/box3dBind-selfcheck.mjs",
        "tools/roundhouse/box3dBind.mjs",
        "tools/ship/artifactWeight.mjs",
        "tools/ship/box3dFilter-selfcheck.mjs",
        "tools/ship/box3dRay-selfcheck.mjs",
        "tools/ship/copiedOutsideVendor-selfcheck.mjs",
        "tools/ship/jointDrive-selfcheck.mjs",
        "tools/ship/ragdollSelfCollide-selfcheck.mjs",
    ]),
    "draco": Object.freeze([
        "gpu/gltfDraco.js",
        "tools/ship/dracoWeld-selfcheck.mjs",
    ]),
    "fonts": Object.freeze([
        "ev/esShipLabels-selfcheck.mjs",
        "ev/esShipLabels.js",
        "slug-text.html",
    ]),
    "gifenc": Object.freeze([
        "render/gifRecorder-selfcheck.mjs",
        "render/gifRecorder.js",
    ]),
    "grass": Object.freeze([
        "tools/ship/grassField-selfcheck.mjs",
        "tools/ship/orrery-selfcheck.mjs",
    ]),
    "heerich": Object.freeze([
        "heerich-avatar.html",
    ]),
    "htmx": Object.freeze([
        "ai-bridge/ensureHtmx.js",
        "ai-bridge/server.js",
        "clients.html",
        "server.html",
        "tools/ship/artifactWeight.mjs",
        "tools/ship/vendoredLicences-selfcheck.mjs",
    ]),
    "jolt": Object.freeze([
        "physics/jolt/joltLoader.js",
        "tools/ship/artifactWeight.mjs",
    ]),
    "keyhunt": Object.freeze([
        "physics/crypto/secp256k1-selfcheck.mjs",
    ]),
    "krbn": Object.freeze([
        "krbn-avatar.html",
        "krbn-compare.html",
        "krbn-lyapunov.html",
        "krbn-rigged.html",
        "krbn.html",
        "render/holoPicture-selfcheck.mjs",
        "tools/krbn/krbnCompareLive-selfcheck.mjs",
        "tools/krbnVendor-selfcheck.mjs",
    ]),
    "slug": Object.freeze([
    ]),
    "taichi-js": Object.freeze([
        "tools/roundhouse/androidPeer-selfcheck.mjs",
        "tools/roundhouse/magmapTaichi-selfcheck.mjs",
        "tools/roundhouse/magmapTaichi.mjs",
        "tools/roundhouse/magmapTaichiRun-selfcheck.mjs",
    ]),
    "three": Object.freeze([
        "ai-bridge/ensureThree.js",
        "ai-bridge/server.js",
        "aquarelle.html",
        "ascii-avatar.html",
        "ascii-object.html",
        "asset2voxels.html",
        "avatarpreview.html",
        "battleship3d.html",
        "blob-selfie.html",
        "blob-shock.html",
        "blobulator.html",
        "box3d-blobs.html",
        "brain-3d.html",
        "celltrack-viewer.html",
        "codemap.html",
        "cosmic-web.html",
        "es-box3d-3d.html",
        "es-box3d-fly3d.html",
        "ev/esShipModels.js",
        "ev/spriteHull.js",
        "eve.html",
        "face/robotFaceAvatar.js",
        "fire-demo.html",
        "fluid-selfie.html",
        "fog-of-war.html",
        "fpscontrol.html",
        "fpsmirror.html",
        "glb_viewer.html",
        "graph_viewer.html",
        "heerich-avatar.html",
        "krbn-avatar.html",
        "krbn-compare.html",
        "krbn-rigged.html",
        "lbm3d-flow.html",
        "lbm3d-gpu.html",
        "main.js",
        "mpm3d.html",
        "physics/box3dMeshOverlay.js",
        "physics/fire/fireMesh.js",
        "pipboy-models.html",
        "render/svgExtrude.js",
        "render/tools/meshopt-selfcheck.mjs",
        "rle-mesh-demo.html",
        "scene-view.html",
        "server.html",
        "shipavatar.html",
        "shipview.js",
        "song-globe.html",
        "splat_viewer.html",
        "svg-forge.html",
        "thead.html",
        "thermal3d-cells.html",
        "tomography.html",
        "tools/krbn/krbnCompareLive-selfcheck.mjs",
        "tools/ship/artifactWeight.mjs",
        "tools/ship/boundaryLint-selfcheck.mjs",
        "tools/ship/dracoWeld-selfcheck.mjs",
        "tools/ship/threeImportmap-selfcheck.mjs",
        "tools/ship/tsl-selfcheck.mjs",
        "tools/ship/webgpuHarness.mjs",
        "toroidal-wave.html",
        "torrents.html",
        "universal-viewer.html",
        "uvtt.html",
        "view.html",
        "voxearth.html",
        "voxel-photo-cube.html",
        "wallpaper.html",
        "warp-map.html",
        "wasm-bench.html",
        "wear-field.html",
    ]),
    "three-webgpu": Object.freeze([
        "orrery-gpu.html",
        "tools/ship/brainTsl-page.js",
        "tools/ship/divineEye-selfcheck.mjs",
        "tools/ship/generatedLadder-selfcheck.mjs",
        "tools/ship/img2three-selfcheck.mjs",
        "tools/ship/tsl-selfcheck.mjs",
        "tools/ship/tslPhysics-selfcheck.mjs",
        "tools/ship/tslRace-selfcheck.mjs",
        "tools/ship/tslSource-selfcheck.mjs",
        "tsl-probe.html",
        "tsl-rig.html",
    ]),
    "wasm": Object.freeze([
        "ai-bridge/wasmDemoBridge.js",
        "ai-bridge/wasmJsSandbox.js",
        "ai-bridge/wasmSandbox.js",
        "wasm-bench.html",
    ]),
});

/** DERIVED from the list above, never typed. The old EJECTA_BASELINE shape, for readers that want a count. */
export const EJECTA_BASELINE = Object.freeze(Object.fromEntries(
    Object.entries(DEPENDANTS_AT_V4410).map(([k, v]) => [k, v.length])));

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
