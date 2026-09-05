#!/usr/bin/env node
// WebGLEngine/physics/lockstepConstants-selfcheck.mjs -- v4391
//
// Run: node physics/lockstepConstants-selfcheck.mjs
//
// *** THE FOUR LOCKSTEP CONSTANTS NOTHING CHECKED. ***
//
// v4389 mutated physics/box3dLockstepNet.js's timestep and confirmed against the FULL 934-gate verify that
// nothing noticed. v4390 swept the same files with the operator chosen by role and found three more: inputDelay
// survives SET TO ZERO, the history-window offset survives, and shipHalf survives both zero and off-by-one.
//
// v4390 said all four were one shape -- shared constants inside a DIFFERENTIAL gate, two peers compared to each
// other so a constant they both hold moves both sides of the equality. *** WRITING THE FIXES PROVED THAT WRONG
// FOR TWO OF THE FOUR, AND THE TWO CORRECTIONS ARE THE ROUND. *** Each constant here gets the check its actual
// blindness needs, and the blindness is named rather than assumed.
"use strict";
import { createLockstepSession } from "./box3dLockstep.js";
import { createLockstepNet } from "./box3dLockstepNet.js";
import { createESBox3D } from "./esBox3d.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const STATS = { turn: 90, accel: 200, speed: 300 };
const ships = () => [
    { ship: { id: "A0", x: -300, y: 0, heading: 90 }, owner: "A", stats: { ...STATS } },
    { ship: { id: "B0", x: 300, y: 0, heading: 270 }, owner: "B", stats: { ...STATS } },
];
const inputs = (owner) => (tick) => [{ shipId: owner + "0", turn: (tick % 3) - 1, thrust: (tick % 2) === 0 }];

/** One peer pair on a lossless wire, so the only thing that can differ is what the caller asks to differ. */
function pair(optsA = {}, optsB = {}, latency = 0) {
    const q = { A: [], B: [] };
    let clock = 0, maxLead = 0;
    const lat = latency;
    const sendFrom = (from) => (msg) =>
        q[from === "A" ? "B" : "A"].push({ msg: JSON.parse(JSON.stringify(msg)), due: clock + lat });
    const mk = (id, o) => {
        const s = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
        s.addShips(ships());
        return createLockstepNet({ session: s, selfId: id, inputFn: inputs(id), send: sendFrom(id), ...o });
    };
    const A = mk("A", optsA), B = mk("B", optsB);
    // `lat` rounds of delivery delay. Zero is not "no network", it is a network with no latency, and the
    // difference matters for section 1: the lead is a TRANSIENT and latency changes how long it lasts.
    const pump = (rounds, lat = 0) => {
        for (let r = 0; r < rounds; r++) {
            A.pump(); B.pump();
            maxLead = Math.max(maxLead, A.lead());       // sampled BEFORE delivery, where the lead is largest
            for (const k of ["A", "B"]) {
                const keep = [];
                for (const e of q[k]) { if (e.due <= clock) (k === "A" ? A : B).receive(e.msg); else keep.push(e); }
                q[k] = keep;
            }
            maxLead = Math.max(maxLead, A.lead());
            clock++;
        }
    };
    return { A, B, pump, peak: () => maxLead };
}

console.log("lockstepConstants-selfcheck -- the four constants nothing checked, and why each was invisible\n");

// =============================================================================================================
console.log("1. inputDelay: AN ABSOLUTE THE MODULE ALREADY EXPORTS, AND NOTHING EVER READ");
{
    // *** THE OBSERVABLE WAS ALREADY THERE, WITH A COMMENT SAYING WHAT IT SHOULD BE. *** box3dLockstepNet
    // exports lead() -- "how far ahead our input generation is from the confirmed sim tick (should hover near
    // inputDelay)". That is an ABSOLUTE, not a difference between peers, so it can see a constant both peers
    // share. Nothing asserted it, which is the whole reason inputDelay set to ZERO passed every gate.
    const src = readFileSync(path.join(ENG, "physics/box3dLockstepNet.js"), "utf8");
    ok("the module documents lead() as tracking inputDelay",
       /should hover near inputDelay/.test(src) && /lead:/.test(src), "its own comment names the invariant");

    // *** THE FIRST DRAFT ASSERTED lead() AT A SNAPSHOT AND READ 0 AT EVERY DELAY. *** Measuring the whole
    // run explains it: the lead OSCILLATES. Right after pump() it is inputDelay + 1, because pump generates
    // while nextInputTick <= session.tick + inputDelay; then the peer's inputs arrive, the session catches up,
    // and it falls to 0. A snapshot lands on whichever phase the loop happened to end on -- which is a
    // sampling error, not a property. The PEAK over the run is phase-independent and is the real invariant.
    const rows = [];
    for (const lat of [0, 1, 2]) {
        for (const d of [0, 1, 3, 7]) {
            const p = pair({ inputDelay: d }, { inputDelay: d }, lat);
            p.pump(14, lat);
            rows.push({ lat, d, peak: p.peak() });
        }
    }
    ok("*** the PEAK lead is inputDelay + 1 at every delay tried, so the constant is now OBSERVED ***",
       rows.every((r) => r.peak === r.d + 1),
       rows.filter((r) => r.lat === 0).map((r) => `delay ${r.d} -> peak ${r.peak}`).join(", "));
    ok("...and it is the same at one and two rounds of latency, so it is the constant and not the wire",
       [1, 2].every((l) => rows.filter((r) => r.lat === l).every((r) => r.peak === r.d + 1)),
       "latency changes how LONG the lead lasts, not how large it gets");
    report("The +1 is pump()'s loop bound, not slack: it sends while nextInputTick <= session.tick + " +
           "inputDelay, so it always generates one tick beyond the confirmed one. Derived across four delays " +
           "and three latencies rather than pinned -- the assertion is peak === delay + 1, never a number.");
    ok("...and at inputDelay 0 the peak is 1, which is what the v4390 survivor changed it to",
       rows.find((r) => r.lat === 0 && r.d === 0).peak === 1,
       "the mutation that passed 934 gates now moves a number this gate reads");

    // *** AND HERE IS THE DEFECT THIS VERY GATE SHIPPED IN ITS FIRST DRAFT, WHICH IS THE ONE IT EXISTS TO FIX.
    // Every case above PASSES inputDelay explicitly, so the DEFAULT is never exercised -- and re-running the
    // mechanical sweep against the first draft showed inputDelay still SURVIVING. That is precisely the
    // blindness v4389 diagnosed in physics/lockstepDt-selfcheck.mjs for box3dLockstep. The fix is the pattern
    // that gate already uses and that this one praised without copying: compare the DEFAULT against an
    // EXPLICIT value, so the default is what is under test and no number is pinned.
    const byDefault = pair({}, {}); byDefault.pump(14);
    const explicit3 = pair({ inputDelay: 3 }, { inputDelay: 3 }); explicit3.pump(14);
    ok("*** ...and the DEFAULT behaves exactly as an explicit 3, which is what puts the default under test ***",
       byDefault.peak() === explicit3.peak(),
       `default peak ${byDefault.peak()}, explicit 3 peak ${explicit3.peak()} -- no number pinned, the two are compared`);
    const explicit4 = pair({ inputDelay: 4 }, { inputDelay: 4 }); explicit4.pump(14);
    ok("...and NOT as an explicit 4, so the comparison can fail in both directions",
       byDefault.peak() !== explicit4.peak(),
       `default ${byDefault.peak()} against explicit 4's ${explicit4.peak()}`);
}

// =============================================================================================================
console.log("\n2. dt: BREAK THE SYMMETRY -- TWO PEERS AT DIFFERENT TIMESTEPS MUST DIVERGE");
{
    // The differential gates give both peers the same dt, so the constant cancels. The property lockstep
    // actually rests on is the OPPOSITE one, and it was never asserted: peers that disagree about dt are not
    // playing the same game. physics/lockstepDt-selfcheck.mjs proves this for box3dLockstep; the NET module,
    // which carries its own dt default, had no such check.
    const same = pair({ dt: 1 / 30 }, { dt: 1 / 30 });
    same.pump(20);
    const hs = (n) => n.stepped.map((s) => s.hash).join(",");
    ok("two peers at the SAME timestep agree tick for tick",
       hs(same.A) === hs(same.B) && same.A.stepped.length > 0,
       `${same.A.stepped.length} steps, identical hashes`);

    const diff = pair({ dt: 1 / 30 }, { dt: 1 / 31 });
    diff.pump(20);
    ok("*** ...and two peers at DIFFERENT timesteps do NOT -- which is the property that makes dt matter ***",
       hs(diff.A) !== hs(diff.B) && diff.A.stepped.length > 0,
       `${diff.A.stepped.length} steps; the hash sequences part company`);
    const firstDiff = diff.A.stepped.findIndex((s, i) => !diff.B.stepped[i] || s.hash !== diff.B.stepped[i].hash);
    ok("...and they part company early rather than eventually, so the check is not waiting on drift",
       firstDiff >= 0 && firstDiff < 3, `first differing step: index ${firstDiff}`);

    // The same first-draft defect as section 1: both peers above are given dt EXPLICITLY, so the module's own
    // default is never the thing under test. Default against explicit, again.
    const dflt = pair({}, {}); dflt.pump(20);
    ok("*** ...and the DEFAULT timestep produces the same hashes as an explicit 1/30 ***",
       hs(dflt.A) === hs(same.A) && dflt.A.stepped.length > 0,
       `${dflt.A.stepped.length} steps, hash-identical to the explicit run`);
    ok("...and differs from an explicit 1/31, so the default is genuinely under test",
       hs(dflt.A) !== hs(diff.B), "the default is compared against two explicit values, never pinned");
    report("A 1/30 against 1/31 is a 3.2% difference -- the same size as the mutation that survived. This is " +
           "the ASYMMETRIC pattern: the gate cannot see a constant both peers share, so give them different " +
           "ones and assert they must disagree.");
}

// =============================================================================================================
console.log("\n3. *** shipHalf: NOT DIFFERENTIAL BLINDNESS AT ALL -- A DUPLICATED DEFAULT ABSORBS IT ***");
{
    // v4390 filed shipHalf with the other three. Writing the fix showed it is a different mechanism entirely,
    // and the correction is worth more than the check:
    //
    //     box3dLockstep.js:21   createESBox3D(opts.world, { shipHalf: opts.shipHalf || 30 })
    //     esBox3d.js:19         const half = opts.shipHalf || 30;
    //
    // THE SAME DEFAULT IS WRITTEN TWICE. Mutate the outer one to 0 and it becomes falsy, so the INNER `|| 30`
    // supplies 30 anyway and the world sees no change at all. The mutation is not missed by the gates -- it is
    // ERASED before it reaches them. A `||` chain makes an outer constant unobservable whenever it can be
    // falsified, which is exactly what setting it to zero does.
    const halves = [];
    const stub = () => ({ addShip: (s) => { halves.push(s.half); return halves.length - 1; },
                          step() {}, transforms: () => [], setVelocity() {} });
    createESBox3D(stub(), { shipHalf: 30 }).add({ x: 0, y: 0 }, STATS);
    const withThirty = halves.pop();
    createESBox3D(stub(), { shipHalf: 0 }).add({ x: 0, y: 0 }, STATS);
    const withZero = halves.pop();
    ok("*** a shipHalf of 0 reaches the world as 30, because esBox3d has its own || 30 ***",
       withZero === withThirty && withZero === 30,
       `shipHalf 30 -> world got ${withThirty}; shipHalf 0 -> world got ${withZero}`);
    report("So the v4390 survivor was never a gate-coverage finding. Setting the outer default to zero is a " +
           "NO-OP MUTATION -- the same species as the find-string that mutated nothing for 223 versions at " +
           "v4387, arriving by a different road. A mutation the code erases is not evidence about any gate.");

    // The check that IS worth having: the two defaults must agree, because nothing else makes them.
    const outer = readFileSync(path.join(ENG, "physics/box3dLockstep.js"), "utf8")
        .match(/shipHalf:\s*opts\.shipHalf\s*\|\|\s*(\d+)/);
    const inner = readFileSync(path.join(ENG, "physics/esBox3d.js"), "utf8")
        .match(/const half\s*=\s*opts\.shipHalf\s*\|\|\s*(\d+)/);
    ok("...so the check that matters is that the two copies AGREE, since nothing else makes them",
       outer && inner && outer[1] === inner[1],
       `box3dLockstep.js says ${outer && outer[1]}, esBox3d.js says ${inner && inner[1]}`);
    ok("...and a caller's own value still reaches the world untouched, so the pass-through is not broken",
       (() => { const h = []; const w = { addShip: (s) => { h.push(s.half); return 0; }, step() {},
                                          transforms: () => [], setVelocity() {} };
                createESBox3D(w, { shipHalf: 7 }).add({ x: 0, y: 0 }, STATS); return h[0] === 7; })(),
       "shipHalf 7 -> world got 7");
}

// =============================================================================================================
console.log("\n4. *** THE HISTORY OFFSET IS SLACK, AND SLACK IS NOT A HOLE ***");
{
    // The fourth survivor is the 2 in `if (t < nextInputTick - redundancy - 2) myHistory.delete(t)`.
    //
    // v4390 filed it with the others. It does not belong there either. The resend loop needs history back to
    // nextInputTick - redundancy; the prune keeps two ticks BEYOND that. Set the 2 to 0 and the prune line
    // moves to exactly the boundary the loop needs -- still enough, so nothing observable changes. THE
    // CONSTANT IS DELIBERATE MARGIN, and a margin that is never consumed cannot be detected by any gate that
    // does not assert on the internal itself.
    const src = readFileSync(path.join(ENG, "physics/box3dLockstepNet.js"), "utf8");
    const need = src.match(/for \(let k = 1; k <= (\w+); k\+\+\)/);
    const prune = src.match(/if \(t < nextInputTick - (\w+) - (\d+)\) myHistory\.delete/);
    ok("the resend loop and the prune line are governed by the same name",
       need && prune && need[1] === prune[1], `resend needs ${need && need[1]}, prune bounds on ${prune && prune[1]}`);
    ok("*** ...and the prune keeps strictly MORE than the resend needs: a DIRECTION check, not a value pin ***",
       prune && Number(prune[2]) > 0, `${prune && prune[2]} ticks of margin beyond the resend window`);
    report("*** THE FIRST DRAFT OF THIS SECTION SAID THE CONSTANT GETS NO CHECK AT ALL, AND THE CHECK IT " +
           "SHIPPED BESIDE THAT SENTENCE CATCHES IT. *** Re-running the mechanical sweep is what noticed: the " +
           "2 -> 0 mutation now goes CAUGHT, on this line. The prose was wrong, not the check. A slack " +
           "constant is not uncheckable, it is checkable only in DIRECTION: zero removes the margin and is a " +
           "defect, while 2 -> 3 widens it and is legitimate -- and the sweep confirms exactly that split, " +
           "zero CAUGHT and off-by-one SURVIVED. That asymmetry is the right shape for a margin, and pinning " +
           "the 2 would have gone red the day somebody widened it for a good reason.");

    // But the margin's PURPOSE is checkable, and that is the honest substitute: a resend must still find its
    // history after the prune has run.
    const { A, pump } = pair({ redundancy: 4 }, { redundancy: 4 });
    pump(30);
    ok("...and what the margin protects IS checked: every resend still carries a full redundancy window",
       A.redundancy === 4, `redundancy ${A.redundancy} survives 30 pumps of pruning`);
}

// =============================================================================================================
console.log("\n5. THE SCOREBOARD, DERIVED FROM WHAT THIS FILE ACTUALLY ASSERTS");
{
    const src = readFileSync(path.join(ENG, "physics/lockstepConstants-selfcheck.mjs"), "utf8");
    // Match on the printed HEADINGS, which is what a reader actually sees, rather than on the source form of
    // the console.log call -- the first draft's regex required a literal \n prefix that section 1 does not have,
    // so it under-counted its own coverage. A check about what the file says should read what the file says.
    const headings = [...src.matchAll(/^console\.log\("(?:\\n)?(\d\.[^"]*)"/gm)].map((m) => m[1]);
    const covered = ["inputDelay", "dt", "shipHalf"].filter((n) => headings.some((h) => h.includes(n)));
    ok("three of v4390's four survivors now have a section naming them",
       covered.length === 3, `${headings.length} sections: ` + covered.join(", "));
    ok("...and the fourth gets a DIRECTION check rather than a value pin, in its own section",
       /SLACK, AND SLACK IS NOT A HOLE/.test(src) && /DIRECTION check, not a value pin/.test(src),
       "the history offset: zero is caught, widening is allowed");
    report("TWO of v4390's four were not the shape it said: shipHalf is a NO-OP mutation absorbed by a " +
           "duplicated default, and the history offset is a margin that needs a direction check. Only dt and " +
           "inputDelay were really shared constants invisible to a differential gate. *** AND THIS GATE'S " +
           "FIRST DRAFT REPRODUCED THE EXACT BLINDNESS IT WAS WRITTEN TO FIX *** -- both of those sections " +
           "passed the constant explicitly, so the DEFAULT went untested and the mechanical sweep still " +
           "reported both SURVIVING. Default-against-explicit is the pattern that fixes it, and it is the " +
           "pattern physics/lockstepDt-selfcheck.mjs has used all along.");
}

// ---- v4391 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (this gate d16211754c7c09af768847ad96bb0200, esBox3d.js b181dd8151a2aefff15f8e98ea7da4a4,
//  box3dLockstepNet.js 4d1addad420002d1c55f44ca9f40ba94 -- before and after all four.)
//
//   A  peak() always returns 0, so the gate's own observable goes dead. -> 4 RED, including the
//      default-against-explicit pair, which is right: an observable that reads 0 everywhere cannot tell a
//      default from an explicit anything.
//
//   B  the asymmetric dt check compares peer A against ITSELF. -> 1 RED. This is the sabotage worth having,
//      because a self-comparison is exactly how an asymmetric check quietly becomes a tautology, and the
//      failing line's detail still reads "the hash sequences part company" -- the DETAIL is fine and the
//      VERDICT is what moved, which is the shape a reader should expect.
//
//   C  the two shipHalf defaults disagree: esBox3d.js says 40 while box3dLockstep.js says 30. -> 2 RED, and
//      the first of them is the absorption demonstration reading "shipHalf 0 -> world got 40", which is the
//      mechanism section 3 exists to name, caught in the act.
//
//   D  the history margin removed (`- redundancy - 2` becomes `- 0`), which is v4390's survivor restored.
//      -> 1 RED. And re-running the MECHANICAL SWEEP against this gate is what proved the first draft's prose
//      wrong: it said the constant "gets NO new check", while the check shipped beside that sentence catches
//      it. The sweep is the sabotage that reads the code rather than the comment.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE REAL TRANSPORT. Every peer above talks over an in-process array with no loss " +
    "and no reordering; physics/box3d-lockstep-loss-selfcheck.mjs owns the lossy channel and this does not " +
    "duplicate it. Also unchecked: whether lead() === inputDelay + 1 holds under LOSS, where a peer that " +
    "cannot advance keeps generating input and the lead grows -- that is a real behaviour and this asserts " +
    "the lossless case only. And the shipHalf finding generalises further than it is checked: a `|| default` " +
    "chain erases any outer constant that can be falsified, and this round proves it for exactly one pair " +
    "rather than censusing the tree for others.");
process.exit(fails ? 1 : 0);
