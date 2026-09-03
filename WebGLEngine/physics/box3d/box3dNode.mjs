// WebGLEngine/physics/box3d/box3dNode.mjs -- v3568
// ---------------------------------------------------------------------------------------------------------------
// LOADING THE box3d WASM FROM NODE, AND REPORTING WHAT THE ARTIFACT ACTUALLY CONTAINS.
//
// box3dLoader.js is a BROWSER loader: it imports "/vendor/box3d/box3d.js" by absolute URL and the vendor glue
// reaches the .wasm with fetch(). Node's fetch has no file: scheme, so the loader cannot be reused from a gate
// without either changing it (it works, so no) or supplying the one thing it is missing. This supplies it.
//
// *** AND IT DOES THE SECOND THING, WHICH IS WHY THE FILE IS WORTH ITS OWN NAME: IT COMPARES THE SHIM SOURCE'S
// EXPORT LIST AGAINST THE BUILT ARTIFACT'S. *** Two independent routes to one integer, which is the sharpest
// agreement shape available, and on this tree TODAY THEY DISAGREE:
//
//     box3d_shim.c defines   43 swk_* functions
//     box3d.wasm exports     40
//     missing                swk_contacts, swk_contact_count, swk_contact_stride
//
// Those three arrived at v3037 ("CONTACTS -- round 1 of 3 (exports -> gate -> overlay)") while the vendored
// artifact header said v2560. THE WASM WAS FIVE HUNDRED VERSIONS BEHIND ITS OWN SOURCE AND NOTHING IN THE TREE
// NOTICED, because every consumer calls through box3dLoader and the loader only reports ready/not-ready --
// never ready-but-stale. A capability that is declared, compiled in source, documented in a header, and simply
// ABSENT from the binary is the failure mode a boolean cannot express.
//
// *** THAT WAS FIXED AT v3569 AND THIS PARAGRAPH WENT ON DESCRIBING IT IN THE PRESENT TENSE UNTIL v4248. ***
// PENDING_REBUILD below was emptied at v3571 with a note saying the rebuild had happened; the MECHANISM was
// updated and the PROSE was not, so a file whose entire purpose is catching a stale record carried one. Today
// the artifact exports 45 swk_* functions, all three contact calls among them, and `stale` is empty. The
// numbers above are kept as history because the shape they describe is the reason this file exists -- but they
// are history, and the only name still outstanding is swk_joint_motor_set, which is documented in the shim and
// defined nowhere.
//
// The check is an integer set difference. No tolerance, no fixture, and it grades a build artifact rather than a
// simulation -- which is the same move backendConformance makes one level down.
//
// SECOND FINDING, SMALLER AND ALSO REAL: box3d_shim.c line 321 says "see swk_joint_motor_set below" and NO SUCH
// FUNCTION IS DEFINED ANYWHERE IN THE FILE. The comment describes the determinism cost of driving a joint and
// then points at nothing. exportReport() lists it under `documentedButMissing` so it is a fact in a report rather
// than a reader's confusion.
"use strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ADDED_AT_V4385 as JOINT_DRIVE_ADDED } from "./jointDrive.mjs";
import { ADDED_AT_V4395 as SENSOR_CCD_ADDED } from "./sensorTrigger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = join(HERE, "..", "..", "vendor", "box3d");
export const SHIM_PATH = join(HERE, "box3d_shim.c");

/** Teach fetch() the file: scheme, once, and only for file: URLs. Every other request keeps the real fetch. */
let patched = false;
function patchFetch() {
    if (patched) return;
    const real = globalThis.fetch;
    globalThis.fetch = async (u, o) => {
        const s = String(u);
        if (!s.startsWith("file:")) return real(u, o);
        const buf = await readFile(fileURLToPath(s));
        return new Response(buf, { status: 200, headers: { "content-type": "application/wasm" } });
    };
    patched = true;
}

let _mod = null, _status = null;

/**
 * Load the vendored wasm. Mirrors box3dLoader.init()'s contract exactly -- { ready } or { ready:false, reason } --
 * because a gate that threw here would be indistinguishable from a gate that failed on physics.
 */
export async function initNode(dir = VENDOR_DIR) {
    if (_status) return _status;
    try {
        patchFetch();
        const factory = (await import(pathToFileURL(join(dir, "box3d.js")).href)).default;
        _mod = await factory({ locateFile: (f) => pathToFileURL(join(dir, f)).href });
        _status = { ready: true };
    } catch (e) {
        _status = { ready: false, reason: "box3d wasm not loadable from node: " + (e && e.message) };
    }
    return _status;
}

export function mod() {
    if (!_mod) throw new Error("box3dNode: call initNode() first and check .ready");
    return _mod;
}

/** Every swk_* symbol the BUILT artifact exports. Read from the module, never typed here. */
export function builtExports(m = _mod) {
    return Object.keys(m).filter((k) => k.startsWith("_swk_")).map((k) => k.slice(1)).sort();
}

/**
 * Every swk_* function the SHIM SOURCE defines. A definition is a line beginning at column zero with a return
 * type and a name followed by "(" -- which is exactly how every export in that file is written, and deliberately
 * does NOT match calls, prototypes indented inside functions, or mentions in comments.
 */
export async function declaredExports(path = SHIM_PATH) {
    const src = await readFile(path, "utf8");
    const out = new Set();
    for (const line of src.split("\n")) {
        const m = /^[A-Za-z_][A-Za-z0-9_ *]*\b(swk_[a-z0-9_]+)\s*\(/.exec(line);
        if (m && !line.trimStart().startsWith("static")) out.add(m[1]);
    }
    return [...out].sort();
}

/**
 * Names a comment points at that no line defines. The dangling-reference check, kept separate from staleness.
 *
 * swk__* (DOUBLE underscore) is the file's own convention for a static internal helper -- swk__push_joint and
 * swk__valid_pair are both defined and both `static`, so declaredExports rightly skips them. The first version of
 * this function reported them as missing, which is a false alarm of exactly the kind that teaches a reader to
 * ignore the report. Internal helpers are excluded by that convention rather than by name.
 */
export async function documentedButMissing(path = SHIM_PATH) {
    const src = await readFile(path, "utf8");
    const declared = new Set(await declaredExports(path));
    const internal = /^swk__/;
    const mentioned = new Set((src.match(/swk_[a-z0-9_]+/g) || []));
    return [...mentioned].filter((n) => !declared.has(n) && !internal.test(n)).sort();
}

/**
 * *** THE MANIFEST OF WHAT IS KNOWINGLY WAITING ON A REBUILD, AND WRITING IT DOWN IS THE POINT. ***
 *
 * The first version of the gate asserted `stale.length === 3`, and it went red the same hour, because adding
 * swk_body_set_friction and swk_body_set_restitution to the shim GREW THE GAP -- correctly. A count is the wrong
 * shape: it fails on legitimate work and says nothing about which capability went missing.
 *
 * A manifest is the right shape. Every name here is a function that exists in box3d_shim.c, is expected to be
 * absent from the vendored artifact, and has a consumer that must degrade rather than throw. Anything missing and
 * NOT on this list is an unexplained gap and the gate says so. Rebuild the wasm and this list should empty.
 */
export const PENDING_REBUILD = [
    // v3571 -- *** EMPTY, AND THE EMPTYING IS THE POINT. *** v3569 rebuilt the artifact and all five names it
    // listed are now exported, so the gate's second half -- "a name listed as pending that the artifact DOES
    // export means the rebuild happened and the list should shrink" -- FIRED AND THIS IS THE SHRINK. A manifest
    // that kept its entries after the rebuild would report work as outstanding that was already done, which is
    // the same stale-record defect the manifest was built to catch, one level up.
    //
    // The list stays as a mechanism rather than being deleted: the next shim function added without a rebuild
    // belongs here, and `unexplained` goes red until somebody says so.
    //
    // v4256 -- AND HERE IS THAT NEXT ONE. Four collision-filtering functions were added to box3d_shim.c and
    // the vendored artifact predates them, because this sandbox has no emcc. They are written down rather
    // than discovered: a caller asking for self-collision filtering on the current artifact gets `false` from
    // has() and must degrade, and the day someone runs build-box3d-wasm.sh this list empties and
    // `manifestStale` says so.
    "swk_body_set_filter",
    "swk_body_get_filter",
    "swk_joint_set_collide_connected",
    "swk_joint_get_collide_connected",
    // v4382 -- AND THE NEXT ONE AGAIN, with the same split #125's note recorded for the filter. The raycast
    // (swk_world_cast_ray plus swk_ray_stride, which publishes the row width so the reader is not typed) is
    // BUILT AND MEASURED: build-box3d-native.sh needs only cc and cmake, so tools/ship/box3dRay-selfcheck.mjs
    // compiles a probe against the real library and compares eleven rays against the mesh BVH. What it is NOT
    // is packaged: getting it into vendor/box3d/box3d.wasm needs emsdk, which this sandbox has not got, so the
    // browser path degrades on has() until somebody runs build-box3d-wasm.sh on a rig that has it.
    "swk_world_cast_ray",
    "swk_ray_stride",
    // v4385 -- the joint READBACKS and the DRIVE, same split again: built and measured natively, not packaged.
    // These six are the half of the joint API that was missing for four hundred rounds -- the shim could set a
    // limit and never read one back, so physics/ragdollFromSkeleton.mjs's derived knee angle of [-145, 0] was
    // written into the solver and unobservable. The names come from physics/box3d/jointDrive.mjs's
    // ADDED_AT_V4385 rather than being typed here twice; the gate asserts the two lists are the same.
    ...JOINT_DRIVE_ADDED,
    // v4395 -- sensors, continuous collision, and the speed cap: the same split a fourth time, and this one
    // brought back something the browser path needs more than the functions. swk_world_max_linear_speed
    // MEASURES a default the vendored headers never state -- 400 m/s -- and the artifact that ships ALREADY
    // ENFORCES IT, because it is box3d's own default and not something this round added. So unlike the twelve
    // names beside it, that finding is not pending anything: physics/esBox3d.js hands box3d a ship's top speed
    // and ev/tools/es-arena.mjs's Fighter asks for 430, and 400 is what the world gives it today, in the wasm,
    // with no rebuild involved. What is pending is only the ability to SEE or MOVE the cap from the browser.
    ...SENSOR_CCD_ADDED,
];


/**
 * THE REPORT. `stale` is the integer set difference that matters: declared minus built. Empty means the artifact
 * was compiled from this source; non-empty NAMES THE CAPABILITIES A CALLER WILL FIND MISSING AT RUNTIME.
 * `unexplained` is the half that has to stay empty: a gap nobody wrote down.
 */
export async function exportReport() {
    const st = await initNode();
    if (!st.ready) return { ready: false, reason: st.reason };
    const built = builtExports(), declared = await declaredExports();
    const stale = declared.filter((n) => !built.includes(n));
    const extra = built.filter((n) => !declared.includes(n));
    return {
        ready: true, builtCount: built.length, declaredCount: declared.length,
        stale, extra, documentedButMissing: await documentedButMissing(),
        artifactMatchesSource: stale.length === 0 && extra.length === 0,
        // missing and NOT written down: the half that must stay empty
        unexplained: stale.filter((n) => !PENDING_REBUILD.includes(n)),
        // written down but present after all: the manifest has gone stale and should shrink
        manifestStale: PENDING_REBUILD.filter((n) => built.includes(n)),
    };
}

/** Capability probe for one function, so a gate can SKIP rather than FAIL when the artifact predates a feature. */
// *** A CAPABILITY PROBE THAT THROWS IS NOT A CAPABILITY PROBE. *** This dereferenced a null module when
// initNode() had not run, so asking "can box3d do X" BEFORE loading it crashed instead of answering "not that I
// can tell" -- and the whole point of the function is to be safe to ask early. Found at v3593 by a caller that
// asked in exactly that order.
export function has(name, m = _mod) { return !!m && typeof m["_" + name] === "function"; }
