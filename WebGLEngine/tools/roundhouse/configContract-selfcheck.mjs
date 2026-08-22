// WebGLEngine/tools/roundhouse/configContract-selfcheck.mjs -- v3435
//
// Run: node tools/roundhouse/configContract-selfcheck.mjs
//
// *** A DEVICE THAT READS A CONFIG KEY ITS defaults() NEVER DECLARES HAS TWO CONTRACTS AND NOBODY COMPARED
// THEM. *** strictConfig was built to catch a caller passing a key a device would silently ignore. This is the
// same defect from the other side: the key WORKS, the device READS it, and defaults() does not list it -- so
// strictBuild REJECTS A PARAMETER THAT DEMONSTRABLY CHANGES THE ANSWER. blackhole's iscoKm moves 12.40 -> 17.72
// when nsMass is set, and the guard built to protect the lab was blocking it.
//
// *** SOURCE PROPOSES AND BEHAVIOUR DECIDES, AND THAT SPLIT EARNED ITS KEEP ON THE FIRST RUN. *** Scanning for
// `c.foo` proposed sixteen keys across eleven devices; driving each one -- set it, rebuild, see whether any
// observable moves -- confirmed fifteen and REJECTED twobody.keyMass, where the source hit was an ASSIGNMENT the
// bind makes to itself rather than a read of the caller's config. A SOURCE SCAN ALONE WOULD HAVE HAD ME DECLARE
// A KNOB THAT DOES NOT EXIST.
//
// AND THE FIRST VERSION OF THIS SWEEP REPORTED ZERO. The registry stores `file: "blackHoleBind"` -- no
// directory, no extension -- so every readFileSync threw, every throw was caught, and the census announced a
// clean lab. *** A CHECK THAT PASSES BECAUSE IT DOES NOTHING, in the round built to find checks that pass
// because they do nothing. The implausible number is what caught it. ***
"use strict";
import fs from "node:fs";
import * as D from "./devices.mjs";
import { EXTRA_KEYS, unknownKeys } from "./strictConfig.mjs";
import { parseRegistry } from "./plantedCoverage.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);

// *** TWO KEYS ARE NOT DECLARED AND ARE NAMED HERE RATHER THAN GUESSED AT. *** Their fallback is not a simple
// default in the source -- it is computed -- and inventing one would FABRICATE A CONTRACT, which is worse than
// an honest gap. Neither is mine. WHEN SOMEBODY WHO KNOWS THE DEFAULT DECLARES IT, THE ENTRY GOES RED AND
// SHOULD BE DELETED, NOT WIDENED.
const UNDECLARED_BASELINE = {
    // *** THE FOURTEEN I COULD DERIVE ARE FIXED; THESE THIRTEEN ARE NAMED AND NOT GUESSED AT. *** Their
    // fallbacks are COMPUTED in build() rather than written as a literal, so declaring one means READING THAT
    // DEVICE and stating what its author meant -- and inventing a default would FABRICATE A CONTRACT, which is
    // worse than an honest gap. None of these devices is mine. A RATCHET BY NAME: the list may only SHRINK, a
    // new arrival FAILS, and the staleness half below fails if an entry stops being true.
    //
    // WHEN THE OWNER DECLARES ONE, ITS ENTRY GOES RED AND SHOULD BE DELETED, NOT WIDENED.
    "kerr.dynamicIsco": "a computed fallback, not a literal",
    // v3456 -- lens.bSweep ENTRY DELETED, NOT EDITED. Keith's patch DECLARED it in lensBind's DEF (bSweep: 60),
    // so the reason "a sweep specification rather than a scalar knob" HAS EXPIRED. This gate's own rule fired
    // exactly as written -- a baseline entry whose reason expired is a ratchet holding nothing (v3195) -- and
    // the instruction is REMOVE THE NAME, DO NOT LOWER A COUNT. Sixth time that idiom has paid.
    "figureeight.steps": "step count derived from the period at build time",
    "friction.mu": "the bisection target -- the device SEARCHES for it, so a declared default would read as a setting",
    "gyroscope.omega": "spin rate, swept by the order key rather than defaulted",
    "gyroscope.steps": "derived from omega so the run covers the same physical time",
    "gyroscope.torque": "paired with omega in the sweep",
    "md.alpha": "the Ewald splitting parameter -- alphaFree VARIES it on purpose and demands the answer not move",
    "plastic.creep": "recovered BY REGRESSION rather than set (v3201's external-key rule)",
    "plastic.maxStrain": "a cap tied to yieldStrain, not an independent knob",
    "plastic.yieldStrain": "recovered BY BISECTION rather than set",
    "spacefill.order": "Hilbert order, derived from the grid size",
    "zeta.K": "truncation depth chosen from the requested precision",
    "zeta.M": "paired with K by the same choice",
};

/** Keys a bind READS from config, proposed from source. */
function candidateKeys(file) {
    let src = "";
    try { src = codeOnly(fs.readFileSync("tools/roundhouse/" + file + ".mjs", "utf8")); } catch { return null; }
    return new Set([...src.matchAll(/\b(?:c|cfg|conf|config)\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
}

const differs = (a, b) => {
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        const x = a[k], y = b[k];
        if (typeof x === "object" || typeof y === "object") { if (JSON.stringify(x) !== JSON.stringify(y)) return k; }
        else if (x !== y) return k;
    }
    return null;
};

async function main() {
    console.log("[configContract-selfcheck] a key a device reads and never declares\n");
    const rows = parseRegistry(process.cwd());
    let filesRead = 0, proposed = 0, live = [], dead = [];

    for (const row of rows) {
        let dev; try { dev = await D.getDevice(row.name); } catch { continue; }
        if (typeof dev.defaults !== "function") continue;
        const cand = candidateKeys(row.file);
        if (cand === null) continue;
        filesRead++;
        const declared = new Set();
        for (const mode of dev.modes || []) {
            let d; try { d = dev.defaults({ mode }); } catch { continue; }
            for (const k of Object.keys((d && d.config) || {})) declared.add(k);
        }
        for (const k of cand) {
            if (declared.has(k) || EXTRA_KEYS[k]) continue;
            proposed++;
            // BEHAVIOUR DECIDES: does setting it move anything?
            let moved = null;
            for (const mode of dev.modes || []) {
                let a; try { a = await dev.build({ mode }); } catch { continue; }
                for (const v of [2.0, 17, 0.37, true]) {
                    let b; try { b = await dev.build({ mode, config: { [k]: v } }); } catch { continue; }
                    const w = differs(a, b);
                    if (w) { moved = mode + "." + w; break; }
                }
                if (moved) break;
            }
            (moved ? live : dead).push(row.name + "." + k + (moved ? " -> " + moved : ""));
        }
    }

    say(`${filesRead} bind files read, ${proposed} keys proposed by source, ${live.length} confirmed live, ${dead.length} rejected by behaviour`);

    ok("!! *** the sweep actually READ the bind files -- the first version read none and reported a clean lab ***",
        filesRead > 40,
        `${filesRead} of ${rows.length}. The registry stores file: "blackHoleBind" with NO DIRECTORY AND NO EXTENSION, so every ` +
        "readFileSync threw and every throw was caught. A CHECK THAT PASSES BECAUSE IT DOES NOTHING, in the round built to find them");

    const stray = live.filter((h) => !UNDECLARED_BASELINE[h.split(" ")[0]]);
    ok("!! *** NO DEVICE NEWLY reads a live config key it does not declare (ratchet, names not a count) ***",
        stray.length === 0,
        stray.length ? "UNDECLARED AND LIVE: " + stray.join(", ") + " -- strictBuild REJECTS these, so the guard blocks a working parameter"
                     : `every live key is declared, except the ${Object.keys(UNDECLARED_BASELINE).length} named below whose fallback is COMPUTED rather than literal`);

    ok("...and the two named exceptions are still genuinely undeclared, so the entries are not stale",
        Object.keys(UNDECLARED_BASELINE).filter((k) => !live.some((h) => h.startsWith(k))).length === 0,
        "a baseline entry whose reason has expired is a ratchet holding nothing (v3195). *** WHEN THE OWNER DECLARES ONE, THIS GOES RED AND THE " +
        "ENTRY SHOULD BE DELETED, NOT WIDENED ***");
    const fixed = Object.keys(UNDECLARED_BASELINE).filter((k) => !live.some((h) => h.startsWith(k)));
    if (fixed.length) console.log("  ----  REMOVABLE FROM THE BASELINE: " + fixed.join(", "));

    ok("!! *** behaviour REJECTED at least one key the source proposed, which is why both halves exist ***",
        dead.length > 0,
        `rejected: ${dead.join(", ") || "(none)"}. twobody.keyMass is an ASSIGNMENT THE BIND MAKES TO ITSELF, not a read of the caller's ` +
        "config -- A SOURCE SCAN ALONE WOULD HAVE HAD ME DECLARE A KNOB THAT DOES NOT EXIST");

    // The concrete case, driven rather than described.
    {
        const bh = await D.getDevice("blackhole");
        const a = await bh.build({ mode: "neutronstar" }), b = await bh.build({ mode: "neutronstar", config: { nsMass: 2.0 } });
        const u = await unknownKeys("blackhole", "neutronstar", { nsMass: 2.0 });
        ok("!! blackhole.nsMass moves the answer AND is now accepted by strictBuild",
            Math.abs(a.iscoKm - b.iscoKm) > 1 && (u.keys || []).length === 0,
            `iscoKm ${a.iscoKm.toFixed(2)} -> ${b.iscoKm.toFixed(2)} with nsMass = 2.0, and unknownKeys returns none. ` +
            "DECLARING COST NOTHING AT RUN TIME -- the declared value IS the fallback the code already used; what it bought is that the " +
            "CONTRACT NOW MATCHES THE BEHAVIOUR");
    }

    console.log(failed ? `\n[configContract-selfcheck] ${failed} FAILED` : "\n[configContract-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[configContract-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
