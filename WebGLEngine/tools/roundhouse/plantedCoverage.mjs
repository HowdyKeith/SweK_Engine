// WebGLEngine/tools/roundhouse/plantedCoverage.mjs -- v3391
//
// *** HOW MANY OF THE LAB'S BINDS CAN BE ASKED WHAT THEY WOULD CATCH? DERIVED, NOT REMEMBERED. ***
//
// v2893 built plantedError.mjs on the observation that a check which has never failed has never demonstrated it
// CAN, and that every tolerance in this tree was chosen by looking at where the measurement landed. The answer
// it proposed is a PLANTED ERROR: swap a physics knob for a plausible wrong one and ask the gate its ordinary
// question. Thirteen binds took up the convention, one at a time, over some hundreds of versions.
//
// NOBODY COULD SAY HOW MANY. The number reached me as "27 of 63 binds", and 27 is not a figure this tree can
// produce about itself -- there was no census. THAT IS THE DEFECT THIS FILE FIXES, and the fix is the one this
// project keeps arriving at: DERIVE THE NUMBER, so it cannot be stale and cannot be argued about.
//
// *** THE OBVIOUS IMPLEMENTATION IS A KEYWORD SCAN AND THE KEYWORD PROBE HAS MISLED THIS PROJECT THREE TIMES. ***
// So two rules:
//
//   READ CODE, NOT PROSE. Every bind here is heavily commented and several DISCUSS planted errors without
//   having one. Matching is done through codeOnly(), which strips comments AND strings, so a bind that only
//   talks about the convention cannot be counted as following it. The sabotage in the gate proves that.
//
//   A DECLARATION IS NOT A CAPABILITY. Reading `planted` off a config proves the identifier exists; it does not
//   prove the knob MOVES ANYTHING. v3081 learned this the expensive way when lens echoed its own input back and
//   a liveness check read 107% movement on a device that was ignoring its config. So every candidate is RUN --
//   nominal against planted, every declared mode -- and a mode counts only if a finite numeric observable
//   actually changes.
//
// WHAT THE RESULT IS FOR. Not a score. The uncovered list is the useful half: it is the set of devices whose
// green tells you nothing about what they would have caught, and it is printed by name so somebody can pick one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { codeOnly } from "../ship/sourceScan.mjs";

/** Which registry rows this file can see, and -- just as important -- which it cannot. */
export function parseRegistry(engRoot) {
    const src = fs.readFileSync(path.join(engRoot, "tools", "roundhouse", "devices.mjs"), "utf8");
    const varToFile = {};
    for (const m of src.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*["']\.\/([\w.]+?)\.mjs["']/g)) varToFile[m[1]] = m[2];
    const rows = [];
    // `async` OPTIONAL. v3382 found deviceInstrumentMap reading 44 of 57 rows because its copy of this regex
    // required it -- a subset that looked like a corpus, inside the gate built to stop registries drifting.
    for (const m of src.matchAll(/(\w+)\s*:\s*(?:async\s*)?\(\)\s*=>\s*(\w+)\s*,/g)) {
        const file = varToFile[m[2]];
        if (file) rows.push({ name: m[1], file });
    }
    return rows;
}

/** Does this bind READ a planted knob -- in code, with comments and strings removed? */
export function readsPlantedKnob(engRoot, file) {
    const p = path.join(engRoot, "tools", "roundhouse", file + ".mjs");
    if (!fs.existsSync(p)) return null;
    return /\bplanted\b/.test(codeOnly(fs.readFileSync(p, "utf8")));
}

/**
 * *** THE FOURTH PLANT SHAPE: A MODE, NOT A KNOB. *** Several binds carry their deliberate wrong method as a
 * MODE you select rather than a flag you set -- gyroscope's "sabotage" points the torque ALONG the spin axis
 * instead of across it, which its own header calls THE LOAD-BEARING NEGATIVE. readsPlantedKnob cannot see any of
 * them, so they counted as undeclared, and a grep for mode names would be a MENTION TEST -- exactly the
 * distinction this whole file exists to refuse.
 *
 * SO IT IS A DECLARATION, AND IT MUST SAY WHAT IT FLIPS. A mode plant cannot be verified the way a knob is:
 * building two DIFFERENT modes trivially produces different numbers, so "something moved" proves nothing here.
 * The bind names the observable the plant is supposed to overturn (plantFlips), and the sweep checks THAT ONE
 * changes. gyroscope declares `precessed`, which goes 1 -> 0: A BINARY THE CLAIM RESTS ON, in the same class as
 * the integer rank v3687 chose for the LAPACK key.
 */
export function declaredPlantMode(device) {
    if (!device || typeof device.plantMode !== "string" || typeof device.plantFlips !== "string") return null;
    if (!(device.modes || []).includes(device.plantMode)) return null;   // a mode that does not exist is not a plant
    return { mode: device.plantMode, flips: device.plantFlips };
}

/** Build the plant mode against the primary mode and require the DECLARED observable to change. */
export async function probeModePlant(device) {
    const d = declaredPlantMode(device);
    if (!d) return null;
    const primary = (device.modes || []).find((m) => m !== d.mode);
    if (!primary) return { ok: false, why: "no other mode to compare against" };
    let a, b;
    try { a = await device.build({ mode: primary }); b = await device.build({ mode: d.mode }); }
    catch (e) { return { ok: false, why: "build threw: " + (e && e.message || e) }; }
    const av = a && a[d.flips], bv = b && b[d.flips];
    if (typeof av !== "number" || typeof bv !== "number" || !Number.isFinite(av) || !Number.isFinite(bv)) {
        return { ok: false, why: "declared observable " + d.flips + " is not a finite number in both modes" };
    }
    return { ok: av !== bv, mode: d.mode, flips: d.flips, from: av, to: bv,
             why: av !== bv ? "" : d.flips + " did not move (" + av + " both ways)" };
}

/**
 * *** A POSITIVE CONTROL IS NOT A PLANT, AND THE PHRASE THAT FINDS ONE FINDS THE OTHER. *** Hunting mode-shaped
 * plants after v3688, the search turned up heidler's "exact" mode carrying the SAME WORDS as gyroscope's
 * sabotage -- "THE LOAD-BEARING NEGATIVE" -- and they are opposite objects. gyroscope's sabotage runs the WRONG
 * METHOD and the claim FAILS: precessed goes 1 -> 0. heidler's exact runs the IDEAL normalisation and the claim
 * becomes PERFECT: peakErrFrac goes 0.0667 -> 0, which is there to prove the APPARATUS so that the 5% the other
 * mode reports belongs to the published formula rather than to our arithmetic.
 *
 * DECLARING THAT AS A PLANT WOULD HAVE COUNTED A CONTROL AS COVERAGE -- the manufacturing-coverage failure this
 * census exists to prevent, arriving through the very phrase used to look for candidates. TWO THINGS WEARING
 * ONE LABEL, this tree's most repeated shape.
 *
 * THE DISCRIMINATOR IS DIRECTION AND IT IS MECHANICAL: a plant moves the claim's observable AWAY from its ideal;
 * a control moves it TO the ideal. So controls are declared separately, verified separately, and REPORTED
 * SEPARATELY -- they are never added to the plant count, because a subject with a good control and no plant has
 * not been shown to catch anything.
 */
export function declaredControlMode(device) {
    if (!device || typeof device.controlMode !== "string" || typeof device.controlPerfects !== "string") return null;
    if (typeof device.controlIdeal !== "number") return null;
    if (!(device.modes || []).includes(device.controlMode)) return null;
    return { mode: device.controlMode, perfects: device.controlPerfects, ideal: device.controlIdeal };
}

/** Build the control mode against the primary and require the named observable to REACH its stated ideal. */
export async function probeControlMode(device) {
    const d = declaredControlMode(device);
    if (!d) return null;
    const primary = (device.modes || []).find((m) => m !== d.mode);
    if (!primary) return { ok: false, why: "no other mode to compare against" };
    let a, b;
    try { a = await device.build({ mode: primary }); b = await device.build({ mode: d.mode }); }
    catch (e) { return { ok: false, why: "build threw: " + (e && e.message || e) }; }
    const av = a && a[d.perfects], bv = b && b[d.perfects];
    if (typeof av !== "number" || typeof bv !== "number" || !Number.isFinite(av) || !Number.isFinite(bv)) {
        return { ok: false, why: "declared observable " + d.perfects + " is not a finite number in both modes" };
    }
    // It must REACH the ideal and START AWAY FROM IT: a control whose observable was already ideal proves nothing.
    const reached = Math.abs(bv - d.ideal) <= 1e-12 * Math.max(1, Math.abs(d.ideal));
    const moved = Math.abs(av - d.ideal) > Math.abs(bv - d.ideal);
    return { ok: reached && moved, mode: d.mode, perfects: d.perfects, from: av, to: bv, ideal: d.ideal,
             why: reached ? (moved ? "" : d.perfects + " was already at the ideal in the primary mode -- proves nothing")
                          : d.perfects + " did not reach " + d.ideal + " (got " + bv + ")" };
}

/** Run one device nominal against planted and report WHICH modes actually move. */
export async function probeLiveness(device) {
    const live = [], inert = [], broke = [];
    for (const mode of device.modes || []) {
        let a, b;
        // *** v3685 -- THE KNOB IS SPELLED TWO WAYS AND THIS SWEEP ONLY TURNED ONE OF THEM. *** It set
        // `config: { planted: true }`, which is what most binds read -- but freeRotationBind's signature is
        // `build({ mode, config = {}, planted = false })`, where planted is a SIBLING of config, not a key
        // inside it. So the sweep built NOMINAL TWICE, saw nothing move, and reported a LIVE plant as
        // "DECLARED BUT DEAD". MEASURED DIRECTLY: with the knob in the right place that plant moves
        // sigmaMeasured/sigmaRelErr/sigmaR2 in stability, driftE/driftL/driftWorldL/flips in conserve, and
        // driftWorldL/attitudeOrder in attitude. It deletes the whole gyroscopic term; of course it moves.
        //
        // A FALSE NEGATIVE HERE IS THE EXPENSIVE DIRECTION: it sends somebody to repair a plant that already
        // works, and it understates the one number this file exists to report. BOTH SPELLINGS ARE NOW TURNED,
        // because this is a CENSUS OVER HETEROGENEOUS BINDS and its job is to exercise the knob HOWEVER THE
        // BIND SPELLS IT -- not to make 79 devices agree on a parameter shape, which is a different round and
        // a much larger one. A bind that stays inert under BOTH is genuinely dead, which is what the report
        // now means.
        try { a = await device.build({ mode }); b = await device.build({ mode, planted: true, config: { planted: true } }); }
        catch { broke.push(mode); continue; }
        const keys = Object.keys(a).filter((k) => typeof a[k] === "number" && Number.isFinite(a[k]));
        const moved = keys.filter((k) => a[k] !== b[k]);
        (moved.length ? live : inert).push({ mode, moved: moved.length, of: keys.length });
    }
    return { live, inert, broke };
}

/**
 * v3416 -- THE DECLARED CENSUS, SPLIT OUT SO THIS FILE CAN HAVE A FRONT DOOR.
 *
 * *** THE FULL CENSUS BELOW IS A SWEEP, NOT A REPORT: it BUILDS every device at every mode, twice, and takes
 * around a minute and a half. v3395 learned what that costs at a front door -- capabilityCard ran this and blew
 * toolFrontDoor's budget (every reporting tool runs TWICE at 120s each) and turned a green gate red. *** The
 * answer there was to make the NAME carry the caveat, and it is the answer here too. This function reads SOURCE
 * ONLY: it says which binds DECLARE a planted knob, and it is silent about whether the knob moves anything.
 *
 * SO THE TWO NUMBERS ARE DIFFERENT CLAIMS AND ARE NEVER PRINTED AS ONE. `declared` is what a bind says about
 * itself; `verified` is what it does when you turn the knob -- and v3081's lens is exactly why the difference is
 * not academic: a device echoed its own config back and read 107% movement while ignoring it. The declared
 * number is an UPPER BOUND on the verified one, and the CLI says so where the number is read.
 */
export function declaredCensus(engRoot, DEVICE_NAMES = []) {
    const rows = parseRegistry(engRoot);
    const unparsed = DEVICE_NAMES.filter((n) => !rows.some((r) => r.name === n));
    const declared = [], undeclared = [], missingFile = [];
    for (const row of rows) {
        const reads = readsPlantedKnob(engRoot, row.file);
        if (reads === null) missingFile.push(row.name);
        else if (reads) declared.push(row.name);
        else undeclared.push(row.name);
    }
    return { parsed: rows.length, registered: DEVICE_NAMES.length, unparsed, missingFile, declared, undeclared };
}

/**
 * The census. Returns the covered and uncovered sets BY NAME, the modes actually exercised, and the registry
 * rows this file could not parse -- which are reported as UNPARSED and never silently folded into "uncovered".
 */
export async function plantedCoverage(engRoot, { DEVICE_NAMES, getDevice }) {
    const rows = parseRegistry(engRoot);
    const unparsed = DEVICE_NAMES.filter((n) => !rows.some((r) => r.name === n));
    const covered = [], uncovered = [], declaredButDead = [], missingFile = [], modePlants = [], controls = [], brokenControls = [];
    let modesLive = 0, modesTotal = 0;

    for (const row of rows) {
        const reads = readsPlantedKnob(engRoot, row.file);
        if (reads === null) { missingFile.push(row.name); continue; }
        let device = null;
        try { device = await getDevice(row.name); } catch { device = null; }
        // v3688 -- A MODE PLANT COUNTS, AND IT IS VERIFIED ON ITS OWN TERMS: the declared observable must flip.
        // It is checked BEFORE the knob path so a bind carrying both is not double-counted, and its result is
        // kept in modePlants rather than added to the knob totals -- THEY ARE NOT THE SAME EVIDENCE, which is
        // the rule this file already applies to knob-versus-reader.
        // v3690 -- controls are probed too, and kept OUT of the plant accounting on purpose: a subject with a
        // good control and no plant has not been shown to CATCH anything.
        const cm = device ? await probeControlMode(device) : null;
        if (cm) (cm.ok ? controls : brokenControls).push(cm.ok
            ? { name: row.name, mode: cm.mode, perfects: cm.perfects, from: cm.from, to: cm.to }
            : row.name + " (control: " + cm.why + ")");
        const mp = device ? await probeModePlant(device) : null;
        if (mp) {
            (mp.ok ? modePlants : declaredButDead).push(mp.ok
                ? { name: row.name, mode: mp.mode, flips: mp.flips, from: mp.from, to: mp.to }
                : row.name + " (mode plant: " + mp.why + ")");
            if (mp.ok) { covered.push({ name: row.name, live: [mp.mode], inert: [], plantKind: "mode" }); continue; }
            continue;
        }
        if (!reads) { uncovered.push(row.name); continue; }
        if (!device) { declaredButDead.push(row.name + " (unloadable)"); continue; }
        const r = await probeLiveness(device);
        modesLive += r.live.length;
        modesTotal += r.live.length + r.inert.length;
        if (r.live.length === 0) declaredButDead.push(row.name);
        else covered.push({ name: row.name, live: r.live.map((x) => x.mode), inert: r.inert.map((x) => x.mode),
            // v3393 -- KNOB vs READER. A knob plant perturbs a physics input and lets the whole path from knob
            // to observable be graded (plantedError.mjs's second design rule); a reader plant substitutes the
            // MEASUREMENT because the failure being reproduced has no input that produces it. Both are useful
            // and THEY ARE NOT THE SAME EVIDENCE, so the census keeps them apart instead of adding them up.
            // It CANNOT be derived -- from outside both are "a config key goes in and numbers change" -- so it
            // is DECLARED, and a bind that has not said reads `undeclared` rather than being assumed a knob.
            plantKind: device.plantKind || "undeclared" });
    }
    return {
        parsed: rows.length, registered: DEVICE_NAMES.length, unparsed, missingFile,
        covered, uncovered, declaredButDead, modesLive, modesTotal, modePlants, controls, brokenControls,
        byKind: covered.reduce((m, c) => { m[c.plantKind] = (m[c.plantKind] || 0) + 1; return m; }, {}),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// v3416 -- THE FRONT DOOR. `node tools/roundhouse/plantedCoverage.mjs` PRINTED NOTHING AND EXITED 0 for
// twenty-five versions, which is the shape this tree named at v3201 and never fixed here: AN EMPTY REPORT AND A
// TOOL THAT NEVER RAN ARE INDISTINGUISHABLE FROM A SHELL, and exit 0 with no output READS AS A CLEAN BILL.
// Its only callers were its own selfcheck and capabilityCard.
//
// *** THE DEFAULT IS THE CHEAP CENSUS, AND THAT IS THE WHOLE DESIGN DECISION. *** The verified sweep is ~90s and
// a reporting tool that slow cannot sit on a page (v3395). So the default is DECLARED -- source only, instant,
// page-safe -- and the verified sweep is `--verify`, NAMED IN THE OUTPUT so nobody reads the fast number as the
// strong one. A REPORT MUST PRINT AND EXIT ZERO; this exits 0 on both paths, because a census is not a verdict.
// ---------------------------------------------------------------------------------------------------------------
async function main() {
    const engRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
    const verify = process.argv.includes("--verify");
    const D = await import("./devices.mjs");
    console.log("[plantedCoverage] which of the lab's binds can be asked what they would catch\n");

    if (!verify) {
        const c = declaredCensus(engRoot, D.DEVICE_NAMES);
        console.log(`  DECLARED   ${c.declared.length} of ${c.parsed} parsed binds read a planted knob (registry has ${c.registered})`);
        console.log("  THIS IS AN UPPER BOUND, NOT A MEASUREMENT: it says a bind MENTIONS the knob in code, not that the knob");
        console.log("  moves an observable. Run with --verify for the sweep that turns each knob and watches (~90s).\n");
        console.log("  UNDECLARED -- the list worth working, one at a time:");
        for (const n of c.undeclared) console.log("    " + n);
        if (c.unparsed.length) console.log("\n  UNPARSED (registered but this file could not read the row): " + c.unparsed.join(", "));
        if (c.missingFile.length) console.log("  MISSING FILE: " + c.missingFile.join(", "));
        return 0;
    }

    const r = await plantedCoverage(engRoot, D);
    console.log(`  VERIFIED   ${r.covered.length} of ${r.parsed} binds have a planted knob that MOVES a finite observable`);
    console.log(`  modes exercised: ${r.modesLive} live of ${r.modesTotal}   by kind: ${JSON.stringify(r.byKind)}\n`);
    console.log("  UNCOVERED -- the list worth working, one at a time:");
    for (const n of r.uncovered) console.log("    " + n);
    if (r.modePlants && r.modePlants.length) {
        console.log("\n  MODE PLANTS -- the plant is a MODE, and the observable it overturns is named and checked:");
        for (const m of r.modePlants) console.log("    " + m.name + "  mode=" + m.mode + "  " + m.flips + ": " + m.from + " -> " + m.to);
    }
    if (r.controls && r.controls.length) {
        console.log("\n  POSITIVE CONTROLS -- NOT counted as plants. These prove the APPARATUS: the observable reaches its ideal,");
        console.log("  which is what lets the primary mode's disappointment belong to the PHYSICS rather than to our arithmetic:");
        for (const c of r.controls) console.log("    " + c.name + "  mode=" + c.mode + "  " + c.perfects + ": " + c.from + " -> " + c.to);
    }
    if (r.brokenControls && r.brokenControls.length) console.log("\n  *** CONTROLS THAT DO NOT CONTROL: " + r.brokenControls.join(", "));
    if (r.declaredButDead.length) console.log("\n  *** DECLARED BUT DEAD -- says planted, moves nothing: " + r.declaredButDead.join(", "));
    if (r.unparsed.length) console.log("  UNPARSED: " + r.unparsed.join(", "));
    if (r.missingFile.length) console.log("  MISSING FILE: " + r.missingFile.join(", "));
    return 0;
}

// Windows path law (v2759): compare through fileURLToPath, never by string.
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main().then((c) => process.exit(c)).catch((e) => { console.error("[plantedCoverage] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
}

/**
 * *** v3917 -- THE DISCRIMINATOR WAS WRITTEN DOWN AT v3688 AND NOTHING EVER RE-DERIVED IT. ***
 *
 * The comment above declaredControlMode states the rule in as many words: "THE DISCRIMINATOR IS DIRECTION AND IT
 * IS MECHANICAL: a plant moves the claim's observable AWAY from its ideal; a control moves it TO the ideal."
 * probeControlMode encodes half of that -- it requires the control to REACH controlIdeal. probeModePlant encodes
 * none of it. It asks only `av !== bv`, WHICH IS SEPARATION, NOT WRONGNESS, and a load-bearing negative separates
 * exactly as well as a plant does.
 *
 * v3916 paid for the gap. spacefill's `raster` mode was declared a plant at v3902 because `breaks` moves 0 -> 63,
 * and probeModePlant passed it every run since. But 63 IS THE ANALYTIC KEY FOR A RASTER at order 6, breakErrAbs
 * is exactly zero in BOTH arms, and spacefill-selfcheck had been calling that same mode "the NEGATIVE" since
 * v3174. TWO PROSE CLAIMS ABOUT ONE DEVICE DISAGREED FOR FOURTEEN VERSIONS AND NOTHING COMPARED THEM.
 *
 * This applies the rule where it has meaning. When plantFlips names an ERROR-LIKE observable, "away from ideal"
 * is decidable without knowing anything else about the device: the planted arm must report a LARGER magnitude.
 * When plantFlips names something else -- `breaks`, `order`, `netForce`, `r2Val` -- there is no ideal in evidence
 * and the direction cannot be read, so this reports UNREADABLE rather than inventing a verdict. Those two
 * populations are the point and they are not merged: see plantDirection-selfcheck, which walls the first at zero
 * failures and ratchets the second so it cannot grow.
 */
export const ERRORISH_FIELD = /err|error|residual|delta|deviation/i;

/** Magnitudes of every finite numeric error-like field on an observable bag. */
export function errorLikeFields(obs) {
    const m = new Map();
    for (const [k, v] of Object.entries(obs || {})) {
        if (!ERRORISH_FIELD.test(k)) continue;
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        m.set(k, Math.abs(v));
    }
    return m;
}

/**
 * Build a declared mode plant's two arms and read the DIRECTION of its named observable.
 *
 * verdict is one of:
 *   "worse"      -- plantFlips is error-like and grew. The declaration is confirmed mechanically.
 *   "better"     -- plantFlips is error-like and SHRANK. That is a control wearing a plant's label.
 *   "unmoved"    -- plantFlips is error-like and did not move at all. Not a plant either.
 *   "unreadable" -- plantFlips is not error-like, so no ideal is in evidence. NOT a pass and NOT a failure.
 */
export async function probeModePlantDirection(device) {
    const d = declaredPlantMode(device);
    if (!d) return null;
    const primary = (device.modes || []).find((m) => m !== d.mode);
    if (!primary) return { verdict: "unreadable", why: "no other mode to compare against" };
    let a, b;
    try { a = await device.build({ mode: primary }); b = await device.build({ mode: d.mode }); }
    catch (e) { return { verdict: "unreadable", why: "build threw: " + (e && e.message || e) }; }

    const base = { mode: d.mode, flips: d.flips, primary };
    if (!ERRORISH_FIELD.test(d.flips)) {
        // The side channel is reported but NEVER promoted to a verdict: an unrelated error field getting worse
        // does not show that THIS declaration is a plant, only that the two arms differ somewhere.
        const ea = errorLikeFields(a), eb = errorLikeFields(b);
        const shared = [...ea.keys()].filter((k) => eb.has(k));
        const worse = shared.filter((k) => eb.get(k) > ea.get(k));
        return { ...base, verdict: "unreadable", sideErrorFields: shared.length, sideWorse: worse,
                 why: d.flips + " is not error-like, so 'away from ideal' has no reading here" };
    }
    const av = Math.abs(a && a[d.flips]), bv = Math.abs(b && b[d.flips]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) {
        return { ...base, verdict: "unreadable", why: d.flips + " is not a finite number in both modes" };
    }
    const verdict = bv > av ? "worse" : bv < av ? "better" : "unmoved";
    return { ...base, verdict, from: av, to: bv,
             why: verdict === "worse" ? "" : d.flips + " went " + av.toExponential(3) + " -> " + bv.toExponential(3) +
                  (verdict === "better" ? ", TOWARD its ideal -- that is a control's direction" : " (no movement)") };
}

/** Sweep every declared mode plant in a device registry and split it by whether direction is readable. */
export async function plantDirectionCensus(D) {
    const readable = [], unreadable = [], wrongWay = [];
    for (const name of D.DEVICE_NAMES) {
        let dev; try { dev = await D.getDevice(name); } catch { continue; }
        const r = await probeModePlantDirection(dev);
        if (!r) continue;
        const row = { device: name, ...r };
        if (r.verdict === "unreadable") unreadable.push(row);
        else if (r.verdict === "worse") readable.push(row);
        else { readable.push(row); wrongWay.push(row); }
    }
    return { readable, unreadable, wrongWay, total: readable.length + unreadable.length };
}
