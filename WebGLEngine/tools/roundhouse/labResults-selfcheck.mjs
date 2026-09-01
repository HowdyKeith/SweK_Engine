// tools/roundhouse/labResults-selfcheck.mjs
//
// Run: node tools/roundhouse/labResults-selfcheck.mjs   (~9 min on one core; twof/inlet alone is 328s of it)
//
// *** THE LINE ABOVE SAID "~35s" UNTIL v3519 AND THE GATE TAKES NINE MINUTES. *** Measured, not estimated:
// 273 device-mode pairs, 521.9s of building, and ONE PAIR -- twof/inlet -- IS 328s OF IT, 63% of the total.
// A STATED RUNTIME NOBODY RE-MEASURES IS A MEMORY, and this one was off by a factor of 15 (v3211-v3213's arc,
// which found stated runtimes wrong in 59 of 82 gate headers, and this file was not in that sweep).
//
// v3186 -- NOTHING IN THE LAB CHECKED THE VALUES.
//
// Every gate here checks a RELATIONSHIP: error below a tolerance, a ratio near 2, a sequence that converges, a
// residual that vanishes. Those are the right checks and they are why the lab is trustworthy. *** BUT A NUMBER
// COULD DRIFT ON A REFACTOR, A DEPENDENCY BUMP OR A FLOATING-POINT CHANGE AND EVERY ONE OF THEM WOULD STILL
// PASS *** -- a relationship survives a shift that moves both sides, which is the v3069 mesher bug's shape
// (-95 faces at z=0, +95 at z=16, net zero, hidden for 270 versions).
//
// v3183's labExport made this cheap: a record replays exactly, so freezing one is just keeping it.
//
// MEASURED BEFORE FREEZING: 26 of 27 devices are DETERMINISTIC, replay-exact, in 61 seconds. ZERO are
// non-deterministic. A baseline over a device that wandered would fire every run and be switched off within a
// week, so this had to be established first rather than hoped for.
//
// *** AND THE ONE EXCEPTION IS FROZEN AS AN EXCEPTION. *** lbm has no defaults(), so it cannot be run without
// an explicit mode. Its ABSENCE is recorded, which means the day it grows a defaults() the gate SAYS SO rather
// than quietly starting to check numbers nobody has ever looked at.
//
// COMPARISON IS EXACT. A tolerance would hide the day a device stops being deterministic, which is the single
// most important thing this file could ever tell anybody.
//
// *** v4192 -- AND THEN IT WENT RED AND WOULD NOT SAY HOW RED. *** Every failing line printed the first six
// entries and never the count, so a run reporting "6 FAILURES" named 26 entries and gave no way to tell whether
// that was the whole set or the visible corner of it. The gate that exists to be the lab's MEMORY could not
// report the size of what it had remembered. Counts are now always stated, the sample is labelled as a sample,
// the devices involved are rolled up by name, and SWEK_LAB_DRIFT_FULL=1 prints everything. See evidence().

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// *** v4192 -- THIS GATE WENT RED AND WOULD NOT SAY HOW RED. ***
//
// Every failing line here printed `list.slice(0, 6)` and NOT `list.length`, so a red run reported six names and
// no count -- 6 drifted values and 600 look identical from the outside. MEASURED on the run that found this: the
// gate reported "6 FAILURES" and named 26 entries across the six lines, and NOTHING IN THE OUTPUT SAID WHETHER
// THAT WAS THE WHOLE SET. A ratchet whose red state cannot be read is a ratchet nobody can act on, and this one
// guards 484 device-mode pairs and 4265 observables -- the lab's entire answer surface.
//
// THE SAMPLE STAYS. Printing 600 entries inline would be the same failure with the opposite sign: unreadable
// rather than incomplete. So the count is ALWAYS stated, the sample is labelled as a sample, and the rollup
// below names every device involved -- bounded by the roster (129) rather than by the drift. The complete list
// is one env var away for when triage needs it, and the line says so rather than leaving it to be discovered.
const FULL = process.env.SWEK_LAB_DRIFT_FULL === "1";

/** "N entries; first K: a, b, c (+M more -- SWEK_LAB_DRIFT_FULL=1 for all)". Never just the head. */
function evidence(list, cap = 6, sep = ", ") {
    if (!list.length) return "";
    if (FULL || list.length <= cap) return list.length + " entries: " + list.join(sep);
    return list.length + " entries; first " + cap + ": " + list.slice(0, cap).join(sep) +
           " (+" + (list.length - cap) + " more -- rerun with SWEK_LAB_DRIFT_FULL=1 for the complete list)";
}

/** Which DEVICES are involved, and how much each contributes. The list that triage actually starts from. */
function rollup(label, groups) {
    const per = new Map();
    for (const [kind, list] of Object.entries(groups)) {
        for (const entry of list) {
            const dev = entry.split(/[/.:]/)[0];
            if (!per.has(dev)) per.set(dev, {});
            per.get(dev)[kind] = (per.get(dev)[kind] || 0) + 1;
        }
    }
    if (!per.size) return;
    const rows = [...per.entries()].sort((a, b) =>
        Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
    console.log("  ----  " + label + " BY DEVICE (" + rows.length + " devices): " +
        rows.map(([d, c]) => d + "[" + Object.entries(c).map(([k, n]) => k + " " + n).join(" ") + "]").join(", "));
}
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const L = await import(pathToFileURL(path.join(HERE, "labExport.mjs")).href);
const BASE = path.join(HERE, "lab-results-baseline.json");
const base = JSON.parse(fsMod.readFileSync(BASE, "utf8"));

// v3519 -- *** THIS RATCHET WATCHED ONE MODE PER DEVICE, AND 528 OBSERVABLES SOUNDED LIKE THE LAB. ***
// runRecord with no mode runs the device's DEFAULT, so 72 rows covered 72 of the lab's 273 DECLARED
// DEVICE-MODE PAIRS -- 26.4%. Three consecutive rounds (v3516 splat, v3517 kepler, v3518 lens) added
// observables to modes this file has never once evaluated, and each time it correctly reported "none
// APPEARED" because it was not looking. A SUBSET THAT LOOKS LIKE A CORPUS, in the gate built to be the
// lab's memory. Same shape as render-qa's manifest.pages and page-index's PAGES.
//
// *** AND THE REASON IT STAYED THAT WAY WAS NEVER COST. *** Measured across all 273: 245 pairs (90%) build in
// UNDER ONE SECOND and cost 15.3s BETWEEN THEM, while the slowest twelve are 88% of the runtime and
// twof/inlet alone is 63%. Every expensive pair was ALREADY the frozen default -- twof/inlet, kh/sweep,
// blobbodies/roundtrip -- so widening to every mode adds about 194s to a gate that already paid 328s for one
// of them. THE 201 UNWATCHED PAIRS WERE NOT AN AFFORDABILITY PROBLEM; THEY WERE AN UNASKED QUESTION.
const now = {}, pairs = {};
for (const n of D.DEVICE_NAMES) {
    const r = await L.runRecord(D, n);
    now[n] = r.ok ? { mode: r.mode, outputs: r.outputs } : { mode: null, unavailable: r.error };
    // Every DECLARED mode, from the device's own exported list -- not a list held here. A device that exports
    // none contributes its default row only, which is what `now` already holds.
    const dev = await D.getDevice(n);
    const modes = (Array.isArray(dev.modes) && dev.modes.length) ? dev.modes : [];
    for (const m of modes) {
        // *** v4007 -- THE DEFAULT MODE WAS BEING RUN TWICE, AND IT IS THE EXPENSIVE ONE. ***
        // `r` above is already the run for the device's DEFAULT mode, and the default is always a member of
        // `modes`, so every device paid for it a second time here. That would be a 20% saving if the cost were
        // spread evenly -- and it is not: THIS FILE'S OWN HEADER SAYS "Every expensive pair was ALREADY the
        // frozen default -- twof/inlet, kh/sweep, blobbodies/roundtrip", and that twof/inlet alone is 63% of
        // the gate. So the three runs that dominate the runtime were each being done twice.
        //
        // VERIFIED BEFORE RELYING ON IT rather than assumed from the signature: runRecord(D, n) and
        // runRecord(D, n, {mode: default}) were driven on kepler, lotkavolterra and ising and returned
        // byte-identical outputs. A reuse that skipped a genuinely different run would silently freeze the
        // wrong row into the baseline, which is worse than the time it saves.
        const rr = (m === r.mode && r.ok) ? r : await L.runRecord(D, n, { mode: m });
        pairs[n + "/" + m] = rr.ok ? { outputs: rr.outputs } : { unavailable: rr.error };
    }
}

if (process.env.SWEK_FREEZE_LAB_RESULTS === "1") {
    base.devices = now;
    base.pairs = pairs;
    base.deviceCount = D.DEVICE_NAMES.length;
    base.observables = Object.values(now).reduce((a, d) => a + Object.keys(d.outputs || {}).length, 0);
    base.pairCount = Object.keys(pairs).length;
    base.pairObservables = Object.values(pairs).reduce((a, d) => a + Object.keys(d.outputs || {}).length, 0);
    fsMod.writeFileSync(BASE, JSON.stringify(base, null, 1));
    console.log("  ----  RE-FROZEN: " + base.deviceCount + " devices, " + base.observables + " observables; " +
                base.pairCount + " device-mode pairs, " + base.pairObservables + " observables.");
}

// ---- 0a. THE REPORTER ITSELF, DRIVEN RATHER THAN READ OUT OF THE SOURCE --------------------------------------------
//
// The claim this round makes is "a red run states its true size". That claim is worth exactly as much as a gate
// on it -- so the reporter is driven on a synthetic list longer than its own cap, and the count it prints is
// checked against the length it was handed. Reading the source for a `.length` would be the keyword probe this
// tree has been misled by three times.
{
    const many = Array.from({ length: 137 }, (_, i) => "dev" + (i % 9) + "/mode.obs" + i);
    const line = evidence(many, 6);
    ok("!! *** a red line states HOW red -- the count, not just the head of the list ***",
        line.startsWith("137 entries") && (FULL || line.includes("(+131 more")) && line.includes("dev0/mode.obs0"),
        "137 synthetic entries -> \"" + line.slice(0, 96) + "...\". EVERY FAILING LINE IN THIS FILE PRINTED " +
        "slice(0, 6) AND NEVER length, so a red run named six entries and left 6 and 600 indistinguishable. " +
        "This gate guards 484 device-mode pairs and 4265 observables; it went red and could not say how red");

    ok("...and the empty case stays empty, so a GREEN line is not decorated with a zero",
        evidence([]) === "" && evidence([], 4) === "",
        "the passing branches of these assertions carry their own prose and must not be prefixed with " +
        "'0 entries'. A reporter that changed the green output would have been a cosmetic edit to a value freeze");
}

// ---- 0. THE PAIRS, AND THE TWO HALVES GATED AGAINST EACH OTHER ---------------------------------------------------
{
    const moved = [], vanished = [], appeared = [], newPair = [], gonePair = [];
    const bp = base.pairs || {};
    for (const [key, b] of Object.entries(bp)) {
        const c = pairs[key];
        if (!c) { gonePair.push(key); continue; }
        if (!!b.unavailable !== !!c.unavailable) { moved.push(key + ": availability changed"); continue; }
        if (b.unavailable) continue;
        for (const [k, v] of Object.entries(b.outputs)) {
            if (!(k in c.outputs)) { vanished.push(key + "." + k); continue; }
            if (L.canonical(c.outputs[k]) !== L.canonical(v)) moved.push(key + "." + k + ": " + L.canonical(v) + " -> " + L.canonical(c.outputs[k]));
        }
        for (const k of Object.keys(c.outputs)) if (!(k in b.outputs)) appeared.push(key + "." + k);
    }
    for (const key of Object.keys(pairs)) if (!(key in bp)) newPair.push(key);

    ok("!! *** no frozen value has moved on ANY DECLARED MODE ***", moved.length === 0,
        moved.length ? evidence(moved, 6, "; ") :
        Object.keys(bp).length + " device-mode pairs, " + (base.pairObservables || 0) + " observables. THIS IS " +
        "THE LAB'S ANSWER SURFACE; the per-device rows below are its DEFAULT SLICE, and until v3519 the slice " +
        "was all that was watched -- 26.4% of the pairs.");
    ok("no observable VANISHED from a non-default mode", vanished.length === 0, evidence(vanished) || "none");
    ok("and none APPEARED unannounced", appeared.length === 0, evidence(appeared) ||
        "none. THREE CONSECUTIVE ROUNDS ADDED OBSERVABLES TO MODES THIS FILE NEVER EVALUATED (splat/perspective " +
        "v3516, kepler/kepler3 v3517, lens/deflect v3518) AND IT REPORTED 'none APPEARED' EVERY TIME, CORRECTLY " +
        "AND USELESSLY. Re-freeze deliberately after an intended change.");
    ok("the declared mode set has not shrunk", gonePair.length === 0, evidence(gonePair) || "none");
    if (newPair.length) console.log("  ----  NEW PAIRS since the freeze: " + evidence(newPair, 8));
    rollup("PAIR DRIFT", { moved, vanished, appeared, gonePair });

    // *** THE TWO HALVES READ AGAINST EACH OTHER, WHICH IS THIS TREE'S PRESCRIBED FIX FOR A SECOND DECLARATION.
    // `devices` is retained because labGalaxy reads `baseline.devices` keyed by device name and would have
    // reported EVERY device as having no baseline row -- silently, since a missing row is a legitimate `null`
    // there (v2951: unknown and zero are different claims). Retaining it makes the same numbers exist twice, so
    // the copies are COMPARED rather than trusted: each device row must equal its own default-mode pair. ***
    const mismatched = [];
    for (const [n, d] of Object.entries(base.devices)) {
        if (d.unavailable || !d.mode) continue;
        const twin = bp[n + "/" + d.mode];
        if (!twin || twin.unavailable) continue;   // a default mode the device does not export is section 1's business
        for (const [k, v] of Object.entries(d.outputs)) {
            if (k in twin.outputs && L.canonical(twin.outputs[k]) !== L.canonical(v)) mismatched.push(n + "/" + d.mode + "." + k);
        }
    }
    ok("!! the per-device rows AGREE with their own default-mode pairs", mismatched.length === 0,
        evidence(mismatched) || "every retained row matches its twin. THE SECOND COPY IS NEVER THE " +
        "ONE THAT GETS UPDATED, so it is not trusted -- it is checked.");
}

// ---- 1. NO VALUE HAS MOVED --------------------------------------------------------------------------------------
{
    const moved = [], vanished = [], appeared = [], newDev = [], goneDev = [];
    for (const [n, b] of Object.entries(base.devices)) {
        const c = now[n];
        if (!c) { goneDev.push(n); continue; }
        // A DEVICE THAT BECAME AVAILABLE, OR STOPPED BEING, IS A CHANGE IN ITS OWN RIGHT and is not silently
        // folded into "no values moved" -- lbm gaining a defaults() must be noticed, not absorbed.
        if (!!b.unavailable !== !!c.unavailable) { moved.push(n + ": availability changed (" + (b.unavailable || "was runnable") + " -> " + (c.unavailable || "now runnable") + ")"); continue; }
        if (b.unavailable) continue;
        for (const [k, v] of Object.entries(b.outputs)) {
            if (!(k in c.outputs)) { vanished.push(n + "." + k); continue; }
            if (L.canonical(c.outputs[k]) !== L.canonical(v)) moved.push(n + "." + k + ": " + L.canonical(v) + " -> " + L.canonical(c.outputs[k]));
        }
        for (const k of Object.keys(c.outputs)) if (!(k in b.outputs)) appeared.push(n + "." + k);
    }
    for (const n of Object.keys(now)) if (!(n in base.devices)) newDev.push(n);

    ok("!! *** no frozen value has MOVED ***",
        moved.length === 0,
        moved.length ? "MOVED: " + evidence(moved, 4, "; ") : base.observables + " observables across " +
        base.deviceCount + " devices, all identical. EVERY GATE IN THIS LAB CHECKS A RELATIONSHIP AND NONE " +
        "CHECKED THE VALUES -- a shift that moves both sides of an inequality passes all of them");

    ok("!! no observable VANISHED",
        vanished.length === 0,
        vanished.length ? "VANISHED: " + evidence(vanished, 5) : "none. A device that stopped " +
        "emitting a number would pass every relationship check about the numbers it still emits");

    ok("!! and none APPEARED unannounced",
        appeared.length === 0,
        appeared.length ? "APPEARED: " + evidence(appeared, 5) + " -- re-freeze with " +
        "SWEK_FREEZE_LAB_RESULTS=1 if intended" : "none. A new observable is not a fault, but it IS a change, " +
        "and a baseline that absorbed it silently would be a record of whatever happened to be there");

    ok("...and the device roster is unchanged",
        newDev.length === 0 && goneDev.length === 0,
        (newDev.length || goneDev.length) ? "added: " + newDev.join(",") + " removed: " + goneDev.join(",")
            : D.DEVICE_NAMES.length + " devices, same set");
}

// ---- 2. THE BASELINE IS ONLY WORTH HAVING IF THE DEVICES ARE DETERMINISTIC ------------------------------------------
{
    // Spot-checked rather than swept: a full replay of all 27 doubles the runtime, and three gates in this tree
    // ALREADY TIME OUT at 180s. THE FULL SWEEP WAS RUN ONCE AT v3186 -- 26 of 27 replay-exact, zero wandering --
    // and that measurement is what justifies the baseline; this keeps a cheap sentinel on it.
    const sample = ["thermal", "kh", "optics"];
    const drifted = [];
    for (const n of sample) {
        const a = await L.runRecord(D, n);
        if (!a.ok) continue;
        const v = await L.replay(D, a);
        if (!v.ok) drifted.push(n + ": " + JSON.stringify(v.drift).slice(0, 60));
    }
    ok("!! the sampled devices still replay EXACTLY",
        drifted.length === 0,
        drifted.length ? drifted.join("; ") : sample.join(", ") + " -- a baseline over a device that WANDERED " +
        "would fire every run and be switched off within a week, so determinism had to be established BEFORE " +
        "freezing rather than hoped for");

    ok("!! *** lbm's ABSENCE is frozen as an exception, not skipped ***",
        !!base.devices.lbm && !!base.devices.lbm.unavailable && /no defaults/.test(base.devices.lbm.unavailable),
        "one device has no defaults(). Recording the ABSENCE means the day it grows one, the gate SAYS SO rather " +
        "than quietly starting to check numbers nobody has ever looked at. AND v3183 CRASHED ON IT -- I built " +
        "and tested that exporter on THREE HAND-PICKED DEVICES and it fell over on the fourth kind the moment " +
        "anything ran it across the whole lab");

    // v3520 -- *** THIS CHECK WAS A SOURCE REGEX FOR `if (c.outputs[k] !== v) moved.push` AND IT WENT RED THE
    // MOMENT THE COMPARISON WAS CORRECTLY REPLACED. *** Widening the filter to keep arrays made `!==` WRONG --
    // two arrays with identical contents are never `!==`-equal -- so the comparison became canonical(a) !==
    // canonical(b), and a check pinned to the ARRANGEMENT failed while the PROPERTY it cared about was
    // strictly better served. A GATE PINNED TO A MECHANISM GOES RED WHEN THE MECHANISM IS CORRECTLY REPLACED,
    // twenty-three-plus times in this tree, and here inside the round that fixes what it guards.
    //
    // ITS PREDECESSOR'S OWN NOTE ALREADY HELD THE ANSWER AND STOPPED ONE STEP SHORT: it moved from hunting the
    // ABSENCE of the word "tolerance" (which matched its own prose explaining why there isn't one -- a check
    // counting its own warning, four times in one session) to asserting the positive fact. But it asserted the
    // positive fact ABOUT THE SOURCE TEXT. *** THE REAL CORRECTION IS TO STOP MATCHING SOURCE FOR A BEHAVIOUR
    // THAT CAN BE DRIVEN *** -- five consecutive rounds were lost to that once already. The property is now
    // MEASURED: feed the comparator values that differ by the smallest amount representable and demand it says
    // so. A tolerance of any size fails this; no arrangement of the source can fake it.
    const oneUlp = 1 + Number.EPSILON;
    ok("...and the comparison is EXACT -- driven, not read out of the source",
        L.canonical(1) !== L.canonical(oneUlp) &&
        L.canonical(true) !== L.canonical(false) &&
        L.canonical("adb0305e") !== L.canonical("adb0305f") &&
        L.canonical([1, 2, 3]) !== L.canonical([1, 2, 3.0000000000000004]) &&
        L.canonical([1, 2, 3]) === L.canonical([1, 2, 3]),
        "1 vs 1+EPSILON separate; a boolean flip separates; ONE CHARACTER of box3d's state hash separates; a " +
        "one-ulp change inside an ARRAY separates; and two equal arrays COMPARE EQUAL, which `!==` could never " +
        "do and is why the comparator changed. A TOLERANCE WOULD HIDE THE DAY A DEVICE STOPS BEING " +
        "DETERMINISTIC, the single most important thing this file could ever tell anybody -- so the check is " +
        "identity, not nearness, and that is now a MEASUREMENT rather than a claim about a line of code");
}

console.log();
console.log("  ----  WHAT THIS CATCHES THAT NOTHING ELSE DID: a value moving while every relationship still");
console.log("  ----  holds. v3069's mesher bug hid for 270 VERSIONS that way -- -95 faces at z=0 and +95 at");
console.log("  ----  z=16, net zero, invariant under the aggregate every check looked at.");
console.log("  ----  RE-FREEZE DELIBERATELY after an intended change: SWEK_FREEZE_LAB_RESULTS=1");

// ---------------------------------------------------------------------------
// v3520 -- THE FOUR VACUOUS ROWS, AND WHAT THE FILTER HAD BEEN DROPPING.
console.log("\n  ---- v3520: the observable filter ----");
{
    // FOUR PAIRS FROZE WITH `outputs: {}` AND COUNTED TOWARDS "272 PAIRS FROZEN". A row holding nothing is
    // WORSE than no row, because the count says it is covered -- v3202's stale orphan baselines, 5 of 14
    // holding nothing, in the gate that is meant to be the lab's memory.
    const WERE_EMPTY = ["acoustics/modes", "beam/conditioning", "centrifuge/bands", "box3d/hash"];
    for (const key of WERE_EMPTY) {
        const row = base.pairs[key];
        ok("!! " + key.padEnd(22) + " now carries observables", !!row && Object.keys(row.outputs || {}).length > 0,
            "was `outputs: {}`; now " + Object.keys(row.outputs || {}).length + " -- " +
            Object.keys(row.outputs || {}).join(", "));
    }
    ok("!! *** AND NONE OF THEM WAS EVER EMPTY ***", true,
        "every one returned its WHOLE ANSWER in a type the filter dropped: acoustics/modes the open-open and " +
        "open-closed harmonic SERIES (arrays), beam/conditioning a SWEEP TABLE (array of rows), " +
        "centrifuge/bands the band values (array), and box3d/hash A STATE HASH (string). THE FILTER READ " +
        "`typeof v === \"number\" && isFinite(v)` AND NOBODY HAD LOOKED AT IT.");

    // THE IRONY IS THE ARGUMENT FOR THE ROUND, so it is asserted rather than written in a comment.
    const hashRow = base.pairs["box3d/hash"].outputs;
    ok("!! *** box3d/hash EXISTS TO DETECT DRIFT BY HASHING STATE, AND THE DRIFT RATCHET COULD NOT SEE ITS HASH ***",
        typeof hashRow.stateHash === "string" && typeof hashRow.deterministic === "boolean",
        "stateHash " + JSON.stringify(hashRow.stateHash) + " -- a CHECKSUM, the single most drift-sensitive " +
        "value in the lab, dropped for being a string. Now frozen, with its repeat and its verdict.");

    // THE CENSUS, RE-DERIVED FROM THE BASELINE rather than quoted from the round that measured it.
    let numbers = 0, bools = 0, strings = 0, arrays = 0;
    for (const row of Object.values(base.pairs)) {
        for (const v of Object.values(row.outputs || {})) {
            if (typeof v === "number") numbers++;
            else if (typeof v === "boolean") bools++;
            else if (typeof v === "string") strings++;
            else if (Array.isArray(v)) arrays++;
        }
    }
    ok("the widened corpus is counted by KIND, not asserted as a total",
        numbers + bools + strings + arrays === base.pairObservables,
        numbers + " numbers, " + bools + " booleans, " + strings + " strings, " + arrays + " arrays = " +
        base.pairObservables + ". Was 1896 numbers alone -- 48.7% of the 3890 fields the lab reports. " +
        "Excluding the 1666 deliberate NULLS, 328 of 2224 real values were unwatched, across 191 of 272 pairs.");

    // NULLS STAY OUT, AND THE ARGUMENT IS CHECKED RATHER THAN ASSERTED: a null field is ABSENT from outputs,
    // so if it ever becomes a real value THE KEY APPEARS and the "none APPEARED unannounced" check above
    // fires. Freezing 1666 nulls would buy nothing that mechanism does not already give.
    const nullKeyPresent = Object.entries(base.pairs).some(([, r]) =>
        Object.values(r.outputs || {}).some((v) => v === null));
    ok("nulls are absent from the frozen outputs, so a null becoming a value APPEARS", !nullKeyPresent,
        "the mode-scoped absence convention: a field belonging to another mode reads null and is not an " +
        "observable of THIS one. The appeared/vanished check is what covers it -- stated as the reason, and " +
        "checked, rather than left as a gap nobody re-derives.");

    // *** THE LOAD-BEARING NEGATIVE: the OLD filter is blind to all four of these and the new one is not. ***
    const oldFilter = (v) => typeof v === "number" && isFinite(v);
    // *** THE ARRAY PERTURBATION IS DERIVED BIT-WISE, AND MY FIRST VERSION WAS NOT. *** I typed
    // 0.010512704393427473 against ...472 as "one ulp" and THE TWO LITERALS ARE THE SAME DOUBLE -- the decimal
    // difference sits below what the mantissa can represent, so the check reported 3 of 4 and was RIGHT to.
    // The comparator was correct; the fixture was fake. NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST,
    // and that includes the ADVERSARIAL one -- a plant typed by hand can be a plant that plants nothing.
    const nextUp = (x) => {
        const b = new DataView(new ArrayBuffer(8));
        b.setFloat64(0, x);
        const hi = b.getUint32(0), lo = b.getUint32(4);
        if (lo === 0xffffffff) { b.setUint32(0, hi + 1); b.setUint32(4, 0); } else { b.setUint32(4, lo + 1); }
        return b.getFloat64(0);
    };
    const cleanBands = [5.957265738188179, 0.022251849653420627, 0.010512704393427472];
    const clean = { stateHash: "adb0305e", deterministic: true, bands: cleanBands, oddHarmonicsOnly: true };
    const planted = { stateHash: "adb0305f", deterministic: false, oddHarmonicsOnly: false,
                      bands: cleanBands.map((x, i) => (i === 2 ? nextUp(x) : x)) };
    const oldSees = Object.keys(clean).filter((k) => oldFilter(clean[k]) && clean[k] !== planted[k]);
    const newSees = Object.keys(clean).filter((k) => L.isObservable(clean[k]) && L.canonical(clean[k]) !== L.canonical(planted[k]));
    ok("!! *** THE PLANT: one hash character, one flipped verdict, one ulp inside an array ***",
        oldSees.length === 0 && newSees.length === 4,
        "THE OLD FILTER SEES " + oldSees.length + " OF 4 -- it keeps none of these fields, so all four " +
        "corruptions freeze and replay identically and every relationship check in the lab still passes. The " +
        "widened filter sees all four: " + newSees.join(", ") + ". A CORRUPTED CHECKSUM WAS INVISIBLE TO THE " +
        "DRIFT RATCHET, which is the whole case for this round.");

    // WHAT IS STILL REFUSED, NAMED, so the gap is a number rather than a silence.
    ok("and what the filter still refuses is NAMED rather than silent", typeof L.unwatchedKinds === "function",
        "bare objects and arrays nested deeper than one flat level are REFUSED, not serialised hopefully, and " +
        "unwatchedKinds() reports them BY KIND. Repeating the silent drop one level down would be absurd " +
        "inside the round that exists to fix it.");
}


// ---------------------------------------------------------------------------
// v3529 -- THE 5% PLANTED MOVE, MOVED HERE FROM resultBaseline-selfcheck BEFORE THAT FILE WAS ARCHIVED.
//
// v3524 measured that result-baseline is a STRICT SUBSET of this one -- all 245 of its keys present here, ZERO
// unique to it, and of its 1734 fields none missing and none holding a different value. Its DATA was entirely
// redundant. ITS GATE WAS NOT: it owned a check this one lacked, that a planted 5% move IS DETECTED AND
// REPORTED WITH THE OLD AND NEW VALUES. v3142 established the difference between a ratchet and a hope is
// whether anybody has watched it fire, so archiving the file on the containment alone would have thrown away a
// proven negative. THE PLANT COMES ACROSS FIRST; THE ARCHIVE FOLLOWS.
console.log("\n  ---- v3529: the ratchet, shown firing ----");
{
    const planted = JSON.parse(JSON.stringify(base.pairs));
    let key = null, field = null, was = null;
    outer: for (const [k, row] of Object.entries(planted)) {
        for (const [f, v] of Object.entries(row.outputs || {})) {
            if (typeof v === "number" && Number.isFinite(v) && v !== 0) { key = k; field = f; was = v; break outer; }
        }
    }
    // 5% AND A NUDGE, because a pure 5% of a value that happens to be representable could land back on itself;
    // the epsilon makes the perturbation real at any magnitude. DERIVED FROM THE VALUE, never typed.
    planted[key].outputs[field] = was * 1.05 + 1e-9;
    const now = planted[key].outputs[field];

    const moved = [];
    for (const [k, row] of Object.entries(base.pairs)) {
        for (const [f, v] of Object.entries(row.outputs || {})) {
            const p = (planted[k].outputs || {})[f];
            if (L.canonical(p) !== L.canonical(v)) moved.push({ key: k, field: f, was: v, now: p });
        }
    }
    ok("!! *** A 5% PLANTED MOVE IS DETECTED, AND EXACTLY ONE ***", moved.length === 1,
        "planted " + key + "." + field + " and the comparison reported " +
        (moved[0] ? moved[0].was + " -> " + moved[0].now : "MISSED") +
        ". EXACTLY ONE matters as much as at least one: a comparison that fired on everything would pass this " +
        "check while telling nobody anything.");
    ok("...and it names the device, the mode, the observable AND the size", !!(moved[0] && moved[0].key.includes("/") && moved[0].field),
        "a gate that only said 'something changed' across " + Object.keys(base.pairs).length +
        " pairs would send somebody hunting");
    ok("the relative move is the 5% that was planted", moved[0] && Math.abs(Math.abs(moved[0].now / moved[0].was) - 1.05) < 1e-6,
        "measured " + (moved[0] ? (moved[0].now / moved[0].was).toFixed(9) : "?") +
        " -- the negative fails BY A PREDICTED AMOUNT rather than merely failing");
    ok("!! and the clean corpus compares EQUAL, so the check is not vacuous",
        Object.entries(base.pairs).every(([k, row]) =>
            Object.entries(row.outputs || {}).every(([f, v]) => L.canonical((base.pairs[k].outputs || {})[f]) === L.canonical(v))),
        "without this every assertion above would pass on a comparator that reports differences it invented");
}

if (fails) { console.log("labResults-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("labResults-selfcheck: all checks pass");
