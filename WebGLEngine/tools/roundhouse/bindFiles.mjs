// tools/roundhouse/bindFiles.mjs -- v4033
//
// *** WHICH FILE IMPLEMENTS A DEVICE, READ FROM THE REGISTRY RATHER THAN GUESSED FROM ITS NAME. ***
//
// Three tools in this lab needed that answer and all three guessed it the same way -- `${name}Bind.mjs`, or the
// same with a capital first letter -- and all three were wrong in the same direction, because THE REGISTRY KEY
// IS LOWERCASE AND THE FILENAME IS CAMELCASE. mpmstep lives in mpmStepBind.mjs, blackhole in blackHoleBind.mjs,
// twobody in twoBodyBind.mjs, landauzener in landauZenerBind.mjs. MEASURED: 37 of 129 registry names have no
// file at the guessed path, including the entire MPM family.
//
//   strictConfig.mirrorAudit    `continue`d on a miss, so it scanned 81 of the 116 devices that declare a
//                               config AND REPORTED `scanned` AS THOUGH THAT WERE COVERAGE (v4032).
//   composeBind                 asks classifyCoupling for two paths and REFUSES TO REPORT AGREEMENT when
//                               independence cannot be established -- correct behaviour on a wrong input, so
//                               36 devices were undecidable for a reason that had nothing to do with coupling.
//   knobLiveness (indirectly)   via both of the above.
//
// *** AND ONE OF THE 37 IS A TRUE MISS, WHICH IS WHY THIS RESOLVES RATHER THAN RENAMES. *** `lbm` has no bind
// file at all -- its device is a local function inside devices.mjs (v3719) -- so the honest answer for lbm is
// still "no file", and composeBind's refusal for it stands exactly as v3722 wrote it. Renaming files to match
// keys would have hidden that one real case among 36 spurious ones.
//
// This is a TEXT SCAN of devices.mjs's own import statements, and says so: a device registered by some route
// this pattern does not describe resolves to null, which callers must handle as "unknown", never as "clean".

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

let CACHE = null;

/**
 * registry name -> bind filename (e.g. "mpmstep" -> "mpmStepBind.mjs"), or absent when the registry does not
 * name a module for it. Built once from devices.mjs's source.
 */
export function bindFileMap({ source = null } = {}) {
    if (CACHE && source == null) return CACHE;
    const src = source ?? readFileSync(path.join(HERE, "devices.mjs"), "utf8");

    // import { fooDevice, barDevice } from "./fooBind.mjs";
    const symToFile = new Map();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g))
        for (const sym of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean))
            symToFile.set(sym, m[2]);

    // Registry entries, at one indent level inside REGISTRY:
    //     name: fooDevice,        name: () => fooDevice,        name: async () => fooDevice,
    const map = new Map();
    for (const m of src.matchAll(/^\s{4}(\w+):\s*(?:async\s*)?(?:\(\)\s*=>\s*)?(\w+)/gm))
        if (symToFile.has(m[2])) map.set(m[1], symToFile.get(m[2]));

    if (source == null) CACHE = map;
    return map;
}

/** The bind filename for one device, or null. NULL MEANS UNKNOWN AND NEVER MEANS CLEAN. */
export function bindFileFor(name, opts) {
    return bindFileMap(opts).get(name) ?? null;
}

/** Repo-relative path, or null on the same terms. */
export function bindPathFor(name, opts) {
    const f = bindFileFor(name, opts);
    return f ? "tools/roundhouse/" + f : null;
}
