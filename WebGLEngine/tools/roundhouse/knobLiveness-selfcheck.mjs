// WebGLEngine/tools/roundhouse/knobLiveness-selfcheck.mjs
//
// Run: node tools/roundhouse/knobLiveness-selfcheck.mjs
//
// THIS GRADES THE PROBE BEFORE IT GRADES THE LAB, AND THAT ORDER IS THE POINT.
//
// *** THE FIRST TWO VERSIONS OF knobLiveness BOTH REPORTED DEAD KNOBS THAT WERE ALIVE, AND BOTH READINGS WERE
// ENTIRELY ARTEFACTS OF THE QUESTION. *** Probed per device instead of per mode, it called eight of `quantum`'s
// eleven knobs dead -- every one live in a mode it never entered. Corrected, but probing only the honest build,
// it called inspiral's `plantedPower` dead -- a knob whose whole job is to sit on the planted branch
// (`c.planted ? c.plantedPower : 3`), where it moves eight observables. Both numbers were plausible, both were
// actionable, and acting on either would have deleted a working knob.
//
// So section 2 is SABOTAGE and it is the reason this file exists: three knobs whose liveness is KNOWN, each
// hiding somewhere a naive probe does not look. If a future simplification collapses an axis, these go red
// before the lab census reports a fictional improvement.
//
// AND A KNOB THAT REFUSES A VALUE IS LIVE. A knob that rejects what it is handed is read by the code -- a
// refusal is a response. Counting it dead would mark the best-behaved knobs in the lab as the broken ones.
"use strict";
import { knobLiveness, widenStill, stillKnobs, insensitiveKnobs, unprobedKnobs, probeValues, wideValues,
         PLANT_STATES, STILL_OK, incompleteKnobs, probeKnob, choicesFor } from "./knobLiveness.mjs";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { kuramotoDevice } from "./kuramotoBind.mjs";
import { COMPOSE_KNOB_CHOICES } from "./composeBind.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rowFor = (rows, d, k) => rows.find((r) => r.device === d && r.knob === k);

console.log("knobLiveness-selfcheck -- a declared knob and a knob that does something\n");

console.log("1. THE LADDERS ARE REAL LADDERS");
{
    ok("a numeric knob is probed at more than one value", probeValues(4).length >= 3, probeValues(4).join(", "));
    ok("a boolean knob is probed at its opposite", probeValues(true).join() === "false", String(probeValues(true)));
    ok("!! a zero-valued knob is not probed by scaling, which would never leave zero",
        probeValues(0).every((v) => v !== 0), probeValues(0).join(", ") + " -- 0 * anything is 0, so a scaled "
        + "ladder on a default of zero would probe the same value three times and call the knob dead");
    ok("a string knob is not probed at all rather than probed wrongly", probeValues("fcc").length === 0,
        "there is no ordering to perturb along, and inventing one would test the device's error handling "
        + "instead of the knob");
    ok("!! the wide ladder reaches far outside the working range", wideValues(1).some((v) => Math.abs(v) >= 1e6)
        && wideValues(1).some((v) => Math.abs(v) <= 1e-6) && wideValues(1).some((v) => v < 0),
        wideValues(1).join(", ") + " -- and it includes the SIGN, because a tolerance flat over fifteen orders "
        + "of magnitude can still respond to being made negative");
    ok("!! both plant states are named axes rather than an implicit default",
        PLANT_STATES.length === 2 && PLANT_STATES.some((p) => p.extra.planted === true),
        PLANT_STATES.map((p) => p.label || "honest").join(", ") + ". Named so that adding a third axis is a "
        + "visible change and omitting one is a visible omission -- this file exists because an unnamed axis "
        + "was silently missing twice.");
}

console.log("\n2. *** SABOTAGE: THREE KNOBS WHOSE LIVENESS IS KNOWN, EACH HIDING WHERE A NAIVE PROBE DOES NOT LOOK ***");
{
    const { rows } = await knobLiveness({ only: ["quantum", "inspiral", "powder", "structureFactor"], budgetMs: 120000 });

    const omega = rowFor(rows, "quantum", "omega");
    ok("!! *** A KNOB LIVE IN ONE MODE OF SEVEN IS LIVE -- quantum.omega, read only by `osc` ***",
        !!omega && omega.live.length > 0,
        omega ? "live in " + omega.live.join(", ") : "NOT FOUND",
        );
    report("defaults() returns ONE flat config for a device with seven modes, so omega is in the register while "
        + "`bands` runs. Probed per device this read dead, along with E, V0, steps, dt, kpV0 and bandGridN.");

    const pp = rowFor(rows, "inspiral", "plantedPower");
    ok("!! *** A KNOB LIVE ONLY UNDER THE PLANT IS LIVE -- inspiral.plantedPower ***",
        !!pp && pp.live.length > 0 && pp.live.some((w) => w.includes("planted")),
        pp ? "live in " + pp.live.join(", ") : "NOT FOUND");
    report("`const ratePower = c.planted ? c.plantedPower : 3` -- moving it on the honest build moves nothing BY "
        + "CONSTRUCTION. Reporting that as dead would have reported a HEALTHY PLANT as a defect, and the "
        + "obvious fix would have been to delete the knob that makes the plant adjustable.");

    const ct = rowFor(rows, "powder", "checkTo");
    ok("!! *** A KNOB THAT REFUSES A VALUE IS LIVE, NOT DEAD ***",
        !!ct && ct.live.some((w) => w.includes("refused")),
        ct ? ct.live.join(", ") : "NOT FOUND");
    report("powder.checkTo throws on an absurd series length. A knob that rejects what it is handed is READ; "
        + "counting a refusal as silence would mark the best-behaved knobs in the lab as the broken ones.");

    const disp = rowFor(rows, "structureFactor", "displace");
    ok("...and an ordinary live knob still reads live", !!disp && disp.live.length > 0,
        disp ? disp.live.join(", ") : "NOT FOUND");
}

console.log("\n3. THE WIDE LADDER SEPARATES 'FLAT NEARBY' FROM 'READ BY NOBODY'");
{
    const { rows } = await knobLiveness({ only: ["galaxy"], budgetMs: 120000 });
    await widenStill(rows, { budgetMs: 60000 });
    const zt = rowFor(rows, "galaxy", "zeroTol");
    ok("!! galaxy.zeroTol is flat over its working range and wakes at the sign flip",
        !!zt && !zt.live.length && !!zt.wideLive,
        zt ? "near ladder: still; wide ladder: " + zt.wideLive : "NOT FOUND");
    report("*** THAT FLATNESS IS THE PROPERTY, NOT A DEFECT. *** zeroTol feeds `Math.abs(v) < zeroTol` over a "
        + "spectrum whose zero modes sit at 1e-16 and whose next eigenvalue is order 1. Moving it 50% CANNOT "
        + "change the count and should not -- the same gap structureFactor's absences are graded on, where any "
        + "threshold between 1e-14 and 1 gives the identical verdict. A knob flat across a measured margin is "
        + "evidence the answer does not depend on it.");
    ok("...and the two states are reported separately rather than collapsed",
        !stillKnobs(rows).includes("galaxy.zeroTol") &&
        insensitiveKnobs(rows).some((s) => s.startsWith("galaxy.zeroTol")),
        "insensitive: " + (insensitiveKnobs(rows).join(", ") || "none") + " | still: " + (stillKnobs(rows).join(", ") || "none"));
}

console.log("\n3b. *** v4030 -- A KNOB THE CENSUS CANNOT ANSWER IS NAMED, NOT DROPPED ***");
{
    // Strings and arrays were always skipped and that is right: inventing an ordering would test the device's
    // error handling instead of the knob. But the row then carried an empty `probed`, so BOTH stillKnobs and
    // insensitiveKnobs filtered it out and the knob disappeared from every list this census prints.
    const { rows } = await knobLiveness({ only: ["optics", "blackhole"], budgetMs: 200000 });
    const un = unprobedKnobs(rows);
    ok("!! *** the two null-default knobs in the lab are REPORTED rather than silently absent ***",
        un.some((k) => k.startsWith("optics.spread")) && un.some((k) => k.startsWith("blackhole.onsetLo")),
        un.join(", ") + ". Both use `cfg.x ?? fallback` -- a live, readable knob whose default means 'compute "
        + "it'. blackhole.onsetLo has been invisible to this census since it was written; optics.spread became "
        + "invisible the moment v4030 gave it a null default, WHICH IS A GAP THIS ROUND CREATED AND THEREFORE "
        + "HAD TO CLOSE.");
    ok("...and they are NOT counted as still, because 'was never probed' is not 'moves nothing'",
        !stillKnobs(rows).some((k) => k === "optics.spread" || k === "blackhole.onsetLo"),
        "still: " + (stillKnobs(rows).join(", ") || "none") + ". A measurement and an admission are different "
        + "claims and folding the second into the first would report coverage this census does not have.");
}

console.log("\n3c. *** v4031 -- A KNOB THE CENSUS NEVER REACHED IS NOT A KNOB THAT MOVES NOTHING ***");
{
    // THE MOST EXPENSIVE READING THIS CENSUS EVER PRODUCED, and the only kind it cannot afford: a knob that
    // is LIVE, reported DEAD, under a heading that says ANYWHERE. kuramoto's `curve` mode sweeps 4096
    // oscillators eight times over two plant states; that blew the budget before the loop ever reached
    // `pendulum`, which is the one mode reading pendN and cycle at all. The row carried one mode's worth of
    // evidence and the report carried a claim about all three.
    const honest = await kuramotoDevice.build({ mode: "pendulum", config: {} });
    const moves = async (knob, v) => {
        const o = await kuramotoDevice.build({ mode: "pendulum", config: { [knob]: v } });
        return Object.keys(honest).filter((k) => !Object.is(honest[k], o[k]));
    };
    const mN = await moves("pendN", 40), mC = await moves("cycle", 120);
    ok("!! *** kuramoto.pendN AND .cycle ARE LIVE, AND WERE LIVE THE WHOLE TIME THE CENSUS CALLED THEM DEAD ***",
        mN.length >= 3 && mC.length >= 3,
        "pendN 15 -> 40 moves " + mN.join(", ") + "; cycle 60 -> 120 moves " + mC.join(", ") + ". Both in " +
        "`pendulum`, in about a millisecond each -- THE COST THAT HID THEM WAS ENTIRELY IN THE OTHER TWO MODES.");

    // *** THE BUDGET IS MEASURED IN BUILDS, NOT MILLISECONDS, SO THIS CHECK IS NOT A RACE. *** A flat
    // millisecond figure would assert the machine's speed as much as the census's logic: too small and the
    // loop is cut off before it probes anything (a different bug, unprobedKnobs' territory), too large and a
    // fast machine finishes and there is nothing incomplete to classify. One `curve` build is the natural
    // unit -- 7.3 s here -- and the budget check falls between knobs, so at 1.5 builds the loop clears the
    // base build, probes exactly one knob (three more builds), and is over. That holds at any clock speed.
    const c0 = Date.now();
    await kuramotoDevice.build({ mode: "curve", config: {} });
    const oneBuild = Date.now() - c0;
    const { rows, notes } = await knobLiveness({ only: ["kuramoto"], budgetMs: Math.round(oneBuild * 1.5) });
    const row = rows.find((r) => r.knob === "pendN");
    ok("!! *** and a cut-off census reports them as UNFINISHED, never as answered ***",
        !!row && row.incomplete === true && row.probed.length > 0 &&
        !stillKnobs(rows).some((k) => k.startsWith("kuramoto.")) &&
        incompleteKnobs(rows).some((k) => k.startsWith("kuramoto.")),
        "one build " + oneBuild + " ms, budget " + Math.round(oneBuild * 1.5) + " ms. still: " +
        (stillKnobs(rows).join(", ") || "none") + " | incomplete: " +
        (incompleteKnobs(rows).join(", ") || "none") + ". Three categories, not two: 'moves nothing' is a " +
        "measurement, 'was never probed' is an admission, and THIS ONE IS A PARTIAL MEASUREMENT -- the most " +
        "dangerous to promote, because it looks exactly like the first.");
    ok("...and the note names the modes it never opened, so the gap has an address",
        notes.some((n) => /MODES NEVER ENTERED:/.test(n) && /pendulum/.test(n)),
        notes.join(" | ") + ". The old note said only that the device was incomplete, and counted its " +
        "denominator off the knobs the loop had REACHED -- so kuramoto scored 'probed 1 of 1', a perfect " +
        "score, with four declared knobs never looked at.");
}

console.log("\n3d. *** v4031 -- AN OBSERVABLE THAT IS THE KNOB HANDED BACK IS AN ECHO, NOT A RESPONSE ***");
{
    // SABOTAGE, in the spirit of section 2: a device that grades nothing at all and would have read as
    // perfectly live. Several real binds publish their config among their observables -- mpmstep does it with
    // `steps` and `dt` -- and this round nearly added two more before the census obligingly reported the new
    // knob as "live in freefall [1 observables]". The one observable was the knob.
    const parrot = { modes: ["only"], observables: ["nx"], build: async ({ config = {} } = {}) => ({ nx: config.nx }) };
    const cfg = { nx: 16 };
    const pBase = await parrot.build({ mode: "only", config: cfg });
    const pr = await probeKnob(parrot, "only", cfg, "nx", pBase);
    ok("!! *** A DEVICE WHOSE ONLY OBSERVABLE IS ITS OWN INPUT READS STILL, NOT LIVE ***",
        pr.state === "still",
        "state " + pr.state + ". A knob that reads live off its own echo is WORSE THAN ONE THAT READS DEAD: " +
        "dead invites a look and live closes the question, so the census would have certified as answered the " +
        "exact knob it had just been wrong about.");

    // And the rule has to be narrow, or it starts deleting real responses. An observable counts as an echo
    // ONLY if it equalled the default before AND equals the probe value after -- the signature of a
    // pass-through and of nothing else.
    const nearly = {
        modes: ["only"], observables: ["nx", "twice"],
        build: async ({ config = {} } = {}) => ({ nx: config.nx, twice: config.nx * 2 }),
    };
    const nBase = await nearly.build({ mode: "only", config: cfg });
    const nr = await probeKnob(nearly, "only", cfg, "nx", nBase);
    ok("!! ...and one real observable beside the echo is still enough to read live",
        nr.state === "live" && nr.moved.includes("twice") && !nr.moved.includes("nx"),
        "state " + nr.state + ", moved " + nr.moved.join(", ") + ". The echo is dropped and the RESPONSE is " +
        "kept -- the rule discards a pass-through, not a knob.");
}

console.log("\n3e. *** v4032 -- THE BUDGET IS CHECKED BEFORE EVERY BUILD, NOT ONLY BETWEEN KNOBS ***");
{
    // The guard sat in the knob loop, so ONE knob's ladder -- three full builds -- ran unbounded once entered.
    // optics is what showed it: its `converge` mode costs 7200/F Simpson evaluations, the shipped default is
    // already 3.5 s, and the near ladder's 8x rung on lambda is 1.85e9 evaluations. It was never hanging; it
    // was finishing, at a cost the survey could not see coming, and it produced NO COMPLETED ROW all session.
    const slow = {
        modes: ["only"], observables: ["v"],
        build: async ({ config = {} } = {}) => {
            const end = Date.now() + 120;                 // every build costs the same; three exceed the budget
            while (Date.now() < end) { /* synchronous, exactly like a real one */ }
            return { v: config.n };
        },
    };
    const cfg = { n: 4 };
    const base = await slow.build({ mode: "only", config: cfg });
    const cut = await probeKnob(slow, "only", cfg, "n", base, {}, Date.now() + 150);
    ok("!! *** A LADDER THAT RUNS OUT OF BUDGET MID-CLIMB SAYS SO, RATHER THAN SAYING 'STILL' ***",
        cut.state === "budget-cut",
        "state " + cut.state + " after a deadline 150 ms out with 120 ms per build. Before this the three " +
        "rungs ran to completion whatever the budget said, and a knob whose later rungs were never tried was " +
        "recorded on the evidence of the ones that were.");
    const room = await probeKnob(slow, "only", cfg, "n", base, {}, Date.now() + 60000);
    ok("...and with room it answers normally, so the deadline bounds rather than breaks the probe",
        room.state === "still",
        "state " + room.state + " with a minute of headroom. `still` is the CORRECT answer for this fixture " +
        "and 3d is why -- its one observable is the knob handed back, which is an echo, not a response. The " +
        "point of the line is that the deadline changes WHEN the probe stops, never WHAT it concludes.");
    report("*** ONE BUILD IS STILL UNBOUNDED, AND THAT IS STATED RATHER THAN PRETENDED AWAY ***",
        "a build is synchronous work and nothing here can interrupt one that has started. This turns 3N " +
        "unbounded builds per knob into at most one, which is what is actually achievable. optics went from " +
        "producing nothing at all to a complete row -- every knob live, none still -- once it was given a " +
        "budget it could finish inside.");
}

console.log("\n3f. *** v4033 -- A KNOB WITH NO ORDERING CAN STILL HAVE ALTERNATIVES, IF THE DEVICE DECLARES THEM ***");
{
    // Refusing to GUESS an ordering is right and stays right -- a made-up string tests the device's error
    // handling instead of the knob. But it is not the same as being unable to ASK. compose is the case that
    // makes the difference plain: all six of its knobs are names, so the census could say NOTHING AT ALL about
    // the one device in the lab that consumes other devices.
    ok("!! nothing is invented: a string knob with no declared choices is still not probed",
        probeValues("vacuum").length === 0 && probeValues(["a", "b"]).length === 0,
        "unchanged from before this round, and the reason is unchanged -- inventing a value would test the " +
        "device's error handling instead of the knob.");
    ok("!! ...and declared choices are used, with the current value dropped",
        probeValues("vacuum", ["vacuum", "hall", "snell"]).join(",") === "hall,snell" &&
        probeValues(4, [4, 9]).join(",") === "9",
        "probing a knob at the value it already has measures nothing and would read as dead. Choices win for " +
        "numbers too, because a device may know its own range better than a blind 1.5x does.");

    const { rows } = await knobLiveness({ only: ["compose"], budgetMs: 200000 });
    const live = rows.filter((r) => r.live.length).map((r) => r.knob).sort();
    ok("!! *** ALL SIX OF compose's KNOBS NOW READ LIVE, WHERE ALL SIX READ 'not probed (string)' BEFORE ***",
        live.join(",") === "devA,devB,keyA,keyB,modeA,modeB" && unprobedKnobs(rows).length === 0,
        "live: " + live.join(", ") + ". *** THE CENSUS VARIES ONE KNOB AT A TIME, so setting devA to `kepler` " +
        "while keyA is still `cComputed` asks for an observable kepler does not have -- and compose answers " +
        "verdict:\"missing\", WHICH MOVES OBSERVABLES AND IS A LIVE READING. A refusal is a response, this " +
        "census's own third category, and a device that answered a broken triple with a number would be the " +
        "thing worth finding. ***");

    // *** AND THE DECLARED SET IS CHECKED AGAINST THE LAB, BECAUSE A DECLARATION CAN ROT. *** A choice list is
    // a claim about other devices -- that this name is registered, that this mode exists, that this observable
    // is produced. Rename any of them and the list still parses, still runs, and quietly probes a knob at
    // values that only ever produce "unbuildable". THE KNOB WOULD STILL READ LIVE, off the error path alone.
    const bad = [];
    for (const d of [...COMPOSE_KNOB_CHOICES.devA, ...COMPOSE_KNOB_CHOICES.devB])
        if (!DEVICE_NAMES.includes(d)) bad.push("device " + d + " is not registered");
    const emDev = await getDevice("em"), fdtdDev = await getDevice("fdtd");
    for (const m of COMPOSE_KNOB_CHOICES.modeA) if (!emDev.modes.includes(m)) bad.push("em has no mode " + m);
    for (const m of COMPOSE_KNOB_CHOICES.modeB) if (!fdtdDev.modes.includes(m)) bad.push("fdtd has no mode " + m);
    const emOut = await emDev.build({ mode: "vacuum" }), fdOut = await fdtdDev.build({ mode: "lightspeed" });
    for (const k of COMPOSE_KNOB_CHOICES.keyA)
        if (typeof emOut[k] !== "number") bad.push("em/vacuum does not produce a number for " + k);
    for (const k of COMPOSE_KNOB_CHOICES.keyB)
        if (typeof fdOut[k] !== "number") bad.push("fdtd/lightspeed does not produce a number for " + k);
    ok("!! *** EVERY DECLARED CHOICE STILL NAMES SOMETHING THAT EXISTS ***", bad.length === 0,
        bad.length === 0
            ? "6 lists checked against the registry, em's and fdtd's declared modes, and their actual output. " +
              "A choice list is a claim about OTHER devices; rename one and the list still parses, still runs, " +
              "and probes at values that only ever produce `unbuildable` -- the knob reads live off the error " +
              "path and the coverage is fictional."
            : "STALE CHOICES: " + bad.join("; "));

    ok("...and choicesFor answers null for a device that declares none, which is not the same as empty",
        choicesFor(kuramotoDevice, "pendN") === null && choicesFor(null, "x") === null,
        "null means NO ORDERING DECLARED and never means nothing to find -- a device without choices keeps " +
        "the scaled ladder, and one with a non-numeric knob and no choices stays in the unprobed list.");
}

console.log("\n4. THE REGISTER OF EXAMINED STILL KNOBS");
{
    ok("!! every entry carries a real sentence, not a label",
        Object.values(STILL_OK).every((v) => typeof v === "string" && v.length > 40),
        Object.keys(STILL_OK).length + " entries. A one-word reason is a suppression wearing an explanation.");
    report(Object.keys(STILL_OK).length === 0
        ? "the register is EMPTY, and that is the claim -- xenon.highFlux was FIXED rather than registered."
        : Object.keys(STILL_OK).join(", "));

    // *** AND NO ENTRY MAY OUTLIVE ITS REASON. *** census-selfcheck applies exactly this to
    // EXACT_ZERO_BACKLOG -- "a stale suppression is an ACTIVE BLIND SPOT, because if the zero came back the
    // entry would silently swallow it" -- and this register had no such check until an entry actually expired.
    // hands.span was registered because translationDisagreements was a load-bearing negative no plant could
    // make fire; v4026 gave handsBind a second declared defect knob, the negative fires, and the knob went
    // live. The entry was DELETED, not loosened, and this is what makes the next one impossible to forget.
    const stale = [];
    for (const key of Object.keys(STILL_OK)) {
        const [dev, knob] = key.split(".");
        const { rows } = await knobLiveness({ only: [dev], budgetMs: 90000 });
        await widenStill(rows, { budgetMs: 60000 });
        const r = rows.find((x) => x.knob === knob);
        if (!r) { stale.push(key + " (knob no longer declared)"); continue; }
        if (r.live.length || r.wideLive) stale.push(key + " (now live in " + (r.live.join(", ") || r.wideLive) + ")");
    }
    ok("!! *** NO ENTRY HAS OUTLIVED ITS REASON ***", stale.length === 0,
        stale.length === 0
            ? Object.keys(STILL_OK).length + " entries, every one still still. A register that kept an expired "
              + "entry would silently swallow the knob going still again."
            : "STALE, DELETE THESE: " + stale.join("; ") + " -- an entry whose reason has expired is an ACTIVE "
              + "BLIND SPOT. THE RIGHT RESPONSE IS DELETION, NOT LOOSENING (v3195).");
}

console.log("\n" + (fails ? "knobLiveness-selfcheck: " + fails + " FAILED" : "knobLiveness-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
