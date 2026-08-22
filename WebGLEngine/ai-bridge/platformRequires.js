// platformRequires.js -- v3334. THE CATALOG LEARNS TO SAY "THIS MACHINE CANNOT RUN THIS".
//
// THE HOLE THIS FILLS, MEASURED. install_catalog.json carries 102 entries and, before this round, exactly six
// fields: description, cmds, cmdsMac, manual, timeoutMs, checkPath, ping. NOTHING IN IT COULD EXPRESS A
// REQUIREMENT. cmdsMac is a command VARIANT -- "here is the Mac spelling" -- and was repeatedly mistaken for
// "this is for Macs", which are different claims. So every platform constraint in the catalog lived as ENGLISH
// INSIDE description, where no check can read it and no button can honour it.
//
// *** THE INSTANCE THAT FORCED IT: turbo-fieldfare is pure arm64 + Metal, and Stellar Atlas is an INTEL Mac. ***
// An architecture refusal, not an OS-version one -- no upgrade changes it. app-apple-container is the precedent
// AND the hole: its Windows cmds print a refusal, but its cmdsMac echoes install instructions WITH NO ARCH
// CHECK, so pressing it on an Intel Mac recommends software that cannot run.
//
// *** AND MY OWN KEYWORD SCAN WAS WRONG ABOUT ONE OF THE TWO ROWS I NAMED, WHICH IS THE ARGUMENT FOR THIS FILE
// RATHER THAN AGAINST IT. *** I reported raycast-llm as Apple-Silicon-only because its description contains both
// "Apple Silicon" and "Intel". READ, it says the opposite: it pulls a SMALLER model on Intel because CPU-only
// inference is slow there, and a bigger one on Apple Silicon. IT SUPPORTS BOTH. The keyword probe has now misled
// this project a fourth time, and it misled it about the very field being introduced to replace it. THAT IS WHY
// THE REMAINING ROWS ARE NOT SWEPT: the scan that would drive the sweep is the thing that got this wrong.
//
// PURE AND INJECTABLE ON PURPOSE. The environment is passed IN rather than read here, so a gate can ask what
// this machine would decide about a DIFFERENT machine -- which is the only way to test an Intel-Mac refusal from
// a Linux sandbox, and the only way to prove the check has power in both directions.
"use strict";

// A requirement this checker does not understand is NOT a requirement met. A future field name typo'd into a
// row would otherwise pass silently, which is the failure mode the whole file exists to end.
// v3336 -- *** A THIRD OUTCOME, AND MY OWN WALL FOUND THE GAP ONE ROUND AFTER I BUILT IT. *** v3335 gave every
// row one of two states: CONSTRAINED, or READ AND DELIBERATELY UNCONSTRAINED. The very next row added -- the ARDY
// placeholder -- is neither. Its constraint is REAL and NOT YET MEASURED: nobody has run an 8B text encoder plus
// a diffusion model on a Pascal card with 8 GB, so "no constraint" would be a claim, and declaring one would be
// the fabrication VERIFY_EXTERNAL item 5 forbids.
//
// READ-AND-NEEDS-NOTHING and READ-BUT-NOT-YET-MEASURED ARE DIFFERENT FACTS, and collapsing them would let a real
// constraint hide inside the word "unconstrained". `unknown: true` is UNMET on every machine -- fail closed, the
// same direction as an unreadable macOS version -- and it clears the moment somebody measures it and replaces it
// with a real block.
const KNOWN = ["os", "arch", "macosMin", "unknown", "why"];

/**
 * env: { platform, arch, macosVersion }  -- platform/arch as Node reports them ("darwin"/"win32"/"linux",
 *      "arm64"/"x64"); macosVersion a string like "26.1" or null when it could not be determined.
 * Returns { ok, unmet: [{ field, need, got, unknown }], unknownFields: [] }
 */
function checkRequires(requires, env) {
    const unmet = [];
    const unknownFields = [];
    if (!requires || typeof requires !== "object") return { ok: true, unmet, unknownFields, declared: false };

    for (const k of Object.keys(requires)) if (!KNOWN.includes(k)) unknownFields.push(k);

    if (Array.isArray(requires.os) && requires.os.length) {
        if (!requires.os.includes(env.platform)) unmet.push({ field: "os", need: requires.os.join(" or "), got: env.platform });
    }
    if (Array.isArray(requires.arch) && requires.arch.length) {
        if (!requires.arch.includes(env.arch)) unmet.push({ field: "arch", need: requires.arch.join(" or "), got: env.arch });
    }
    if (typeof requires.macosMin === "number") {
        if (env.platform !== "darwin") {
            // Not a Mac at all -- the os requirement (if any) already said so, and repeating it as a version
            // failure would report one problem twice and send somebody hunting a macOS upgrade on Windows.
        } else if (!env.macosVersion) {
            // *** UNKNOWN IS NOT SATISFIED. *** A version that could not be read and a version that is high
            // enough are different facts, and treating the first as the second is how a check stops checking.
            unmet.push({ field: "macosMin", need: ">= " + requires.macosMin, got: "could not be determined", unknown: true });
        } else {
            const major = parseInt(String(env.macosVersion).split(".")[0], 10);
            if (!Number.isFinite(major)) unmet.push({ field: "macosMin", need: ">= " + requires.macosMin, got: String(env.macosVersion), unknown: true });
            else if (major < requires.macosMin) unmet.push({ field: "macosMin", need: ">= " + requires.macosMin, got: String(env.macosVersion) });
        }
    }
    if (requires.unknown === true) {
        unmet.push({ field: "unknown", need: "somebody to measure whether this machine can run it", got: "not yet measured", unknown: true });
    }
    // An unrecognised field is reported and is NOT allowed to pass as satisfied.
    for (const f of unknownFields) unmet.push({ field: f, need: "a field this checker understands", got: "unrecognised", unknown: true });

    return { ok: unmet.length === 0, unmet, unknownFields, declared: true };
}

/** A sentence a person can act on. Names EVERY unmet requirement, not just the first -- a row can miss two. */
function explain(id, result, requires) {
    if (!result || result.ok) return "";
    const parts = result.unmet.map((u) => u.field + ": needs " + u.need + ", this machine reports " + u.got);
    let s = "REFUSED: " + id + " cannot run on this machine. " + parts.join("; ") + ".";
    if (requires && requires.why) s += " " + requires.why;
    // A refusal that reads as a bug gets worked around. Say which kind it is.
    if (result.unmet.some((u) => u.field === "arch")) s += " An architecture refusal is not fixed by an OS upgrade.";
    if (result.unmet.some((u) => u.unknown)) s += " Nothing was installed: a requirement that could not be checked is not a requirement met.";
    return s;
}

module.exports = { checkRequires, explain, KNOWN };
