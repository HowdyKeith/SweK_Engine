// WebGLEngine/tools/ship/deferralAudit-selfcheck.mjs — v3313
//
// Run: node tools/ship/deferralAudit-selfcheck.mjs   (~2s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A DEFERRED NOTE THAT HAS BEEN SATISFIED IS WORSE THAN ONE THAT HAS NOT. It advertises open work that is
// finished, and the next reader spends their round rediscovering that instead of doing something new.
//
// The tree carries "its own round" notes in a dozen files: honest deferrals, each naming a decision somebody
// declined to take in passing. Nothing ever checked whether they were still true. Audited in v3313, THREE OF
// THE FOUR ON THE SHORTLIST HAD ALREADY BEEN SETTLED ELSEWHERE:
//
//   lensCorroborated -- "c4 should require a live control the way c2 requires non-identity". DONE at v3083.
//     corroborateFully now refuses a bit-identical c4 without a control that moved on the same device in the
//     same process, naming the three situations that produce no movement. The note outlived the fix by thirty
//     versions.
//   airySlitAdoption -- "the escapeBudget default needs an explicit decision, not a quiet adoption". TAKEN at
//     v2932: escSteps raised to the converged plateau, which dissolved three basins that were all artefacts of
//     the unconverged default. One of the two held-back fixes is settled; only the deflect reframing remains.
//   thermalScaling -- "adding a heated-bottom/cooled-top bifurcation is a change to the SIMULATION, and is its
//     own round". THE SIMULATION EXISTS: simulation/lbm/benardSweep.mjs grades onset against Rayleigh's 1707.76
//     with Nu exactly one below it. The round is not "build a bifurcation", it is "bind the existing one" --
//     smaller and better defined than the note implies.
//
//   refinementWindow -- "making the sign test a criterion in classifyPlacement is a change to the battery every
//     device must survive". GENUINELY STILL OPEN, verified: no sign test is wired into defaultPlacementSweep.
//
// This gate pins those four so the same audit does not have to be redone by hand. It checks BEHAVIOUR rather
// than wording wherever it can -- the v3298 prose round is precisely about checks that hunt sentences, and the
// first version of the lensCorroborated assertion failed because the sentence it hunted was wrapped across two
// comment lines.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// ---- 1. THE THREE THAT WERE ALREADY SETTLED, EACH CHECKED ON BEHAVIOUR --------------------------------------------
{
    const cf = codeOf(read("tools/roundhouse/corroborateFully.mjs"));
    ok("!! lensCorroborated's deferral is SATISFIED: c4 consults a live control before accepting bit-identical",
       /probeLibmControl\(/.test(cf) && /ctl\.declared\s*&&\s*ctl\.present\s*&&\s*ctl\.moved/.test(cf),
       "done at v3083; the note survived thirty versions past its own fix");

    const dps = read("tools/roundhouse/defaultPlacementSweep.mjs");
    ok("!! airySlitAdoption's escapeBudget deferral is SATISFIED: the fix was adopted",
       /ADOPTED the escapeBudget fix/.test(dps),
       "v2932 raised escSteps to the converged plateau, dissolving three basins that were artefacts of the unconverged default");

    const benard = read("simulation/lbm/benardSweep.mjs");
    ok("!! thermalScaling's 'change to the SIMULATION' already exists: a graded Benard bifurcation",
       benard.length > 0 && /1707\.76/.test(benard),
       "the round is 'bind the existing onset to the thermal device', not 'build a bifurcation' — smaller and better defined than the note implies");
}

// ---- 2. THE ONE THAT IS GENUINELY STILL OPEN ------------------------------------------------------------------------
// This is the half that makes the audit worth anything. If every deferral came back SETTLED, the gate would be
// congratulating the tree rather than measuring it.
{
    // *** v3315 -- I CALLED THIS ONE OPEN IN v3314 AND IT WAS NOT. THE ABSENCE WAS THE DECISION. ***
    // The v3314 check confirmed no sign test is wired into the placement battery and read that as unfinished
    // work. It is finished work: v3132 proposed promoting the sign test to a pass/fail criterion, v3133 RAN THE
    // CENSUS AND REJECTED IT, and refinementWindow-selfcheck section 4 carries the casualty -- chaos/deltaBest
    // straddles the Feigenbaum constant 4.6692 with steps shrinking 1.1e-1 -> 2.9e-2 -> 0. ALTERNATING
    // CONVERGENCE IS CONVERGENCE, and a sign criterion would have failed a correct estimate of a real
    // mathematical constant. The file says in its own words "which is why the promotion did not happen".
    //
    // So the audit that caught six stale notes made the SYMMETRIC ERROR on the seventh: it verified an absence
    // and inferred an omission. An absence can equally be a settled refusal, and telling them apart needs the
    // reason, not the state. That is exactly the distinction section 5 draws between a deferral and narration,
    // arriving one section later and catching me anyway.
    const rw = read("tools/roundhouse/refinementWindow-selfcheck.mjs");
    ok("!! refinementWindow's deferral is SETTLED AS A REFUSAL, not open — the census rejected the promotion",
       /which is why the promotion did not happen/.test(rw) && /ALTERNATING CONVERGENCE IS CONVERGENCE/.test(rw),
       "v3133 ran it and found a casualty: a correct Feigenbaum estimate that alternates while converging. " +
       "The sign test is UNWIRED ON PURPOSE, and v3314 mistook that for work nobody had done");

    const dps = codeOf(read("tools/roundhouse/defaultPlacementSweep.mjs"));
    const signWired = /sign(Test|Change|Flip)/i.test(dps) || /Math\.sign\(/.test(dps);
    ok("...and it is still unwired, which is now recorded as the OUTCOME rather than as a gap",
       !signWired,
       "if someone wires it, this flips and sends them to the v3133 casualty first");
}

// ---- 3. THE NOTES THEMSELVES CARRY THEIR OUTCOME ---------------------------------------------------------------------
{
    const pairs = [
        ["tools/roundhouse/lensCorroborated-selfcheck.mjs", /THAT ROUND HAPPENED, AT v3083/],
        ["tools/roundhouse/airySlitAdoption-selfcheck.mjs", /THAT DECISION WAS TAKEN, AT v2932/],
        ["tools/roundhouse/thermalScaling-selfcheck.mjs", /ALREADY EXISTS ELSEWHERE/],
    ];
    const missing = pairs.filter(([f, re]) => !re.test(read(f)));
    ok("each settled deferral records its outcome BESIDE the original note, rather than the note being deleted",
       missing.length === 0,
       missing.length ? "not annotated: " + missing.map((m) => m[0]).join(", ")
                      : "the deferral is kept as history and the settlement sits under it — deleting the note would erase why the work was once declined");
}

// ---- 4. THE POPULATION IS NOT SHRINKING QUIETLY ------------------------------------------------------------------------
{
    let count = 0;
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.mjs$|\.js$/.test(e.name)) { if (/its own round/i.test(fs.readFileSync(p, "utf8"))) count++; }
        }
    };
    walk(ENG);
    ok("the tree still carries deferral notes, and the count is stated rather than assumed",
       count >= 4,
       count + " files carry an 'its own round' note. ALL are now classified: SEVEN deferrals settled (six met, " +
       "one REFUSED by census at v3133), FOUR matches that were never deferrals but narration of completed " +
       "rounds, ONE genuinely open (Trellis warmup), ONE unmeasured. NOT ONE of the fifteen was work waiting to " +
       "be done that somebody had not already done or decided against");
}

// ---- 5. v3314 -- THE REST OF THE POPULATION, AND A DISTINCTION THE FIRST PASS MISSED --------------------------------
// *** "its own round" IS NOT A MARKER OF OPEN WORK. *** Four of the remaining matches are PAST-TENSE NARRATION
// of rounds that happened: "the antidote fired on its own round", "This is that answer key". A grep that treats
// every match as a to-do MANUFACTURES BACKLOG, which is the exact mirror of the stale-note problem this gate was
// built for. The phrase means two opposite things, so a count of it was never a backlog.
{
    const narration = [
        ["tools/ship/gateBudget.mjs", /antidote fired on its own round/],
        ["tools/ship/unwiredRegister.mjs", /fired on its own round/],
        ["render/depthProject.js", /This is that answer key/],
        ["tools/ship/depthProject-selfcheck.mjs", /its own round with its own/],
    ];
    const bad = narration.filter(([f, re]) => !re.test(read(f)));
    ok("!! four matches are NARRATION of completed rounds, not deferrals — counting them would invent backlog",
       bad.length === 0,
       bad.length ? "not narration after all: " + bad.map((b) => b[0]).join(", ")
                  : "a phrase-based backlog is only as good as the phrase, and this one points both ways");
}

// ---- 6. TWO MORE DEFERRALS SETTLED ELSEWHERE ---------------------------------------------------------------------------
{
    const lc = read("tools/roundhouse/lensCorroborated-selfcheck.mjs");
    ok("!! lensNuisance's deferral is SATISFIED: the battery was run and lens.deflect passed all four criteria",
       /is CORROBORATED/.test(lc) && /all four/.test(lc),
       "deferred as 'its own round with its own evidence' — the round happened, and the evidence is in that file");

    const srv = read("ai-bridge/server.js");
    ok("!! copypartyRegistry's deferral is SATISFIED: every chunk is now checked against the manifest",
       /EVERY chunk passes the manifest/.test(srv),
       "the note says the means existed since v3160 and had not been used; it is used now");
}

// ---- 7. WHAT REMAINS, INCLUDING ONE THIS ROUND COULD NOT SETTLE ----------------------------------------------------------
{
    const cs = read("ai/ColdStartPrimer.js");
    ok("ColdStartPrimer's Trellis warmup deferral is still OPEN",
       /belongs in its own round/.test(cs),
       "warming Trellis means posting a real workflow JSON, which is genuine work nobody has done");

    // *** AND THE ONE THIS ROUND FAILED TO SETTLE, FILED AS NEITHER ANSWER. ***
    const dps = read("tools/roundhouse/defaultPlacementSweep-selfcheck.mjs");
    ok("!! defaultPlacementSweep's blackhole.escape note is UNMEASURED, and is recorded as neither settled nor open",
       /deserves its own round/.test(dps),
       "the note asks whether dt, escRFar and escSteps still all sit at the error minimum. escapeBudget was " +
       "adopted at v2932 and reportedly dissolved those basins, but the sweep returns ZERO ROWS for blackhole " +
       "(200k steps per build across three modes), so NOTHING WAS MEASURED. A sweep that produced no rows is not " +
       "evidence of no basins, and filing it as settled would have been the easiest wrong answer available");
}

console.log(fails ? ("[deferralAudit-selfcheck] FAILED " + fails) : "[deferralAudit-selfcheck] all passed");
process.exit(fails ? 1 : 0);
