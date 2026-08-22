// WebGLEngine/tools/ship/instrumentDevice-selfcheck.mjs
//
// Run: node tools/ship/instrumentDevice-selfcheck.mjs   (~0.2s -- MEASURED)
//
// v3330 -- EVERY INSTRUMENT THAT NAMES A DEVICE MUST NAME ONE THAT EXISTS.
//
// *** MY EARLIER SCAN SAID "38 INSTRUMENTS NOT WIRED INTO THE ROUNDHOUSE" AND IT WAS WRONG. *** It substring-
// matched instrument IDs against devices.mjs, so `lbm-fluid` did not match the device `lbm` and eleven others
// missed the same way. FIFTY-ONE DEVICES ARE REGISTERED against 52 instruments -- the roundhouse was never the
// gap. I nearly proposed a 38-item sweep to build things that already existed.
//
// THE REAL GAP WAS A DECLARATION ONE: 42 instruments recorded NO `device` field at all, even where a device of
// the same name was sitting in the registry. THE INSTRUMENT KNEW ITS ANSWER KEY AND NOT ITS APPARATUS -- which
// is this project's signature defect (two declarations about one thing that nobody compared) in the place where
// it decides whether the agent can route to a verifier.
//
// ELEVEN WIRED THIS ROUND, AND ONLY WHERE THE MAPPING WAS UNAMBIGUOUS: the instrument's own id, hyphens
// stripped, IS a registered device name. Anything needing a judgement was left alone -- `lbm-fluid` -> `lbm`
// is probably right and PROBABLY IS NOT A REASON TO WRITE IT DOWN AS FACT.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { INSTRUMENTS } = await import(pathToFileURL(path.join(ROOT, "physics", "instruments.mjs")).href);
const { DEVICE_NAMES, getDevice } = await import(pathToFileURL(path.join(ROOT, "tools", "roundhouse", "devices.mjs")).href);
const known = new Set(DEVICE_NAMES);
const named = INSTRUMENTS.filter((i) => i.device);

{
    const bad = named.filter((i) => !known.has(i.device));
    ok("!! *** every instrument that names a device names one that EXISTS ***",
        bad.length === 0,
        named.length + " of " + INSTRUMENTS.length + " instruments name a device, against " + DEVICE_NAMES.length +
        " registered. A NAME THAT RESOLVES TO NOTHING would send the roundhouse looking for apparatus that is not " +
        "there -- and it would fail at ROUTING TIME, in an agent run, not here" +
        (bad.length ? ". MISSING: " + bad.map((i) => i.id + " -> " + i.device).join(", ") : ""));

    // DRIVEN, NOT READ: getDevice() must actually return something for each named device. A name present in
    // DEVICE_NAMES but absent from the factory would pass a set check and fail on use.
    const unbuildable = named.filter((i) => { try { return !getDevice(i.device); } catch { return true; } });
    ok("!! ...and getDevice() returns something for each of them",
        unbuildable.length === 0,
        "a name in DEVICE_NAMES that the factory cannot build WOULD PASS A SET CHECK AND FAIL ON USE" +
        (unbuildable.length ? ". UNBUILDABLE: " + unbuildable.map((i) => i.device).join(", ") : ""));
}
{
    const RATCHET = 21;   // v3330 -- MEASURED after wiring eleven. MAY GROW, MAY NEVER SHRINK.
    ok("!! *** the count of instruments naming their apparatus has not fallen ***",
        named.length >= RATCHET,
        named.length + " naming a device, baseline " + RATCHET + ". Was 10 before this round. THE REMAINING " +
        (INSTRUMENTS.length - named.length) + " ARE NOT NECESSARILY UNWIRED -- they simply do not record which " +
        "device they use, and several map to an existing one by a name that needs a judgement rather than a " +
        "string match. THAT JUDGEMENT IS KEITH'S, per instrument");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM: that the 31 without a `device` field have no apparatus. Some run");
console.log("  ----  their own loop and answer to a gate directly. The field records WHICH device the roundhouse");
console.log("  ----  should route to, and its absence is a missing declaration -- not proof of a missing device.");
if (fails) { console.log("instrumentDevice-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("instrumentDevice-selfcheck: all checks pass");
