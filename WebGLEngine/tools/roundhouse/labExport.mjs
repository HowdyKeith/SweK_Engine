// WebGLEngine/tools/roundhouse/labExport.mjs -- v3183
//
// A LAB RESULT THAT CARRIES THE CONFIGURATION THAT PRODUCED IT.
//
// v3182 measured that only 24% of the numeric claims in lab gates can be reproduced by running the device they
// name. The rest are legitimate and CONFIG-SPECIFIC, and the config was not written down. *** A NUMBER WITHOUT
// ITS CONFIGURATION IS NOT A RESULT, IT IS AN ANECDOTE *** -- and a device's build() returns observables and
// nothing else, so even a careful author has to remember the config by hand and write it into prose.
//
// This makes the pairing structural. A record is { device, mode, config, outputs } and the config is THE ONE
// THAT WAS ACTUALLY PASSED, captured at the call rather than described afterwards.
//
// *** THE PROPERTY THAT MATTERS IS THAT A RECORD IS RE-RUNNABLE. *** Given a row, anybody -- a stranger, a
// future Keith, a different application -- can feed its config back to the device and get the same number. That
// is the whole of what traceability means here, and it is checkable rather than asserted: the gate re-runs
// every record from its own record and compares.
//
// NO TIMESTAMP, DELIBERATELY. A time in the record would make two identical runs differ, which breaks the
// round-trip diff this project ships on and adds nothing: THE CONFIG IS THE PROVENANCE. When something did run
// is a fact about a session; what it was run WITH is a fact about the result.

/**
 * Run one device at a stated config and return a record carrying both.
 *
 * The config is passed through UNCHANGED rather than merged with defaults(), because a record must say what the
 * CALLER asked for. Recording the merged view would silently claim the author chose every default, and a later
 * change to a default would rewrite history.
 */
// v3520 -- *** WHAT COUNTS AS AN OBSERVABLE, IN ONE PLACE, BECAUSE THIS LINE DECIDED WHAT THE WHOLE LAB
// WATCHES AND NOBODY HAD LOOKED AT IT. ***
//
// It used to read `typeof v === "number" && isFinite(v)`, and every value ratchet in the tree inherits from
// here. Censused across all 272 device-mode pairs: 3890 fields reported, 1896 kept -- 48.7%. The dropped
// 1994 are 1666 nulls (legitimate: the mode-scoped absence convention, a field belonging to a different
// mode), 249 BOOLEANS, 41 STRINGS, 20 NUMERIC ARRAYS, 5 ARRAYS OF FLAT OBJECTS, 12 OBJECTS and 1 mixed
// array. EXCLUDING THE DELIBERATE NULLS, 328 OF 2224 REAL VALUES -- 14.7% -- WERE UNWATCHED.
//
// *** AND FOUR PAIRS WERE WATCHED ENTIRELY VACUOUSLY: acoustics/modes, beam/conditioning, centrifuge/bands
// and box3d/hash FROZE WITH `outputs: {}` AND COUNTED TOWARDS "272 PAIRS FROZEN". None of them returns
// nothing -- every one returns its whole answer in a type this filter dropped: acoustics/modes reports the
// open-open and open-closed harmonic SERIES, beam/conditioning a SWEEP TABLE, centrifuge/bands the band
// values, and box3d/hash A STATE HASH. A ROW HOLDING NOTHING IS WORSE THAN NO ROW, because the count says
// it is covered -- the stale-orphan-baseline shape (v3202, 5 of 14 held nothing). ***
//
// THE SHARPEST INSTANCE, AND IT IS WHY THIS IS NOT A TIDY-UP: box3d/hash EXISTS TO DETECT DRIFT BY HASHING
// STATE, AND THE DRIFT RATCHET COULD NOT SEE ITS HASH. stateHash "adb0305e" -- a checksum, the single most
// drift-sensitive value in the lab -- was dropped for being a string.
//
// NULLS STAY OUT, AND THEY ARE STILL COVERED: a null field is absent from `outputs`, so if it ever becomes a
// real value THE KEY APPEARS and the baseline's own "none APPEARED unannounced" check fires. Freezing 1666
// nulls would have bought nothing the appeared/vanished check does not already give.
export function isObservable(v) {
    if (typeof v === "number") return isFinite(v);
    if (typeof v === "boolean" || typeof v === "string") return true;
    if (Array.isArray(v)) return v.every((x) => isFlat(x));
    return false;   // bare objects REFUSED -- see the note on canonical()
}
const isFlat = (x) => {
    if (typeof x === "number") return isFinite(x);
    if (typeof x === "boolean" || typeof x === "string") return true;
    // ONE level of nesting only, and flat inside. beam/conditioning's `rows` is an array of {eps, tipDriftFrac,
    // relGap}, which is a table and freezes cleanly; anything deeper is REFUSED rather than serialised
    // hopefully. THE REFUSAL IS COUNTED (unwatchedKinds below) so it is not a silent drop -- which is the
    // whole defect this round exists to fix, and repeating it one level down would be absurd.
    if (x && typeof x === "object" && !Array.isArray(x)) {
        return Object.values(x).every((y) =>
            (typeof y === "number" && isFinite(y)) || typeof y === "boolean" || typeof y === "string");
    }
    return false;
};

/**
 * A STABLE STRING FOR ANY OBSERVABLE, so comparison is one operation rather than one per type.
 *
 * The old comparison was `!==`, which is right for numbers and WRONG FOR EVERYTHING ELSE THIS NOW KEEPS: two
 * arrays with identical contents are never `!==`-equal, so widening the filter without widening the compare
 * would have made every array-carrying pair fail on the first run. Object keys are SORTED so a reordered
 * literal is not read as a change -- key order is not an observable.
 */
export function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object") {
        return "{" + Object.keys(v).sort().map((k) => k + ":" + canonical(v[k])).join(",") + "}";
    }
    return typeof v === "string" ? JSON.stringify(v) : String(v);
}

/** What this filter still refuses, BY KIND, so the gap is a number rather than a silence. */
export function unwatchedKinds(out) {
    const k = { null: 0, object: 0, deepArray: 0, other: 0 };
    for (const v of Object.values(out || {})) {
        if (isObservable(v)) continue;
        if (v === null) k.null++;
        else if (Array.isArray(v)) k.deepArray++;
        else if (typeof v === "object") k.object++;
        else k.other++;
    }
    return k;
}

export async function runRecord(D, device, { mode = null, config = null } = {}) {
    const d = await D.getDevice(device);
    // v3186 -- A DEVICE NEED NOT HAVE defaults(). lbm does not, one of 27, and v3183 CRASHED ON IT -- I built
    // and tested the exporter on three hand-picked devices and it fell over on the fourth kind the moment
    // anything ran it across the whole lab. A DEVICE THAT CANNOT STATE ITS DEFAULTS IS A LEGITIMATE STATE and
    // it is REPORTED, not thrown: a crash here takes down an export of twenty-six working devices for one that
    // is merely different.
    if (typeof d.defaults !== "function") {
        if (!mode) return { device, mode: null, config: config || null, ok: false,
                            error: "device has no defaults(), so a mode must be given explicitly", outputs: {} };
    }
    const def = (typeof d.defaults === "function") ? d.defaults({}) : {};
    const m = mode || def.mode;
    const args = config ? { mode: m, config } : { mode: m };
    let out;
    try { out = await d.build(args); }
    // A FAILED RUN IS A RECORD TOO, and it says so. Dropping it would leave a row missing from an export with
    // no indication anything was attempted -- the absence looking exactly like a config nobody tried.
    catch (e) { return { device, mode: m, config: config || null, ok: false, error: String((e && e.message) || e), outputs: {} }; }
    const outputs = {};
    for (const [k, v] of Object.entries(out)) if (isObservable(v)) outputs[k] = v;
    return { device, mode: m, config: config || null, ok: true, error: null, outputs };
}

/**
 * Re-run a record FROM THE RECORD and report whether it reproduces.
 *
 * *** THIS IS THE POINT OF THE WHOLE MODULE. *** An export nobody can replay is a spreadsheet of assertions.
 * Comparing exactly rather than within a tolerance is deliberate: these devices are DETERMINISTIC, so a
 * difference is a finding rather than noise, and a tolerance would hide the day one stops being.
 */
export async function replay(D, rec) {
    const again = await runRecord(D, rec.device, { mode: rec.mode, config: rec.config });
    if (!again.ok || !rec.ok) return { ok: false, why: "a run failed: " + (again.error || rec.error) };
    const drift = [];
    for (const [k, v] of Object.entries(rec.outputs)) {
        const now = again.outputs[k];
        if (now === undefined) { drift.push({ key: k, was: v, now: null, why: "observable no longer produced" }); continue; }
        // v3520 -- CANONICAL, NOT `!==`. Two arrays with identical contents are never `!==`-equal, so the
        // moment runRecord started keeping arrays this line would have reported drift on every replay.
        if (canonical(now) !== canonical(v)) drift.push({ key: k, was: v, now, why: "value changed" });
    }
    // AN OBSERVABLE THAT APPEARED IS ALSO A CHANGE, and reporting only disappearances would call a device that
    // grew a new output "unchanged" -- true of every number it used to emit and false about the device.
    for (const k of Object.keys(again.outputs)) if (!(k in rec.outputs)) drift.push({ key: k, was: null, now: again.outputs[k], why: "observable is new" });
    return { ok: drift.length === 0, drift, checked: Object.keys(rec.outputs).length };
}

/**
 * Flat CSV: one row per observable, so any spreadsheet, pandas, or R reads it without a parser.
 *
 * ONE ROW PER OBSERVABLE rather than one per run, because a wide table has a column set that changes with the
 * device and a long table does not. The config is serialised into a single cell as JSON -- ugly to read and
 * EXACTLY re-pasteable, which is the trade that matters for a record whose job is to be re-runnable.
 */
export function toCSV(records) {
    const esc = (s) => {
        const t = String(s);
        return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const lines = ["device,mode,config,observable,value,ok,error"];
    for (const r of records) {
        const cfg = r.config ? JSON.stringify(r.config) : "";
        if (!r.ok) { lines.push([r.device, r.mode, cfg, "", "", "false", r.error].map(esc).join(",")); continue; }
        for (const [k, v] of Object.entries(r.outputs)) {
            lines.push([r.device, r.mode, cfg, k, v, "true", ""].map(esc).join(","));
        }
    }
    return lines.join("\n") + "\n";
}
