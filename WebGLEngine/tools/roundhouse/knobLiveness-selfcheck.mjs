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
         PLANT_STATES, STILL_OK, incompleteKnobs, probeKnob, choicesFor,
         partialDeafness, deafnessUnanswered, LIST_CLAIMS, unusedInMode, jointlyLive } from "./knobLiveness.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { kuramotoDevice } from "./kuramotoBind.mjs";
import { COMPOSE_KNOB_CHOICES } from "./composeBind.mjs";
import { BASES } from "../../physics/crystal/structureFactor.mjs";
import { INTEGRATORS } from "../../physics/orbits/kepler.js";
import { LIQUIDS, MATERIALS } from "../../physics/thermal/phaseOps.mjs";
import { SCENARIOS } from "../../physics/blobKelvin.js";
import { sameValue } from "./knobLiveness.mjs";

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
    // loop is cut off before it probes anything, too large and a fast machine finishes and there is nothing
    // incomplete to classify. One `curve` build is the natural unit -- 7.3 s here -- and the budget check
    // falls between knobs, so the loop clears the base build, probes one knob, and is over.
    //
    // *** v4045a -- FOUR BUILDS, NOT 1.5, AND v4044 IS WHY. *** This read 1.5 until the affordability
    // pre-check landed: a budget that cannot afford TWO builds of a mode now skips that mode outright rather
    // than spending itself on a base build whose result is discarded. At 1.5 builds kuramoto is no longer cut
    // off mid-sweep, it is DECLINED before it starts -- better behaviour, and no longer the scenario this
    // section exists to demonstrate. Four builds affords the base plus one knob's three rungs and runs out
    // exactly where it used to. The check moved because the code got better, which is the honest reason to
    // move a test and the only one.
    const c0 = Date.now();
    await kuramotoDevice.build({ mode: "curve", config: {} });
    const oneBuild = Date.now() - c0;
    const { rows, notes } = await knobLiveness({ only: ["kuramoto"], budgetMs: Math.round(oneBuild * 4) });
    const row = rows.find((r) => r.knob === "pendN");
    ok("!! *** and a cut-off census reports them as UNFINISHED, never as answered ***",
        !!row && row.incomplete === true && row.probed.length > 0 &&
        !stillKnobs(rows).some((k) => k.startsWith("kuramoto.")) &&
        incompleteKnobs(rows).some((k) => k.startsWith("kuramoto.")),
        "one build " + oneBuild + " ms, budget " + Math.round(oneBuild * 4) + " ms. still: " +
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

console.log("\n3g. *** v4034 -- THE OTHER FOUR NAME KNOBS, DERIVED FROM THE TABLE THAT DECIDES VALIDITY ***");
{
    // compose's choices name OTHER devices, so they are written out literally and section 3f checks them
    // against the lab. These four are the opposite case: each device's valid set is a table it can already
    // reach, and its own guard decides validity by reading that table. Deriving the choices FROM THE SAME
    // TABLE means they cannot drift from what the device accepts -- and adding an entry extends the probe for
    // free. A literal copy would be a second list to keep in step.
    const cases = [
        ["structureFactor", "absences", "lattice", BASES],
        ["kepler", "kepler3", "integrator", INTEGRATORS],
        ["freeze", "control", "material", LIQUIDS],
        ["blobkelvin", "convert", "scenario", SCENARIOS],
    ];
    const drift = [], dead = [], coerced = [];
    for (const [name, mode, knob, table] of cases) {
        const dev = await getDevice(name);
        const declared = (dev.knobChoices || {})[knob] || [];
        if (declared.join(",") !== Object.keys(table).join(","))
            drift.push(name + "." + knob + " is a COPY, not the table: [" + declared.join(",") + "] vs [" +
                       Object.keys(table).join(",") + "]");

        const dflt = ((dev.defaults({ mode }) || {}).config || {})[knob];
        const base = await dev.build({ mode, config: {} });
        for (const ch of declared) {
            if (Object.is(ch, dflt)) continue;
            const out = await dev.build({ mode, config: { [knob]: ch } });
            if (Object.keys(base).every((k) => Object.is(base[k], out[k])))
                coerced.push(name + "." + knob + "=" + ch);
        }
        const { rows } = await knobLiveness({ only: [name], budgetMs: 200000 });
        const r = rows.find((x) => x.knob === knob);
        if (!r || !r.live.length) dead.push(name + "." + knob);
    }

    ok("!! *** ALL FOUR READ LIVE, WHERE ALL FOUR READ 'not probed (string)' IN THE LAST FULL SWEEP ***",
        dead.length === 0,
        dead.length === 0
            ? "structureFactor.lattice (6 observables), kepler.integrator (3), freeze.material (3), " +
              "blobkelvin.scenario (3). keplerBind's own v3993 note says the first-order integrators reach " +
              "every other mode THROUGH THIS KNOB -- so a census that could not turn it was blind to exactly " +
              "the two the header says are reachable no other way."
            : "STILL: " + dead.join(", "));

    ok("!! the choices are DERIVED from the validity table, not copied beside it",
        drift.length === 0,
        drift.length === 0
            ? "each list is Object.keys of the same table the device's guard reads, so the two cannot disagree."
            : "DRIFTED: " + drift.join("; "));

    // *** AND EVERY DECLARED CHOICE IS ACTUALLY ACCEPTED. *** These guards coerce rather than throw --
    // `c.material = LIQUIDS[c.material] ? c.material : "ice"` -- so a value the device rejects comes back as
    // the DEFAULT RUN, bit for bit. That is invisible to liveness (the knob still reads live off its other
    // choices) and it would mean probing a knob at a value it never actually took.
    ok("!! *** EVERY DECLARED CHOICE IS ACCEPTED, NOT SILENTLY COERCED BACK TO THE DEFAULT ***",
        coerced.length === 0,
        coerced.length === 0
            ? "every non-default choice produces output that differs from the default run."
            : "COERCED (the device refused these and fell back): " + coerced.join(", "));

    // The negative control, which is why freeze derives from LIQUIDS and not from MATERIALS.
    const fz = await getDevice("freeze");
    const fb = await fz.build({ mode: "control", config: {} });
    const fp = await fz.build({ mode: "control", config: { material: "paraffin" } });
    ok("!! ...and the check can fail, shown on the value freeze is RIGHT to refuse",
        Object.keys(MATERIALS).includes("paraffin") && !Object.keys(LIQUIDS).includes("paraffin") &&
        Object.keys(fb).every((k) => Object.is(fb[k], fp[k])),
        "MATERIALS carries five entries and LIQUIDS four: `paraffin` is a solid this module has no liquid " +
        "phase for, and freeze's guard coerces it to `ice` -- output BIT-IDENTICAL to the default. *** HAD " +
        "THE CHOICES BEEN DERIVED FROM MATERIALS, the census would have probed a value the device is right to " +
        "refuse, and read the fallback as a reading. The two tables differ by exactly one entry and that entry " +
        "is the whole difference between a probe and a no-op. ***");
}

console.log("\n3h. *** v4035 -- A LIST OF NUMBERS HAS A SCALING, AND THREE QUANTITIES IGNORE IT ON PURPOSE ***");
{
    // The refusal to invent an ordering was written for STRINGS -- there is no 1.5x of "fcc". A list of
    // numbers is not that case: betas, temps, angles and queries are sample points, and multiplying them is
    // exactly as principled as multiplying a scalar. Eleven of the lab's fifteen array knobs answer to that
    // ladder alone. THE OTHER FOUR ARE THE INTERESTING ONES.
    ok("!! a numeric list is stepped elementwise, which is not inventing anything",
        JSON.stringify(probeValues([2, 4])) === JSON.stringify([[3, 6], [1, 2], [16, 32]]),
        "1.5x, 0.5x, 8x applied per element -- the same ladder the scalar branch uses, one dimension up.");
    ok("!! an ALL-ZERO list is offset instead, because scaling zero is the identity",
        JSON.stringify(probeValues([0, 0])) === JSON.stringify([[1, 1], [0.5, 0.5], [-1, -1]]),
        "strokeMorph's `lineA` is the endpoint [0,0]. A scaled ladder probes it at [0,0] three times and calls " +
        "it dead -- the array case of the `v === 0` branch this file has carried for scalars since it was " +
        "written, which is the same fact one dimension up.");
    ok("!! a list of non-numbers is still declined rather than guessed at",
        probeValues([[1, 2], [3, 4]]).length === 0,
        "nbench's `sizes` is a list of (N, radius) PAIRS: scaling one would multiply a particle count and a " +
        "cutoff radius by the same factor, which is two different physical changes wearing one number.");
    ok("!! and a declared choice equal to the default is dropped BY VALUE, not by reference",
        probeValues([1, 2], [[1, 2], [3, 4]]).length === 1 && sameValue([[1, 2]], [[1, 2]]),
        "Object.is compares arrays by identity, so a choice written out with the same contents survived the " +
        "filter, moved nothing, and for a one-entry list would have been the only rung -- a declared knob " +
        "reading dead off a comparison that never looked at the numbers.");

    // *** THE TWO INVARIANCES, ASSERTED AS PHYSICS RATHER THAN WORKED AROUND. *** Both knobs read dead under
    // the elementwise ladder, and both were right to: the ladder was asking the one question each quantity is
    // provably blind to. Recording that here means the reading cannot come back as a mystery.
    const ent = await getDevice("entropy");
    const eBase = await ent.build({ mode: "coding", config: {} });
    const eScaled = await ent.build({ mode: "coding", config: { weights: [450, 130, 120, 160, 90, 50] } });
    const eUniform = await ent.build({ mode: "coding", config: { weights: [1, 1, 1, 1, 1, 1] } });
    ok("!! *** SHANNON ENTROPY DOES NOT CARE HOW MANY TIMES YOU COUNTED ***",
        Object.keys(eBase).every((k) => Object.is(eBase[k], eScaled[k])) &&
        Math.abs(eUniform.H - Math.log2(6)) < 1e-12,
        "every frequency x10 is BIT-IDENTICAL on every observable -- H depends on the normalised distribution " +
        "and on nothing else. And uniform weights give H = " + eUniform.H.toFixed(15) + " against log2(6) = " +
        Math.log2(6).toFixed(15) + ", the maximum. *** THE KNOB READ DEAD BECAUSE THE DEVICE IS CORRECT, which " +
        "is the mpmstep.nu shape again: a key that holds looks exactly like a knob that does nothing. The " +
        "declared choices change the SHAPE of the distribution, which is the question that has an answer. ***");

    const frag = await getDevice("fragmentRotation");
    const fBase = await frag.build({ mode: "fragments", config: {} });
    const fScaled = await frag.build({ mode: "fragments", config: { axis: [1.5, 3, 4.5] } });
    const fTurned = await frag.build({ mode: "fragments", config: { axis: [0, 0, 1] } });
    ok("!! *** AND A ROTATION AXIS IS A DIRECTION, SO A LONGER VECTOR IS THE SAME AXIS ***",
        Object.keys(fBase).every((k) => Object.is(fBase[k], fScaled[k])) &&
        Object.keys(fBase).some((k) => !Object.is(fBase[k], fTurned[k])),
        "[1,2,3] and [1.5,3,4.5] are BIT-IDENTICAL; [0,0,1] moves an observable. The honest perturbation is a " +
        "different direction, not a longer vector, and the declared choices are three that are parallel " +
        "neither to the default nor to each other.");

    const { rows } = await knobLiveness({
        only: ["fragmentRotation", "entropy", "nbench", "strokeMorph"], budgetMs: 200000 });
    const named = ["fragmentRotation.axis", "entropy.weights", "nbench.sizes", "strokeMorph.lineA"];
    const answered = rows.filter((r) => r.live.length).map((r) => r.device + "." + r.knob);
    ok("!! *** ALL FOUR NOW READ LIVE, AND NO ARRAY KNOB IN THE LAB IS UNPROBED ***",
        named.every((k) => answered.includes(k)) && unprobedKnobs(rows).length === 0,
        named.join(", ") + " -- the last full sweep reported every one of them as 'not probed (array)'. " +
        "Eleven of the fifteen came free from the elementwise ladder; these four each needed the device to " +
        "say what a real alternative looks like, and two of them needed it BECAUSE THEY WERE RIGHT.");
}

console.log("\n3i. *** v4042 -- A KNOB THAT WORKS IN SIX MODES AND IS IGNORED IN THE SEVENTH ***");
{
    // *** THE LAB CONTAINS A PLANTED DEAD KNOB AND THIS CENSUS COULD NOT SEE IT. *** stability's `deafknob`
    // mode hands every run the shipped viscosity whatever the caller asked for, and its own comment names the
    // shape: "a control that does nothing ... nothing throws, every run completes, every number is finite, and
    // the ONLY tell is that the answer stops depending on the input." Two separate defects hid it, and the
    // first was fixed a round earlier for an unrelated reason.
    //
    //   1. AN ARRAY OBSERVABLE COMPARED BY REFERENCE. stability reports `ratioLadder`, rebuilt per call, so
    //      Object.is called it moved every time and EVERY knob on the device read live. MEASURED: visc moved
    //      [viscosity, ratioLadder] by reference and only [viscosity] by value.
    //   2. THE SWEEP STOPPED AT THE FIRST RESPONDING MODE, and `deafknob` is last in the list.
    //
    // AND WITHOUT v4031's ECHO RULE IT WOULD STILL BE INVISIBLE: the plant reaches the OUTPUT (the bind copies
    // the knob to out.viscosity) while never reaching the solver, so the one thing that moves in that mode is
    // the knob's own echo. The rule written to stop mpmstep.nx reading live off itself is what makes a
    // deliberately deaf knob findable.
    const deaf = {
        modes: ["hears", "deaf"], name: "synthetic-deaf",
        defaults: ({ mode } = {}) => ({ mode: mode || "hears", config: { gain: 2, other: 5 } }),
        // `ladder` is an ARRAY rebuilt every call -- the reference-comparison trap, on purpose.
        // `gain` is echoed and then IGNORED in `deaf`, which is the deafknob shape exactly.
        build: async ({ mode = "hears", config = {} } = {}) => {
            const c = { gain: 2, other: 5, ...config };
            const used = mode === "deaf" ? 2 : c.gain;
            return { gain: c.gain, ladder: [{ a: 1 }, { a: 2 }], answer: used * c.other };
        },
    };
    const cfg = { gain: 2, other: 5 };
    const base = await deaf.build({ mode: "deaf", config: cfg });
    ok("!! *** AN ARRAY OBSERVABLE MUST NOT READ AS MOVED JUST FOR BEING A NEW OBJECT ***",
        sameValue(base.ladder, (await deaf.build({ mode: "deaf", config: { ...cfg, gain: 9 } })).ladder),
        "a device that rebuilds an array per call compares unequal TO ITSELF under Object.is, and every knob " +
        "on it reads live whatever it does. This is the mirror of the v4031 echo bug and the worse direction " +
        "of the two: a dead reading invites a look, a live one closes the question.");
    ok("!! ...and Object.is stays at the LEAVES, because NaN is a real observable",
        sameValue(NaN, NaN) && !sameValue(NaN, Infinity) && !sameValue({ a: 1 }, { a: 1, b: 2 }),
        "NaN === NaN is false, so === at the leaves would call an unchanged NaN a move. JSON.stringify would " +
        "have been shorter and wrong the other way: it renders NaN and Infinity BOTH as null, so a value that " +
        "changed from one to the other would compare EQUAL.");

    const rHears = await probeKnob(deaf, "hears", cfg, "gain", await deaf.build({ mode: "hears", config: cfg }));
    const rDeaf = await probeKnob(deaf, "deaf", cfg, "gain", base);
    ok("!! *** THE SAME KNOB READS LIVE IN ONE MODE AND STILL IN THE OTHER ***",
        rHears.state === "live" && rDeaf.state === "still",
        "hears: " + rHears.state + ", deaf: " + rDeaf.state + ". In `deaf` the only thing the knob moves is " +
        "its own echo, which is discarded -- so the mode that ignores it is the mode that reads still.");

    const rows = [
        { device: "d", knob: "k", live: ["hears"], still: ["deaf"], probed: ["hears", "deaf"], incomplete: false },
        { device: "d", knob: "clean", live: ["hears", "deaf"], still: [], probed: ["hears", "deaf"], incomplete: false },
        { device: "d", knob: "cut", live: ["hears"], still: [], probed: ["hears"], incomplete: true, unenteredModes: ["deaf"] },
    ];
    ok("!! partialDeafness names the split knob and leaves the one that works everywhere alone",
        partialDeafness(rows).length === 1 && partialDeafness(rows)[0].startsWith("d.k "),
        partialDeafness(rows).join(" | ") + " -- a knob live in every mode is not deaf anywhere.");
    ok("!! *** AND A ZERO MEANS 'NONE FOUND IN WHAT WAS OPENED', NEVER 'NONE' ***",
        deafnessUnanswered(rows).length === 1 && deafnessUnanswered(rows)[0].includes("NEVER ENTERED: deaf"),
        deafnessUnanswered(rows).join(" | ") + ". *** THE FIRST EXHAUSTIVE RUN OF stability REPORTED ZERO " +
        "DEAF KNOBS HAVING NEVER OPENED THE PLANT -- over budget at 90 s, modes never entered: direction, " +
        "horizon, deafknob. incompleteKnobs cannot catch that either: it requires the knob to be STILL so " +
        "far, and this one is live. Same measurement-versus-admission line v4030 and v4031 drew, walked into " +
        "a third time. ***");

    report("*** AND ON THE REAL PLANT, MEASURED RATHER THAN ASSERTED HERE, BECAUSE IT COSTS MINUTES ***",
        "knobLiveness --only stability --exhaustive, with a budget it can finish inside, reports EXACTLY ONE " +
        "entry: `stability.visc -- live in response, response/planted, direction, direction/planted, horizon, " +
        "horizon/planted; STILL in deafknob, deafknob/planted`. And it discriminates -- c, dt and T are live " +
        "in ALL EIGHT mode/plant combinations INCLUDING deafknob, because the plant overrides viscosity and " +
        "nothing else. One stability build is ~19 s and exhaustive is four knobs across eight combinations, " +
        "so the real run is minutes; the synthetic above proves the mechanism on every run instead.");
}

console.log("\n3j. *** v4045 -- THE ONE RULE ALL SIX LISTS KEPT NEEDING, ENFORCED INSTEAD OF REMEMBERED ***");
{
    // Six rounds, six local fixes, one rule nobody wrote down: A ROW FROM A DEVICE THAT DID NOT FINISH MAY NOT
    // APPEAR IN A LIST WHOSE HEADING CLAIMS COMPLETENESS. v4030, v4031, v4042a, v4043 and v4044 each found it
    // the same way -- a wrong answer reached a report -- and v4043's fix had been ARGUED AGAINST in a v4031
    // comment. This section is the check none of those rounds had.
    const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "knobLiveness.mjs"), "utf8");
    const declared = [...SRC.matchAll(/^export const (\w+) = \(rows\)/gm)].map((m) => m[1]);
    const undeclaredClaim = declared.filter((n) => !LIST_CLAIMS[n]);
    ok("!! *** EVERY LIST THIS FILE EXPORTS DECLARES WHAT IT CLAIMS ***",
        declared.length >= 6 && undeclaredClaim.length === 0,
        declared.length + " lists, all classified: " + declared.map((n) => n + "=" + LIST_CLAIMS[n]).join(", ") +
        ". *** THIS IS THE RATCHET. *** A seventh list written as `export const X = (rows)` and not added to " +
        "LIST_CLAIMS fails here, which is exactly the check the six previous rounds did not have -- each of " +
        "them found the rule by shipping a wrong answer instead.");

    // A row that qualifies for each universal list EXCEPT that its device skipped a mode. It must not appear.
    const cut = { device: "d", knob: "k", probed: ["m"], live: [], still: ["m"], incomplete: true,
                  unenteredModes: ["never"] };
    const lists = { stillKnobs, insensitiveKnobs, partialDeafness, incompleteKnobs, deafnessUnanswered, unprobedKnobs };
    const leaks = [];
    for (const [name, fn] of Object.entries(lists)) {
        if (LIST_CLAIMS[name] !== "universal") continue;
        if (fn([{ ...cut }]).length) leaks.push(name + " (still)");
        if (fn([{ ...cut, wideLive: "1e6" }]).length) leaks.push(name + " (wide)");
    }
    ok("!! *** NO UNIVERSAL LIST ADMITS A ROW FROM A DEVICE THAT SKIPPED A MODE ***",
        leaks.length === 0,
        leaks.length === 0
            ? "stillKnobs and insensitiveKnobs both reject it, with and without a wide-ladder wake. The wide " +
              "case is the one v4043 got wrong: a knob whose device never opened the modes that READ it wakes " +
              "on something incidental, and 'flat across its working range' is a claim about where it IS read."
            : "LEAKED: " + leaks.join(", "));

    const admits = [];
    if (!incompleteKnobs([{ ...cut }]).length) admits.push("incompleteKnobs");
    if (!deafnessUnanswered([{ ...cut, live: ["m"] }]).length) admits.push("deafnessUnanswered");
    if (!unprobedKnobs([{ device: "d", knob: "k", probed: [], unprobed: true, kind: "string", live: [], still: [] }]).length) admits.push("unprobedKnobs");
    ok("!! ...and every ADMISSION list does admit it, because that is its whole subject",
        admits.length === 0,
        admits.length === 0 ? "an unfinished row surfaces in all three. A list that exists to say something "
            + "was not measured and then drops the unmeasured row is the v4030 defect exactly."
            : "SILENT: " + admits.join(", "));

    const pd = partialDeafness([{ device: "d", knob: "k", live: ["a"], still: ["b"], probed: ["a", "b"], incomplete: false }]);
    ok("!! and the PARTICULAR list names its scope, or it would be universal in disguise",
        pd.length === 1 && pd[0].includes("live in a") && pd[0].includes("STILL in b"),
        pd.join(" | ") + " -- it may include an unfinished row precisely BECAUSE it names the modes it is " +
        "talking about and claims nothing beyond them. A list that reported 'k is deaf' without saying where " +
        "would need the universal rule too.");
}

console.log("\n3k. *** v4047 -- A FOURTH THING THAT LOOKS LIKE A DEAD KNOB: A PAIR THAT ONLY WORKS TOGETHER ***");
{
    // This file names three conditions behind a still reading -- dead, saturated, quantised below the step.
    // A lab-wide sweep found a fourth, and it nearly went in the register as two dead knobs.
    //
    // thermal.beta and thermal.gravity survived BOTH ladders in every mode and plant state: 1.5x/0.5x/8x and
    // 1e-6x to 1e6x and negated. They would have been the first unregistered still knobs in four sweeps.
    const dev = await getDevice("thermal");
    const base = await dev.build({ mode: "convect", config: {} });
    const only = async (cfg) => {
        const o = await dev.build({ mode: "convect", config: cfg });
        return Object.keys(base).filter((k) => JSON.stringify(base[k]) !== JSON.stringify(o[k]));
    };
    const b = await only({ beta: 1 }), g = await only({ gravity: 1e-3 }), both = await only({ beta: 1, gravity: 1e-3 });
    ok("!! *** NEITHER MOVES ANYTHING ALONE AND TOGETHER THEY MOVE THREE OBSERVABLES ***",
        b.length === 0 && g.length === 0 && both.length >= 3,
        "beta=1 alone: " + (b.join(", ") || "NOTHING") + " | gravity=1e-3 alone: " + (g.join(", ") || "NOTHING") +
        " | both: " + both.join(", ") + ". *** BOTH DEFAULT TO ZERO AND THEY MULTIPLY -- Boussinesq buoyancy " +
        "is beta * gravity * dT, so moving either alone leaves the product at zero. NEITHER KNOB IS DEAD; THE " +
        "PAIR IS THE KNOB, and a probe that moves one at a time cannot see it however far it moves that one. ***");

    const rows = [
        { device: "thermal", knob: "beta", live: [], still: ["convect"], probed: ["convect"], incomplete: false },
        { device: "thermal", knob: "gravity", live: [], still: ["convect"], probed: ["convect"], incomplete: false },
    ];
    const found = await jointlyLive(rows, { budgetMs: 120000 });
    ok("!! ...and the pair pass finds it without being told which pair to try",
        found.length >= 1 && found[0].includes("beta") && found[0].includes("gravity"),
        (found[0] || "NOTHING FOUND") + ". Only STILL knobs whose default is ZERO are paired, which is what " +
        "keeps this a handful of builds instead of the O(K^2) sweep that pairing every knob would be -- a " +
        "knob already at a working value multiplies to something, one at zero cannot.");

    report("*** AND IT REMAINS A READING ***",
        "a pair that moves something together is JOINTLY GATED; a pair that does not has been asked one more " +
        "question and not answered. Nothing here promotes a knob to live on its own, and thermal.beta and " +
        "thermal.gravity are still reported still -- correctly, because each of them alone is.");
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
